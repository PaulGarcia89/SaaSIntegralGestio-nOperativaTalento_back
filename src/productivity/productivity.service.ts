import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class ProductivityService {
  constructor(private readonly prisma: PrismaService) {}
  cameras(tenantId: string, branchId?: string) { return this.prisma.productivityCamera.findMany({ where: { tenantId, branchId }, select: { id: true, branchId: true, name: true, description: true, sourceType: true, status: true, lastHeartbeatAt: true, createdAt: true }, orderBy: { name: 'asc' } }); }
  async createCamera(tenantId: string, input: { branchId: string; name: string; description?: string; sourceType?: string; streamUrl?: string }) { const branch = await this.prisma.branch.findFirst({ where: { id: input.branchId, tenantId } }); if (!branch) throw new BadRequestException('Sucursal no autorizada'); return this.prisma.productivityCamera.create({ data: { tenantId, branchId: input.branchId, name: input.name.trim(), description: input.description, sourceType: input.sourceType || 'RTSP', streamUrlEncrypted: input.streamUrl ? Buffer.from(input.streamUrl).toString('base64') : null } }); }
  zones(tenantId: string, cameraId?: string) { return this.prisma.productivityZone.findMany({ where: { tenantId, cameraId }, orderBy: { name: 'asc' } }); }
  async createZone(tenantId: string, input: { cameraId: string; name: string; zoneType: string; polygonCoordinates: unknown; description?: string }) { const camera = await this.prisma.productivityCamera.findFirst({ where: { id: input.cameraId, tenantId } }); if (!camera) throw new NotFoundException('Cámara no encontrada'); return this.prisma.productivityZone.create({ data: { tenantId, branchId: camera.branchId, cameraId: camera.id, name: input.name.trim(), zoneType: input.zoneType, polygonCoordinates: input.polygonCoordinates as never, description: input.description } }); }

  async events(tenantId: string, input: { branchId?: string; source?: string; limit?: number }) {
    const events = await this.prisma.productivityEvent.findMany({
      where: { tenantId, branchId: input.branchId, source: input.source },
      orderBy: { startedAt: 'desc' },
      take: input.limit ?? 12,
    });
    const cameraIds = [...new Set(events.map((event) => event.cameraId))];
    const zoneIds = [...new Set(events.map((event) => event.zoneId).filter((id): id is string => Boolean(id)))];
    const [cameras, zones] = await Promise.all([
      this.prisma.productivityCamera.findMany({ where: { tenantId, id: { in: cameraIds } }, select: { id: true, name: true } }),
      this.prisma.productivityZone.findMany({ where: { tenantId, id: { in: zoneIds } }, select: { id: true, name: true } }),
    ]);
    const cameraNames = new Map(cameras.map((camera) => [camera.id, camera.name]));
    const zoneNames = new Map(zones.map((zone) => [zone.id, zone.name]));
    return events.map((event) => ({
      ...event,
      cameraName: cameraNames.get(event.cameraId) ?? 'Cámara',
      zoneName: event.zoneId ? zoneNames.get(event.zoneId) ?? 'Zona' : null,
    }));
  }

  createDemoEvent(tenantId: string, input: { cameraId: string; zoneId?: string; eventType: string; startedAt: string; endedAt?: string; confidence?: number; metadata?: unknown; idempotencyKey: string }) {
    return this.persistEvent(tenantId, input, 'DEMO');
  }

  async ingest(key: string | undefined, input: { cameraId: string; zoneId?: string; eventType: string; startedAt: string; endedAt?: string; confidence?: number; metadata?: unknown; idempotencyKey: string }) {
    if (!key || key !== process.env.PRODUCTIVITY_EVENT_INGEST_KEY) throw new BadRequestException('Servicio de visión no autorizado');
    const camera = await this.prisma.productivityCamera.findUnique({ where: { id: input.cameraId } });
    if (!camera) throw new NotFoundException('Cámara no encontrada');
    return this.persistEvent(camera.tenantId, input, 'CV_SERVICE');
  }

  private async persistEvent(
    tenantId: string,
    input: { cameraId: string; zoneId?: string; eventType: string; startedAt: string; endedAt?: string; confidence?: number; metadata?: unknown; idempotencyKey: string },
    source: 'DEMO' | 'CV_SERVICE',
  ) {
    const eventType = input.eventType.trim();
    if (!eventType) throw new BadRequestException('El tipo de evento es obligatorio');

    const camera = await this.prisma.productivityCamera.findFirst({ where: { id: input.cameraId, tenantId } });
    if (!camera) throw new NotFoundException('Cámara no encontrada en el tenant activo');
    if (input.zoneId) {
      const zone = await this.prisma.productivityZone.findFirst({
        where: { id: input.zoneId, tenantId, cameraId: camera.id, branchId: camera.branchId },
      });
      if (!zone) throw new BadRequestException('La zona no pertenece a la cámara y sucursal activas');
    }
    const existing = await this.prisma.productivityEvent.findFirst({
      where: { tenantId, idempotencyKey: input.idempotencyKey },
    });
    if (existing) return { event: existing, duplicate: true };

    const startedAt = new Date(input.startedAt);
    const endedAt = input.endedAt ? new Date(input.endedAt) : undefined;
    if (Number.isNaN(startedAt.getTime()) || (endedAt && Number.isNaN(endedAt.getTime()))) {
      throw new BadRequestException('Fecha de evento inválida');
    }
    if (endedAt && endedAt < startedAt) throw new BadRequestException('La fecha final no puede ser anterior a la inicial');
    const durationSeconds = endedAt ? Math.round((endedAt.getTime() - startedAt.getTime()) / 1000) : undefined;

    try {
      const event = await this.prisma.$transaction(async (tx) => {
        const created = await tx.productivityEvent.create({
          data: {
            tenantId,
            branchId: camera.branchId,
            cameraId: camera.id,
            zoneId: input.zoneId,
            idempotencyKey: input.idempotencyKey,
            eventType,
            startedAt,
            endedAt,
            durationSeconds,
            confidence: input.confidence,
            metadata: input.metadata as never,
            source,
          },
        });
        await tx.productivityCamera.update({
          where: { id: camera.id },
          data: { status: 'ONLINE', lastHeartbeatAt: new Date() },
        });
        return created;
      });
      return { event, duplicate: false };
    } catch (error) {
      if ((error as { code?: string }).code !== 'P2002') throw error;
      const duplicate = await this.prisma.productivityEvent.findFirst({
        where: { tenantId, idempotencyKey: input.idempotencyKey },
      });
      if (!duplicate) throw error;
      return { event: duplicate, duplicate: true };
    }
  }
  async overview(tenantId: string, branchId?: string) { const since = new Date(); since.setHours(0, 0, 0, 0); const [events, cameras, zones, alerts] = await Promise.all([this.prisma.productivityEvent.findMany({ where: { tenantId, branchId, startedAt: { gte: since } } }), this.prisma.productivityCamera.count({ where: { tenantId, branchId, status: 'ONLINE' } }), this.prisma.productivityZone.count({ where: { tenantId, branchId, status: 'ACTIVE' } }), this.prisma.productivityAlert.count({ where: { tenantId, branchId, status: 'OPEN' } })]); const activeSeconds = events.filter(event => ['ACTIVITY_STARTED', 'TASK_DETECTED'].includes(event.eventType)).reduce((sum, event) => sum + (event.durationSeconds ?? 0), 0); const idleSeconds = events.filter(event => event.eventType === 'ACTIVITY_STOPPED').reduce((sum, event) => sum + (event.durationSeconds ?? 0), 0); return { totalEvents: events.length, activeSeconds, idleSeconds, taskCount: events.filter(event => event.eventType === 'TASK_DETECTED').length, camerasOnline: cameras, zonesActive: zones, alertsOpen: alerts }; }
  alertRules(tenantId: string) { return this.prisma.productivityAlertRule.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } }); }
  createAlertRule(tenantId: string, input: { name: string; ruleType: string; threshold: number; branchId?: string; zoneId?: string }) { return this.prisma.productivityAlertRule.create({ data: { tenantId, name: input.name.trim(), ruleType: input.ruleType, threshold: input.threshold, branchId: input.branchId, zoneId: input.zoneId } }); }
  alerts(tenantId: string, branchId?: string) { return this.prisma.productivityAlert.findMany({ where: { tenantId, branchId }, orderBy: { createdAt: 'desc' }, take: 100 }); }
  async updateAlert(tenantId: string, id: string, status: 'ACKNOWLEDGED' | 'CLOSED') { const alert = await this.prisma.productivityAlert.findFirst({ where: { id, tenantId } }); if (!alert) throw new NotFoundException('Alerta no encontrada'); return this.prisma.productivityAlert.update({ where: { id }, data: { status, acknowledgedAt: status === 'ACKNOWLEDGED' ? new Date() : alert.acknowledgedAt, closedAt: status === 'CLOSED' ? new Date() : null } }); }
  async insights(tenantId: string, branchId?: string) { const since = new Date(); since.setDate(since.getDate() - 7); const events = await this.prisma.productivityEvent.findMany({ where: { tenantId, branchId, startedAt: { gte: since } }, select: { zoneId: true, eventType: true, durationSeconds: true, confidence: true } }); const zones = await this.prisma.productivityZone.findMany({ where: { tenantId, branchId, status: 'ACTIVE' }, select: { id: true, name: true } }); const results = zones.map(zone => { const items = events.filter(event => event.zoneId === zone.id); const activeSeconds = items.filter(event => ['ACTIVITY_STARTED','TASK_DETECTED'].includes(event.eventType)).reduce((sum,event)=>sum+(event.durationSeconds??0),0); const idleSeconds = items.filter(event => event.eventType === 'ACTIVITY_STOPPED').reduce((sum,event)=>sum+(event.durationSeconds??0),0); const confidence = items.length ? Math.round(items.reduce((sum,event)=>sum+(event.confidence??0),0)/items.length*100) : 0; return { zone, events: items.length, activeSeconds, idleSeconds, confidence }; }); return { period: { from: since, to: new Date() }, zones: results, recommendations: results.filter(item=>item.events>0&&item.idleSeconds>item.activeSeconds).map(item=>({ zoneId:item.zone.id, title:`Revisar contexto de ${item.zone.name}`, explanation:`${Math.round(item.idleSeconds/60)} min sin actividad y ${Math.round(item.activeSeconds/60)} min de actividad. Esto no evalúa desempeño individual.`, suggestedAction:'Validar turno, demanda, insumos y configuración de zona con el supervisor.' })) }; }
}

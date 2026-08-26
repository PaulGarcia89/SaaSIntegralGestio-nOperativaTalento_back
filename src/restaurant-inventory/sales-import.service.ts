import { HttpStatus, Injectable, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { join } from 'path';
import AdmZip from 'adm-zip';
import { PrismaService } from '../common/prisma/prisma.service';
import { RestaurantInventoryService } from './restaurant-inventory.service';
import { AppException } from '../common/errors/app-exception';
import { ErrorCode } from '../common/errors/error-code.enum';
import { QueueManagerService } from '../messaging/queue-manager.service';
import { MESSAGE_QUEUE_NAMES } from '../messaging/messaging.constants';
import { MessageBusWorkerHandle } from '../messaging/messaging.types';

const MAX_BYTES = Number(process.env.SALES_IMPORT_MAX_BYTES ?? 25 * 1024 * 1024);

@Injectable()
export class SalesImportService implements OnModuleInit, OnModuleDestroy {
  private worker: MessageBusWorkerHandle | null = null;
  constructor(private readonly prisma: PrismaService, private readonly inventory: RestaurantInventoryService, @Optional() private readonly queues?: QueueManagerService) {}
  onModuleInit() { if (this.queues?.isEnabled()) this.worker = this.queues.subscribe<{ tenantId: string; userId: string; importId: string }>(MESSAGE_QUEUE_NAMES.SALES_IMPORT, (message) => this.processRows(message.payload.tenantId, message.payload.userId, message.payload.importId), { concurrency: 2 }); }
  async onModuleDestroy() { await this.worker?.close(); }
  private fail(message: string): never { throw new AppException(message, ErrorCode.BAD_REQUEST, HttpStatus.BAD_REQUEST); }
  private normalize(value: unknown) { return String(value ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, ''); }
  private csv(buffer: Buffer) { const text = buffer.toString('utf8').replace(/^\uFEFF/, ''); const rows: string[][] = []; let row: string[] = [], cell = '', quoted = false; for (let i = 0; i < text.length; i++) { const c = text[i]; if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = !quoted; else if (!quoted && (c === ',' || c === ';' || c === '\t')) { row.push(cell); cell = ''; } else if (!quoted && (c === '\n' || c === '\r')) { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); if (row.some((v) => v.trim())) rows.push(row); row = []; cell = ''; } else cell += c; } if (cell || row.length) { row.push(cell); rows.push(row); } return rows; }
  private xlsx(buffer: Buffer) { const zip = new AdmZip(buffer); const workbook = zip.readAsText('xl/workbook.xml'); const sheet = workbook.match(/<sheet[^>]+r:id="([^"]+)"/); const rels = zip.readAsText('xl/_rels/workbook.xml.rels'); const target = rels.match(new RegExp(`Id="${sheet?.[1] ?? ''}"[^>]+Target="([^"]+)"`))?.[1] ?? 'worksheets/sheet1.xml'; const xml = zip.readAsText(`xl/${target.replace(/^\//, '')}`); if (/<f[ >]/.test(xml)) this.fail('Las fórmulas de Excel no están permitidas'); const shared = zip.getEntry('xl/sharedStrings.xml') ? zip.readAsText('xl/sharedStrings.xml').match(/<t[^>]*>(.*?)<\/t>/g)?.map((x) => x.replace(/<[^>]+>/g, '')) ?? [] : []; return [...xml.matchAll(/<row[^>]*>(.*?)<\/row>/gs)].map((m) => [...m[1].matchAll(/<c[^>]*?(?:t="([^"]+)")?[^>]*>(?:<v>(.*?)<\/v>)?<\/c>/gs)].map((c) => c[1] === 's' ? shared[Number(c[2])] : c[2] ?? '')); }
  private parse(buffer: Buffer, fileName: string) { const ext = fileName.toLowerCase().split('.').pop(); if (ext === 'csv') return this.csv(buffer); if (ext === 'xlsx') return this.xlsx(buffer); this.fail('Solo se admiten archivos CSV o XLSX'); }
  private column(headers: string[], aliases: string[]) { return headers.findIndex((h) => aliases.includes(this.normalize(h))); }
  private date(value: unknown) { const date = new Date(String(value)); return Number.isNaN(date.getTime()) ? null : date; }
  async upload(tenantId: string, userId: string, branchId: string, warehouseId: string, file: Express.Multer.File) {
    if (!file || file.size > MAX_BYTES) this.fail('Archivo ausente o excede el límite permitido');
    const ext = file.originalname.toLowerCase().split('.').pop();
    if (!['csv', 'xlsx'].includes(ext ?? '')) this.fail('Extensión no permitida');
    if (ext === 'csv' && !['text/csv', 'application/csv', 'text/plain'].includes(file.mimetype)) this.fail('MIME de CSV inválido');
    if (ext === 'xlsx' && (file.mimetype !== 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || file.buffer.subarray(0, 2).toString() !== 'PK')) this.fail('MIME o contenido XLSX inválido');
    const hash = createHash('sha256').update(file.buffer).digest('hex');
    const duplicate = await this.prisma.restaurantSalesImport.findUnique({ where: { tenantId_fileHash: { tenantId, fileHash: hash } } });
    if (duplicate) return duplicate;
    const baseDir = process.env.SALES_IMPORT_STORAGE_DIR ?? join('/tmp', 'restaurant-sales-imports');
    const key = `${tenantId}/${hash}.${ext}`;
    const path = join(baseDir, key);
    const rows = this.parse(file.buffer, file.originalname);
    if (rows.length < 2) this.fail('El archivo no contiene filas');
    const headers = rows[0];
    const indexes = { sale: this.column(headers, ['externalsaleid', 'idsale', 'saleid', 'idventa']), code: this.column(headers, ['externalproductcode', 'productcode', 'code', 'codigoproducto', 'sku']), name: this.column(headers, ['externalproductname', 'productname', 'name', 'nombreproducto']), quantity: this.column(headers, ['quantity', 'qty', 'cantidad']), date: this.column(headers, ['soldat', 'date', 'fecha', 'fechaventa']) };
    if (indexes.sale < 0 || indexes.code < 0 || indexes.quantity < 0 || indexes.date < 0) this.fail('Encabezados requeridos ausentes');
    await fs.mkdir(join(baseDir, tenantId), { recursive: true });
    await fs.writeFile(path, file.buffer, { flag: 'wx' }).catch((error: any) => { if (error?.code !== 'EEXIST') throw error; });
    const importRow = await this.prisma.restaurantSalesImport.create({ data: { tenantId, branchId, warehouseId, fileName: file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_'), fileHash: hash, fileStorageKey: key, totalRows: rows.length - 1, createdBy: userId } });
    const existing = await this.prisma.restaurantSalesImportRow.findMany({ where: { externalSaleId: { in: rows.slice(1).map((r) => String(r[indexes.sale] ?? '').trim()).filter(Boolean) }, salesImport: { tenantId } }, select: { externalSaleId: true, externalProductCode: true, soldAt: true } });
    const seen = new Set<string>();
    const data = rows.slice(1).map((r, i) => {
      const errors: string[] = []; const externalSaleId = String(r[indexes.sale] ?? '').trim(); const code = String(r[indexes.code] ?? '').trim(); const quantity = Number(String(r[indexes.quantity] ?? '').replace(',', '.')); const soldAt = this.date(r[indexes.date]);
      if (!externalSaleId) errors.push('ID de venta requerido'); if (!code) errors.push('Código de producto requerido'); if (!Number.isFinite(quantity) || quantity <= 0) errors.push('Cantidad inválida'); if (!soldAt) errors.push('Fecha inválida');
      const key = createHash('sha256').update(`${externalSaleId}|${code}|${quantity}|${soldAt?.toISOString() ?? ''}`).digest('hex'); const duplicateKey = `${externalSaleId}|${code}|${soldAt?.toISOString() ?? ''}`; const duplicate = seen.has(duplicateKey) || existing.some((row) => row.externalSaleId === externalSaleId && row.externalProductCode === code && row.soldAt.getTime() === (soldAt?.getTime() ?? -1)); seen.add(duplicateKey); if (duplicate) errors.push('Venta duplicada');
      return { salesImportId: importRow.id, rowNumber: i + 2, externalSaleId, externalProductCode: code, externalProductName: indexes.name >= 0 ? r[indexes.name] : null, quantity: Number.isFinite(quantity) ? quantity : 0, soldAt: soldAt ?? new Date(0), validationStatus: duplicate ? 'DUPLICATE' : errors.length ? 'INVALID' : 'VALID', validationErrors: errors, rawData: r, idempotencyKey: key };
    });
    await this.prisma.restaurantSalesImportRow.createMany({ data: data as any });
    const valid = data.filter((r) => r.validationStatus === 'VALID').length; const invalid = data.filter((r) => r.validationStatus === 'INVALID').length; const duplicates = data.filter((r) => r.validationStatus === 'DUPLICATE').length;
    return this.prisma.restaurantSalesImport.update({ where: { id: importRow.id }, data: { validRows: valid, invalidRows: invalid, duplicateRows: duplicates, status: valid ? 'REQUIRES_MAPPING' : 'FAILED', salesDateFrom: data.length ? new Date(Math.min(...data.map((r) => r.soldAt.getTime()))) : null, salesDateTo: data.length ? new Date(Math.max(...data.map((r) => r.soldAt.getTime()))) : null }, include: { rows: { orderBy: { rowNumber: 'asc' } } } });
  }
  async summary(tenantId: string, id: string) {
    return this.prisma.restaurantSalesImport.findFirst({ where: { id, tenantId }, include: { rows: { orderBy: { rowNumber: 'asc' } } } });
  }

  private async importFile(tenantId: string, id: string) {
    const imp = await this.prisma.restaurantSalesImport.findFirst({ where: { id, tenantId }, select: { fileName: true, fileStorageKey: true } });
    if (!imp) this.fail('Importación no encontrada');
    const baseDir = process.env.SALES_IMPORT_STORAGE_DIR ?? join('/tmp', 'restaurant-sales-imports');
    const filePath = join(baseDir, imp!.fileStorageKey);
    return { imp, rows: this.parse(await fs.readFile(filePath), imp!.fileName) };
  }

  async columns(tenantId: string, id: string) {
    const { rows } = await this.importFile(tenantId, id);
    return { headers: rows[0] ?? [], normalizedHeaders: (rows[0] ?? []).map((header) => this.normalize(header)), totalRows: Math.max(0, rows.length - 1) };
  }

  async configure(tenantId: string, _userId: string, id: string, dto: any) {
    const imp = await this.prisma.restaurantSalesImport.findFirst({ where: { id, tenantId } });
    if (!imp) this.fail('Importación no encontrada');
    const { headers } = await this.columns(tenantId, id);
    const mapping = dto?.columns ?? dto;
    const required = ['sale', 'code', 'quantity', 'date'];
    if (!mapping || required.some((key) => typeof mapping[key] !== 'string' && !Number.isInteger(mapping[key]))) this.fail('El mapeo requiere sale, code, quantity y date');
    const indexes = Object.fromEntries(Object.entries(mapping).map(([key, value]) => [key, typeof value === 'number' ? value : headers.findIndex((header) => this.normalize(header) === this.normalize(value))]));
    if (required.some((key) => Number(indexes[key]) < 0 || Number(indexes[key]) >= headers.length)) this.fail('El mapeo contiene columnas inexistentes');
    const rows: any[] = await this.prisma.restaurantSalesImportRow.findMany({ where: { salesImportId: id }, orderBy: { rowNumber: 'asc' } });
    const seen = new Set<string>();
    for (const row of rows) {
      const raw = Array.isArray(row.rawData) ? row.rawData : [];
      const externalSaleId = String(raw[Number(indexes.sale)] ?? '').trim();
      const externalProductCode = String(raw[Number(indexes.code)] ?? '').trim();
      const externalProductName = indexes.name === undefined || Number(indexes.name) < 0 ? null : String(raw[Number(indexes.name)] ?? '').trim();
      const quantity = Number(String(raw[Number(indexes.quantity)] ?? '').replace(',', '.'));
      const soldAt = this.date(raw[Number(indexes.date)]);
      const duplicateKey = `${externalSaleId}|${externalProductCode}|${soldAt?.toISOString() ?? ''}`;
      const errors: string[] = [];
      if (!externalSaleId) errors.push('ID de venta requerido');
      if (!externalProductCode) errors.push('Código de producto requerido');
      if (!Number.isFinite(quantity) || quantity <= 0) errors.push('Cantidad inválida');
      if (!soldAt) errors.push('Fecha inválida');
      if (seen.has(duplicateKey)) errors.push('Venta duplicada');
      seen.add(duplicateKey);
      const rowKey = createHash('sha256').update(`${externalSaleId}|${externalProductCode}|${quantity}|${soldAt?.toISOString() ?? ''}`).digest('hex');
      await this.prisma.restaurantSalesImportRow.update({ where: { id: row.id }, data: { externalSaleId, externalProductCode, externalProductName, quantity: Number.isFinite(quantity) ? quantity : 0, soldAt: soldAt ?? new Date(0), idempotencyKey: rowKey, validationStatus: errors.length ? (errors.includes('Venta duplicada') ? 'DUPLICATE' : 'INVALID') : 'VALID', validationErrors: errors, recipeId: null } });
    }
    const validRows = await this.prisma.restaurantSalesImportRow.count({ where: { salesImportId: id, validationStatus: 'VALID' } });
    const invalidRows = await this.prisma.restaurantSalesImportRow.count({ where: { salesImportId: id, validationStatus: 'INVALID' } });
    const duplicateRows = await this.prisma.restaurantSalesImportRow.count({ where: { salesImportId: id, validationStatus: 'DUPLICATE' } });
    return this.prisma.restaurantSalesImport.update({ where: { id }, data: { columnMap: indexes as any, validRows, invalidRows, duplicateRows, status: validRows ? 'REQUIRES_MAPPING' : 'FAILED' }, include: { rows: { orderBy: { rowNumber: 'asc' } } } });
  }

  async mappings(tenantId: string, id?: string, branchId?: string) {
    const where: any = { tenantId, ...(branchId ? { OR: [{ branchId }, { branchId: null }] } : {}) };
    if (id) {
      const imp = await this.prisma.restaurantSalesImport.findFirst({ where: { id, tenantId }, select: { branchId: true } });
      if (!imp) this.fail('Importación no encontrada');
      where.OR = [{ branchId: imp!.branchId }, { branchId: null }];
    }
    return this.prisma.restaurantExternalProductMapping.findMany({ where, orderBy: [{ branchId: 'desc' }, { externalProductCode: 'asc' }] });
  }

  async preview(tenantId: string, id: string) {
    const imp = await this.summary(tenantId, id);
    if (!imp) this.fail('Importación no encontrada');
    if (!['READY', 'REQUIRES_MAPPING'].includes(imp!.status)) this.fail('La importación no está lista para vista previa');
    const rows = imp!.rows.filter((row) => row.validationStatus === 'VALID' && row.recipeId);
    const grouped = new Map<string, number>();
    for (const row of rows) grouped.set(row.recipeId!, (grouped.get(row.recipeId!) ?? 0) + Number(row.quantity));
    const stock = await this.inventory.previewConsumption(tenantId, { branchId: imp!.branchId, warehouseId: imp!.warehouseId, consumptionDate: new Date().toISOString(), shift: 'OTHER', items: [...grouped.entries()].map(([recipeId, quantitySold]) => ({ recipeId, quantitySold })) } as any);
    return { importId: id, rows: rows.map((row) => ({ rowNumber: row.rowNumber, productCode: row.externalProductCode, recipeId: row.recipeId, quantity: Number(row.quantity), soldAt: row.soldAt })), stock, canProcess: rows.length > 0 && stock.ingredients?.every((item: any) => item.shortageQuantity <= 0) };
  }

  async history(tenantId: string, filters: { branchId?: string; page?: number; pageSize?: number } = {}) {
    const page = Math.max(1, Number(filters.page ?? 1)); const pageSize = Math.min(100, Math.max(1, Number(filters.pageSize ?? 25)));
    const where = { tenantId, ...(filters.branchId ? { branchId: filters.branchId } : {}) };
    const [items, total] = await Promise.all([this.prisma.restaurantSalesImport.findMany({ where, orderBy: { importDate: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }), this.prisma.restaurantSalesImport.count({ where })]);
    return { items, page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
  }

  async progress(tenantId: string, id: string) {
    const imp = await this.summary(tenantId, id);
    if (!imp) this.fail('Importación no encontrada');
    const completed = imp!.processedRows + imp!.failedRows + imp!.duplicateRows;
    return { id: imp!.id, status: imp!.status, totalRows: imp!.totalRows, validRows: imp!.validRows, invalidRows: imp!.invalidRows, duplicateRows: imp!.duplicateRows, processedRows: imp!.processedRows, failedRows: imp!.failedRows, cancelRequested: imp!.cancelRequested, percent: imp!.totalRows ? Math.min(100, Math.round((completed / imp!.totalRows) * 100)) : 0, jobId: imp!.jobId };
  }

  async errors(tenantId: string, id: string) {
    const imp = await this.summary(tenantId, id);
    if (!imp) this.fail('Importación no encontrada');
    return imp!.rows.filter((row) => ['INVALID', 'DUPLICATE', 'FAILED'].includes(row.validationStatus)).map((row) => ({ row: row.rowNumber, externalSaleId: row.externalSaleId, externalProductCode: row.externalProductCode, status: row.validationStatus, errors: row.validationErrors, lastError: row.lastError, attempts: row.attempts }));
  }

  async errorsCsv(tenantId: string, id: string) {
    const rows = await this.errors(tenantId, id);
    const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    return ['row,external_sale_id,external_product_code,status,errors', ...rows.map((row: any) => [row.row, row.externalSaleId, row.externalProductCode, row.status, (row.errors ?? []).join(' | ')].map(escape).join(','))].join('\n');
  }

  async mapProduct(tenantId: string, _userId: string, dto: any) {
    const recipe = await this.prisma.restaurantRecipe.findFirst({ where: { id: dto.recipeId, tenantId } });
    if (!recipe) this.fail('Receta no encontrada en la empresa');
    return this.prisma.restaurantExternalProductMapping.upsert({ where: { tenantId_branchId_externalSystem_externalProductCode: { tenantId, branchId: dto.branchId ?? null, externalSystem: dto.externalSystem, externalProductCode: dto.externalProductCode } }, update: { recipeId: dto.recipeId, externalProductName: dto.externalProductName, status: 'ACTIVE' }, create: { tenantId, branchId: dto.branchId, externalSystem: dto.externalSystem, externalProductCode: dto.externalProductCode, externalProductName: dto.externalProductName, recipeId: dto.recipeId } });
  }

  async validate(tenantId: string, id: string) {
    const imp = await this.summary(tenantId, id);
    if (!imp) this.fail('Importación no encontrada');
    for (const row of imp!.rows.filter((r) => r.validationStatus === 'VALID')) {
      const map = await this.prisma.restaurantExternalProductMapping.findFirst({ where: { tenantId, externalProductCode: row.externalProductCode, status: 'ACTIVE', OR: [{ branchId: imp!.branchId }, { branchId: null }] }, orderBy: { branchId: 'desc' } });
      if (!map) await this.prisma.restaurantSalesImportRow.update({ where: { id: row.id }, data: { validationStatus: 'INVALID', validationErrors: ['Producto sin mapeo'] } });
      else await this.prisma.restaurantSalesImportRow.update({ where: { id: row.id }, data: { recipeId: map.recipeId, validationErrors: [] } });
    }
    const validRows = await this.prisma.restaurantSalesImportRow.count({ where: { salesImportId: id, validationStatus: 'VALID', recipeId: { not: null } } });
    const invalidRows = await this.prisma.restaurantSalesImportRow.count({ where: { salesImportId: id, validationStatus: 'INVALID' } });
    const result = await this.prisma.restaurantSalesImport.update({ where: { id }, data: { validRows, invalidRows, status: validRows ? 'READY' : 'FAILED' }, include: { rows: { orderBy: { rowNumber: 'asc' } } } });
    return { ...result, totalRows: result.rows.length, errors: result.rows.flatMap((row) => ((row.validationErrors as string[] | null) ?? []).map((message) => ({ row: row.rowNumber, message, code: 'ROW_VALIDATION' }))) };
  }

  async process(tenantId: string, userId: string, id: string) {
    const claimed = await this.prisma.restaurantSalesImport.updateMany({ where: { id, tenantId, status: { in: ['READY', 'PARTIALLY_COMPLETED'] } }, data: { status: 'PROCESSING', cancelRequested: false, processedBy: userId } });
    if (!claimed.count) {
      const current = await this.summary(tenantId, id);
      if (!current) this.fail('Importación no encontrada');
      if (current!.status === 'COMPLETED') return this.progress(tenantId, id);
      if (current!.status === 'PROCESSING') return { ...(await this.progress(tenantId, id)), queued: true };
      this.fail('Importación no lista para procesar');
    }
    if (this.queues?.isEnabled()) {
      const job = await this.queues.addJob({ queueName: MESSAGE_QUEUE_NAMES.SALES_IMPORT, jobName: 'process-sales-import', payload: { tenantId, userId, importId: id }, options: { jobId: `sales-import:${id}`, attempts: 3, backoff: { type: 'exponential', delay: 1000 } } });
      await this.prisma.restaurantSalesImport.update({ where: { id }, data: { jobId: job?.id ? String(job.id) : null } });
      return { ...(await this.progress(tenantId, id)), queued: true, jobId: job?.id ? String(job.id) : null };
    }
    return this.processRows(tenantId, userId, id);
  }

  private async processRows(tenantId: string, userId: string, id: string) {
    const batchSize = 50;
    while (true) {
      const imp = await this.prisma.restaurantSalesImport.findFirst({ where: { id, tenantId } });
      if (!imp) this.fail('Importación no encontrada');
      if (imp!.cancelRequested) return this.prisma.restaurantSalesImport.update({ where: { id }, data: { status: 'CANCELLED', cancelledAt: new Date(), processedAt: new Date() } });
      const rows = await this.prisma.restaurantSalesImportRow.findMany({ where: { salesImportId: id, validationStatus: 'VALID', recipeId: { not: null } }, orderBy: { rowNumber: 'asc' }, take: batchSize });
      if (!rows.length) break;
      for (const row of rows) {
        const claim = await this.prisma.restaurantSalesImportRow.updateMany({ where: { id: row.id, salesImportId: id, validationStatus: 'VALID' }, data: { validationStatus: 'PROCESSING', attempts: { increment: 1 } } });
        if (!claim.count) continue;
        try {
          const consumption = await this.inventory.createConsumption(tenantId, userId, { branchId: imp!.branchId, warehouseId: imp!.warehouseId, consumptionDate: row.soldAt.toISOString(), shift: 'OTHER', notes: `Importación ${id}, fila ${row.rowNumber}`, items: [{ recipeId: row.recipeId, quantitySold: Number(row.quantity) }] } as any);
          await this.prisma.restaurantConsumptionRecord.update({ where: { id: consumption.id }, data: { salesImportId: id } });
          await this.inventory.confirmConsumption(tenantId, userId, consumption.id, false);
          const item = await this.prisma.restaurantConsumptionRecordItem.findFirst({ where: { consumptionRecordId: consumption.id } });
          await this.prisma.restaurantSalesImportRow.update({ where: { id: row.id }, data: { validationStatus: 'PROCESSED', processedAt: new Date(), consumptionId: consumption.id } });
          if (item) await this.prisma.restaurantConsumptionRecordItem.update({ where: { id: item.id }, data: { salesImportRowId: row.id } });
          await this.prisma.restaurantSalesImport.update({ where: { id }, data: { processedRows: { increment: 1 } } });
        } catch (error: any) {
          await this.prisma.restaurantSalesImportRow.update({ where: { id: row.id }, data: { validationStatus: 'FAILED', validationErrors: ['Error al procesar consumo'], lastError: String(error?.message ?? error) } });
          await this.prisma.restaurantSalesImport.update({ where: { id }, data: { failedRows: { increment: 1 } } });
        }
      }
    }
    const pending = await this.prisma.restaurantSalesImportRow.count({ where: { salesImportId: id, validationStatus: { in: ['VALID', 'PROCESSING'] } } });
    return this.prisma.restaurantSalesImport.update({ where: { id }, data: { status: pending ? 'PARTIALLY_COMPLETED' : 'COMPLETED', processedAt: new Date() } });
  }

  async retry(tenantId: string, userId: string, id: string) {
    const imp = await this.summary(tenantId, id);
    if (!imp || !['PARTIALLY_COMPLETED', 'FAILED'].includes(imp.status)) this.fail('La importación no tiene filas reintentables');
    await this.prisma.restaurantSalesImportRow.updateMany({ where: { salesImportId: id, validationStatus: 'FAILED' }, data: { validationStatus: 'VALID', lastError: null, validationErrors: [] } });
    await this.prisma.restaurantSalesImport.update({ where: { id }, data: { failedRows: 0, status: 'READY' } });
    return this.process(tenantId, userId, id);
  }

  async cancel(tenantId: string, userId: string, id: string) {
    const imp = await this.summary(tenantId, id);
    if (!imp || imp.status === 'CANCELLED') this.fail('Importación no encontrada o ya cancelada');
    if (imp!.status === 'PROCESSING') return this.prisma.restaurantSalesImport.update({ where: { id }, data: { cancelRequested: true } });
    const consumptions = await this.prisma.restaurantConsumptionRecord.findMany({ where: { tenantId, salesImportId: id, status: 'CONFIRMED' }, select: { id: true } });
    for (const consumption of consumptions) await this.inventory.cancelConsumption(tenantId, userId, consumption.id);
    return this.prisma.restaurantSalesImport.update({ where: { id }, data: { status: 'CANCELLED', cancelledAt: new Date(), processedAt: new Date() } });
  }
}

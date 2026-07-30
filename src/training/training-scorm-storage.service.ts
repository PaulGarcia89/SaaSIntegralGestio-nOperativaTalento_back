import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import AdmZip from 'adm-zip';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { PrismaService } from '../common/prisma/prisma.service';
import { TrainingAntivirusService } from './training-antivirus.service';
import { TrainingObjectStorageService } from './training-object-storage.service';

const MAX_FILES = 2_000;
const MAX_UNCOMPRESSED_BYTES = 500 * 1024 * 1024;

@Injectable()
export class TrainingScormStorageService {
  constructor(private readonly prisma: PrismaService, private readonly storage: TrainingObjectStorageService, private readonly antivirus: TrainingAntivirusService) {}

  async store(tenantId: string, actorId: string, courseId: string, title: string, file: Express.Multer.File) {
    if (!file || (file.mimetype !== 'application/zip' && !file.originalname.toLowerCase().endsWith('.zip'))) throw new BadRequestException('A ZIP package is required');
    const maxUploadBytes = Number(process.env.SCORM_MAX_UPLOAD_BYTES ?? 100 * 1024 * 1024);
    if (file.size > maxUploadBytes) throw new BadRequestException('SCORM package exceeds the tenant upload limit');
    const course = await this.prisma.trainingCourse.findFirst({ where: { id: courseId, OR: [{ tenantId }, { tenantId: null }] } });
    if (!course) throw new NotFoundException('Training course not found');
    const usage = await this.prisma.trainingScormPackage.aggregate({ where: { tenantId }, _sum: { fileSize: true }, _count: true });
    const quotaBytes = Number(process.env.SCORM_TENANT_QUOTA_BYTES ?? 2 * 1024 * 1024 * 1024);
    const packageLimit = Number(process.env.SCORM_TENANT_PACKAGE_LIMIT ?? 250);
    if (usage._count >= packageLimit || (usage._sum.fileSize ?? 0) + file.size > quotaBytes) throw new BadRequestException('SCORM storage quota exceeded');
    const scan = await this.antivirus.scan(file.buffer);

    let zip: AdmZip;
    try { zip = new AdmZip(file.buffer); } catch { throw new BadRequestException('Invalid ZIP package'); }
    const entries = zip.getEntries();
    if (!entries.length || entries.length > MAX_FILES) throw new BadRequestException('SCORM package has an invalid file count');
    let totalSize = 0;
    for (const entry of entries) {
      const normalized = path.posix.normalize(entry.entryName.replaceAll('\\', '/'));
      if (normalized.startsWith('../') || normalized.startsWith('/') || normalized.includes('/../')) throw new BadRequestException('Unsafe path in SCORM package');
      totalSize += entry.header.size;
      if (totalSize > MAX_UNCOMPRESSED_BYTES) throw new BadRequestException('SCORM package is too large after extraction');
    }
    const manifestEntry = entries.find((entry) => entry.entryName.toLowerCase() === 'imsmanifest.xml');
    if (!manifestEntry) throw new BadRequestException('imsmanifest.xml is required');
    const manifestXml = manifestEntry.getData().toString('utf8');
    const launchPath = this.readLaunchPath(manifestXml);
    if (!entries.some((entry) => entry.entryName === launchPath)) throw new BadRequestException('SCORM launch resource is missing');
    const version = /2004|1\.3/i.test(manifestXml) ? '2004' : '1.2';
    const id = randomUUID();
    const prefix = `${tenantId}/${id}`;
    await Promise.all(entries.filter((entry) => !entry.isDirectory).map((entry) => this.storage.put(`${prefix}/${entry.entryName}`, entry.getData(), this.contentType(entry.entryName))));
    await this.storage.put(`${prefix}/.source.zip`, file.buffer, 'application/zip');
    const packageRoot = this.storage.driver === 's3' ? `s3://${process.env.SCORM_S3_BUCKET ?? 'talentos-scorm'}/${prefix}` : path.resolve(process.env.SCORM_STORAGE_ROOT ?? path.join(process.cwd(), 'storage', 'scorm'), prefix);
    const checksum = createHash('sha256').update(file.buffer).digest('hex');
    return this.prisma.trainingScormPackage.create({
      data: {
        id, tenantId, courseId, title, version, checksum, storagePath: packageRoot, fileSize: file.size,
        launchUrl: `/api/training/integrations/scorm-packages/${id}/files/${launchPath}`,
        manifest: { launchPath, fileCount: entries.length, uncompressedBytes: totalSize, validatedAt: new Date().toISOString(), antivirus: scan, storageDriver: this.storage.driver },
        createdById: actorId,
      },
      include: { course: { select: { title: true } }, _count: { select: { sessions: true } } },
    });
  }

  async readAsset(tenantId: string, packageId: string, requestedPath: string) {
    const item = await this.prisma.trainingScormPackage.findFirst({ where: { id: packageId, tenantId } });
    if (!item?.storagePath) throw new NotFoundException('SCORM package not found');
    try {
      const normalized = path.posix.normalize(requestedPath.replaceAll('\\', '/'));
      if (normalized.startsWith('../') || normalized.startsWith('/')) throw new BadRequestException('Unsafe SCORM asset path');
      return { buffer: await this.storage.get(item.storagePath, normalized), filePath: normalized };
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof NotFoundException) throw error;
      throw new NotFoundException('SCORM asset not found');
    }
  }
  async findTenantForPackage(packageId: string) {
    const item = await this.prisma.trainingScormPackage.findUnique({ where: { id: packageId }, select: { tenantId: true } });
    if (!item) throw new NotFoundException('SCORM package not found');
    return item;
  }

  async createLaunchUrl(tenantId: string, packageId: string) {
    const item = await this.prisma.trainingScormPackage.findFirst({ where: { id: packageId, tenantId } });
    const launchPath = item && typeof item.manifest === 'object' && item.manifest && 'launchPath' in item.manifest ? String((item.manifest as { launchPath: unknown }).launchPath) : null;
    if (!item?.storagePath || !launchPath) throw new NotFoundException('SCORM package not found');
    const expiresAt = Date.now() + 5 * 60_000;
    const token = this.sign(`${tenantId}:${packageId}:${expiresAt}`);
    return { url: `/api/training/scorm/${packageId}/launch?tenant=${encodeURIComponent(tenantId)}&expires=${expiresAt}&token=${token}` };
  }

  async validateLaunch(packageId: string, tenantId: string, expiresAt: number, token: string) {
    if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) throw new BadRequestException('SCORM launch link expired');
    const expected = this.sign(`${tenantId}:${packageId}:${expiresAt}`);
    const supplied = Buffer.from(token);
    const reference = Buffer.from(expected);
    if (supplied.length !== reference.length || !timingSafeEqual(supplied, reference)) throw new BadRequestException('Invalid SCORM launch link');
    const item = await this.prisma.trainingScormPackage.findFirst({ where: { id: packageId, tenantId } });
    const launchPath = item && typeof item.manifest === 'object' && item.manifest && 'launchPath' in item.manifest ? String((item.manifest as { launchPath: unknown }).launchPath) : null;
    if (!launchPath) throw new NotFoundException('SCORM package not found');
    return { launchPath, cookie: this.sign(`${tenantId}:${packageId}`) };
  }

  validateAssetCookie(tenantId: string, packageId: string, cookie: string) {
    const expected = this.sign(`${tenantId}:${packageId}`);
    const supplied = Buffer.from(cookie);
    const reference = Buffer.from(expected);
    if (supplied.length !== reference.length || !timingSafeEqual(supplied, reference)) throw new BadRequestException('Invalid SCORM session');
  }

  private readLaunchPath(manifest: string) {
    const resourceMatch = manifest.match(/<resource\b[^>]*\bhref=["']([^"']+)["'][^>]*>/i);
    if (!resourceMatch?.[1]) throw new BadRequestException('SCORM manifest has no launch resource');
    const launchPath = decodeURIComponent(resourceMatch[1].split(/[?#]/)[0]).replaceAll('\\', '/');
    const normalized = path.posix.normalize(launchPath);
    if (normalized.startsWith('../') || normalized.startsWith('/')) throw new BadRequestException('Unsafe launch resource');
    return normalized;
  }
  private sign(value: string) {
    return createHmac('sha256', process.env.SCORM_SIGNING_KEY ?? process.env.JWT_ACCESS_SECRET ?? 'development-only-key').update(value).digest('base64url');
  }
  health() {
    return { storage: this.storage.describe(), antivirus: this.antivirus.describe(), limits: { maxUploadBytes: Number(process.env.SCORM_MAX_UPLOAD_BYTES ?? 100 * 1024 * 1024), tenantQuotaBytes: Number(process.env.SCORM_TENANT_QUOTA_BYTES ?? 2 * 1024 * 1024 * 1024), packageLimit: Number(process.env.SCORM_TENANT_PACKAGE_LIMIT ?? 250) } };
  }
  private contentType(file: string) {
    const types: Record<string,string> = { '.html':'text/html; charset=utf-8','.htm':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.xml':'application/xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.mp4':'video/mp4','.pdf':'application/pdf' };
    return types[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
  }
}

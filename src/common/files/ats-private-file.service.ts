import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { PrismaService } from '../prisma/prisma.service';

type AtsFileKind = 'resume' | 'vacancy-image';

@Injectable()
export class AtsPrivateFileService {
  readonly driver = (process.env.ATS_FILE_STORAGE_DRIVER ?? 'local').toLowerCase();
  private readonly bucket = process.env.ATS_FILE_S3_BUCKET ?? 'talentos-ats-private';
  private readonly root = path.resolve(
    process.env.ATS_FILE_STORAGE_ROOT ?? path.join(process.cwd(), 'storage', 'ats-private'),
  );
  private readonly client = this.driver === 's3'
    ? new S3Client({
        region: process.env.ATS_FILE_S3_REGION ?? 'us-east-1',
        endpoint: process.env.ATS_FILE_S3_ENDPOINT,
        forcePathStyle: process.env.ATS_FILE_S3_FORCE_PATH_STYLE === 'true',
        credentials: process.env.ATS_FILE_S3_ACCESS_KEY_ID
          ? {
              accessKeyId: process.env.ATS_FILE_S3_ACCESS_KEY_ID,
              secretAccessKey: process.env.ATS_FILE_S3_SECRET_ACCESS_KEY ?? '',
            }
          : undefined,
      })
    : null;

  constructor(private readonly prisma: PrismaService) {}

  validateResume(file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('A resume file is required');
    this.assertSize(file, 15 * 1024 * 1024);
    const detected = this.detectMime(file.buffer);
    const allowed = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!allowed.includes(detected) || !allowed.includes(file.mimetype)) {
      throw new BadRequestException('Resume must be a valid PDF or DOCX file');
    }
    return detected;
  }

  validateVacancyImage(file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('A vacancy image is required');
    this.assertSize(file, 5 * 1024 * 1024);
    const detected = this.detectMime(file.buffer);
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(detected) || !allowed.includes(file.mimetype)) {
      throw new BadRequestException('Vacancy image must be a valid JPEG, PNG or WebP file');
    }
    return detected;
  }

  async store(
    kind: AtsFileKind,
    tenantId: string,
    ownerId: string,
    file: Express.Multer.File,
    mimeType: string,
  ) {
    const extension = this.extensionFor(mimeType);
    const key = `${tenantId}/${kind}/${ownerId}/${new Date().getUTCFullYear()}/${randomUUID()}${extension}`;
    if (this.driver === 's3') {
      if (!this.client) throw new ServiceUnavailableException('ATS private storage is not configured');
      await this.client.send(new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: mimeType,
        ServerSideEncryption: process.env.ATS_FILE_S3_SSE === 'false' ? undefined : 'AES256',
        Metadata: { tenant: tenantId, kind },
      }));
    } else {
      const absolute = this.safePath(key);
      await mkdir(path.dirname(absolute), { recursive: true });
      await writeFile(absolute, file.buffer, { mode: 0o600 });
    }
    return {
      storageKey: key,
      sha256: createHash('sha256').update(file.buffer).digest('hex'),
    };
  }

  async delete(storageKey: string) {
    if (this.driver === 's3') {
      if (!this.client) throw new ServiceUnavailableException('ATS private storage is not configured');
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: storageKey }));
      return;
    }
    await unlink(this.safePath(storageKey)).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }

  createSignedUrl(kind: AtsFileKind, fileId: string, ttlSeconds = 300) {
    const expiresAt = Date.now() + Math.min(Math.max(ttlSeconds, 30), 900) * 1000;
    const payload = Buffer.from(JSON.stringify({ kind, fileId, expiresAt })).toString('base64url');
    const signature = createHmac('sha256', this.signingSecret()).update(payload).digest('base64url');
    const baseUrl = (process.env.API_PUBLIC_URL ?? 'http://localhost:3001').replace(/\/$/, '');
    return {
      url: `${baseUrl}/public/ats-files/${kind}/${fileId}?token=${payload}.${signature}`,
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }

  async readSigned(kind: AtsFileKind, fileId: string, token: string) {
    this.verifyToken(kind, fileId, token);
    const record = kind === 'resume'
      ? await this.prisma.candidateResumeFile.findFirst({
          where: { id: fileId, status: { in: ['ACTIVE', 'SUPERSEDED'] }, retainUntil: { gt: new Date() } },
        })
      : await this.prisma.vacancyImageFile.findFirst({
          where: { id: fileId, status: { in: ['ACTIVE', 'SUPERSEDED'] }, retainUntil: { gt: new Date() } },
        });
    if (!record) throw new NotFoundException('File not found or no longer retained');
    return {
      buffer: await this.read(record.storageKey),
      mimeType: record.mimeType,
      originalName: record.originalName,
      sha256: record.sha256,
    };
  }

  retentionDate(kind: AtsFileKind) {
    const defaultDays = kind === 'resume' ? 730 : 365;
    const configured = Number(
      kind === 'resume'
        ? process.env.ATS_RESUME_RETENTION_DAYS
        : process.env.ATS_VACANCY_IMAGE_RETENTION_DAYS,
    );
    const days = Number.isFinite(configured) && configured > 0 ? configured : defaultDays;
    return new Date(Date.now() + days * 86_400_000);
  }

  private async read(storageKey: string) {
    if (this.driver === 's3') {
      if (!this.client) throw new ServiceUnavailableException('ATS private storage is not configured');
      const response = await this.client.send(new GetObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
      }));
      if (!response.Body) throw new NotFoundException('Stored file is empty');
      return Buffer.from(await response.Body.transformToByteArray());
    }
    return readFile(this.safePath(storageKey)).catch(() => {
      throw new NotFoundException('Stored file not found');
    });
  }

  private verifyToken(kind: AtsFileKind, fileId: string, token: string) {
    const [payload, suppliedSignature] = token.split('.');
    if (!payload || !suppliedSignature) throw new UnauthorizedException('Invalid file token');
    const expectedSignature = createHmac('sha256', this.signingSecret()).update(payload).digest('base64url');
    const supplied = Buffer.from(suppliedSignature);
    const expected = Buffer.from(expectedSignature);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      throw new UnauthorizedException('Invalid file token');
    }
    let decoded: { kind?: string; fileId?: string; expiresAt?: number };
    try {
      decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    } catch {
      throw new UnauthorizedException('Invalid file token');
    }
    if (decoded.kind !== kind || decoded.fileId !== fileId || !decoded.expiresAt || decoded.expiresAt < Date.now()) {
      throw new UnauthorizedException('File token has expired or does not match the resource');
    }
  }

  private signingSecret() {
    const secret = process.env.ATS_FILE_SIGNING_SECRET ?? process.env.JWT_SECRET;
    if (!secret && process.env.NODE_ENV === 'production') {
      throw new ServiceUnavailableException('ATS file signing is not configured');
    }
    return secret ?? 'local-development-ats-file-secret';
  }

  private assertSize(file: Express.Multer.File, maximum: number) {
    if (!file.size || file.size > maximum || file.buffer.length > maximum) {
      throw new BadRequestException(`File exceeds the ${Math.floor(maximum / 1024 / 1024)} MB limit`);
    }
  }

  private detectMime(buffer: Buffer) {
    if (buffer.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
    if (buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04) {
      try {
        const names = new Set(new AdmZip(buffer).getEntries().map((entry) => entry.entryName));
        if (names.has('[Content_Types].xml') && names.has('word/document.xml')) {
          return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        }
      } catch {
        return 'application/octet-stream';
      }
      return 'application/octet-stream';
    }
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
    if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
    if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
    return 'application/octet-stream';
  }

  private extensionFor(mimeType: string) {
    return ({
      'application/pdf': '.pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
    } as Record<string, string>)[mimeType] ?? '';
  }

  private safePath(storageKey: string) {
    const absolute = path.resolve(this.root, storageKey);
    if (!absolute.startsWith(`${this.root}${path.sep}`)) {
      throw new ServiceUnavailableException('Unsafe ATS private storage path');
    }
    return absolute;
  }
}

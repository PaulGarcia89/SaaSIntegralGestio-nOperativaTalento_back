import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { PrismaService } from '../prisma/prisma.service';

type AtsFileKind = 'resume' | 'vacancy-image';

@Injectable()
export class AtsPrivateFileService {
  readonly driver = (process.env.ATS_FILE_STORAGE_DRIVER ?? 'local').toLowerCase();
  readonly provider = process.env.ATS_FILE_STORAGE_PROVIDER?.toLowerCase()
    ?? (process.env.ATS_FILE_S3_ENDPOINT?.includes('r2.cloudflarestorage.com') ? 'r2' : 's3');
  readonly bucket = process.env.ATS_FILE_S3_BUCKET ?? 'talentos-ats-private';
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
    this.assertSafeOriginalName(file.originalname);
    const detected = this.detectMime(file.buffer);
    const allowed = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!allowed.includes(detected) || !allowed.includes(file.mimetype)) {
      throw new BadRequestException('Resume must be a valid PDF or DOCX file');
    }
    const expectedExtension = detected === 'application/pdf' ? '.pdf' : '.docx';
    if (path.extname(file.originalname).toLowerCase() !== expectedExtension) {
      throw new BadRequestException('Resume extension does not match its binary format');
    }
    if (detected === 'application/pdf') this.assertSafePdf(file.buffer);
    else this.assertSafeDocx(file.buffer);
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
    // User-controlled names never become object keys. Every upload enters an isolated staging area.
    const key = `${tenantId}/quarantine/${kind}/${ownerId}/${new Date().getUTCFullYear()}/${randomUUID()}${extension}`;
    if (this.driver === 's3') {
      const client = this.remoteClient();
      await client.send(new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: mimeType,
        // R2 encrypts every object with AES-256 automatically. AWS S3 receives an explicit SSE request.
        ServerSideEncryption: this.provider === 'r2' || process.env.ATS_FILE_S3_SSE === 'false'
          ? undefined
          : 'AES256',
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

  async promote(storageKey: string) {
    if (!storageKey.includes('/quarantine/')) {
      throw new ServiceUnavailableException('Only quarantined ATS files can be promoted');
    }
    const promotedKey = storageKey.replace('/quarantine/', '/private/');
    if (this.driver === 's3') {
      const client = this.remoteClient();
      await client.send(new CopyObjectCommand({
        Bucket: this.bucket,
        CopySource: `${this.bucket}/${encodeURI(storageKey).replace(/#/g, '%23')}`,
        Key: promotedKey,
        MetadataDirective: 'COPY',
        ServerSideEncryption: this.provider === 'r2' || process.env.ATS_FILE_S3_SSE === 'false'
          ? undefined
          : 'AES256',
      }));
      try {
        await client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: storageKey }));
      } catch (error) {
        await client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: promotedKey })).catch(() => undefined);
        throw error;
      }
    } else {
      const source = this.safePath(storageKey);
      const destination = this.safePath(promotedKey);
      await mkdir(path.dirname(destination), { recursive: true });
      await rename(source, destination);
    }
    return { storageKey: promotedKey };
  }

  async delete(storageKey: string) {
    if (this.driver === 's3') {
      const client = this.remoteClient();
      await client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: storageKey }));
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
    // Railway supplies the public hostname at runtime. Prefer an explicit URL,
    // but never issue localhost URLs for files requested by browser clients.
    const railwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
    const baseUrl = (
      process.env.API_PUBLIC_URL?.trim()
      ?? process.env.PUBLIC_FRONTEND_URL?.trim()
      ?? (railwayDomain ? `https://${railwayDomain}` : 'http://localhost')
    ).replace(/\/$/, '');
    const publicBaseUrl = process.env.DISABLE_GLOBAL_PREFIX !== 'true' && !baseUrl.endsWith('/api')
      ? `${baseUrl}/api`
      : baseUrl;
    return {
      url: `${publicBaseUrl}/public/ats-files/${kind}/${fileId}?token=${payload}.${signature}`,
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
    if (this.driver === 's3') {
      const client = this.remoteClient();
      const directTtl = Math.min(
        Math.max(Number(process.env.ATS_FILE_DIRECT_URL_TTL_SECONDS ?? 60), 30),
        300,
      );
      return {
        redirectUrl: await getSignedUrl(client, new GetObjectCommand({
          Bucket: this.bucket,
          Key: record.storageKey,
          ResponseContentType: record.mimeType,
          ResponseContentDisposition: `${kind === 'resume' ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(record.originalName)}`,
        }), { expiresIn: directTtl }),
        mimeType: record.mimeType,
        originalName: record.originalName,
        sha256: record.sha256,
      };
    }
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
      const client = this.remoteClient();
      const response = await client.send(new GetObjectCommand({
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

  storageConfiguration() {
    const endpoint = process.env.ATS_FILE_S3_ENDPOINT?.trim() ?? null;
    return {
      driver: this.driver,
      provider: this.driver === 's3' ? this.provider.toUpperCase() : 'LOCAL',
      bucket: this.driver === 's3' ? this.bucket : null,
      private: true,
      directSignedUrls: this.driver === 's3',
      encryption: this.driver === 's3'
        ? { enabled: true, mode: this.provider === 'r2' ? 'R2_MANAGED_AES_256' : 'SSE_AES_256' }
        : { enabled: true, mode: 'FILESYSTEM_PRIVATE_0600' },
      endpointUsesTls: !endpoint || endpoint.startsWith('https://'),
      credentialsConfigured: this.driver !== 's3' || Boolean(
        process.env.ATS_FILE_S3_ACCESS_KEY_ID && process.env.ATS_FILE_S3_SECRET_ACCESS_KEY,
      ),
    };
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
    const secret = process.env.ATS_FILE_SIGNING_SECRET
      ?? process.env.JWT_ACCESS_SECRET
      ?? process.env.JWT_SECRET;
    if (secret) return secret;

    // Railway always supplies DATABASE_URL to this service. Derive an isolated
    // signing key so private file delivery remains available during key setup.
    const databaseUrl = process.env.DATABASE_URL?.trim();
    if (databaseUrl) {
      return createHash('sha256')
        .update(`ats-private-file-signing:${databaseUrl}`)
        .digest('hex');
    }

    if (process.env.NODE_ENV === 'production') {
      throw new ServiceUnavailableException('ATS file signing is not configured');
    }
    return 'local-development-ats-file-secret';
  }

  private remoteClient(): S3Client {
    const endpoint = process.env.ATS_FILE_S3_ENDPOINT?.trim();
    const credentials = process.env.ATS_FILE_S3_ACCESS_KEY_ID?.trim()
      && process.env.ATS_FILE_S3_SECRET_ACCESS_KEY?.trim();
    if (!this.client || !this.bucket || (this.provider === 'r2' && (!endpoint || !credentials))) {
      throw new ServiceUnavailableException('ATS private S3/R2 storage is not fully configured');
    }
    if (endpoint && !endpoint.startsWith('https://') && process.env.NODE_ENV === 'production') {
      throw new ServiceUnavailableException('ATS private storage endpoint must use HTTPS');
    }
    return this.client;
  }

  private assertSize(file: Express.Multer.File, maximum: number) {
    if (!file.size || file.size > maximum || file.buffer.length > maximum) {
      throw new BadRequestException(`File exceeds the ${Math.floor(maximum / 1024 / 1024)} MB limit`);
    }
  }

  private assertSafeOriginalName(originalName: string) {
    if (!originalName || originalName.length > 180 || /[\0\r\n]/.test(originalName)) {
      throw new BadRequestException('Resume filename is invalid');
    }
    const basename = path.basename(originalName);
    if (basename !== originalName || basename.startsWith('.')) {
      throw new BadRequestException('Resume filename is unsafe');
    }
  }

  private assertSafePdf(buffer: Buffer) {
    const header = buffer.subarray(0, 8).toString('ascii');
    if (!/^%PDF-(?:1\.[0-7]|2\.0)/.test(header)) {
      throw new BadRequestException('PDF version or binary signature is invalid');
    }
    const eof = buffer.lastIndexOf(Buffer.from('%%EOF'));
    if (eof < 0 || buffer.subarray(eof + 5).toString('latin1').trim().length > 0) {
      throw new BadRequestException('PDF is incomplete or contains suspicious trailing data');
    }
    const source = buffer.toString('latin1');
    const activeTokens = [
      /\/JavaScript\b/i,
      /\/JS\b/i,
      /\/OpenAction\b/i,
      /\/AA\b/,
      /\/Launch\b/i,
      /\/RichMedia\b/i,
      /\/EmbeddedFile\b/i,
      /\/XFA\b/i,
      /\/AcroForm\b/i,
    ];
    if (activeTokens.some((pattern) => pattern.test(source))) {
      throw new BadRequestException('PDF contains active or embedded content');
    }
    const streamCount = source.match(/\bstream(?:\r?\n|\r)/g)?.length ?? 0;
    if (streamCount > 2_000) throw new BadRequestException('PDF contains too many compressed streams');
  }

  private assertSafeDocx(buffer: Buffer) {
    let archive: AdmZip;
    try {
      archive = new AdmZip(buffer);
    } catch {
      throw new BadRequestException('DOCX archive is corrupt');
    }
    const entries = archive.getEntries();
    if (!entries.length || entries.length > 500) {
      throw new BadRequestException('DOCX contains a suspicious number of compressed entries');
    }
    const names = new Set<string>();
    let expandedBytes = 0;
    for (const entry of entries) {
      const name = entry.entryName.replace(/\\/g, '/');
      const normalized = path.posix.normalize(name);
      if (
        names.has(name)
        || name.includes('\0')
        || name.startsWith('/')
        || normalized.startsWith('../')
        || normalized !== name.replace(/^\.\//, '')
        || entry.header.encrypted
      ) {
        throw new BadRequestException('DOCX contains an unsafe compressed entry');
      }
      names.add(name);
      expandedBytes += entry.header.size;
      if (entry.header.size > 20 * 1024 * 1024 || expandedBytes > 60 * 1024 * 1024) {
        throw new BadRequestException('DOCX expands beyond the safe processing limit');
      }
      const ratio = entry.header.compressedSize > 0
        ? entry.header.size / entry.header.compressedSize
        : entry.header.size > 0 ? Number.POSITIVE_INFINITY : 1;
      if (ratio > 200) throw new BadRequestException('DOCX contains a suspicious compression ratio');
    }
    const required = ['[Content_Types].xml', '_rels/.rels', 'word/document.xml'];
    if (required.some((name) => !names.has(name))) {
      throw new BadRequestException('DOCX structure is incomplete');
    }
    const forbiddenPaths = /(^|\/)(vbaProject\.bin|activeX|embeddings|customUI|oleObject|macros)(\/|$)/i;
    if ([...names].some((name) => forbiddenPaths.test(name))) {
      throw new BadRequestException('DOCX contains macros, ActiveX or embedded objects');
    }
    const contentTypes = archive.readAsText('[Content_Types].xml');
    const documentXml = archive.readAsText('word/document.xml');
    const relationships = entries
      .filter((entry) => entry.entryName.endsWith('.rels'))
      .map((entry) => entry.getData().toString('utf8'))
      .join('\n');
    if (
      /macroEnabled|vbaProject|activeX|oleObject|application\/vnd\.ms-word\.document\.macroEnabled/i.test(contentTypes)
      || /\bDDE(?:AUTO)?\b|INCLUDETEXT|INCLUDEPICT|<w:altChunk\b/i.test(documentXml)
      || /attachedTemplate|oleObject|externalLink/i.test(relationships)
    ) {
      throw new BadRequestException('DOCX contains active, macro-enabled or externally loaded content');
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

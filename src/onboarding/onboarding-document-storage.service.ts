import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

@Injectable()
export class OnboardingDocumentStorageService {
  readonly driver = (process.env.DOCUMENT_STORAGE_DRIVER ?? 'local').toLowerCase();
  private readonly bucket = process.env.DOCUMENT_S3_BUCKET ?? 'talentos-documents';
  private readonly client = this.driver === 's3' ? new S3Client({
    region: process.env.DOCUMENT_S3_REGION ?? 'us-east-1',
    endpoint: process.env.DOCUMENT_S3_ENDPOINT,
    forcePathStyle: process.env.DOCUMENT_S3_FORCE_PATH_STYLE === 'true',
    credentials: process.env.DOCUMENT_S3_ACCESS_KEY_ID
      ? { accessKeyId: process.env.DOCUMENT_S3_ACCESS_KEY_ID, secretAccessKey: process.env.DOCUMENT_S3_SECRET_ACCESS_KEY ?? '' }
      : undefined,
  }) : null;

  async store(tenantId: string, employeeId: string, file: Express.Multer.File) {
    const extension = path.extname(file.originalname).toLowerCase();
    const key = `${tenantId}/${employeeId}/${new Date().getUTCFullYear()}/${randomUUID()}${extension}`;
    if (this.driver === 's3') {
      if (!this.client) throw new ServiceUnavailableException('Document storage is not configured');
      await this.client.send(new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
        ServerSideEncryption: process.env.DOCUMENT_S3_SSE === 'false' ? undefined : 'AES256',
      }));
    } else {
      const root = path.resolve(process.env.DOCUMENT_STORAGE_ROOT ?? path.join(process.cwd(), 'storage', 'documents'));
      const absolute = path.resolve(root, key);
      if (!absolute.startsWith(`${root}${path.sep}`)) throw new ServiceUnavailableException('Unsafe document storage path');
      await mkdir(path.dirname(absolute), { recursive: true });
      await writeFile(absolute, file.buffer, { mode: 0o600 });
    }
    return { key, checksum: createHash('sha256').update(file.buffer).digest('hex') };
  }

  async read(key: string) {
    if (this.driver === 's3') {
      if (!this.client) throw new ServiceUnavailableException('Document storage is not configured');
      const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      return Buffer.from(await response.Body!.transformToByteArray());
    }
    const root = path.resolve(process.env.DOCUMENT_STORAGE_ROOT ?? path.join(process.cwd(), 'storage', 'documents'));
    const absolute = path.resolve(root, key);
    if (!absolute.startsWith(`${root}${path.sep}`)) throw new ServiceUnavailableException('Unsafe document storage path');
    return readFile(absolute);
  }

  async delete(key: string) {
    if (this.driver === 's3') {
      if (!this.client) throw new ServiceUnavailableException('Document storage is not configured');
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
      return;
    }
    const root = path.resolve(process.env.DOCUMENT_STORAGE_ROOT ?? path.join(process.cwd(), 'storage', 'documents'));
    const absolute = path.resolve(root, key);
    if (!absolute.startsWith(`${root}${path.sep}`)) throw new ServiceUnavailableException('Unsafe document storage path');
    await unlink(absolute).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
}

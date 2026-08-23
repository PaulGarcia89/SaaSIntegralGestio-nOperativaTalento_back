import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Injectable } from '@nestjs/common';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';

@Injectable()
export class TrainingObjectStorageService {
  readonly driver = (process.env.SCORM_STORAGE_DRIVER ?? 'filesystem').toLowerCase();
  private readonly bucket = process.env.SCORM_S3_BUCKET ?? 'talentos-scorm';
  private readonly client = this.driver === 's3' ? new S3Client({
    region: process.env.SCORM_S3_REGION ?? 'us-east-1',
    endpoint: process.env.SCORM_S3_ENDPOINT,
    forcePathStyle: process.env.SCORM_S3_FORCE_PATH_STYLE === 'true',
    credentials: process.env.SCORM_S3_ACCESS_KEY_ID ? { accessKeyId: process.env.SCORM_S3_ACCESS_KEY_ID, secretAccessKey: process.env.SCORM_S3_SECRET_ACCESS_KEY ?? '' } : undefined,
  }) : null;

  async put(key: string, body: Buffer, contentType?: string) {
    if (this.client) {
      await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType, ServerSideEncryption: process.env.SCORM_S3_SSE === 'false' ? undefined : 'AES256' }));
      return `s3://${this.bucket}/${key}`;
    }
    const root = path.resolve(process.env.SCORM_STORAGE_ROOT ?? path.join(process.cwd(), 'storage', 'scorm'));
    const absolute = path.resolve(root, key);
    if (!absolute.startsWith(`${root}${path.sep}`)) throw new Error('Unsafe storage key');
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, body, { mode: 0o640 });
    return absolute;
  }

  async get(storageRoot: string, relativePath: string) {
    if (storageRoot.startsWith('s3://')) {
      if (!this.client) throw new Error('S3 storage is not configured');
      const prefix = storageRoot.replace(`s3://${this.bucket}/`, '').replace(/\/$/, '');
      const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: `${prefix}/${relativePath}` }));
      if (!response.Body) throw new Error('Object body is empty');
      return Buffer.from(await (response.Body as Readable).toArray());
    }
    const root = path.resolve(storageRoot);
    const absolute = path.resolve(root, relativePath);
    if (!absolute.startsWith(`${root}${path.sep}`)) throw new Error('Unsafe storage path');
    return readFile(absolute);
  }

  async readKey(key: string) {
    if (this.client) {
      const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      if (!response.Body) throw new Error('Object body is empty');
      return Buffer.from(await (response.Body as Readable).toArray());
    }
    const root = path.resolve(process.env.SCORM_STORAGE_ROOT ?? path.join(process.cwd(), 'storage', 'scorm'));
    const absolute = path.resolve(root, key);
    if (!absolute.startsWith(`${root}${path.sep}`)) throw new Error('Unsafe storage key');
    return readFile(absolute);
  }

  describe() {
    return { driver: this.driver, bucket: this.client ? this.bucket : null, encryption: this.client ? process.env.SCORM_S3_SSE !== 'false' : true };
  }
}

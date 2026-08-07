import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

@Injectable()
export class InventoryEvidenceStorageService {
  private readonly driver = (process.env.INVENTORY_EVIDENCE_STORAGE_DRIVER ?? 'local').toLowerCase();
  private readonly bucket = process.env.INVENTORY_EVIDENCE_S3_BUCKET ?? 'talentos-inventory-private';
  private readonly root = process.env.INVENTORY_EVIDENCE_STORAGE_PATH ?? join(process.cwd(), 'private-storage', 'inventory');
  private readonly client = this.driver === 's3' || this.driver === 'r2' ? new S3Client({
    region: process.env.INVENTORY_EVIDENCE_S3_REGION ?? 'us-east-1', endpoint: process.env.INVENTORY_EVIDENCE_S3_ENDPOINT,
    forcePathStyle: process.env.INVENTORY_EVIDENCE_S3_FORCE_PATH_STYLE === 'true',
    credentials: process.env.INVENTORY_EVIDENCE_S3_ACCESS_KEY_ID ? { accessKeyId: process.env.INVENTORY_EVIDENCE_S3_ACCESS_KEY_ID, secretAccessKey: process.env.INVENTORY_EVIDENCE_S3_SECRET_ACCESS_KEY ?? '' } : undefined,
  }) : null;

  async save(tenantId: string, file: Express.Multer.File) {
    const extension = file.originalname.includes('.') ? `.${file.originalname.split('.').pop()!.toLowerCase()}` : '';
    const storageKey = `${tenantId}/${randomUUID()}${extension}`;
    if (this.client) {
      await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: storageKey, Body: file.buffer, ContentType: file.mimetype, ServerSideEncryption: this.driver === 'r2' || process.env.INVENTORY_EVIDENCE_S3_SSE === 'false' ? undefined : 'AES256' }));
      return { storageKey, sha256: createHash('sha256').update(file.buffer).digest('hex') };
    }
    if (this.driver !== 'local') throw new ServiceUnavailableException('El almacenamiento privado de Inventario no está configurado');
    const directory = join(this.root, tenantId);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(join(this.root, storageKey), file.buffer, { mode: 0o600 });
    return { storageKey, sha256: createHash('sha256').update(file.buffer).digest('hex') };
  }

  async read(storageKey: string) {
    if (this.client) { const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: storageKey })); return Buffer.from(await response.Body!.transformToByteArray()); }
    if (this.driver !== 'local') throw new ServiceUnavailableException('El almacenamiento privado de Inventario no está configurado');
    try { return await readFile(join(this.root, storageKey)); }
    catch { throw new NotFoundException('Evidence file not found'); }
  }
}

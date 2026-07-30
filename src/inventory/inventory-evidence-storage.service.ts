import { Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

@Injectable()
export class InventoryEvidenceStorageService {
  private readonly root = process.env.INVENTORY_EVIDENCE_STORAGE_PATH ?? join(process.cwd(), 'private-storage', 'inventory');

  async save(tenantId: string, file: Express.Multer.File) {
    const directory = join(this.root, tenantId);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const extension = file.originalname.includes('.') ? `.${file.originalname.split('.').pop()!.toLowerCase()}` : '';
    const storageKey = `${tenantId}/${randomUUID()}${extension}`;
    await writeFile(join(this.root, storageKey), file.buffer, { mode: 0o600 });
    return { storageKey, sha256: createHash('sha256').update(file.buffer).digest('hex') };
  }

  async read(storageKey: string) {
    try { return await readFile(join(this.root, storageKey)); }
    catch { throw new NotFoundException('Evidence file not found'); }
  }
}

import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Injectable } from '@nestjs/common';
import { createReadStream } from 'node:fs';
import { chmod, copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
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

  async putFile(key: string, filePath: string, contentType?: string) {
    if (this.client) {
      await this.client.send(new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: createReadStream(filePath),
        ContentType: contentType,
        ServerSideEncryption: process.env.SCORM_S3_SSE === 'false' ? undefined : 'AES256',
      }));
      return `s3://${this.bucket}/${key}`;
    }

    const root = path.resolve(process.env.SCORM_STORAGE_ROOT ?? path.join(process.cwd(), 'storage', 'scorm'));
    const absolute = path.resolve(root, key);
    if (!absolute.startsWith(`${root}${path.sep}`)) throw new Error('Unsafe storage key');
    await mkdir(path.dirname(absolute), { recursive: true });
    await copyFile(filePath, absolute);
    await chmod(absolute, 0o640);
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

  /**
   * Tamaño y flujo de un rango de bytes, SIN cargar el objeto en memoria.
   *
   * `readKey` devuelve el objeto entero en un `Buffer`. Para un ZIP de SCORM de
   * unos megabytes da igual; para un video de hasta 500 MB no: cada petición de
   * rango —y un navegador emite varias por reproducción— reservaba el archivo
   * completo en RAM y solo después recortaba el trozo pedido. Con dos o tres
   * personas viendo un curso a la vez, el proceso se queda sin memoria.
   *
   * Aquí el tamaño se consulta aparte (`stat` o `HeadObject`) y solo se
   * transporta el rango solicitado: en disco con `createReadStream(start, end)`
   * y en S3 con la cabecera `Range`, que el propio servicio resuelve sin
   * mandar el resto del objeto.
   */
  async statKey(key: string): Promise<{ size: number }> {
    if (this.client) {
      const response = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      if (typeof response.ContentLength !== 'number') throw new Error('Object size is unknown');
      return { size: response.ContentLength };
    }
    const info = await stat(this.resolveKey(key));
    return { size: info.size };
  }

  async streamKeyRange(key: string, start: number, end: number): Promise<Readable> {
    if (this.client) {
      const response = await this.client.send(new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Range: `bytes=${start}-${end}`,
      }));
      if (!response.Body) throw new Error('Object body is empty');
      return response.Body as Readable;
    }
    return createReadStream(this.resolveKey(key), { start, end });
  }

  /** Una sola comprobación de ruta seguro para las tres lecturas por clave. */
  private resolveKey(key: string) {
    const root = path.resolve(process.env.SCORM_STORAGE_ROOT ?? path.join(process.cwd(), 'storage', 'scorm'));
    const absolute = path.resolve(root, key);
    if (!absolute.startsWith(`${root}${path.sep}`)) throw new Error('Unsafe storage key');
    return absolute;
  }

  describe() {
    return { driver: this.driver, bucket: this.client ? this.bucket : null, encryption: this.client ? process.env.SCORM_S3_SSE !== 'false' : true };
  }
}

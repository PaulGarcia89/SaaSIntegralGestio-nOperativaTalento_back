import { Writable, Readable } from 'node:stream';
import { NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import { enviarVideo, parseVideoRange } from './training-video-stream';
import { TrainingObjectStorageService } from './training-object-storage.service';

class RespuestaFalsa extends Writable {
  headers: Record<string, unknown> = {};
  code = 0;
  trozos: Buffer[] = [];

  setHeader(nombre: string, valor: unknown) {
    this.headers[nombre] = valor;
    return this;
  }

  status(code: number) {
    this.code = code;
    return this;
  }

  override _write(chunk: Buffer, _codificacion: string, listo: (error?: Error) => void) {
    this.trozos.push(Buffer.from(chunk));
    listo();
  }

  get cuerpo() {
    return Buffer.concat(this.trozos).toString('utf8');
  }
}

function almacen(contenido: string, fallo?: unknown): TrainingObjectStorageService {
  const datos = Buffer.from(contenido);
  return {
    statKey: jest.fn(async () => {
      if (fallo) throw fallo;
      return { size: datos.length };
    }),
    streamKeyRange: jest.fn(async (_clave: string, inicio: number, fin: number) =>
      Readable.from([datos.subarray(inicio, fin + 1)]),
    ),
  } as unknown as TrainingObjectStorageService;
}

describe('parseVideoRange', () => {
  it('sin encabezado devuelve el objeto entero como respuesta completa', () => {
    expect(parseVideoRange(undefined, 10)).toEqual({ start: 0, end: 9, partial: false });
  });

  it('acepta un tramo cerrado', () => {
    expect(parseVideoRange('bytes=2-5', 10)).toEqual({ start: 2, end: 5, partial: true });
  });

  it('acepta un tramo abierto por la derecha', () => {
    expect(parseVideoRange('bytes=4-', 10)).toEqual({ start: 4, end: 9, partial: true });
  });

  it('ignora un tramo fuera de rango en vez de fallar', () => {
    expect(parseVideoRange('bytes=99-', 10)).toEqual({ start: 0, end: 9, partial: false });
  });
});

describe('enviarVideo', () => {
  it('responde 206 con solo el tramo pedido', async () => {
    const respuesta = new RespuestaFalsa();
    const storage = almacen('0123456789');

    await enviarVideo(storage, 'clave.mp4', 'bytes=2-5', respuesta as unknown as Response);

    expect(respuesta.code).toBe(206);
    expect(respuesta.headers['Content-Length']).toBe(4);
    expect(respuesta.headers['Content-Range']).toBe('bytes 2-5/10');
    expect(respuesta.cuerpo).toBe('2345');
    // El tramo se pide al almacén: no se lee el objeto completo en memoria.
    expect(storage.streamKeyRange).toHaveBeenCalledWith('clave.mp4', 2, 5);
  });

  it('responde 200 con el objeto completo cuando no hay encabezado Range', async () => {
    const respuesta = new RespuestaFalsa();
    const storage = almacen('0123456789');

    await enviarVideo(storage, 'clave.mp4', undefined, respuesta as unknown as Response);

    expect(respuesta.code).toBe(200);
    expect(respuesta.headers['Accept-Ranges']).toBe('bytes');
    expect(respuesta.cuerpo).toBe('0123456789');
  });

  it('no pide ningún tramo cuando el objeto está vacío', async () => {
    const respuesta = new RespuestaFalsa();
    const storage = almacen('');

    await enviarVideo(storage, 'clave.mp4', 'bytes=0-', respuesta as unknown as Response);

    expect(respuesta.code).toBe(200);
    expect(respuesta.headers['Content-Length']).toBe(0);
    expect(storage.streamKeyRange).not.toHaveBeenCalled();
  });

  it('convierte un archivo ausente en 404 y no en error de servidor', async () => {
    const respuesta = new RespuestaFalsa();
    const storage = almacen('', Object.assign(new Error('falta'), { code: 'ENOENT' }));

    await expect(enviarVideo(storage, 'clave.mp4', undefined, respuesta as unknown as Response)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

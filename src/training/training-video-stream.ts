import { NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import type { Readable } from 'node:stream';
import { TrainingObjectStorageService } from './training-object-storage.service';

/*
 * Entrega de vídeo por flujo (streaming) con soporte de `Range`.
 *
 * Antes cada petición leía el objeto completo en un Buffer y devolvía un
 * recorte con `subarray`. Un vídeo de 500 MB reservaba 500 MB de memoria por
 * petición, y un navegador emite varias peticiones `Range` por reproducción
 * (una al abrir, otra por cada salto en la barra de tiempo): bastaban dos o
 * tres personas viendo un curso a la vez para agotar la memoria del proceso.
 *
 * Aquí se consulta solo el tamaño (`statKey`) y se transmite únicamente el
 * tramo pedido (`streamKeyRange`), así que la memoria usada no depende del
 * tamaño del vídeo. Los contratos HTTP no cambian: mismos encabezados, mismos
 * códigos 200/206 y el mismo 404 cuando el archivo no está en el almacén.
 */

export type RangoVideo = { start: number; end: number; partial: boolean };

export function parseVideoRange(range: string | undefined, size: number): RangoVideo {
  if (!range) return { start: 0, end: size - 1, partial: false };
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match) return { start: 0, end: size - 1, partial: false };
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]) - 1);
  const end = match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start > end || start >= size) {
    return { start: 0, end: size - 1, partial: false };
  }
  return { start, end, partial: true };
}

function esFaltante(error: any) {
  return error?.code === 'ENOENT' || error?.name === 'NoSuchKey' || error?.$metadata?.httpStatusCode === 404;
}

async function sinArchivo<T>(operacion: () => Promise<T>): Promise<T> {
  try {
    return await operacion();
  } catch (error: any) {
    if (esFaltante(error)) {
      throw new NotFoundException('Video file is missing from configured storage');
    }
    throw error;
  }
}

export async function enviarVideo(
  storage: TrainingObjectStorageService,
  storageKey: string,
  range: string | undefined,
  response: Response,
): Promise<void> {
  const { size } = await sinArchivo(() => storage.statKey(storageKey));

  response.setHeader('Content-Type', 'video/mp4');
  response.setHeader('Accept-Ranges', 'bytes');

  // Un objeto vacío no admite ningún tramo: se responde 200 sin cuerpo en vez
  // de calcular un `end` de -1 y pedir al almacén un rango imposible.
  if (size === 0) {
    response.setHeader('Content-Length', 0);
    response.status(200).end();
    return;
  }

  const requested = parseVideoRange(range, size);
  response.setHeader('Content-Length', requested.end - requested.start + 1);
  response.setHeader('Content-Range', `bytes ${requested.start}-${requested.end}/${size}`);
  response.status(requested.partial ? 206 : 200);

  const flujo: Readable = await sinArchivo(() => storage.streamKeyRange(storageKey, requested.start, requested.end));

  await new Promise<void>((resolve, reject) => {
    // Los encabezados ya salieron: un fallo a mitad de transmisión no se puede
    // convertir en un 500 con cuerpo JSON, así que se corta la conexión para
    // que el navegador vea una descarga incompleta y reintente el tramo.
    const cortar = (error: unknown) => {
      flujo.destroy();
      if (!response.writableEnded) response.destroy();
      reject(error);
    };
    flujo.on('error', cortar);
    response.on('error', cortar);
    response.on('close', () => {
      if (!response.writableEnded) flujo.destroy();
      resolve();
    });
    response.on('finish', resolve);
    flujo.pipe(response);
  });
}

import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createConnection } from 'node:net';

@Injectable()
export class TrainingAntivirusService {
  readonly mode = (process.env.ANTIVIRUS_MODE ?? process.env.SCORM_ANTIVIRUS_MODE ?? 'disabled').toLowerCase();
  async scan(buffer: Buffer) {
    if (this.mode === 'disabled') {
      const allowUnscanned = process.env.ANTIVIRUS_ALLOW_UNSCANNED_UPLOADS
        ?? process.env.SCORM_ALLOW_UNSCANNED_UPLOADS;
      if (process.env.NODE_ENV === 'production' && allowUnscanned !== 'true') throw new ServiceUnavailableException('Antivirus scanning is required');
      return { status: 'SKIPPED' as const, engine: null };
    }
    const host = process.env.CLAMAV_HOST ?? '127.0.0.1';
    const port = Number(process.env.CLAMAV_PORT ?? '3310');
    return new Promise<{ status: 'CLEAN'; engine: 'clamav' }>((resolve, reject) => {
      const socket = createConnection({ host, port });
      const timer = setTimeout(() => { socket.destroy(); reject(new ServiceUnavailableException('Antivirus scan timed out')); }, 30_000);
      const chunks: Buffer[] = [];
      socket.on('connect', () => {
        socket.write('zINSTREAM\0');
        for (let offset = 0; offset < buffer.length; offset += 64 * 1024) {
          const chunk = buffer.subarray(offset, Math.min(offset + 64 * 1024, buffer.length));
          const size = Buffer.alloc(4); size.writeUInt32BE(chunk.length);
          socket.write(size); socket.write(chunk);
        }
        socket.end(Buffer.alloc(4));
      });
      socket.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      socket.on('end', () => {
        clearTimeout(timer);
        const result = Buffer.concat(chunks).toString('utf8');
        if (result.includes('FOUND')) reject(new BadRequestException('The uploaded file contains malware'));
        else if (result.includes('OK')) resolve({ status: 'CLEAN', engine: 'clamav' });
        else reject(new ServiceUnavailableException('Antivirus returned an invalid response'));
      });
      socket.on('error', (error) => { clearTimeout(timer); reject(new ServiceUnavailableException(`Antivirus unavailable: ${error.message}`)); });
    });
  }
  describe() { return { mode: this.mode, required: process.env.NODE_ENV === 'production' && (process.env.ANTIVIRUS_ALLOW_UNSCANNED_UPLOADS ?? process.env.SCORM_ALLOW_UNSCANNED_UPLOADS) !== 'true' }; }
}

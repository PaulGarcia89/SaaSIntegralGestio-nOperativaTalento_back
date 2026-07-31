import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { AtsPrivateFileService } from './ats-private-file.service';

@Controller('public/ats-files')
export class AtsFileAccessController {
  constructor(private readonly files: AtsPrivateFileService) {}

  @Get(':kind/:id')
  async read(
    @Param('kind') kind: 'resume' | 'vacancy-image',
    @Param('id') id: string,
    @Query('token') token: string,
    @Res() response: Response,
  ) {
    const file = await this.files.readSigned(kind, id, token);
    response.setHeader('Content-Type', file.mimeType);
    response.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(file.originalName)}`);
    response.setHeader('Cache-Control', 'private, max-age=60, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('ETag', `"${file.sha256}"`);
    response.send(file.buffer);
  }
}

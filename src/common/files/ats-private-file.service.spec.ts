import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import AdmZip from 'adm-zip';
import { AtsPrivateFileService } from './ats-private-file.service';

function uploaded(buffer: Buffer, mimetype: string, originalname: string): Express.Multer.File {
  return {
    buffer,
    mimetype,
    originalname,
    size: buffer.length,
  } as Express.Multer.File;
}

describe('AtsPrivateFileService security', () => {
  const prisma = {
    candidateResumeFile: { findFirst: jest.fn() },
    vacancyImageFile: { findFirst: jest.fn() },
  };
  const service = new AtsPrivateFileService(prisma as never);

  it('accepts a PDF only when MIME and magic bytes agree', () => {
    const file = uploaded(Buffer.from('%PDF-1.7\ncontent'), 'application/pdf', 'resume.pdf');
    expect(service.validateResume(file)).toBe('application/pdf');
  });

  it('rejects a spoofed PDF MIME type', () => {
    const file = uploaded(Buffer.from('plain text'), 'application/pdf', 'resume.pdf');
    expect(() => service.validateResume(file)).toThrow(BadRequestException);
  });

  it('accepts DOCX structure and rejects an arbitrary ZIP', () => {
    const docx = new AdmZip();
    docx.addFile('[Content_Types].xml', Buffer.from('<Types/>'));
    docx.addFile('word/document.xml', Buffer.from('<document/>'));
    expect(service.validateResume(uploaded(
      docx.toBuffer(),
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'resume.docx',
    ))).toContain('wordprocessingml');

    const zip = new AdmZip();
    zip.addFile('payload.txt', Buffer.from('not a document'));
    expect(() => service.validateResume(uploaded(
      zip.toBuffer(),
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'fake.docx',
    ))).toThrow(BadRequestException);
  });

  it('rejects altered and expired signed URLs before reading storage', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-01T00:00:00.000Z'));
    const signed = service.createSignedUrl('resume', 'file-1', 30);
    const token = new URL(signed.url).searchParams.get('token')!;

    await expect(service.readSigned('resume', 'file-1', `${token}altered`))
      .rejects.toBeInstanceOf(UnauthorizedException);

    jest.advanceTimersByTime(31_000);
    await expect(service.readSigned('resume', 'file-1', token))
      .rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.candidateResumeFile.findFirst).not.toHaveBeenCalled();
    jest.useRealTimers();
  });
});

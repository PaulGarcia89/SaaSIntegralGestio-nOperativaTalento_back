import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import AdmZip from 'adm-zip';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
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

  function validDocx() {
    const docx = new AdmZip();
    docx.addFile('[Content_Types].xml', Buffer.from('<Types><Override ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'));
    docx.addFile('_rels/.rels', Buffer.from('<Relationships/>'));
    docx.addFile('word/document.xml', Buffer.from('<w:document><w:p>Candidate</w:p></w:document>'));
    return docx;
  }

  it('accepts a PDF only when MIME and magic bytes agree', () => {
    const file = uploaded(Buffer.from('%PDF-1.7\ncontent\n%%EOF\n'), 'application/pdf', 'resume.pdf');
    expect(service.validateResume(file)).toBe('application/pdf');
  });

  it('rejects a spoofed PDF MIME type', () => {
    const file = uploaded(Buffer.from('plain text'), 'application/pdf', 'resume.pdf');
    expect(() => service.validateResume(file)).toThrow(BadRequestException);
  });

  it('accepts DOCX structure and rejects an arbitrary ZIP', () => {
    const docx = validDocx();
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

  it('rejects active PDF actions and data appended after EOF', () => {
    expect(() => service.validateResume(uploaded(
      Buffer.from('%PDF-1.7\n1 0 obj <</OpenAction 2 0 R>>\n%%EOF'),
      'application/pdf',
      'active.pdf',
    ))).toThrow(BadRequestException);
    expect(() => service.validateResume(uploaded(
      Buffer.from('%PDF-1.7\ncontent\n%%EOF\nMZ executable'),
      'application/pdf',
      'polyglot.pdf',
    ))).toThrow(BadRequestException);
  });

  it('rejects macros, embedded objects and legacy extensions in DOCX uploads', () => {
    const macro = validDocx();
    macro.addFile('word/vbaProject.bin', Buffer.from('macro'));
    expect(() => service.validateResume(uploaded(
      macro.toBuffer(),
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'macro.docx',
    ))).toThrow(BadRequestException);
    expect(() => service.validateResume(uploaded(
      validDocx().toBuffer(),
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'legacy.doc',
    ))).toThrow(BadRequestException);
  });

  it('uses random quarantine names, records SHA-256 and promotes only after validation', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'ats-security-'));
    const previousRoot = process.env.ATS_FILE_STORAGE_ROOT;
    process.env.ATS_FILE_STORAGE_ROOT = root;
    try {
      const local = new AtsPrivateFileService(prisma as never);
      const file = uploaded(Buffer.from('%PDF-1.7\nprofile\n%%EOF'), 'application/pdf', 'candidate-name.pdf');
      local.validateResume(file);
      const first = await local.store('resume', 'tenant-1', 'candidate-1', file, 'application/pdf');
      const second = await local.store('resume', 'tenant-1', 'candidate-1', file, 'application/pdf');

      expect(first.storageKey).toContain('/quarantine/resume/');
      expect(first.storageKey).not.toContain(file.originalname);
      expect(first.storageKey).not.toBe(second.storageKey);
      expect(first.sha256).toBe(createHash('sha256').update(file.buffer).digest('hex'));

      const promoted = await local.promote(first.storageKey);
      expect(promoted.storageKey).toContain('/private/resume/');
      await expect(stat(path.join(root, promoted.storageKey))).resolves.toBeDefined();
      await expect(stat(path.join(root, first.storageKey))).rejects.toBeDefined();
    } finally {
      if (previousRoot === undefined) delete process.env.ATS_FILE_STORAGE_ROOT;
      else process.env.ATS_FILE_STORAGE_ROOT = previousRoot;
      await rm(root, { recursive: true, force: true });
    }
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

  it('uses the active access-token secret when no dedicated ATS signing secret is set', () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousAtsSecret = process.env.ATS_FILE_SIGNING_SECRET;
    const previousAccessSecret = process.env.JWT_ACCESS_SECRET;
    const previousLegacySecret = process.env.JWT_SECRET;
    process.env.NODE_ENV = 'production';
    delete process.env.ATS_FILE_SIGNING_SECRET;
    process.env.JWT_ACCESS_SECRET = 'test-access-secret';
    delete process.env.JWT_SECRET;

    try {
      const signed = service.createSignedUrl('vacancy-image', 'file-1');
      expect(new URL(signed.url).searchParams.get('token')).toBeTruthy();
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
      if (previousAtsSecret === undefined) delete process.env.ATS_FILE_SIGNING_SECRET;
      else process.env.ATS_FILE_SIGNING_SECRET = previousAtsSecret;
      if (previousAccessSecret === undefined) delete process.env.JWT_ACCESS_SECRET;
      else process.env.JWT_ACCESS_SECRET = previousAccessSecret;
      if (previousLegacySecret === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = previousLegacySecret;
    }
  });

  it('uses the Railway public domain for browser-facing signed URLs', () => {
    const previousPublicUrl = process.env.API_PUBLIC_URL;
    const previousRailwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN;
    const previousGlobalPrefix = process.env.DISABLE_GLOBAL_PREFIX;
    delete process.env.API_PUBLIC_URL;
    process.env.RAILWAY_PUBLIC_DOMAIN = 'talentos-api.up.railway.app';
    delete process.env.DISABLE_GLOBAL_PREFIX;

    try {
      const signed = service.createSignedUrl('vacancy-image', 'file-1');
      const signedUrl = new URL(signed.url);
      expect(signedUrl.origin).toBe('https://talentos-api.up.railway.app');
      expect(signedUrl.pathname).toBe('/api/public/ats-files/vacancy-image/file-1');
    } finally {
      if (previousPublicUrl === undefined) delete process.env.API_PUBLIC_URL;
      else process.env.API_PUBLIC_URL = previousPublicUrl;
      if (previousRailwayDomain === undefined) delete process.env.RAILWAY_PUBLIC_DOMAIN;
      else process.env.RAILWAY_PUBLIC_DOMAIN = previousRailwayDomain;
      if (previousGlobalPrefix === undefined) delete process.env.DISABLE_GLOBAL_PREFIX;
      else process.env.DISABLE_GLOBAL_PREFIX = previousGlobalPrefix;
    }
  });
});

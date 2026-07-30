import AdmZip from 'adm-zip';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { TrainingAntivirusService } from './training-antivirus.service';
import { TrainingObjectStorageService } from './training-object-storage.service';
import { TrainingScormStorageService } from './training-scorm-storage.service';
import { TrainingWebhookDeliveryService } from './training-webhook-delivery.service';

describe('Training integrations security', () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'talentos-scorm-'));
    process.env.SCORM_STORAGE_DRIVER = 'filesystem';
    process.env.SCORM_STORAGE_ROOT = root;
    process.env.SCORM_ALLOW_UNSCANNED_UPLOADS = 'true';
    process.env.SCORM_ANTIVIRUS_MODE = 'disabled';
    process.env.NODE_ENV = 'test';
  });
  afterEach(async () => { await rm(root, { recursive: true, force: true }); });

  it('validates and stores a SCORM package under the tenant prefix', async () => {
    const zip = new AdmZip();
    zip.addFile('imsmanifest.xml', Buffer.from('<manifest><resources><resource href="index.html"></resource></resources></manifest>'));
    zip.addFile('index.html', Buffer.from('<h1>Curso seguro</h1>'));
    const buffer = zip.toBuffer();
    const prisma = {
      trainingCourse: { findFirst: jest.fn().mockResolvedValue({ id: 'course-1' }) },
      trainingScormPackage: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { fileSize: 0 }, _count: 0 }),
        create: jest.fn().mockImplementation(({ data }) => data),
      },
    };
    const service = new TrainingScormStorageService(prisma as never, new TrainingObjectStorageService(), new TrainingAntivirusService());
    const result = await service.store('tenant-1', 'user-1', 'course-1', 'Curso', { buffer, size: buffer.length, mimetype: 'application/zip', originalname: 'course.zip' } as Express.Multer.File);
    expect(result.storagePath).not.toBeNull();
    expect(result.storagePath).toContain(path.join('tenant-1'));
    expect(await readFile(path.join(result.storagePath!, 'index.html'), 'utf8')).toContain('Curso seguro');
    expect(result.checksum).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects private webhook endpoints and never stores plaintext secrets', async () => {
    const service = new TrainingWebhookDeliveryService({} as never, {} as never);
    await expect(service.assertPublicEndpoint('https://127.0.0.1/hook')).rejects.toThrow();
    const encrypted = service.encryptSecret('very-secret-value');
    expect(encrypted).not.toContain('very-secret-value');
    expect(encrypted.split('.')).toHaveLength(3);
  });

  it('recovers persisted webhook deliveries after a process restart', async () => {
    const prisma = {
      trainingWebhookDelivery: {
        findMany: jest.fn().mockResolvedValue([{ id: 'delivery-1' }, { id: 'delivery-2' }]),
      },
    };
    const queues = {
      addJob: jest.fn().mockResolvedValue(true),
    };
    const service = new TrainingWebhookDeliveryService(prisma as never, queues as never);

    await expect(service.recoverPending(new Date('2026-07-30T00:00:00.000Z')))
      .resolves.toEqual({ recovered: 2 });
    expect(prisma.trainingWebhookDelivery.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ['PENDING', 'RETRYING', 'PROCESSING'] },
        }),
      }),
    );
    expect(queues.addJob).toHaveBeenCalledTimes(2);
  });
});

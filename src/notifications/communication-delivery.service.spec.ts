import nodemailer from 'nodemailer';
import { lookup } from 'node:dns/promises';
import { CommunicationDeliveryService } from './communication-delivery.service';

jest.mock('node:dns/promises', () => ({ lookup: jest.fn() }));

jest.mock('nodemailer', () => ({
  __esModule: true,
  default: { createTransport: jest.fn() },
}));

describe('CommunicationDeliveryService', () => {
  const originalEnv = process.env;
  const findUnique = jest.fn();
  const tenantFindUnique = jest.fn();
  const applicationFindFirst = jest.fn();
  const sendMail = jest.fn();
  const service = new CommunicationDeliveryService({
    communicationDomain: { findUnique },
    tenant: { findUnique: tenantFindUnique },
    vacancyApplication: { findFirst: applicationFindFirst },
  } as never);
  const delivery = {
    id: 'delivery-1',
    tenantId: 'tenant-1',
    recipientEmail: 'candidate@example.com',
    correlationId: 'correlation-1',
    user: null,
    notification: {
      title: 'Actualización de tu proceso',
      message: 'Tu postulación avanzó.',
      actionUrl: null,
      payload: { applicationId: 'application-1' },
      atsMessage: null,
    },
  } as never;

  beforeEach(() => {
    process.env = { ...originalEnv };
    jest.clearAllMocks();
    findUnique.mockResolvedValue(null);
    tenantFindUnique.mockResolvedValue({ name: 'DATALINK TECH CORP', careerPortals: [] });
    applicationFindFirst.mockResolvedValue({
      vacancy: { title: 'Chef ejecutivo', branch: { name: 'KendallDr' } },
      currentStage: { name: 'Entrevista técnica' },
    });
    sendMail.mockResolvedValue({ messageId: '<smtp-message@example.com>' });
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });
    (lookup as jest.Mock).mockResolvedValue({ address: '192.0.2.10', family: 4 });
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('envía mediante SMTP seguro cuando está configurado como proveedor', async () => {
    Object.assign(process.env, {
      EMAIL_PROVIDER: 'SMTP',
      SMTP_HOST: 'mail.example.com',
      SMTP_PORT: '465',
      SMTP_SECURE: 'true',
      SMTP_FAMILY: '4',
      SMTP_USER: 'talento@example.com',
      SMTP_PASSWORD: 'secret',
      NOTIFICATION_FROM_EMAIL: 'Talento <talento@example.com>',
    });

    await expect(service.sendEmail(delivery)).resolves.toEqual({
      id: '<smtp-message@example.com>',
      provider: 'SMTP',
    });
    expect(nodemailer.createTransport).toHaveBeenCalledWith(expect.objectContaining({
      host: '192.0.2.10',
      port: 465,
      family: 4,
      secure: true,
      auth: { user: 'talento@example.com', pass: 'secret' },
      tls: { servername: 'mail.example.com' },
    }));
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
      from: 'Talento <talento@example.com>',
      to: 'candidate@example.com',
      subject: 'Actualización de tu proceso',
    }));
  });

  it('rechaza una configuración SMTP incompleta sin filtrar secretos', async () => {
    Object.assign(process.env, {
      EMAIL_PROVIDER: 'SMTP',
      SMTP_HOST: 'mail.example.com',
      NOTIFICATION_FROM_EMAIL: 'talento@example.com',
    });
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASSWORD;

    await expect(service.sendEmail(delivery)).rejects.toThrow(
      'SMTP_HOST, SMTP_USER and SMTP_PASSWORD are required',
    );
  });

  it('compone el correo con empresa, sucursal, vacante y etapa', async () => {
    Object.assign(process.env, {
      EMAIL_PROVIDER: 'SMTP',
      SMTP_HOST: 'mail.example.com',
      SMTP_USER: 'talento@example.com',
      SMTP_PASSWORD: 'secret',
      NOTIFICATION_FROM_EMAIL: 'Talento <talento@example.com>',
    });

    await service.sendEmail(delivery);

    const enviado = sendMail.mock.calls[0][0] as { html: string; text: string };
    for (const dato of ['DATALINK TECH CORP', 'KendallDr', 'Chef ejecutivo', 'Entrevista t']) {
      expect(enviado.html).toContain(dato);
      expect(enviado.text).toContain(dato);
    }
    // El mensaje original se conserva íntegro en la parte de texto: el hilado
    // de respuestas del ATS se apoya en él.
    expect(enviado.text).toContain('Tu postulación avanzó.');
  });

  it('localiza la postulación por el payload cuando el aviso no es un mensaje del ATS', async () => {
    Object.assign(process.env, {
      EMAIL_PROVIDER: 'SMTP',
      SMTP_HOST: 'mail.example.com',
      SMTP_USER: 'talento@example.com',
      SMTP_PASSWORD: 'secret',
      NOTIFICATION_FROM_EMAIL: 'Talento <talento@example.com>',
    });

    await service.sendEmail(delivery);

    expect(applicationFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'application-1', tenantId: 'tenant-1' } }),
    );
  });

  it('no consulta la base de datos si la configuración del proveedor es inválida', async () => {
    Object.assign(process.env, {
      EMAIL_PROVIDER: 'SMTP',
      SMTP_HOST: 'mail.example.com',
      NOTIFICATION_FROM_EMAIL: 'talento@example.com',
    });
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASSWORD;

    await expect(service.sendEmail(delivery)).rejects.toThrow();
    expect(tenantFindUnique).not.toHaveBeenCalled();
  });
});

import nodemailer from 'nodemailer';
import { CommunicationDeliveryService } from './communication-delivery.service';

jest.mock('nodemailer', () => ({
  __esModule: true,
  default: { createTransport: jest.fn() },
}));

describe('CommunicationDeliveryService', () => {
  const originalEnv = process.env;
  const findUnique = jest.fn();
  const sendMail = jest.fn();
  const service = new CommunicationDeliveryService({
    communicationDomain: { findUnique },
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
      atsMessage: null,
    },
  } as never;

  beforeEach(() => {
    process.env = { ...originalEnv };
    jest.clearAllMocks();
    findUnique.mockResolvedValue(null);
    sendMail.mockResolvedValue({ messageId: '<smtp-message@example.com>' });
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });
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
      host: 'mail.example.com',
      port: 465,
      family: 4,
      secure: true,
      auth: { user: 'talento@example.com', pass: 'secret' },
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
});

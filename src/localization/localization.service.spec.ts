import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { LocalizationService } from './localization.service';

describe('LocalizationService', () => {
  const prisma = { platformLocalizationSettings: { findFirst: jest.fn().mockResolvedValue(null) } };
  const service = new LocalizationService(prisma as never);

  it('resolves supported regional values deterministically', () => {
    expect(service.resolve('en-US', ['es', 'en'])).toBe('en');
    expect(service.resolve('fr-FR', ['es', 'en'])).toBe('es');
    expect(service.resolve(undefined, ['en'], 'es')).toBe('es');
    expect(service.resolve('es-MX', ['en'], 'en')).toBe('en');
  });

  it('rejects a default or fallback locale outside enabled locales', async () => {
    await expect(service.updateGlobal({ enabledLocales: ['es'], defaultLocale: 'en' })).rejects.toThrow(BadRequestException);
  });

  it('keeps company localization tenant-scoped', async () => {
    await expect(service.updateCompany('tenant-a', {}, 'tenant-b')).rejects.toThrow(ForbiddenException);
  });
});

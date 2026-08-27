import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { LocalizationService, SupportedLocale } from './localization.service';

type LocalizedRequest = Request & { locale?: SupportedLocale; fallbackLocale?: SupportedLocale };

@Injectable()
export class LocaleMiddleware implements NestMiddleware {
  constructor(private readonly localization: LocalizationService) {}

  async use(request: LocalizedRequest, response: Response, next: NextFunction) {
    try {
      const settings = await this.localization.global();
      const rawEnabled: unknown = settings.enabledLocales;
      const enabled = Array.isArray(rawEnabled)
        ? rawEnabled.filter((locale): locale is string => typeof locale === 'string')
        : ['es', 'en'];
      const requested = request.header('x-locale') ?? request.header('accept-language')?.split(',')[0];
      const fallback = settings.fallbackLocale === 'en' ? 'en' : 'es';
      request.locale = this.localization.resolve(requested, enabled, fallback);
      request.fallbackLocale = fallback;
      response.setHeader('Content-Language', request.locale);
    } catch {
      request.locale = 'es';
      request.fallbackLocale = 'es';
      response.setHeader('Content-Language', 'es');
    }
    next();
  }
}

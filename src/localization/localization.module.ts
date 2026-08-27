import { Module } from '@nestjs/common';
import { LocalizationController } from './localization.controller';
import { LocalizationService } from './localization.service';
import { JwtModule } from '@nestjs/jwt';
import { LocaleMiddleware } from './locale.middleware';

@Module({ imports: [JwtModule.register({})], controllers: [LocalizationController], providers: [LocalizationService, LocaleMiddleware], exports: [LocalizationService, LocaleMiddleware] })
export class LocalizationModule {}

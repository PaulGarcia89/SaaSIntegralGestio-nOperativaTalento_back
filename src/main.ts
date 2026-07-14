import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';

function getAllowedConfiguredOrigins() {
  return (process.env.CORS_ALLOWED_ORIGINS ?? process.env.FRONTEND_URL ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

function isAllowedLocalOrigin(origin: string) {
  try {
    const url = new URL(origin);
    const allowedPorts = new Set(['3000', '3001', '3002']);

    if (!allowedPorts.has(url.port)) {
      return false;
    }

    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
      return true;
    }

    return /^(10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)$/.test(
      url.hostname,
    );
  } catch {
    return false;
  }
}

function isAllowedOrigin(origin: string) {
  const configuredOrigins = getAllowedConfiguredOrigins();

  if (configuredOrigins.includes(origin)) {
    return true;
  }

  return isAllowedLocalOrigin(origin);
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.PORT ?? '3000');
  const host = process.env.HOST ?? '0.0.0.0';

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || isAllowedOrigin(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`Origin ${origin} is not allowed by CORS`));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-tenant-id', 'x-branch-id'],
  });

  app.setGlobalPrefix('api');
  app.use(json({ limit: '10mb' }));
  app.use(urlencoded({ extended: true, limit: '10mb' }));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  await app.listen(port, host);
}

bootstrap();

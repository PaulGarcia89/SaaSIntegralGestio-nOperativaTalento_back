import { Injectable } from '@nestjs/common';

@Injectable()
export class OpenApiService {
  buildDocument() {
    return {
      openapi: '3.1.0',
      info: {
        title: 'SaaS Integral Backend API',
        version: '1.0.0',
        description:
          'Multi-tenant HR and operations backend built with NestJS, Prisma, PostgreSQL, JWT, and modular tenant capability controls.',
      },
      servers: [{ url: '/api' }],
      tags: [
        { name: 'Auth' },
        { name: 'Companies' },
        { name: 'Tenants' },
        { name: 'Branches' },
        { name: 'Users' },
        { name: 'Roles' },
        { name: 'Permissions' },
        { name: 'Plans' },
        { name: 'Modules' },
        { name: 'Feature Flags' },
        { name: 'Subscriptions' },
        { name: 'Billing' },
        { name: 'Notifications' },
        { name: 'Audit Logs' },
        { name: 'Jobs' },
        { name: 'Applications' },
        { name: 'Training' },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
      security: [{ bearerAuth: [] }],
      paths: {
        '/auth/login': { post: { tags: ['Auth'], summary: 'Authenticate a user' } },
        '/auth/refresh': { post: { tags: ['Auth'], summary: 'Rotate refresh and access tokens' } },
        '/auth/logout': { post: { tags: ['Auth'], summary: 'Revoke the current session' } },
        '/auth/me': { get: { tags: ['Auth'], summary: 'Get frontend-ready auth context' } },
        '/auth/sessions': { get: { tags: ['Auth'], summary: 'List active sessions' } },
        '/companies/current': { get: { tags: ['Companies'], summary: 'Get current tenant profile' } },
        '/companies/current/capabilities': {
          get: { tags: ['Companies'], summary: 'Get current tenant capabilities' },
        },
        '/feature-flags': { get: { tags: ['Feature Flags'], summary: 'List tenant module flags' } },
        '/feature-flags/{moduleCode}': {
          put: { tags: ['Feature Flags'], summary: 'Upsert a tenant feature flag' },
        },
        '/billing/overview': { get: { tags: ['Billing'], summary: 'Get billing summary' } },
        '/billing/invoices': { get: { tags: ['Billing'], summary: 'List tenant invoices' } },
        '/notifications': { get: { tags: ['Notifications'], summary: 'List notifications' } },
        '/notifications/{id}/read': {
          patch: { tags: ['Notifications'], summary: 'Mark a notification as read' },
        },
        '/audit/logs': { get: { tags: ['Audit Logs'], summary: 'List audit events' } },
      },
    };
  }
}

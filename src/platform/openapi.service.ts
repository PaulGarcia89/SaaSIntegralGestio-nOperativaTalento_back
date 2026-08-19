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
        { name: 'Metrics' },
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
        '/me/context': { get: { tags: ['Auth'], summary: 'Get canonical frontend navigation and access context' } },
        '/auth/context/tenant': { put: { tags: ['Auth'], summary: 'Switch active tenant context' } },
        '/auth/context/branch': { put: { tags: ['Auth'], summary: 'Switch active branch context' } },
        '/auth/impersonation/start': { post: { tags: ['Auth'], summary: 'Start superadmin tenant impersonation' } },
        '/auth/impersonation/stop': { post: { tags: ['Auth'], summary: 'Stop superadmin tenant impersonation' } },
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
        '/employees': { get: { tags: ['Employees'], summary: 'List tenant employees' }, post: { tags: ['Employees'], summary: 'Register an existing employee' } },
        '/employees/bulk': { post: { tags: ['Employees'], summary: 'Bulk load existing employees' } },
        '/employees/bulk/validate': { post: { tags: ['Employees'], summary: 'Validate a bulk employee load without writing' } },
        '/employees/{id}': { get: { tags: ['Employees'], summary: 'Get an employee record' }, patch: { tags: ['Employees'], summary: 'Update an employee record' } },
        '/employees/{id}/document-summary': { get: { tags: ['Employees'], summary: 'Get a safe document summary for an employee' } },
        '/employees/{id}/history': { get: { tags: ['Employees'], summary: 'Get employee history and audit trail' } },
        '/employees/{id}/overview': { get: { tags: ['Employees'], summary: 'Get a safe employee overview' } },
        '/employees/{id}/status': { patch: { tags: ['Employees'], summary: 'Update employee status' } },
        '/employees/{id}/transfer': { post: { tags: ['Employees'], summary: 'Transfer the primary branch of an employee' } },
        '/employees/{id}/assignments': { post: { tags: ['Employees'], summary: 'Assign a secondary branch to an employee' } },
        '/metrics/queue-overview': {
          get: { tags: ['Metrics'], summary: 'Get operational queue overview and latency metrics' },
        },
        '/metrics/dead-letter': {
          get: { tags: ['Metrics'], summary: 'List dead-letter events pending operational review' },
        },
        '/metrics/throughput-by-domain': {
          get: { tags: ['Metrics'], summary: 'Get domain event throughput grouped by domain and status' },
        },
        '/metrics/queue-errors-by-tenant': {
          get: { tags: ['Metrics'], summary: 'Get queue processing errors grouped by tenant' },
        },
      },
    };
  }
}

import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './common/prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { TenantsModule } from './tenants/tenants.module';
import { UsersModule } from './users/users.module';
import { PlansModule } from './plans/plans.module';
import { PlatformModulesModule } from './modules/platform-modules.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { RolesModule } from './roles/roles.module';
import { PermissionsModule } from './permissions/permissions.module';
import { MetricsModule } from './metrics/metrics.module';
import { ActivityTrackingInterceptor } from './common/interceptors/activity-tracking.interceptor';
import { AuditModule } from './audit/audit.module';
import { AuditContextInterceptor } from './audit/audit-context.interceptor';
import { AuditLogMiddleware } from './audit/audit-log.middleware';
import { BranchesModule } from './branches/branches.module';
import { EmployeesModule } from './employees/employees.module';
import { VacanciesModule } from './vacancies/vacancies.module';
import { ApplicationsModule } from './applications/applications.module';
import { TrainingModule } from './training/training.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { RequestLoggingMiddleware } from './common/logging/request-logging.middleware';
import { PlatformModule } from './platform/platform.module';
import { FeatureFlagsModule } from './feature-flags/feature-flags.module';
import { NotificationsModule } from './notifications/notifications.module';
import { BillingModule } from './billing/billing.module';
import { CompaniesModule } from './companies/companies.module';
import { AuditLogsModule } from './audit-logs/audit-logs.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    PlatformModule,
    AuditModule,
    AuthModule,
    CompaniesModule,
    TenantsModule,
    UsersModule,
    PlansModule,
    PlatformModulesModule,
    FeatureFlagsModule,
    SubscriptionsModule,
    BillingModule,
    RolesModule,
    PermissionsModule,
    MetricsModule,
    NotificationsModule,
    AuditLogsModule,
    BranchesModule,
    EmployeesModule,
    VacanciesModule,
    ApplicationsModule,
    TrainingModule,
  ],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: ActivityTrackingInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditContextInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestLoggingMiddleware, AuditLogMiddleware).forRoutes('*');
  }
}

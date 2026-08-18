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
import { OperationalAlertService } from './common/observability/operational-alert.service';
import { RequestLoggingMiddleware } from './common/logging/request-logging.middleware';
import { RequestContextMiddleware } from './common/middleware/request-context.middleware';
import { PlatformModule } from './platform/platform.module';
import { FeatureFlagsModule } from './feature-flags/feature-flags.module';
import { NotificationsModule } from './notifications/notifications.module';
import { BillingModule } from './billing/billing.module';
import { CompaniesModule } from './companies/companies.module';
import { AuditLogsModule } from './audit-logs/audit-logs.module';
import { WorkflowsModule } from './workflows/workflows.module';
import { AccessControlModule } from './access-control/access-control.module';
import { AutomationModule } from './automation/automation.module';
import { DomainEventsModule } from './domain-events/domain-events.module';
import { WorkflowMasterModule } from './workflow-master/workflow-master.module';
import { HealthModule } from './health/health.module';
import { MessagingModule } from './messaging/messaging.module';
import { RecruitmentModule } from './recruitment/recruitment.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { SignaturesModule } from './signatures/signatures.module';
import { InventoryModule } from './inventory/inventory.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { ReportsModule } from './reports/reports.module';
import { PlanLimitsModule } from './plan-limits/plan-limits.module';
import { JobOffersModule } from './job-offers/job-offers.module';
import { AtsFileStorageModule } from './common/files/ats-file-storage.module';
import { EnterpriseIntegrationsModule } from './enterprise-integrations/enterprise-integrations.module';
import { ProductivityModule } from './productivity/productivity.module';
import { CompanyRegistrationsModule } from './company-registrations/company-registrations.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MessagingModule,
    PrismaModule,
    AtsFileStorageModule,
    EnterpriseIntegrationsModule,
    ProductivityModule,
    CompanyRegistrationsModule,
    PlanLimitsModule,
    AccessControlModule,
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
    JobOffersModule,
    RecruitmentModule,
    OnboardingModule,
    SignaturesModule,
    InventoryModule,
    DashboardModule,
    ReportsModule,
    TrainingModule,
    WorkflowsModule,
    HealthModule,
    AutomationModule,
    DomainEventsModule,
    WorkflowMasterModule,
  ],
  providers: [
    OperationalAlertService,
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
    consumer.apply(RequestContextMiddleware, RequestLoggingMiddleware, AuditLogMiddleware).forRoutes('*');
  }
}

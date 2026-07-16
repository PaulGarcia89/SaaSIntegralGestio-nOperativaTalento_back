import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { AutomationService } from '../src/automation/automation.service';
import { AccessScope } from '../src/common/enums/access-scope.enum';
import { RoleScope } from '../src/common/enums/role-scope.enum';
import { JwtPayload } from '../src/common/interfaces/jwt-payload.interface';
import { PrismaService } from '../src/common/prisma/prisma.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });

  try {
    const prisma = app.get(PrismaService);
    const automationService = app.get(AutomationService);

    const user = await prisma.user.findFirstOrThrow({
      where: { email: 'ava.thompson@talentoscloud.com' },
      select: {
        id: true,
        tenantId: true,
        email: true,
        firstName: true,
        lastName: true,
        activeBranchId: true,
      },
    });

    const actor: JwtPayload = {
      sub: user.id,
      userId: user.id,
      tenantId: user.tenantId,
      tenantSlug: 'talentos-cloud-usa',
      tenantName: 'TalentOS Cloud USA',
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: 'Tenant Admin',
      scope: AccessScope.TENANT,
      isSuperAdmin: false,
      roleScope: RoleScope.TENANT_ADMIN,
      allowedBranchIds: user.activeBranchId ? [user.activeBranchId] : [],
      activeBranchId: user.activeBranchId,
      roles: ['Tenant Admin'],
      permissions: ['automation.read'],
      enabledModules: [],
    };

    const result = await automationService.listRules(actor, {
      page: 1,
      pageSize: 20,
    });

    if (!result.data.length) {
      throw new Error('No se encontraron reglas de automatización sembradas');
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          rules: result.data.map((rule) => ({
            id: rule.id,
            name: rule.name,
            triggerEvent: rule.triggerEvent,
            enabled: rule.enabled,
          })),
        },
        null,
        2,
      ),
    );
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

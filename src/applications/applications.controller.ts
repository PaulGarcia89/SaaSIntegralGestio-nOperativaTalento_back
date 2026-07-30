import { Controller, Get, Param, Patch, Query, Req, UseGuards, Body } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { ScopeGuard } from '../common/guards/scope.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { BranchAccessGuard } from '../common/guards/branch-access.guard';
import { TenantWide } from '../common/decorators/tenant-wide.decorator';
import { BranchLocal } from '../common/decorators/branch-local.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentBranch } from '../common/decorators/current-branch.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequestWithUser } from '../common/types/request-with-user.type';
import { ApplicationsService } from './applications.service';
import { ListApplicationsDto } from './dto/list-applications.dto';
import { UpdateApplicationStatusDto } from './dto/update-application-status.dto';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { ModuleAccessGuard } from '../common/guards/module-access.guard';
import { RequireModule } from '../common/decorators/module-access.decorator';
import { ModuleCode } from '@prisma/client';
import { BulkUpdateApplicationsDto } from './dto/bulk-update-applications.dto';

@Controller('applications')
@UseGuards(JwtAuthGuard, TenantGuard, SubscriptionGuard, ModuleAccessGuard, ScopeGuard, PermissionGuard)
@TenantWide()
@RequireModule(ModuleCode.ATS)
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Get()
  @RequirePermissions('applications.read')
  findAll(
    @Req() request: RequestWithUser,
    @CurrentUser() user: JwtPayload,
    @Query() query: ListApplicationsDto,
  ) {
    return this.applicationsService.listForTenant(user, request.tenant!.id, query);
  }

  @Get('export')
  @RequirePermissions('applications.export')
  export(
    @Req() request: RequestWithUser,
    @CurrentUser() user: JwtPayload,
    @Query() query: ListApplicationsDto,
  ) {
    return this.applicationsService.exportForTenant(user, request.tenant!.id, query);
  }

  @Patch('bulk/status')
  @RequirePermissions('applications.bulk_update')
  bulkUpdateStatus(
    @Req() request: RequestWithUser,
    @CurrentUser() user: JwtPayload,
    @Body() dto: BulkUpdateApplicationsDto,
  ) {
    return this.applicationsService.bulkUpdateStatus(user, request.tenant!.id, dto);
  }

  @Get(':id/files/resume')
  @RequirePermissions('applications.files.read')
  resumeFile(
    @Req() request: RequestWithUser,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.applicationsService.getResumeFile(id, user, request.tenant!.id);
  }

  @Get('branch')
  @UseGuards(BranchAccessGuard)
  @BranchLocal()
  @RequirePermissions('applications.read')
  findAllForBranch(
    @Req() request: RequestWithUser,
    @CurrentBranch() branch: { id: string },
    @Query() query: ListApplicationsDto,
  ) {
    return this.applicationsService.listForBranch(request.tenant!.id, branch.id, query);
  }

  @Get(':id')
  @RequirePermissions('applications.read')
  findOne(@Req() request: RequestWithUser, @CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.applicationsService.findOneForTenant(id, user, request.tenant!.id);
  }

  @Get('branch/:id')
  @UseGuards(BranchAccessGuard)
  @BranchLocal()
  @RequirePermissions('applications.read')
  findOneForBranch(
    @Req() request: RequestWithUser,
    @CurrentBranch() branch: { id: string },
    @Param('id') id: string,
  ) {
    return this.applicationsService.findOneForBranch(id, request.tenant!.id, branch.id);
  }

  @Patch(':id/status')
  @RequirePermissions('applications.update')
  updateStatus(
    @Req() request: RequestWithUser,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateApplicationStatusDto,
  ) {
    return this.applicationsService.updateStatus(id, user, request.tenant!.id, dto);
  }

  @Patch('branch/:id/status')
  @UseGuards(BranchAccessGuard)
  @BranchLocal()
  @RequirePermissions('applications.update')
  updateStatusForBranch(
    @Req() request: RequestWithUser,
    @CurrentBranch() branch: { id: string },
    @Param('id') id: string,
    @Body() dto: UpdateApplicationStatusDto,
  ) {
    return this.applicationsService.updateStatusForBranch(id, request.tenant!.id, branch.id, dto);
  }
}

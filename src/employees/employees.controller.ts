import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { BranchAccessGuard } from '../common/guards/branch-access.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { ScopeGuard } from '../common/guards/scope.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentBranch } from '../common/decorators/current-branch.decorator';
import { RegisterEmployeeDto } from './dto/register-employee.dto';
import { BulkLoadEmployeesDto } from './dto/bulk-load-employees.dto';
import { ListEmployeesDto } from './dto/list-employees.dto';
import { TransferEmployeeDto } from './dto/transfer-employee.dto';
import { AssignEmployeeBranchDto } from './dto/assign-employee-branch.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { UpdateEmployeeStatusDto } from './dto/update-employee-status.dto';
import { EmployeesService } from './employees.service';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { RequestWithUser } from '../common/types/request-with-user.type';
import { BranchLocal } from '../common/decorators/branch-local.decorator';

@Controller('employees')
@UseGuards(JwtAuthGuard, TenantGuard, SubscriptionGuard, ScopeGuard, BranchAccessGuard, PermissionGuard)
@BranchLocal()
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Post()
  @RequirePermissions('employees.create')
  async register(@Req() request: RequestWithUser, @Body() dto: RegisterEmployeeDto) {
    const employee = await this.employeesService.register(request.tenant!.id, dto);
    this.setEmployeeAudit(request, 'EMPLOYEE_RECORD_REGISTERED', employee);
    return employee;
  }

  @Post('bulk')
  @RequirePermissions('employees.create')
  async bulkLoad(@Req() request: RequestWithUser, @Body() dto: BulkLoadEmployeesDto) {
    const result = await this.employeesService.bulkLoad(request.tenant!.id, dto);
    request.auditAction = 'EMPLOYEE_RECORDS_BULK_LOADED';
    request.auditAfter = { loaded: result.created };
    return result;
  }

  @Post('bulk/validate')
  @RequirePermissions('employees.create')
  async validateBulkLoad(@Req() request: RequestWithUser, @Body() dto: BulkLoadEmployeesDto) {
    request.auditAction = 'EMPLOYEE_BULK_LOAD_VALIDATED';
    return this.employeesService.validateBulkLoad(request.tenant!.id, dto);
  }

  @Get()
  @RequirePermissions('employees.read')
  findAll(
    @Req() request: RequestWithUser,
    @CurrentBranch() branch: { id: string },
    @Query() query: ListEmployeesDto,
  ) {
    return this.employeesService.findAll(request.tenant!.id, branch.id, query);
  }

  @Get(':id')
  @RequirePermissions('employees.read')
  findOne(@Req() request: RequestWithUser, @Param('id') id: string) {
    return this.employeesService.findOne(id, request.user, request.tenant!.id);
  }

  @Get(':id/document-summary')
  @RequirePermissions('employees.read')
  documentSummary(@Req() request: RequestWithUser, @Param('id') id: string) {
    return this.employeesService.documentSummary(id, request.user, request.tenant!.id);
  }

  @Patch(':id')
  @RequirePermissions('employees.update')
  async update(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeDto,
  ) {
    const employee = await this.employeesService.update(id, request.user, request.tenant!.id, dto);
    this.setEmployeeAudit(request, 'EMPLOYEE_RECORD_UPDATED', employee);
    return employee;
  }

  @Patch(':id/status')
  @RequirePermissions('employees.update')
  async updateStatus(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeStatusDto,
  ) {
    const employee = await this.employeesService.updateStatus(id, request.user, request.tenant!.id, dto);
    this.setEmployeeAudit(request, 'EMPLOYEE_STATUS_UPDATED', employee);
    return employee;
  }

  @Get(':id/history')
  @RequirePermissions('employees.read')
  history(@Req() request: RequestWithUser, @Param('id') id: string) {
    return this.employeesService.history(id, request.user, request.tenant!.id);
  }

  @Post(':id/transfer')
  @RequirePermissions('employees.update')
  async transfer(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: TransferEmployeeDto,
  ) {
    const employee = await this.employeesService.transfer(id, request.user, request.tenant!.id, dto);
    this.setEmployeeAudit(request, 'EMPLOYEE_PRIMARY_BRANCH_CHANGED', employee);
    return employee;
  }

  @Post(':id/assignments')
  @RequirePermissions('employees.update')
  async assignSecondaryBranch(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: AssignEmployeeBranchDto,
  ) {
    const employee = await this.employeesService.assignSecondaryBranch(id, request.user, request.tenant!.id, dto);
    this.setEmployeeAudit(request, 'EMPLOYEE_BRANCH_ASSIGNMENT_REGISTERED', employee);
    return employee;
  }

  private setEmployeeAudit(
    request: RequestWithUser,
    action: string,
    employee: { id: string; name: string; email: string; status: string; jobTitle?: string | null },
  ) {
    request.auditAction = action;
    request.auditEntityType = 'Employee';
    request.auditEntityId = employee.id;
    request.auditAfter = {
      id: employee.id,
      name: employee.name,
      email: employee.email,
      status: employee.status,
      jobTitle: employee.jobTitle ?? null,
    };
  }
}

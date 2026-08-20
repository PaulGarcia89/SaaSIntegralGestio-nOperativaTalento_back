import { Body, Controller, Get, Param, Patch, Post, Query, Req, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
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
import { BulkUpdateEmployeeStatusDto } from './dto/bulk-update-employee-status.dto';
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

  @Get(':id/overview')
  @RequirePermissions('employees.read')
  overview(@Req() request: RequestWithUser, @Param('id') id: string) {
    return this.employeesService.overview(id, request.user, request.tenant!.id);
  }

  @Get(':id/editor')
  @RequirePermissions('employees.read')
  editor(@Req() request: RequestWithUser, @Param('id') id: string) {
    return this.employeesService.editor(id, request.user, request.tenant!.id);
  }

  @Get(':id/360')
  @RequirePermissions('employees.read')
  employee360(@Req() request: RequestWithUser, @Param('id') id: string) {
    return this.employeesService.employee360(id, request.user, request.tenant!.id);
  }

  @Get(':id/compliance')
  @RequirePermissions('employees.read')
  compliance(@Req() request: RequestWithUser, @Param('id') id: string) {
    return this.employeesService.compliance(id, request.user, request.tenant!.id);
  }

  @Get(':id/documents')
  @RequirePermissions('employees.read')
  documents(@Req() request: RequestWithUser, @Param('id') id: string) {
    return this.employeesService.documentSummary(id, request.user, request.tenant!.id);
  }

  @Post(':id/documents')
  @RequirePermissions('employees.update')
  @UseInterceptors(FileInterceptor('file'))
  uploadDocument(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { section?: string; documentType?: string; requirementCode?: string; notes?: string; expiresAt?: string | null },
  ) {
    return this.employeesService.uploadDocument(id, request.user, request.tenant!.id, file, {
      section: body.section ?? 'employment',
      documentType: body.documentType ?? body.section ?? 'OTHER',
      requirementCode: body.requirementCode ?? null,
      notes: body.notes,
      expiresAt: body.expiresAt ?? null,
    });
  }

  @Get(':id/documents/:documentId/file')
  @RequirePermissions('employees.read')
  async downloadDocument(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Param('documentId') documentId: string,
    @Res() response: Response,
  ) {
    const { document, file } = await this.employeesService.downloadDocument(id, documentId, request.user, request.tenant!.id);
    response.setHeader('Content-Type', document.mimeType);
    response.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(document.originalName)}`);
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.send(file);
  }

  @Patch(':id/documents/:documentId')
  @RequirePermissions('employees.update')
  async updateDocument(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Param('documentId') documentId: string,
    @Body() body: { expiresAt?: string | null },
  ) {
    return this.employeesService.updateDocument(id, documentId, request.user, request.tenant!.id, body);
  }

  @Post(':id/documents/:documentId/replace')
  @RequirePermissions('employees.update')
  @UseInterceptors(FileInterceptor('file'))
  replaceDocument(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Param('documentId') documentId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.employeesService.replaceDocument(id, documentId, request.user, request.tenant!.id, file);
  }

  @Get(':id/audit')
  @RequirePermissions('employees.read')
  audit(@Req() request: RequestWithUser, @Param('id') id: string) {
    return this.employeesService.audit(id, request.user, request.tenant!.id);
  }

  @Get(':id/payroll-compliance')
  @RequirePermissions('employees.read')
  payrollCompliance(@Req() request: RequestWithUser, @Param('id') id: string) {
    return this.employeesService.payrollCompliance(id, request.user, request.tenant!.id);
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

  @Patch(':id/personal')
  @RequirePermissions('employees.update')
  async updatePersonal(@Req() request: RequestWithUser, @Param('id') id: string, @Body() dto: Record<string, any>) {
    const employee = await this.employeesService.updatePersonal(id, request.user, request.tenant!.id, dto);
    this.setEmployeeAudit(request, 'EMPLOYEE_PERSONAL_SECTION_UPDATED', employee);
    return employee;
  }

  @Patch(':id/contact')
  @RequirePermissions('employees.update')
  async updateContact(@Req() request: RequestWithUser, @Param('id') id: string, @Body() dto: Record<string, any>) {
    const employee = await this.employeesService.updateContact(id, request.user, request.tenant!.id, dto);
    this.setEmployeeAudit(request, 'EMPLOYEE_CONTACT_SECTION_UPDATED', employee);
    return employee;
  }

  @Patch(':id/employment')
  @RequirePermissions('employees.update')
  async updateEmployment(@Req() request: RequestWithUser, @Param('id') id: string, @Body() dto: Record<string, any>) {
    const employee = await this.employeesService.updateEmployment(id, request.user, request.tenant!.id, dto);
    this.setEmployeeAudit(request, 'EMPLOYEE_EMPLOYMENT_SECTION_UPDATED', employee);
    return employee;
  }

  @Patch(':id/payroll')
  @RequirePermissions('employees.update')
  async updatePayroll(@Req() request: RequestWithUser, @Param('id') id: string, @Body() dto: Record<string, any>) {
    const result = await this.employeesService.updatePayroll(id, request.user, request.tenant!.id, dto);
    request.auditAction = 'EMPLOYEE_PAYROLL_SECTION_UPDATED';
    request.auditEntityType = 'Employee';
    request.auditEntityId = id;
    request.auditAfter = { section: 'payroll', employeeId: id };
    return result;
  }

  @Patch(':id/tax')
  @RequirePermissions('employees.update')
  async updateTax(@Req() request: RequestWithUser, @Param('id') id: string, @Body() dto: Record<string, any>) {
    const result = await this.employeesService.updateTax(id, request.user, request.tenant!.id, dto);
    request.auditAction = 'EMPLOYEE_TAX_SECTION_UPDATED';
    request.auditEntityType = 'Employee';
    request.auditEntityId = id;
    request.auditAfter = { section: 'tax', employeeId: id };
    return result;
  }

  @Patch(':id/work-eligibility')
  @RequirePermissions('employees.update')
  async updateWorkEligibility(@Req() request: RequestWithUser, @Param('id') id: string, @Body() dto: Record<string, any>) {
    const result = await this.employeesService.updateWorkEligibility(id, request.user, request.tenant!.id, dto);
    request.auditAction = 'EMPLOYEE_WORK_ELIGIBILITY_SECTION_UPDATED';
    request.auditEntityType = 'Employee';
    request.auditEntityId = id;
    request.auditAfter = { section: 'workEligibility', employeeId: id };
    return result;
  }

  @Patch(':id/florida-new-hire')
  @RequirePermissions('employees.update')
  async updateFloridaNewHire(@Req() request: RequestWithUser, @Param('id') id: string, @Body() dto: Record<string, any>) {
    const result = await this.employeesService.updateFloridaNewHire(id, request.user, request.tenant!.id, dto);
    request.auditAction = 'EMPLOYEE_FLORIDA_NEW_HIRE_SECTION_UPDATED';
    request.auditEntityType = 'Employee';
    request.auditEntityId = id;
    request.auditAfter = { section: 'floridaNewHire', employeeId: id };
    return result;
  }

  @Patch(':id/emergency-contact')
  @RequirePermissions('employees.update')
  async updateEmergencyContact(@Req() request: RequestWithUser, @Param('id') id: string, @Body() dto: Record<string, any>) {
    const employee = await this.employeesService.updateEmergencyContact(id, request.user, request.tenant!.id, dto);
    this.setEmployeeAudit(request, 'EMPLOYEE_EMERGENCY_CONTACT_UPDATED', employee);
    return employee;
  }

  @Patch('bulk/status')
  @RequirePermissions('employees.update')
  async bulkUpdateStatus(
    @Req() request: RequestWithUser,
    @Body() dto: BulkUpdateEmployeeStatusDto,
  ) {
    const result = await this.employeesService.bulkUpdateStatus(request.user, request.tenant!.id, dto);
    request.auditAction = 'EMPLOYEE_STATUSES_BULK_UPDATED';
    request.auditAfter = { employeeIds: result.updated.map((employee) => employee.id), status: dto.status, updated: result.updated.length };
    return result;
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

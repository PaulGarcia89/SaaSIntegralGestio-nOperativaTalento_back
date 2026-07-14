import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { BranchAccessGuard } from '../common/guards/branch-access.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { ScopeGuard } from '../common/guards/scope.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentBranch } from '../common/decorators/current-branch.decorator';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { ListEmployeesDto } from './dto/list-employees.dto';
import { TransferEmployeeDto } from './dto/transfer-employee.dto';
import { AssignEmployeeBranchDto } from './dto/assign-employee-branch.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { UpdateEmployeeStatusDto } from './dto/update-employee-status.dto';
import { EmployeesService } from './employees.service';
import { RequestWithUser } from '../common/types/request-with-user.type';
import { BranchLocal } from '../common/decorators/branch-local.decorator';

@Controller('employees')
@UseGuards(JwtAuthGuard, TenantGuard, ScopeGuard, BranchAccessGuard, PermissionGuard)
@BranchLocal()
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Post()
  @RequirePermissions('employees.create')
  create(@Req() request: RequestWithUser, @Body() dto: CreateEmployeeDto) {
    return this.employeesService.create(request.tenant!.id, dto);
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
    return this.employeesService.findOne(id, request.tenant!.id);
  }

  @Patch(':id')
  @RequirePermissions('employees.update')
  update(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeDto,
  ) {
    return this.employeesService.update(id, request.tenant!.id, dto);
  }

  @Patch(':id/status')
  @RequirePermissions('employees.update')
  updateStatus(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeStatusDto,
  ) {
    return this.employeesService.updateStatus(id, request.tenant!.id, dto);
  }

  @Get(':id/history')
  @RequirePermissions('employees.read')
  history(@Req() request: RequestWithUser, @Param('id') id: string) {
    return this.employeesService.history(id, request.tenant!.id);
  }

  @Post(':id/transfer')
  @RequirePermissions('employees.update')
  transfer(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: TransferEmployeeDto,
  ) {
    return this.employeesService.transfer(id, request.tenant!.id, dto);
  }

  @Post(':id/assignments')
  @RequirePermissions('employees.update')
  assignSecondaryBranch(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: AssignEmployeeBranchDto,
  ) {
    return this.employeesService.assignSecondaryBranch(id, request.tenant!.id, dto);
  }
}

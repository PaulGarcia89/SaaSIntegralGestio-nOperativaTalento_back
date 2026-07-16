import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { ScopeGuard } from '../common/guards/scope.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CreateBranchDto } from './dto/create-branch.dto';
import { ListBranchesDto } from './dto/list-branches.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { BranchesService } from './branches.service';
import { RequestWithUser } from '../common/types/request-with-user.type';
import { TenantScoped } from '../common/decorators/tenant-scoped.decorator';

@Controller(['branches', 'company/branches'])
@UseGuards(JwtAuthGuard, TenantGuard, ScopeGuard, PermissionGuard)
@TenantScoped()
export class BranchesController {
  constructor(private readonly branchesService: BranchesService) {}

  @Post()
  @RequirePermissions('branches.create')
  create(@Req() request: RequestWithUser, @Body() dto: CreateBranchDto) {
    return this.branchesService.create(request.tenant!.id, dto);
  }

  @Get()
  @RequirePermissions('branches.read')
  findAll(@Req() request: RequestWithUser, @Query() query: ListBranchesDto) {
    return this.branchesService.findAll(request.tenant!.id, query);
  }

  @Get(':id')
  @RequirePermissions('branches.read')
  findOne(@Req() request: RequestWithUser, @Param('id') id: string) {
    return this.branchesService.findOne(id, request.tenant!.id);
  }

  @Patch(':id')
  @RequirePermissions('branches.update')
  update(@Req() request: RequestWithUser, @Param('id') id: string, @Body() dto: UpdateBranchDto) {
    return this.branchesService.update(id, request.tenant!.id, dto);
  }

  @Delete(':id')
  @RequirePermissions('branches.delete')
  remove(@Req() request: RequestWithUser, @Param('id') id: string) {
    return this.branchesService.remove(id, request.tenant!.id);
  }
}

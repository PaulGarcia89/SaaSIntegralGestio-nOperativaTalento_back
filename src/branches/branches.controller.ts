import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { ScopeGuard } from '../common/guards/scope.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CreateBranchDto } from './dto/create-branch.dto';
import { ListBranchesDto } from './dto/list-branches.dto';
import { BranchesService } from './branches.service';
import { RequestWithUser } from '../common/types/request-with-user.type';
import { TenantWide } from '../common/decorators/tenant-wide.decorator';

@Controller('branches')
@UseGuards(JwtAuthGuard, TenantGuard, ScopeGuard, PermissionGuard)
@TenantWide()
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
}

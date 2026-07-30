import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, Req, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ModuleCode } from '@prisma/client';
import type { Response } from 'express';
import { RequireModule } from '../common/decorators/module-access.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ModuleAccessGuard } from '../common/guards/module-access.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { ScopeGuard } from '../common/guards/scope.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { RequestWithUser } from '../common/types/request-with-user.type';
import { AssignInventoryAssetDto, CreateInventoryAssetDto, CreateInventoryItemDto, InventoryOperationDto, ListInventoryAssetsDto, TransferInventoryAssetDto, ValidateInventoryReturnDto } from './dto/inventory.dto';
import { InventoryService } from './inventory.service';

const fileOptions = {
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
  fileFilter: (_request: unknown, file: Express.Multer.File, callback: (error: Error | null, accept: boolean) => void) =>
    callback(null, ['application/pdf', 'image/jpeg', 'image/png'].includes(file.mimetype)),
};

@Controller('inventory')
@UseGuards(JwtAuthGuard, TenantGuard, SubscriptionGuard, ModuleAccessGuard, ScopeGuard, PermissionGuard)
@RequireModule(ModuleCode.INVENTORY)
export class InventoryController {
  constructor(private readonly service: InventoryService) {}

  @Get('context') @RequirePermissions('inventory.read')
  context(@Req() request: RequestWithUser) { return this.service.context(request.tenant!.id); }

  @Get('catalog') @RequirePermissions('inventory.read')
  catalog(@Req() request: RequestWithUser) { return this.service.listItems(request.tenant!.id); }

  @Post('catalog') @RequirePermissions('inventory.manage')
  createCatalog(@Req() request: RequestWithUser, @Body() dto: CreateInventoryItemDto) {
    request.auditAction = 'INVENTORY_CATALOG_ITEM_CREATED';
    return this.service.createItem(request.tenant!.id, dto);
  }

  @Get('assets') @RequirePermissions('inventory.read')
  assets(@Req() request: RequestWithUser, @Query() query: ListInventoryAssetsDto) { return this.service.listAssets(request.tenant!.id, query); }

  @Get('assets/:id') @RequirePermissions('inventory.read')
  asset(@Req() request: RequestWithUser, @Param('id') id: string) { return this.service.getAsset(request.tenant!.id, id); }

  @Post('assets') @RequirePermissions('inventory.manage')
  createAsset(@Req() request: RequestWithUser, @Body() dto: CreateInventoryAssetDto) {
    request.auditAction = 'INVENTORY_ASSET_REGISTERED';
    return this.service.createAsset(request.tenant!.id, request.user.sub, dto, request.requestId);
  }

  @Post('assets/:id/assign') @RequirePermissions('inventory.manage')
  assign(@Req() request: RequestWithUser, @Param('id') id: string, @Body() dto: AssignInventoryAssetDto) {
    request.auditAction = 'INVENTORY_ASSET_ASSIGNED';
    return this.service.assign(request.tenant!.id, id, request.user.sub, dto, request.requestId);
  }

  @Post('assets/:id/deliver') @RequirePermissions('inventory.manage') @UseInterceptors(FileInterceptor('evidence', fileOptions))
  deliver(@Req() request: RequestWithUser, @Param('id') id: string, @UploadedFile() file: Express.Multer.File | undefined, @Body() dto: InventoryOperationDto) {
    request.auditAction = 'INVENTORY_ASSET_DELIVERED';
    return this.service.deliver(request.tenant!.id, id, request.user.sub, dto, file, request.requestId);
  }

  @Post('assets/:id/transfer') @RequirePermissions('inventory.manage') @UseInterceptors(FileInterceptor('evidence', fileOptions))
  transfer(@Req() request: RequestWithUser, @Param('id') id: string, @UploadedFile() file: Express.Multer.File | undefined, @Body() dto: TransferInventoryAssetDto) {
    request.auditAction = 'INVENTORY_ASSET_TRANSFERRED';
    return this.service.transfer(request.tenant!.id, id, request.user.sub, dto, file, request.requestId);
  }

  @Post('assets/:id/request-return') @RequirePermissions('inventory.manage')
  requestReturn(@Req() request: RequestWithUser, @Param('id') id: string, @Body() dto: InventoryOperationDto) {
    request.auditAction = 'INVENTORY_RETURN_REQUESTED';
    return this.service.requestReturn(request.tenant!.id, id, request.user.sub, dto, request.requestId);
  }

  @Post('assets/:id/return') @RequirePermissions('inventory.manage') @UseInterceptors(FileInterceptor('evidence', fileOptions))
  returnAsset(@Req() request: RequestWithUser, @Param('id') id: string, @UploadedFile() file: Express.Multer.File | undefined, @Body() dto: InventoryOperationDto) {
    request.auditAction = 'INVENTORY_ASSET_RETURNED';
    return this.service.returnAsset(request.tenant!.id, id, request.user.sub, dto, file, request.requestId);
  }

  @Patch('assets/:id/validate-return') @RequirePermissions('inventory.manage') @UseInterceptors(FileInterceptor('evidence', fileOptions))
  validate(@Req() request: RequestWithUser, @Param('id') id: string, @UploadedFile() file: Express.Multer.File | undefined, @Body() dto: ValidateInventoryReturnDto) {
    request.auditAction = 'INVENTORY_RETURN_VALIDATED';
    return this.service.validateReturn(request.tenant!.id, id, request.user.sub, dto, file, request.requestId);
  }

  @Get('evidence/:id') @RequirePermissions('inventory.read')
  async evidence(@Req() request: RequestWithUser, @Param('id') id: string, @Res() response: Response) {
    const result = await this.service.evidence(request.tenant!.id, id);
    if (!result.buffer.length) throw new BadRequestException('Empty evidence');
    response.setHeader('Content-Type', result.evidence.mimeType);
    response.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(result.evidence.originalName)}`);
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.send(result.buffer);
  }
}

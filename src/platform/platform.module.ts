import { Global, Module } from '@nestjs/common';
import { OpenApiController } from './openapi.controller';
import { OpenApiService } from './openapi.service';
import { PlatformAccessService } from './platform-access.service';

@Global()
@Module({
  controllers: [OpenApiController],
  providers: [PlatformAccessService, OpenApiService],
  exports: [PlatformAccessService, OpenApiService],
})
export class PlatformModule {}

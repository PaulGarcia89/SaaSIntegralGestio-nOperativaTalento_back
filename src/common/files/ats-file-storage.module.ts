import { Global, Module } from '@nestjs/common';
import { AtsFileAccessController } from './ats-file-access.controller';
import { AtsPrivateFileService } from './ats-private-file.service';
import { AtsStorageOperationsService } from './ats-storage-operations.service';

@Global()
@Module({
  controllers: [AtsFileAccessController],
  providers: [AtsPrivateFileService, AtsStorageOperationsService],
  exports: [AtsPrivateFileService, AtsStorageOperationsService],
})
export class AtsFileStorageModule {}

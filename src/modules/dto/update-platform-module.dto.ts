import { PartialType } from '@nestjs/mapped-types';
import { CreatePlatformModuleDto } from './create-platform-module.dto';

export class UpdatePlatformModuleDto extends PartialType(CreatePlatformModuleDto) {}

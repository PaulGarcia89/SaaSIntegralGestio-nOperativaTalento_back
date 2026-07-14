import { ModuleCode } from '@prisma/client';
import { SetMetadata } from '@nestjs/common';
import { ACCESS_MODULE_KEY } from '../constants/auth.constants';

export const RequireModule = (moduleCode: ModuleCode) => SetMetadata(ACCESS_MODULE_KEY, moduleCode);

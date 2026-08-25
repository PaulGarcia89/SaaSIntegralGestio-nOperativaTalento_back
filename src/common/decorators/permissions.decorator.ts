import { SetMetadata } from '@nestjs/common';
import { ANY_PERMISSIONS_KEY, REQUIRED_PERMISSIONS_KEY } from '../constants/auth.constants';

export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions);

export const RequireAnyPermission = (...permissions: string[]) =>
  SetMetadata(ANY_PERMISSIONS_KEY, permissions);

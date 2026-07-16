import { SetMetadata } from '@nestjs/common';
import { REQUIRED_SCOPE_KEY } from '../constants/auth.constants';
import { AccessScope } from '../enums/access-scope.enum';

export const RequireScope = (...scopes: AccessScope[]) =>
  SetMetadata(REQUIRED_SCOPE_KEY, scopes);

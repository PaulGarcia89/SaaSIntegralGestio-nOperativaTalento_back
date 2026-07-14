import { SetMetadata } from '@nestjs/common';
import { AUDIT_ACTION_KEY } from './audit.constants';

export const AuditAction = (action: string) => SetMetadata(AUDIT_ACTION_KEY, action);

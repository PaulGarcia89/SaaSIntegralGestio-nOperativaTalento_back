import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { RequestWithUser } from '../common/types/request-with-user.type';
import { TrainingService } from './training.service';

@Injectable()
export class TrainingAccessGuard implements CanActivate {
  constructor(private readonly trainingService: TrainingService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const tenantId = request.tenant?.id ?? request.user?.tenantId;

    await this.trainingService.assertModuleEnabled(tenantId, request.user);
    return true;
  }
}

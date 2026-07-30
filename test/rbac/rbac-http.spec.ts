import {
  CanActivate,
  Controller,
  ExecutionContext,
  Get,
  HttpStatus,
  INestApplication,
  Injectable,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { RequirePermissions } from '../../src/common/decorators/permissions.decorator';
import { PermissionGuard } from '../../src/common/guards/permission.guard';
import { actorFixture } from './rbac.fixtures';

@Injectable()
class SyntheticAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const authorization = req.headers.authorization;
    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Authentication required');
    }
    const token = authorization.slice(7);
    req.user = actorFixture('RECRUITER', {
      permissions: token === 'allowed' ? ['vacancies.read'] : [],
    });
    return true;
  }
}

@Controller('security-probe')
@UseGuards(SyntheticAuthGuard, PermissionGuard)
class SecurityProbeController {
  @Get()
  @RequirePermissions('vacancies.read')
  probe() {
    return { protected: true };
  }
}

describe('RBAC HTTP boundary (Supertest)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SecurityProbeController],
      providers: [SyntheticAuthGuard, PermissionGuard, Reflector],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 401 when authentication is missing', async () => {
    await request(app.getHttpServer()).get('/security-probe').expect(HttpStatus.UNAUTHORIZED);
  });

  it('returns 403 when the permission is missing', async () => {
    await request(app.getHttpServer())
      .get('/security-probe')
      .set('Authorization', 'Bearer denied')
      .expect(HttpStatus.FORBIDDEN);
  });

  it('allows the request when the permission is present', async () => {
    await request(app.getHttpServer())
      .get('/security-probe')
      .set('Authorization', 'Bearer allowed')
      .expect(HttpStatus.OK)
      .expect({ protected: true });
  });
});

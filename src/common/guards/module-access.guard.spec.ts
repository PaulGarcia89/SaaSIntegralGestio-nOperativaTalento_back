import { HttpStatus } from '@nestjs/common';
import { ModuleCode } from '@prisma/client';
import { ModuleAccessGuard } from './module-access.guard';
import { ErrorCode } from '../errors/error-code.enum';
import { ACCESS_MODULE_KEY } from '../constants/auth.constants';
import {
  actor,
  executionContext,
  reflectorWith,
  request,
  superAdmin,
} from '../../../test/fixtures/auth-context.fixture';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

const MODULE_A = 'RECRUITMENT' as ModuleCode;
const MODULE_B = 'TRAINING' as ModuleCode;

function run(options: {
  required?: ModuleCode | ModuleCode[];
  user?: JwtPayload;
  subscriptionModules?: ModuleCode[];
}) {
  const guard = new ModuleAccessGuard(
    reflectorWith(options.required ? { [ACCESS_MODULE_KEY]: options.required } : {}),
  );
  const req = request({
    user: options.user ?? actor(),
    ...(options.subscriptionModules
      ? {
          subscription: {
            id: 's1',
            planId: 'p1',
            status: 'ACTIVE',
            modules: options.subscriptionModules,
          },
        }
      : {}),
  });
  return () => guard.canActivate(executionContext(req));
}

describe('ModuleAccessGuard', () => {
  it('deja pasar cuando la ruta no exige modulo', () => {
    expect(run({})()).toBe(true);
  });

  it('permite si la suscripcion incluye el modulo', () => {
    expect(run({ required: MODULE_A, subscriptionModules: [MODULE_A] })()).toBe(true);
  });

  it('rechaza si la suscripcion no incluye el modulo', () => {
    expect(run({ required: MODULE_A, subscriptionModules: [MODULE_B] })).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({
          code: ErrorCode.MODULE_NOT_ENABLED,
          status: HttpStatus.FORBIDDEN,
        }),
      }),
    );
  });

  it('exige todos los modulos cuando se declara una lista', () => {
    expect(run({ required: [MODULE_A, MODULE_B], subscriptionModules: [MODULE_A, MODULE_B] })()).toBe(true);
    expect(run({ required: [MODULE_A, MODULE_B], subscriptionModules: [MODULE_A] })).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({ code: ErrorCode.MODULE_NOT_ENABLED }),
      }),
    );
  });

  it('el superadmin en contexto global pasa por encima del plan', () => {
    expect(run({ required: MODULE_A, user: superAdmin(), subscriptionModules: [] })()).toBe(true);
  });

  it('el superadmin fuera del contexto global si queda sujeto al plan', () => {
    expect(
      run({
        required: MODULE_A,
        user: superAdmin({ isGlobalContext: false }),
        subscriptionModules: [],
      }),
    ).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({ code: ErrorCode.MODULE_NOT_ENABLED }),
      }),
    );
  });

  it('cae a los modulos del token cuando la peticion no trae suscripcion', () => {
    // Documenta el respaldo: sin SubscriptionGuard delante, la decision se toma
    // con los modulos que viajan en el contexto del usuario.
    expect(run({ required: MODULE_A, user: actor({ enabledModules: [MODULE_A] }) })()).toBe(true);
    expect(run({ required: MODULE_A, user: actor({ enabledModules: [] }) })).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({ code: ErrorCode.MODULE_NOT_ENABLED }),
      }),
    );
  });

  it('la suscripcion de la peticion prevalece sobre los modulos del token', () => {
    expect(
      run({
        required: MODULE_A,
        user: actor({ enabledModules: [MODULE_A] }),
        subscriptionModules: [],
      }),
    ).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({ code: ErrorCode.MODULE_NOT_ENABLED }),
      }),
    );
  });
});

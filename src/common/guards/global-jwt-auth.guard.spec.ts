import { ExecutionContext } from '@nestjs/common';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { GlobalJwtAuthGuard, isGlobalAuthGuardEnabled } from './global-jwt-auth.guard';
import { AUTH_PUBLIC_KEY } from '../constants/auth.constants';
import { reflectorWith } from '../../../test/fixtures/auth-context.fixture';

/**
 * Lista revisada de controladores accesibles sin token. Cada entrada indica por
 * que medio se protege realmente. Anadir una linea aqui exige revisar ese medio.
 *
 * Origen: auditoria de arquitectura 2026-09-04, hallazgo CRITICO-4.
 */
const CONTROLADORES_PUBLICOS: Record<string, string> = {
  HealthController: 'sondas de salud, sin datos de negocio',
  OpenApiController: 'documento OpenAPI (pendiente de autenticar o retirar)',
  AtsFileAccessController: 'token HMAC firmado con caducidad de 30-900 s',
  PublicVacanciesController: 'portal publico de vacantes, datos ya publicos',
  PublicApplicationsController: 'postulacion publica + CandidateAuthGuard por ruta',
  CandidateAuthController: 'login y registro de candidato, con limitacion de tasa',
  ApplicantAuthController: 'login y registro de postulante, con limitacion de tasa',
  CandidateApplicationsController: 'protegido por CandidateAuthGuard a nivel de clase',
  InterviewSelfSchedulingController: 'enlace de autoagenda con token propio',
  PublicSignaturesController: 'token de firma de un solo uso',
  DocuSealWebhookController: 'firma HMAC-SHA256 del proveedor',
  CommunicationWebhooksController: 'webhook de correo con secreto de proveedor',
  PublicTrainingCertificateController: 'verificacion publica de certificado por codigo',
  PublicTrainingScormController: 'URL de lanzamiento SCORM firmada',
  ProductivityInternalController: 'clave de servicio en cabecera x-productivity-service-key',
};

function listarArchivos(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return listarArchivos(full);
    return full.endsWith('.controller.ts') ? [full] : [];
  });
}

interface ClaseControlador {
  archivo: string;
  clase: string;
  publico: boolean;
  conGuards: boolean;
}

function analizarControladores(): ClaseControlador[] {
  const raiz = join(__dirname, '..', '..');
  return listarArchivos(raiz).flatMap((archivo) => {
    const lineas = readFileSync(archivo, 'utf8').split('\n');
    const indices = lineas
      .map((linea, i) => (linea.startsWith('export class') ? i : -1))
      .filter((i) => i >= 0);

    return indices.map((inicio, k) => {
      const anterior = k > 0 ? indices[k - 1] : 0;
      const fin = indices[k + 1] ?? lineas.length;
      const cabecera = lineas.slice(Math.max(anterior, inicio - 30), inicio).join('\n');
      const cuerpo = lineas.slice(inicio, fin).join('\n');
      return {
        archivo: archivo.slice(raiz.length + 1),
        clase: lineas[inicio].split(' ')[2],
        publico: cabecera.includes('@Public()'),
        conGuards: cabecera.includes('@UseGuards(') || cuerpo.includes('@UseGuards('),
      };
    });
  });
}

describe('GlobalJwtAuthGuard', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  const context = (metadata: Record<string, unknown> = {}) =>
    ({
      getHandler: () => function handler() { return undefined; },
      getClass: () => class Test {},
      switchToHttp: () => ({ getRequest: () => ({ headers: {} }) }),
    }) as unknown as ExecutionContext;

  it('esta desactivado por defecto', () => {
    delete process.env.GLOBAL_AUTH_GUARD_ENABLED;
    expect(isGlobalAuthGuardEnabled()).toBe(false);
  });

  it('deja pasar todo mientras esta desactivado', () => {
    delete process.env.GLOBAL_AUTH_GUARD_ENABLED;
    const guard = new GlobalJwtAuthGuard(reflectorWith({}));
    expect(guard.canActivate(context())).toBe(true);
  });

  it('activado, exime a las rutas marcadas con @Public()', () => {
    process.env.GLOBAL_AUTH_GUARD_ENABLED = 'true';
    const guard = new GlobalJwtAuthGuard(reflectorWith({ [AUTH_PUBLIC_KEY]: true }));
    expect(guard.canActivate(context())).toBe(true);
  });

  it('activado, delega en passport para las rutas no publicas', () => {
    process.env.GLOBAL_AUTH_GUARD_ENABLED = 'true';
    const guard = new GlobalJwtAuthGuard(reflectorWith({}));
    const delegado = jest
      .spyOn(Object.getPrototypeOf(Object.getPrototypeOf(guard)), 'canActivate')
      .mockReturnValue(true as never);

    expect(guard.canActivate(context())).toBe(true);
    expect(delegado).toHaveBeenCalledTimes(1);
    delegado.mockRestore();
  });
});

describe('Inventario de controladores publicos', () => {
  const controladores = analizarControladores();

  it('encuentra los controladores del proyecto', () => {
    expect(controladores.length).toBeGreaterThan(70);
  });

  it('todo controlador esta protegido por guards o marcado como @Public()', () => {
    const huerfanos = controladores
      .filter((c) => !c.publico && !c.conGuards)
      .map((c) => `${c.archivo} :: ${c.clase}`);

    expect(huerfanos).toEqual([]);
  });

  it('los controladores publicos son exactamente los de la lista revisada', () => {
    const encontrados = controladores.filter((c) => c.publico).map((c) => c.clase).sort();
    expect(encontrados).toEqual(Object.keys(CONTROLADORES_PUBLICOS).sort());
  });

  it('cada controlador publico documenta como se protege', () => {
    for (const [clase, motivo] of Object.entries(CONTROLADORES_PUBLICOS)) {
      expect(motivo.length).toBeGreaterThan(10);
      expect(clase).toMatch(/Controller$/);
    }
  });
});

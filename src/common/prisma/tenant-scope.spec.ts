import { AppException } from '../errors/app-exception';
import { contieneFiltroDeTenant, consultaAcotada, puntoDeLlamada } from './tenant-scope.predicate';
import {
  argumentosDeExtension,
  extensionDeAislamiento,
  inspeccionar,
  manejarOperacion,
} from './tenant-scope.extension';
import { registroDeAislamiento } from './tenant-scope.reporter';
import { EXCEPCIONES_DE_AISLAMIENTO, estaExento } from './tenant-scope.allowlist';
import { clasificarOperacion, infoDeModelo, registroDeModelos } from './tenant-scope.model-registry';

describe('registro de modelos', () => {
  it('se deriva del esquema, no de una lista escrita a mano', () => {
    const registro = registroDeModelos();
    expect(registro.size).toBeGreaterThan(280);
  });

  it('reconoce un modelo acotado por tenant', () => {
    expect(infoDeModelo('vacancyApplication')?.tieneTenantId).toBe(true);
  });

  it('reconoce un modelo sin tenantId (se acota por su padre)', () => {
    expect(infoDeModelo('trainingLesson')?.tieneTenantId).toBe(false);
  });

  it('distingue los modelos cuyo tenantId admite null (contenido global o de tenant)', () => {
    expect(infoDeModelo('trainingCourse')?.tenantIdOpcional).toBe(true);
    expect(infoDeModelo('vacancyApplication')?.tenantIdOpcional).toBe(false);
  });

  it('clasifica las operaciones', () => {
    expect(clasificarOperacion('findMany')).toBe('colectiva');
    expect(clasificarOperacion('deleteMany')).toBe('colectiva');
    expect(clasificarOperacion('findUnique')).toBe('por-identidad');
    expect(clasificarOperacion('update')).toBe('por-identidad');
    expect(clasificarOperacion('create')).toBe('escritura');
    expect(clasificarOperacion('$queryRaw')).toBe('otra');
  });
});

describe('contieneFiltroDeTenant', () => {
  it('detecta la forma directa', () => {
    expect(contieneFiltroDeTenant({ tenantId: 'tenant-a' })).toBe(true);
  });

  it('detecta dentro de AND / OR / NOT', () => {
    expect(contieneFiltroDeTenant({ AND: [{ status: 'ACTIVE' }, { tenantId: 'a' }] })).toBe(true);
    expect(contieneFiltroDeTenant({ OR: [{ tenantId: 'a' }, { tenantId: 'b' }] })).toBe(true);
    expect(contieneFiltroDeTenant({ NOT: { tenantId: 'a' } })).toBe(true);
  });

  it('detecta a traves de un filtro de relacion anidado', () => {
    // Patron real del modulo de formacion: la leccion se acota por su curso.
    expect(
      contieneFiltroDeTenant({ module: { course: { tenantId: 'tenant-a' } } }),
    ).toBe(true);
  });

  it('detecta una clave unica compuesta', () => {
    expect(
      contieneFiltroDeTenant({
        tenantId_branchId_warehouseId_ingredientId: { branchId: 'b', warehouseId: 'w' },
      }),
    ).toBe(true);
  });

  it('no se deja enganar por un campo que solo se le parece', () => {
    expect(contieneFiltroDeTenant({ tenantName: 'Acme' })).toBe(false);
    expect(contieneFiltroDeTenant({ tenant: 'Acme' })).toBe(false);
  });

  it('devuelve false ante una clausula vacia o ausente', () => {
    expect(contieneFiltroDeTenant(undefined)).toBe(false);
    expect(contieneFiltroDeTenant(null)).toBe(false);
    expect(contieneFiltroDeTenant({})).toBe(false);
  });

  it('no se cuelga con estructuras muy profundas', () => {
    let profundo: Record<string, unknown> = { tenantId: 'a' };
    for (let i = 0; i < 40; i += 1) profundo = { anidado: profundo };
    // Mas alla del limite de profundidad deja de buscar, en lugar de recorrer sin fin.
    expect(contieneFiltroDeTenant(profundo)).toBe(false);
  });
});

describe('consultaAcotada', () => {
  it('las colectivas exigen el filtro en where', () => {
    expect(consultaAcotada('colectiva', { where: { tenantId: 'a' } })).toBe(true);
    expect(consultaAcotada('colectiva', { where: { status: 'ACTIVE' } })).toBe(false);
    expect(consultaAcotada('colectiva', undefined)).toBe(false);
  });

  it('las escrituras exigen el tenant en data', () => {
    expect(consultaAcotada('escritura', { data: { tenantId: 'a', nombre: 'x' } })).toBe(true);
    expect(consultaAcotada('escritura', { data: { nombre: 'x' } })).toBe(false);
  });

  it('upsert vale con el tenant en create', () => {
    expect(consultaAcotada('escritura', { create: { tenantId: 'a' } })).toBe(true);
  });

  it('createMany con un array de filas acotadas', () => {
    expect(consultaAcotada('escritura', { data: [{ tenantId: 'a' }, { tenantId: 'a' }] })).toBe(true);
  });
});

describe('inspeccionar', () => {
  it('ignora las operaciones sin modelo ($queryRaw, $transaction)', () => {
    expect(inspeccionar({ operation: '$queryRaw', args: {} })).toMatchObject({
      acotada: true,
      motivo: 'sin-modelo',
    });
  });

  it('ignora los modelos que no declaran tenantId', () => {
    expect(inspeccionar({ model: 'TrainingLesson', operation: 'findMany', args: {} })).toMatchObject({
      acotada: true,
      motivo: 'modelo-global',
    });
  });

  it('respeta la lista de excepciones', () => {
    // Tenant no declara tenantId: queda exento por la via general.
    expect(inspeccionar({ model: 'Tenant', operation: 'findMany', args: {} })).toMatchObject({
      acotada: true,
      motivo: 'modelo-global',
    });
    expect(inspeccionar({ model: 'User', operation: 'findFirst', args: {} })).toMatchObject({
      acotada: true,
      motivo: 'exento',
    });
  });

  it('una excepcion solo cubre las operaciones declaradas', () => {
    // User esta exento para findFirst/findUnique, no para findMany.
    expect(inspeccionar({ model: 'User', operation: 'findMany', args: {} })).toMatchObject({
      acotada: false,
      motivo: 'sin-filtro',
    });
  });

  it('marca una lectura colectiva sin filtro', () => {
    expect(
      inspeccionar({ model: 'VacancyApplication', operation: 'findMany', args: { where: { status: 'SUBMITTED' } } }),
    ).toMatchObject({ acotada: false, clasificacion: 'colectiva' });
  });

  it('acepta una lectura colectiva con filtro', () => {
    expect(
      inspeccionar({
        model: 'VacancyApplication',
        operation: 'findMany',
        args: { where: { tenantId: 'a', status: 'SUBMITTED' } },
      }),
    ).toMatchObject({ acotada: true });
  });

  it('marca una escritura sin tenant en data', () => {
    expect(
      inspeccionar({ model: 'Employee', operation: 'create', args: { data: { name: 'Ada' } } }),
    ).toMatchObject({ acotada: false, clasificacion: 'escritura' });
  });

  it('separa las lecturas por identidad, que se comprueban despues', () => {
    expect(
      inspeccionar({ model: 'Employee', operation: 'findUnique', args: { where: { id: 'e1' } } }),
    ).toMatchObject({ acotada: false, clasificacion: 'por-identidad' });
  });
});

describe('manejarOperacion', () => {
  beforeEach(() => registroDeAislamiento.limpiar());

  const consulta = jest.fn(async (args: unknown) => ({ ok: true, args }));

  beforeEach(() => consulta.mockClear());

  it('en modo off no inspecciona nada', async () => {
    await manejarOperacion(
      { model: 'Employee', operation: 'findMany', args: {}, query: consulta },
      'off',
    );
    expect(consulta).toHaveBeenCalledTimes(1);
    expect(registroDeAislamiento.resumen().combinaciones).toBe(0);
  });

  it('en modo warn registra pero deja pasar la consulta sin tocarla', async () => {
    const args = { where: { status: 'ACTIVE' } };
    const resultado = await manejarOperacion(
      { model: 'Employee', operation: 'findMany', args, query: consulta },
      'warn',
    );

    expect(consulta).toHaveBeenCalledWith(args);
    expect(resultado).toEqual({ ok: true, args });
    expect(registroDeAislamiento.resumen()).toMatchObject({ combinaciones: 1, colectivas: 1 });
  });

  it('no registra nada cuando la consulta si esta acotada', async () => {
    await manejarOperacion(
      { model: 'Employee', operation: 'findMany', args: { where: { tenantId: 'a' } }, query: consulta },
      'warn',
    );
    expect(registroDeAislamiento.resumen().combinaciones).toBe(0);
  });

  it('deduplica: la misma combinacion se registra una vez y cuenta las repeticiones', async () => {
    for (let i = 0; i < 5; i += 1) {
      await manejarOperacion(
        { model: 'Employee', operation: 'findMany', args: {}, query: consulta },
        'warn',
      );
    }
    const resumen = registroDeAislamiento.resumen();
    expect(resumen.combinaciones).toBe(1);
    expect(resumen.ocurrencias).toBe(5);
  });

  it('en modo block corta las colectivas', async () => {
    await expect(
      manejarOperacion(
        { model: 'Employee', operation: 'findMany', args: {}, query: consulta },
        'block',
      ),
    ).rejects.toBeInstanceOf(AppException);
    expect(consulta).not.toHaveBeenCalled();
  });

  it('en modo block corta las escrituras sin tenant', async () => {
    await expect(
      manejarOperacion(
        { model: 'Employee', operation: 'create', args: { data: { name: 'Ada' } }, query: consulta },
        'block',
      ),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('en modo block deja pasar las lecturas por identidad', async () => {
    await expect(
      manejarOperacion(
        { model: 'Employee', operation: 'findUnique', args: { where: { id: 'e1' } }, query: consulta },
        'block',
      ),
    ).resolves.toBeDefined();
    expect(consulta).toHaveBeenCalledTimes(1);
  });

  it('en modo block no estorba a una consulta correcta', async () => {
    await expect(
      manejarOperacion(
        { model: 'Employee', operation: 'findMany', args: { where: { tenantId: 'a' } }, query: consulta },
        'block',
      ),
    ).resolves.toEqual({ ok: true, args: { where: { tenantId: 'a' } } });
  });
});

describe('lista de excepciones', () => {
  it('cada excepcion declara un motivo util y apunta a un modelo que si lleva tenantId', () => {
    // Un modelo sin tenantId no debe estar aqui: ya queda exento por la via
    // general, y tenerlo en la lista solo la ensucia.
    for (const [modelo, excepcion] of Object.entries(EXCEPCIONES_DE_AISLAMIENTO)) {
      expect(excepcion.motivo.length).toBeGreaterThan(20);
      expect(infoDeModelo(modelo.charAt(0).toLowerCase() + modelo.slice(1))?.tieneTenantId).toBe(true);
    }
  });

  it('solo exime lo declarado', () => {
    expect(estaExento('UserSession', 'findUnique')).toBe(true);
    expect(estaExento('UserSession', 'deleteMany')).toBe(false);
    expect(estaExento('Employee', 'findMany')).toBe(false);
  });
});

describe('puntoDeLlamada', () => {
  it('salta los marcos de la propia extension y del runtime', () => {
    const pila = [
      'Error',
      '    at manejarOperacion (/app/src/common/prisma/tenant-scope.extension.ts:70:5)',
      '    at /app/node_modules/@prisma/client/runtime/library.js:1:2',
      '    at EmployeesService.listar (/app/src/employees/employees.service.ts:412:24)',
    ].join('\n');

    expect(puntoDeLlamada(pila)).toBe('src/employees/employees.service.ts:412:24');
  });

  it('tolera la ausencia de pila', () => {
    expect(puntoDeLlamada(undefined)).toBe('desconocido');
  });
});

describe('extensionDeAislamiento', () => {
  beforeEach(() => registroDeAislamiento.limpiar());

  const obtenerManejador = () => argumentosDeExtension.query.$allModels.$allOperations;

  it('declara un enganche para todas las operaciones de todos los modelos', () => {
    expect(argumentosDeExtension.name).toBe('tenant-scope');
    expect(typeof obtenerManejador()).toBe('function');
  });

  it('defineExtension devuelve el instalador que consume $extends', () => {
    // Prisma envuelve los argumentos en una funcion `(cliente) => cliente.$extends(...)`.
    expect(typeof extensionDeAislamiento()).toBe('function');
  });

  it('el enganche deja pasar la consulta y registra el hallazgo', async () => {
    const manejador = obtenerManejador();
    const query = jest.fn(async (args: unknown) => ({ filas: [], args }));

    const resultado = await manejador({
      model: 'Employee',
      operation: 'findMany',
      args: { where: { status: 'ACTIVE' } },
      query,
    });

    expect(query).toHaveBeenCalledWith({ where: { status: 'ACTIVE' } });
    expect(resultado).toMatchObject({ filas: [] });
    expect(registroDeAislamiento.resumen().combinaciones).toBe(1);
  });

  it('el enganche no registra nada cuando la consulta esta acotada', async () => {
    const manejador = obtenerManejador();
    await manejador({
      model: 'Employee',
      operation: 'findMany',
      args: { where: { tenantId: 'tenant-a' } },
      query: jest.fn(async () => []),
    });

    expect(registroDeAislamiento.resumen().combinaciones).toBe(0);
  });
});

describe('manejarOperacion — modo tomado del entorno', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    registroDeAislamiento.limpiar();
  });

  it('sin variable de entorno usa el modo advertencia', async () => {
    delete process.env.TENANT_SCOPE_ENFORCEMENT;
    const query = jest.fn(async () => []);

    await manejarOperacion({ model: 'Employee', operation: 'findMany', args: {}, query });

    expect(query).toHaveBeenCalledTimes(1);
    expect(registroDeAislamiento.resumen().combinaciones).toBe(1);
  });

  it('TENANT_SCOPE_ENFORCEMENT=off desactiva la vigilancia', async () => {
    process.env.TENANT_SCOPE_ENFORCEMENT = 'off';
    const query = jest.fn(async () => []);

    await manejarOperacion({ model: 'Employee', operation: 'findMany', args: {}, query });

    expect(registroDeAislamiento.resumen().combinaciones).toBe(0);
  });

  it('acepta el nombre del modelo ya en camelCase', () => {
    expect(inspeccionar({ model: 'employee', operation: 'findMany', args: {} })).toMatchObject({
      acotada: false,
      clasificacion: 'colectiva',
    });
  });

  it('un modelo desconocido se trata como global', () => {
    expect(inspeccionar({ model: 'ModeloQueNoExiste', operation: 'findMany', args: {} })).toMatchObject({
      acotada: true,
      motivo: 'modelo-global',
    });
  });
});

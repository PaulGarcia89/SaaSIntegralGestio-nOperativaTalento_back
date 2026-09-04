import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
  collectCoverageFrom: [
    'src/common/guards/**/*.ts',
    'src/common/prisma/tenant-scope*.ts',
    'src/common/rate-limit/**/*.ts',
    'src/common/security/**/*.ts',
    'src/access-control/**/*.ts',
    'src/applications/applications.service.ts',
    'src/employees/employees.service.ts',
  ],
  coverageDirectory: 'coverage',
  // Umbrales por ruta (no globales): protegen la capa de autorizacion, que es
  // donde vive el aislamiento entre empresas. Auditoria 2026-09-04.
  coverageThreshold: {
    // `global` vacio: no se impone un umbral general, solo los de cada ruta.
    global: {},
    './src/common/guards/': { statements: 95, branches: 90, functions: 90, lines: 95 },
    './src/access-control/access-control.service.ts': {
      statements: 100,
      branches: 95,
      functions: 100,
      lines: 100,
    },
    './src/common/security/': { statements: 95, branches: 90, functions: 90, lines: 95 },
    './src/common/prisma/tenant-scope.predicate.ts': {
      statements: 95,
      branches: 90,
      functions: 100,
      lines: 95,
    },
    './src/common/prisma/tenant-scope.extension.ts': {
      statements: 90,
      branches: 85,
      functions: 80,
      lines: 90,
    },
    './src/common/rate-limit/rate-limit.guard.ts': {
      statements: 95,
      branches: 70,
      functions: 90,
      lines: 95,
    },
  },
  testEnvironment: 'node',
  testPathIgnorePatterns: ['/test/e2e/'],
};

export default config;

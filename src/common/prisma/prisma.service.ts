import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { extensionDeAislamiento } from './tenant-scope.extension';
import { modoDeAislamiento, registroDeAislamiento } from './tenant-scope.reporter';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  private static readonly logger = new Logger(PrismaService.name);

  constructor() {
    super();

    const modo = modoDeAislamiento();
    if (modo === 'off') {
      return;
    }

    // La extension solo observa en modo `warn`; nunca altera los argumentos ni
    // el resultado de una consulta. Si por cualquier motivo no pudiera
    // instalarse, se sigue con el cliente sin extender: vigilar el aislamiento
    // jamas debe impedir que la aplicacion funcione.
    try {
      const extendido = this.$extends(extensionDeAislamiento());
      PrismaService.logger.log(`Vigilancia de aislamiento multiempresa activa en modo "${modo}"`);
      return extendido as unknown as PrismaService;
    } catch (error) {
      PrismaService.logger.warn(
        `No se pudo instalar la vigilancia de aislamiento multiempresa: ${
          error instanceof Error ? error.message : 'error desconocido'
        }`,
      );
    }
  }

  async onModuleInit() {
    await this.$connect();
  }

  /** Hallazgos de aislamiento acumulados por este proceso. */
  informeDeAislamiento() {
    return { modo: modoDeAislamiento(), ...registroDeAislamiento.resumen(), hallazgos: registroDeAislamiento.informe() };
  }
}

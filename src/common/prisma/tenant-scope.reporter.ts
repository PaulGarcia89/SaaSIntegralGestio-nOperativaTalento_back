import { Logger } from '@nestjs/common';
import { puntoDeLlamada } from './tenant-scope.predicate';

export type ModoDeAislamiento = 'off' | 'warn' | 'block';

export interface HallazgoDeAislamiento {
  modelo: string;
  operacion: string;
  clasificacion: 'colectiva' | 'por-identidad' | 'escritura';
  puntoDeLlamada: string;
  ocurrencias: number;
  primeraVez: string;
}

/**
 * Registro en memoria de las consultas sin filtro de tenant.
 *
 * Deduplica por modelo + operacion: cada combinacion se registra en el log una
 * sola vez por proceso y despues solo incrementa su contador. Sin esto, un
 * despliegue con trafico real generaria miles de lineas identicas y el aviso
 * dejaria de leerse.
 */
export class RegistroDeAislamiento {
  private readonly logger = new Logger('TenantScope');
  private readonly hallazgos = new Map<string, HallazgoDeAislamiento>();

  registrar(
    modelo: string,
    operacion: string,
    clasificacion: 'colectiva' | 'por-identidad' | 'escritura',
    pila: string | undefined,
  ): HallazgoDeAislamiento {
    const clave = `${modelo}.${operacion}`;
    const existente = this.hallazgos.get(clave);

    if (existente) {
      existente.ocurrencias += 1;
      return existente;
    }

    const hallazgo: HallazgoDeAislamiento = {
      modelo,
      operacion,
      clasificacion,
      // La pila solo se calcula la primera vez que aparece la combinacion,
      // de modo que su coste es despreciable.
      puntoDeLlamada: puntoDeLlamada(pila),
      ocurrencias: 1,
      primeraVez: new Date().toISOString(),
    };

    this.hallazgos.set(clave, hallazgo);

    // Las lecturas y escrituras por identidad se resuelven casi siempre con una
    // comprobacion de propiedad inmediatamente posterior, asi que se registran
    // con menos ruido.
    const mensaje = JSON.stringify({
      type: 'tenant_scope_missing',
      modelo,
      operacion,
      clasificacion,
      puntoDeLlamada: hallazgo.puntoDeLlamada,
    });

    if (clasificacion === 'por-identidad') {
      this.logger.debug(mensaje);
    } else {
      this.logger.warn(mensaje);
    }

    return hallazgo;
  }

  informe(): HallazgoDeAislamiento[] {
    return [...this.hallazgos.values()].sort((a, b) => b.ocurrencias - a.ocurrencias);
  }

  resumen() {
    const hallazgos = this.informe();
    return {
      combinaciones: hallazgos.length,
      ocurrencias: hallazgos.reduce((total, h) => total + h.ocurrencias, 0),
      colectivas: hallazgos.filter((h) => h.clasificacion === 'colectiva').length,
      escrituras: hallazgos.filter((h) => h.clasificacion === 'escritura').length,
      porIdentidad: hallazgos.filter((h) => h.clasificacion === 'por-identidad').length,
    };
  }

  limpiar() {
    this.hallazgos.clear();
  }
}

/** Registro compartido por el proceso, legible desde una ruta de diagnostico. */
export const registroDeAislamiento = new RegistroDeAislamiento();

export function modoDeAislamiento(): ModoDeAislamiento {
  const valor = process.env.TENANT_SCOPE_ENFORCEMENT?.trim().toLowerCase();
  if (valor === 'off' || valor === 'block') return valor;
  return 'warn';
}

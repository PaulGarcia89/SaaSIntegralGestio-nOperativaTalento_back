import { Prisma } from '@prisma/client';
import { HttpStatus } from '@nestjs/common';
import { AppException } from '../errors/app-exception';
import { ErrorCode } from '../errors/error-code.enum';
import { estaExento } from './tenant-scope.allowlist';
import { clasificarOperacion, infoDeModelo } from './tenant-scope.model-registry';
import { ArgumentosDeConsulta, consultaAcotada } from './tenant-scope.predicate';
import { ModoDeAislamiento, modoDeAislamiento, registroDeAislamiento } from './tenant-scope.reporter';

export interface ContextoDeOperacion {
  model?: string;
  operation: string;
  args: unknown;
}

export interface ResultadoDeInspeccion {
  acotada: boolean;
  motivo?: 'sin-modelo' | 'modelo-global' | 'exento' | 'operacion-no-acotable' | 'sin-filtro';
  clasificacion?: 'colectiva' | 'por-identidad' | 'escritura';
}

/**
 * Decide si una operacion necesita filtro de tenant y si lo lleva. Es una
 * funcion pura: toda la logica comprobable vive aqui, no en el enganche.
 */
export function inspeccionar(contexto: ContextoDeOperacion): ResultadoDeInspeccion {
  const { model, operation, args } = contexto;

  // Operaciones sin modelo: $queryRaw, $executeRaw, $transaction.
  if (!model) return { acotada: true, motivo: 'sin-modelo' };

  const delegado = model.charAt(0).toLowerCase() + model.slice(1);
  const info = infoDeModelo(delegado) ?? infoDeModelo(model);

  // Un modelo sin `tenantId` se acota por su entidad padre; no hay nada que exigir.
  if (!info?.tieneTenantId) return { acotada: true, motivo: 'modelo-global' };

  if (estaExento(info.modelo, operation)) return { acotada: true, motivo: 'exento' };

  const clasificacion = clasificarOperacion(operation);
  if (clasificacion === 'otra') return { acotada: true, motivo: 'operacion-no-acotable' };

  if (consultaAcotada(clasificacion, args as ArgumentosDeConsulta | undefined)) {
    return { acotada: true, clasificacion };
  }

  return { acotada: false, motivo: 'sin-filtro', clasificacion };
}

/**
 * Enganche que se instala en el cliente. En modo `warn` solo observa: registra
 * el hallazgo y deja pasar la consulta sin alterarla. En modo `block` corta las
 * operaciones colectivas y de escritura, que son las que exponen o modifican
 * filas de otra empresa; las lecturas por identidad siguen pasando, porque el
 * proyecto las resuelve con una comprobacion de propiedad posterior.
 */
export async function manejarOperacion<T>(
  contexto: ContextoDeOperacion & { query: (args: unknown) => Promise<T> },
  modo: ModoDeAislamiento = modoDeAislamiento(),
): Promise<T> {
  const { model, operation, args, query } = contexto;

  if (modo === 'off') return query(args);

  const resultado = inspeccionar({ model, operation, args });

  if (resultado.acotada) return query(args);

  registroDeAislamiento.registrar(
    model!,
    operation,
    resultado.clasificacion!,
    new Error().stack,
  );

  if (modo === 'block' && resultado.clasificacion !== 'por-identidad') {
    throw new AppException(
      `La consulta ${model}.${operation} no lleva filtro de tenant`,
      ErrorCode.TENANT_CONTEXT_REQUIRED,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }

  return query(args);
}

/**
 * Extension de cliente Prisma que vigila el aislamiento entre empresas.
 *
 * Se aplica tambien dentro de `$transaction`, que es donde vive la mayor parte
 * de la logica de inventario: esa es la razon de usar una extension de cliente y
 * no un envoltorio propio sobre el servicio.
 *
 * Origen: auditoria de arquitectura 2026-09-04, hallazgo CRITICO-3.
 */
export const argumentosDeExtension = {
  name: 'tenant-scope',
  query: {
    $allModels: {
      async $allOperations({
        model,
        operation,
        args,
        query,
      }: {
        model?: string;
        operation: string;
        args: unknown;
        query: (args: unknown) => Promise<unknown>;
      }) {
        return manejarOperacion({ model, operation, args, query });
      },
    },
  },
};

export function extensionDeAislamiento() {
  return Prisma.defineExtension(argumentosDeExtension as never);
}

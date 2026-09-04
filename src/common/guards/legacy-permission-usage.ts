import { Logger } from '@nestjs/common';

export interface UsoDeAliasLegacy {
  permiso: string;
  alias: string;
  ocurrencias: number;
  tenants: Set<string>;
  primeraVez: string;
}

/**
 * Telemetria de los alias de compatibilidad de permisos de inventario.
 *
 * `INVENTORY_LEGACY_PERMISSION_FALLBACK` esta activo por defecto, de modo que
 * `inventory.manage` satisface hoy permisos granulares como
 * `restaurant_inventory.purchase_orders.approve`. Antes de invertir ese valor
 * por defecto hay que saber quien depende realmente del atajo: este registro lo
 * mide sin cambiar ninguna decision de autorizacion.
 *
 * Origen: auditoria de arquitectura 2026-09-04, hallazgo ALTA-8.
 */
export class RegistroDeAliasLegacy {
  private readonly logger = new Logger('LegacyPermissionAlias');
  private readonly usos = new Map<string, UsoDeAliasLegacy>();

  registrar(permiso: string, alias: string, tenantId: string | null) {
    const clave = `${permiso}<-${alias}`;
    const existente = this.usos.get(clave);

    if (existente) {
      existente.ocurrencias += 1;
      if (tenantId) existente.tenants.add(tenantId);
      return;
    }

    const uso: UsoDeAliasLegacy = {
      permiso,
      alias,
      ocurrencias: 1,
      tenants: new Set(tenantId ? [tenantId] : []),
      primeraVez: new Date().toISOString(),
    };
    this.usos.set(clave, uso);

    this.logger.warn(
      JSON.stringify({
        type: 'legacy_permission_alias_used',
        permiso,
        alias,
        tenantId,
      }),
    );
  }

  informe() {
    return [...this.usos.values()]
      .map((uso) => ({
        permiso: uso.permiso,
        alias: uso.alias,
        ocurrencias: uso.ocurrencias,
        tenants: [...uso.tenants],
        primeraVez: uso.primeraVez,
      }))
      .sort((a, b) => b.ocurrencias - a.ocurrencias);
  }

  resumen() {
    const informe = this.informe();
    return {
      activo: aliasLegacyActivos(),
      combinaciones: informe.length,
      ocurrencias: informe.reduce((total, u) => total + u.ocurrencias, 0),
      tenantsAfectados: new Set(informe.flatMap((u) => u.tenants)).size,
    };
  }

  limpiar() {
    this.usos.clear();
  }
}

export const registroDeAliasLegacy = new RegistroDeAliasLegacy();

export function aliasLegacyActivos() {
  return process.env.INVENTORY_LEGACY_PERMISSION_FALLBACK !== 'false';
}

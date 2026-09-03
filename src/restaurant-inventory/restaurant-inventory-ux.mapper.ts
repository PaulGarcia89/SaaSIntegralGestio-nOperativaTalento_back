export type InventoryUxAction = {
  code: string;
  label: string;
  enabled: boolean;
};

const operationLabels: Record<string, string> = {
  DRAFT: 'Borrador',
  CONFIRMED: 'Confirmado',
  CANCELLED: 'Cancelado',
  SENT: 'Enviado',
  RECEIVED: 'Recibido',
  IN_REVIEW: 'En revisión',
  REVIEW: 'En revisión',
};

export function displayStatus(status: string | null | undefined): string | null {
  return status ? operationLabels[status] ?? status : null;
}

export function resolveNextAction(status: string | null | undefined, blocked = false): string | null {
  if (blocked) return 'resolve_stock_shortage';
  if (status === 'DRAFT') return 'confirm_operation';
  if (status === 'SENT') return 'receive_transfer';
  if (status === 'IN_REVIEW' || status === 'REVIEW') return 'approve_count';
  return null;
}

export function operationActions(status: string | null | undefined, blocked = false): InventoryUxAction[] {
  return [
    { code: 'view_detail', label: 'Ver detalle', enabled: true },
    { code: 'confirm_operation', label: 'Confirmar', enabled: status === 'DRAFT' && !blocked },
    { code: 'cancel_operation', label: 'Cancelar', enabled: status === 'DRAFT' || status === 'CONFIRMED' },
  ];
}

export function mapOperationForUx<T extends Record<string, any>>(row: T, kind: string): T & Record<string, any> {
  const blocked = Boolean(row.blocked);
  Object.assign(row, {
    displayStatus: displayStatus(row.status),
    nextAction: resolveNextAction(row.status, blocked),
    actionsAvailable: operationActions(row.status, blocked),
    activityDescription: `${kind} ${displayStatus(row.status)?.toLowerCase() ?? 'actualizado'}`,
  });
  return row;
}

export function mapBalanceForUx<T extends Record<string, any>>(row: T, lotSummary: Record<string, number>) {
  const quantity = Number(row.quantityOnHand ?? 0);
  const minimum = Number(row.minimumStock ?? 0);
  const blocked = quantity <= minimum;
  return {
    ...row,
    availableQuantity: quantity,
    stockStatus: blocked ? 'LOW_STOCK' : 'AVAILABLE',
    displayStatus: blocked ? 'Bajo mínimo' : 'Disponible',
    blocked,
    nextAction: blocked ? 'create_purchase_or_receipt' : null,
    actionsAvailable: operationActions(undefined, false),
    lotSummary,
  };
}

export function mapMovementForUx<T extends Record<string, any>>(row: T) {
  const direction = row.direction === 'IN' ? 'Entrada' : 'Salida';
  return {
    ...row,
    displayType: row.movementType ?? null,
    displayDirection: direction,
    activityDescription: `${direction} de inventario${row.ingredientName ? `: ${row.ingredientName}` : ''}`,
  };
}

export function mapLotForUx<T extends Record<string, any>>(row: T, now = new Date()) {
  const expiration = row.expirationDate ? new Date(row.expirationDate) : null;
  const daysRemaining = expiration ? Math.ceil((expiration.getTime() - now.getTime()) / 86400000) : null;
  const status = Number(row.remainingQuantity ?? row.quantity ?? 0) <= 0 ? 'DEPLETED' : daysRemaining !== null && daysRemaining < 0 ? 'EXPIRED' : daysRemaining !== null && daysRemaining <= 30 ? 'EXPIRING' : 'AVAILABLE';
  return { ...row, displayStatus: displayStatus(status) ?? status, lotStatus: status, daysRemaining };
}

export function previewUx<T extends Record<string, any>>(preview: T, rows: Array<Record<string, any>>, shortageField = 'shortageQuantity') {
  const blocked = rows.some((row) => Number(row[shortageField] ?? 0) > 0);
  return {
    ...preview,
    blocked,
    warnings: blocked ? [{ code: 'INSUFFICIENT_STOCK', message: 'La operación requiere más existencia de la disponible.' }] : [],
    nextAction: blocked ? 'resolve_stock_shortage' : 'confirm_operation',
    actionsAvailable: [{ code: 'confirm_operation', label: 'Confirmar', enabled: !blocked }],
  };
}

# Compras e inventario de restaurante

## Alcance

El dominio comercial usa `RestaurantPurchaseOrder`, separado del inventario de activos físicos (`InventoryPurchaseOrder`). Las órdenes se mantienen aisladas por tenant, sucursal y almacén.

Estados de orden:

```text
DRAFT -> PENDING_APPROVAL -> APPROVED -> SENT -> PARTIALLY_RECEIVED -> RECEIVED
                 |                 \-> REJECTED
                 \---------------------------------> CANCELLED
```

Las transiciones se validan en backend y las mutaciones críticas aceptan `Idempotency-Key` mediante el interceptor de inventario existente.

## Recepción

`POST /api/restaurant-inventory/purchase-orders/:id/receive` bloquea la orden dentro de una transacción y actualiza conjuntamente:

- Líneas recibidas y estado de la orden.
- `RestaurantGoodsReceipt` confirmado y relacionado.
- Existencias y costo promedio.
- Lotes y vencimientos.
- Movimiento `GOODS_RECEIPT`.
- Historial de precios.
- Diferencias de precio.

No permite sobre-recepción salvo `inventory.override`. Una orden no aprobada, cancelada o recibida no puede recibir mercancía.

## Facturas OCR

El dominio depende de la interfaz `InvoiceOcrProvider`; `BasicInvoiceOcrProvider` deja la factura en revisión manual con confianza cero. Para producción se debe registrar un adaptador real de OCR sin cambiar el dominio. No se aprueban facturas con confianza inferior a `INVOICE_OCR_MIN_CONFIDENCE` (por defecto `0.8`) ni facturas con diferencias fuera de tolerancia.

Variables adicionales:

```env
INVOICE_MAX_UPLOAD_BYTES=15728640
INVOICE_STORAGE_DIR=/var/lib/app/invoices
INVOICE_OCR_MIN_CONFIDENCE=0.8
PURCHASE_DIFFERENCE_TOLERANCE_PERCENT=0
```

## Migración y pruebas

```bash
npx prisma migrate deploy
npx jest src/restaurant-inventory --runInBand
npm run build
```

La migración es aditiva. No ejecutar `prisma migrate reset` en producción. Las pruebas que requieren persistencia real deben apuntar a una base cuyo nombre contenga `e2e`, `test` o `certification`.

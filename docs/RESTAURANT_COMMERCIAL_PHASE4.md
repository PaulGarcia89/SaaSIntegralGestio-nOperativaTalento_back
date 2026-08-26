# Inteligencia Comercial del Inventario

## Endpoints

Todos los endpoints están bajo `/restaurant-inventory/commercial` y requieren sesión, contexto de tenant y el permiso indicado:

- `GET /demand-forecast` (`restaurant_inventory.commercial.view`): pronóstico por promedio móvil ponderado explicable basado en consumos confirmados y recetas vigentes. Acepta `branchId`, `warehouseId`, `ingredientId`, `categoryId`, `from`, `to`, `horizon` y `granularity` (`daily`, `weekly`, `monthly`).
- `GET /branch-costs` (`restaurant_inventory.commercial.view`): resumen por sucursal y periodo con `purchasesConfirmed`, `transferredCost`, `consumptionCost`, `inventoryValue`, `wasteCost`, `adjustments`, `theoreticalRealVariance`, `foodCostPercent` y cambio absoluto/porcentual contra el periodo anterior. Acepta `branchId`, `warehouseId`, `categoryId`, `from` y `to`.
- `GET /recipe-margins` (`restaurant_inventory.commercial.view`): porciones, ingresos, costo directo de ingredientes, costo de subrecetas/producción, costo total, margen, food cost y versión histórica utilizada. Acepta `recipeId`, `branchId`, `from`, `to`, `status` y `categoryId`.
- `GET /comparative` (`restaurant_inventory.commercial.view`): comparativo de costos por sucursal y márgenes por receta.
- `GET /unit-comparison` (`restaurant_inventory.commercial.view`): compara sucursales autorizadas para `purchase_cost`, `consumption_cost`, `food_cost_percent`, `waste_cost`, `shrinkage_cost`, `inventory_turnover`, `stockout_rate`, `recipe_margin` y `purchase_budget_utilization`. Acepta `branchIds`, `from`, `to`, `metric`, `groupBy`, `normalized` y `sortOrder`.
- `GET /commissary` (`restaurant_inventory.commissary.manage`): transferencias recibidas y valorización del comisariato.
- `GET /commissaries` (`restaurant_inventory.commissary.manage`): catálogo paginado de comisariatos.
- `POST /commissaries` (`restaurant_inventory.commissary.manage`): crea configuración central, sucursales atendidas, ingredientes y recetas permitidas.
- `PATCH /commissaries/:id` (`restaurant_inventory.commissary.manage`): actualiza configuración y relaciones dentro del tenant.
- `POST /commissaries/:id/activate` y `POST /commissaries/:id/deactivate` (`restaurant_inventory.commissary.manage`): transiciones idempotentes de estado.
- `GET /budgets` (`restaurant_inventory.budgets.manage`): consulta de presupuestos.
- `POST /budgets` (`restaurant_inventory.budgets.manage`): creación idempotente de presupuesto.
- `PATCH /budgets/:id` (`restaurant_inventory.budgets.manage`): actualización y transición de presupuesto.

Las consultas aceptan `branchId`, `warehouseId`, `recipeId`, `ingredientId`, `periodStart`, `periodEnd`, `page`, `pageSize`, `sortBy` y `sortOrder`. El límite de página es 200. Las mutaciones heredan `Idempotency-Key` y auditoría del módulo.

## Fórmulas

- Pronóstico: promedio móvil ponderado de las cubetas históricas, con pesos crecientes hacia los periodos más recientes.
- Límites: `promedio ponderado +/- 1.96 * desviación estándar ponderada`; el límite inferior nunca es menor que cero.
- Confianza: cobertura de cubetas no censuradas frente al total de cubetas observadas, limitada a 99%.
- Costo pronosticado: `cantidad pronosticada * costo promedio vigente`.
- Margen: `ingreso - costo de consumo confirmado`.
- Margen porcentual: `margen / ingreso * 100`.
- Costo directo: suma de `totalCostSnapshot` de componentes `INGREDIENT`, prorrateada por porciones y multiplicada por porciones vendidas.
- Costo de producción: costo total histórico menos costo directo; representa componentes `SUB_RECIPE` y evita sumar otra vez órdenes de producción.
- Costo total: snapshot `totalCost` del consumo confirmado, nunca el costo actual de la receta.
- Comparación de unidades: ranking por valor de la métrica, promedio y desviación estándar calculados únicamente sobre las sucursales autorizadas.
- Normalización de costos y margen: `métrica / ventas confirmadas * 100`.
- Rotación: `costo de consumo / valor de inventario * (365 / días del periodo)`.
- Tasa de agotamiento: `saldos con cantidad <= 0 / saldos totales * 100`.
- Utilización de presupuesto: `compras confirmadas / presupuesto activo * 100`.
- Comisariato: suma de `cantidad * costo unitario` en transferencias `RECEIVED`.
- Food cost: `costo de consumo confirmado / ingreso de ventas confirmadas * 100`.
- Variación teórica versus real: suma de `varianceValue` de conteos aprobados.
- Valor de inventario: `quantityOnHand * averageCost` por saldo actual filtrado.

Se excluyen consumos no confirmados, transferencias no recibidas y movimientos fuera del tenant, sucursal o almacén seleccionado. Los periodos con existencia reconstruida en cero se registran en `censoredPeriods` y no se usan para entrenar el promedio. El mínimo de historial se configura con `RESTAURANT_COMMERCIAL_FORECAST_MIN_HISTORY_DAYS` y por defecto es 14 días; cuando no se alcanza se devuelve `INSUFFICIENT_HISTORY`. Las cantidades se redondean a seis decimales y valores monetarios a dos decimales.

Para costos de sucursal, entradas de `PURCHASE_ORDER`/`GOODS_RECEIPT`, transferencias `TRANSFER_RECEIPT`, consumo, desperdicio y ajustes se agregan por referencia y tipo de movimiento; las reversiones se compensan por signo y no se cuentan como compras nuevas.

El catálogo de comisariatos es independiente de producción y transferencias. Sus mutaciones sólo actualizan configuración y relaciones; los movimientos se generan exclusivamente en los flujos confirmatorios de producción o recepción de transferencias.

## Datos y despliegue

La migración `20260825150000_restaurant_commercial_intelligence` crea el estado y tabla de presupuestos, índices y permisos. Ejecutar en despliegue con `npx prisma migrate deploy`; no se ejecuta automáticamente contra una base de datos productiva desde desarrollo.

No hay variables de entorno nuevas. Se utiliza la zona horaria UTC de la base de datos y los valores actuales de `DATABASE_URL` y autenticación.

El archivo `docs/backend-contracts-required.md` solicitado como referencia no existe en el repositorio; los contratos se alinearon con los DTOs, guards y servicios actuales.

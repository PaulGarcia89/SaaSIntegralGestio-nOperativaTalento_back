# API de registros de empleados

## Propósito funcional

El módulo `employees` mantiene el directorio y la base documental de personas que ya pertenecen a una empresa. `POST /employees` registra un empleado existente; no crea una candidatura, oferta, contratación ni flujo de onboarding.

ATS, conversión de candidatos, ofertas y onboarding conservan sus propios contratos. Cuando un empleado proviene de una conversión ATS, la API lo identifica con `recordSource: CANDIDATE_CONVERSION`; el registro manual y la carga usan `DIRECTORY_REGISTRATION`.

## Registro manual

`POST /employees`

```json
{
  "name": "Ana Pérez",
  "email": "ana@empresa.com",
  "primaryBranchId": "uuid",
  "primaryRole": "Supervisora",
  "status": "ACTIVE"
}
```

La escritura del empleado y su asignación principal es transaccional. El correo se normaliza a minúsculas y debe ser único dentro del tenant. `primaryRole` se persiste como cargo (`jobTitle`) y como rol operativo de la asignación principal.

## Carga masiva

- `POST /employees/bulk/validate`: prevalidación sin escritura.
- `POST /employees/bulk`: carga atómica de hasta 500 registros.

Ambos reciben `{ "employees": [<mismo contrato del registro manual>] }`. La prevalidación devuelve totales y errores por fila:

- `DUPLICATE_EMAIL_IN_LOAD`
- `EMPLOYEE_EMAIL_ALREADY_REGISTERED`
- `BRANCH_NOT_AVAILABLE_IN_TENANT`

Si una fila es inválida, la carga no escribe ningún registro.

## Directorio y auditoría documental

- `GET /employees`: directorio paginado por sucursal activa.
- `GET /employees/:id`: ficha operativa, origen del registro y conteo documental.
- `GET /employees/:id/document-summary`: resumen de documentos, revisiones, vencimientos y categorías. No expone claves internas de almacenamiento ni checksums.
- `GET /employees/:id/history`: asignaciones, documentos y hasta 100 eventos de auditoría vinculados al empleado.
- `GET /employees/:id/overview`: vista agregada y segura del expediente con datos base, empleo, sucursal, resumen documental y alertas derivadas.
- `GET /employees/:id/payroll-compliance`: snapshot seguro para nómina y cumplimiento con base del tenant, estado W-4, I-9, E-Verify y Florida New Hire, usando placeholders cuando el backend aún no persiste un campo específico.
- `PATCH /employees/:id`: actualiza nombre, correo, cargo o estado. Cambiar `jobTitle` sincroniza el rol de la asignación principal.

Las respuestas de directorio incluyen:

```json
{
  "recordSource": "DIRECTORY_REGISTRATION",
  "documentSummary": { "totalDocuments": 3 }
}
```

## Compatibilidad

Las rutas existentes no cambian. `CreateEmployeeDto` y `BulkCreateEmployeesDto` permanecen como alias internos obsoletos para evitar romper consumidores compilados contra nombres anteriores. No se aceptan en estos DTO campos de postulación, oferta, onboarding, nómina o identidad.

## Trazabilidad

Las mutaciones registran el empleado como entidad de auditoría con acciones explícitas:

- `EMPLOYEE_RECORD_REGISTERED`
- `EMPLOYEE_RECORD_UPDATED`
- `EMPLOYEE_STATUS_UPDATED`
- `EMPLOYEE_RECORDS_BULK_LOADED`
- `EMPLOYEE_PRIMARY_BRANCH_CHANGED`
- `EMPLOYEE_BRANCH_ASSIGNMENT_REGISTERED`

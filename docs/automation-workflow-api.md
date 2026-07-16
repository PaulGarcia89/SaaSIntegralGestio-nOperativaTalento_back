# Automatización Operativa y Workflow Master

## Arquitectura breve

- `MasterWorkflow` sigue siendo el núcleo persistente del flujo maestro por tenant, branch y employee.
- `AutomationRule` define reglas activas por tenant o sucursal.
- `AutomationExecution` guarda cada corrida real disparada por un evento de dominio.
- `AutomationExecutionStep` registra cada consecuencia ejecutada dentro de la corrida.
- `AutomationAuditLog` deja auditoría append-only de recepción, ejecución, éxito, fallo o skip.
- `PolicyCheck`, `AssetAssignment` y `TrainingActivation` persisten artefactos operativos disparados por automatización.

## Endpoints principales

### Listar reglas

`GET /api/automation/rules`

Respuesta:

```json
{
  "data": [
    {
      "id": "55e2a0e9-139e-4b92-aa5b-0763651878ad",
      "name": "Alta operativa al contratar",
      "triggerEvent": "CANDIDATE_HIRED",
      "scope": "BRANCH",
      "enabled": true,
      "version": 1
    }
  ],
  "meta": {
    "total": 1,
    "page": 1,
    "pageSize": 20,
    "totalPages": 1
  }
}
```

### Crear regla

`POST /api/automation/rules`

```json
{
  "name": "Provisionar accesos al completar operación",
  "triggerEvent": "OPERATION_HANDOFF_COMPLETED",
  "scope": "BRANCH",
  "branchId": "7f1f9bf0-1f0e-4a4e-b9e6-a95ef6d71d81",
  "consequences": [
    {
      "type": "PROVISION_ACCESS"
    },
    {
      "type": "MARK_WORKFLOW_STAGE",
      "stepKey": "ADMIN_COMPLIANCE"
    }
  ]
}
```

### Disparar evento `candidate-hired`

`POST /api/domain-events/candidate-hired`

```json
{
  "branchId": "7f1f9bf0-1f0e-4a4e-b9e6-a95ef6d71d81",
  "candidateId": "1e39e829-8178-4260-b8d6-e40f99bf3151",
  "employeeName": "Ana Torres",
  "employeeEmail": "ana.torres@example.com",
  "payload": {
    "source": "frontend"
  }
}
```

Respuesta:

```json
{
  "triggerEvent": "CANDIDATE_HIRED",
  "executionCount": 1,
  "executions": [
    {
      "id": "5db6d6c6-a13a-454b-af7a-4887aa2c4025",
      "status": "COMPLETED"
    }
  ]
}
```

### Consultar workflow master actual por empleado

`GET /api/workflow-master/:employeeId`

Respuesta:

```json
{
  "id": "35f132ec-a096-4256-9e95-e16c54392444",
  "employeeName": "Ana Torres",
  "branchName": "Sede principal de Miami",
  "workflowType": "hiring",
  "globalStatus": "completed",
  "progressPercent": 100,
  "currentStage": null,
  "summary": "Flujo sin etapa actual",
  "blockers": [],
  "steps": [
    {
      "id": "8fce8ae4-d7cb-4f2b-b947-8c0cefb7a5c1",
      "label": "Candidatura",
      "status": "completed",
      "detail": "La candidatura y la evaluación ATS fueron completadas.",
      "owner": "ATS / Reclutamiento",
      "sla": "on_time",
      "targetDate": ""
    }
  ],
  "updatedAtLabel": "2026-07-16T05:10:19.531Z"
}
```

### Consultar auditoría de automatización

`GET /api/automation/audit?workflowId=35f132ec-a096-4256-9e95-e16c54392444`

## Scripts útiles

- `npm run test:automation:rules`
- `npm run test:automation:flow`

## Nota de migración

La aplicación del esquema nuevo sobre la base local quedó realizada con `prisma db push` porque `prisma migrate dev` falla hoy por una migración histórica previa del proyecto en la shadow database:

- migración conflictiva: `20260601200000_add_application_tracking_and_interview`
- error observado: `type "ApplicationStatus" does not exist`

Antes de publicar formalmente por migraciones, conviene corregir esa cadena histórica o regenerar una baseline limpia.

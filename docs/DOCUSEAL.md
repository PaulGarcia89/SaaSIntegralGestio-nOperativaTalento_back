# DocuSeal

La integración usa el API de DocuSeal desde el backend. El token nunca se expone al frontend.

## Configuración

Define en el entorno del backend:

```env
DOCUSEAL_BASE_URL=https://api.docuseal.com
DOCUSEAL_API_KEY=...
DOCUSEAL_WEBHOOK_SECRET=...
DOCUSEAL_TEMPLATE_EMPLOYMENT_AGREEMENT_ID=...
DOCUSEAL_TEMPLATE_EMPLOYMENT_AGREEMENT_URL=https://docuseal.example.com/s/...
DOCUSEAL_TEMPLATE_NDA_ID=...
DOCUSEAL_TEMPLATE_NDA_URL=https://docuseal.example.com/s/...
```

Los IDs son los IDs numéricos de las plantillas en DocuSeal. Las URLs son opcionales y solo se usan como fallback para abrir la solicitud si DocuSeal no devuelve el slug del submitter.

## Webhook

En DocuSeal registra:

```text
POST https://TU_BACKEND/webhooks/docuseal?secret=EL_MISMO_DOCUSEAL_WEBHOOK_SECRET
```

Activa los eventos `submission.completed` y `submission.expired`. Al recibir `submission.completed`, el backend descarga el PDF firmado, lo guarda en el expediente del empleado, completa `EMPLOYMENT_AGREEMENT` y registra la auditoría.

La UI está disponible en el alta individual del empleado y en la pestaña `Documentos` del expediente.

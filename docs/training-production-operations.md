# Operación productiva del módulo de formación

## Almacenamiento SCORM

El entorno LAN usa `SCORM_STORAGE_DRIVER=filesystem` y un volumen persistente. Para producción:

- `SCORM_STORAGE_DRIVER=s3`
- `SCORM_S3_BUCKET`
- `SCORM_S3_REGION`
- `SCORM_S3_ENDPOINT` para MinIO
- `SCORM_S3_FORCE_PATH_STYLE=true` para MinIO
- `SCORM_S3_ACCESS_KEY_ID` y `SCORM_S3_SECRET_ACCESS_KEY`
- `SCORM_S3_SSE=true`

La cuenta debe tener acceso únicamente al prefijo del bucket destinado a SCORM. Active versionado, lifecycle y replicación del bucket.

## Antivirus

En producción configure `SCORM_ANTIVIRUS_MODE=clamav`, `CLAMAV_HOST` y `CLAMAV_PORT=3310`. Si el motor no responde, la carga falla cerrada. `SCORM_ALLOW_UNSCANNED_UPLOADS=true` se reserva para desarrollo local.

## Límites

`SCORM_MAX_UPLOAD_BYTES`, `SCORM_TENANT_QUOTA_BYTES` y `SCORM_TENANT_PACKAGE_LIMIT` limitan abuso y consumo. La consola muestra uso y cuota.

## Webhooks

Los secretos se cifran con `WEBHOOK_ENCRYPTION_KEY`; no cambie esta clave sin un procedimiento de rotación. Las firmas usan HMAC SHA-256 sobre `timestamp.body`, en `x-talentos-signature`. La cola reintenta cinco veces y conserva la entrega para auditoría.

## Copias de seguridad

Respaldar conjuntamente PostgreSQL y el bucket/volumen SCORM. Probar restauraciones trimestralmente. Una restauración inconsistente entre base de datos y objetos debe considerarse fallida.

## Alertas recomendadas

- Entregas webhook fallidas mayores que cero durante 15 minutos.
- Antivirus no disponible.
- Uso de almacenamiento mayor al 80%.
- Crecimiento anormal de paquetes o entregas.
- Cola `training-webhook` con retraso superior a cinco minutos.
## Video storage on Railway

Training video metadata is stored in PostgreSQL, but MP4 bytes must not use the container filesystem. Configure the following Railway variables before uploading videos:

```env
SCORM_STORAGE_DRIVER=s3
SCORM_S3_BUCKET=<bucket>
SCORM_S3_REGION=auto
SCORM_S3_ENDPOINT=<s3-or-r2-endpoint>
SCORM_S3_ACCESS_KEY_ID=<access-key>
SCORM_S3_SECRET_ACCESS_KEY=<secret-key>
SCORM_S3_FORCE_PATH_STYLE=false
```

Existing lessons whose files were uploaded with the filesystem driver must be uploaded again or migrated to the bucket. Missing objects now return `404` instead of `500`, but the database record cannot reconstruct a deleted MP4.

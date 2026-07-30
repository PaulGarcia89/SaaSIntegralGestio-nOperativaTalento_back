# Certificación y salida a producción

## Puertas obligatorias

La versión candidata solo puede promoverse cuando:

- backend y frontend completan sus workflows `certification.yml`;
- `npm run audit:production` no reporta vulnerabilidades críticas;
- migraciones se ejecutaron primero en staging y existe respaldo verificable;
- S3/MinIO y ClamAV muestran estado operativo, sin permitir cargas sin escaneo;
- cookies son `Secure`, el tráfico usa HTTPS y CORS contiene únicamente orígenes conocidos;
- pruebas E2E por rol se ejecutan con cuentas efímeras y tenants aislados;
- accesibilidad pública no contiene violaciones A/AA detectables;
- el smoke test cumple el umbral p95 y las rutas protegidas rechazan acceso anónimo.

## Despliegue gradual

1. Crear backup y ejecutar `npm run restore:verify -- <directorio>`.
2. Desplegar migraciones en staging y ejecutar `npm run certify`.
3. Ejecutar `SMOKE_BASE_URL=https://staging.example.com npm run smoke:production`.
4. Promover a un grupo interno o tenant canario.
5. Observar errores 5xx, latencia p95, DLQ, entregas webhook y uso de almacenamiento.
6. Ampliar tráfico únicamente si no se superan los umbrales durante 30 minutos.

## Umbrales y alertas

| Señal | Advertencia | Crítica |
|---|---:|---:|
| HTTP 5xx | > 1% durante 5 min | > 5% durante 5 min |
| Latencia API p95 | > 1 s | > 2 s |
| Dead letters | > 0 durante 10 min | crecimiento continuo |
| Webhooks fallidos | 3 por endpoint | 10 por endpoint |
| Uso SCORM | 80% de cuota | 95% de cuota |
| Antivirus | degradado | no disponible |
| Backup | > 26 h sin éxito | > 48 h sin éxito |

## Restauración

La restauración real se practica en una base aislada; nunca sobre producción:

```bash
npm run restore:verify -- /ruta/al/backup
createdb restore_drill
pg_restore --clean --if-exists --no-owner --dbname restore_drill database.dump
```

Después se comprueban conteos de tenants, usuarios, cursos, asignaciones, paquetes
SCORM y entregas webhook. El resultado y el tiempo de recuperación deben quedar
registrados en auditoría operativa.

## Rotación y respuesta a incidentes

- Rotar inmediatamente JWT, firma SCORM y cifrado webhook si existe exposición.
- La rotación de claves de cifrado necesita una ventana que permita descifrar con
  la clave anterior y volver a cifrar con la nueva.
- Revocar sesiones activas después de comprometer una clave JWT.
- Pausar webhooks afectados, conservar request IDs y evitar registrar payloads sensibles.
- El rollback de aplicación no revierte migraciones destructivas: requiere un plan
  explícito y un backup probado.

## Limitaciones del entorno LAN

`docker-compose.lan.yml` es demostrativo: usa HTTP, almacenamiento local y permite
SCORM sin antivirus. No constituye una configuración certificada para producción.

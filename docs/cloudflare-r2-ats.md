# Almacenamiento ATS privado con Cloudflare R2

Esta integración mantiene los CV e imágenes de vacantes fuera del disco efímero del servidor y evita que Railway transporte el contenido de cada descarga.

## Configuración sin gasto adicional

1. Cree un bucket R2 llamado `talentos-ats-private` y mantenga desactivado el acceso público (`r2.dev` y dominios personalizados).
2. Cree un token de API R2 con permiso `Object Read & Write`, limitado solo a ese bucket. No use una clave de administrador de la cuenta.
3. Configure en Railway las variables `ATS_FILE_*` incluidas en `.env.production.example`. Nunca guarde las credenciales en Git.
4. Genere `ATS_FILE_SIGNING_SECRET` con `openssl rand -hex 32`.
5. Despliegue y ejecute **Administración > Bus de eventos y colas > Ejecutar certificación segura**. La prueba escribe, lee y elimina un objeto efímero.

## Garantías aplicadas

- El bucket no requiere acceso público; las descargas se autorizan en la API y se redirigen a una URL R2 firmada de 60 segundos.
- R2 cifra automáticamente objetos y metadatos con AES-256 y la aplicación exige HTTPS en producción.
- El token puede limitarse a lectura y escritura de objetos del único bucket ATS.
- El mantenimiento elimina físicamente los objetos cuya fecha `retainUntil` venció y después marca su registro como `EXPIRED`.
- El panel administrativo calcula el consumo con los tamaños registrados y alerta a administradores de plataforma desde 8 GiB.

La alerta se basa en los archivos administrados por esta aplicación. No incluye objetos subidos manualmente al bucket; para conservar exactitud, dedique el bucket exclusivamente a ATS.

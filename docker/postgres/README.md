# PostgreSQL para SaaS Integral

Imagen: `ghcr.io/paulgarcia89/saas-integral-postgres`.

La imagen contiene PostgreSQL 16 y no incluye datos, respaldos ni credenciales.
Configura POSTGRES_USER, POSTGRES_PASSWORD y POSTGRES_DB al ejecutar el contenedor.
Monta un volumen persistente en /var/lib/postgresql/data.
El backend crea y actualiza el esquema mediante `prisma migrate deploy` al arrancar;
no se duplica el esquema en scripts de inicialización para evitar conflictos con Prisma.
Las etiquetas `sha-*` permiten fijar una versión junto con el backend.

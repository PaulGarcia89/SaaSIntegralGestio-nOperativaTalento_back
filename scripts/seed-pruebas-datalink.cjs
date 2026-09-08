#!/usr/bin/env node
/* eslint-disable */
/**
 * Datos de prueba que la API no puede crear sola: cuentas.
 *
 * Se ejecuta DENTRO del contenedor del backend, contra la base de datos local:
 *
 *   cd FrontEnd
 *   docker compose --env-file deploy/.env.self-hosted -f docker-compose.self-hosted.yml \
 *     exec -e TEST_PASSWORD='la-contraseña-que-tú-elijas' backend \
 *     node scripts/seed-pruebas-datalink.cjs
 *
 * Qué hace, en orden, y por qué no lo hace la sesión del administrador:
 *
 *   1. Publica en el mercado público las vacantes abiertas de la empresa que
 *      todavía no tengan publicación. Las vacantes abiertas entre la migración
 *      del 26 de agosto y el arreglo de `syncMarketplacePublication` quedaron
 *      sin ella.
 *   2. Registra 12 cuentas de candidato (`/applicant-auth/register`) y, con
 *      cada una, postula a su vacante por la API pública. Postular exige una
 *      cuenta de candidato autenticada; no hay forma interna de hacerlo.
 *   3. Crea 3 usuarios con roles distintos (supervisor, encargado de
 *      inventario, empleado) para que Formación tenga a quién asignar cursos
 *      y para probar permisos por rol. Los usuarios exigen contraseña.
 *
 * La contraseña sale de TEST_PASSWORD y no se escribe en ningún sitio. Todo es
 * idempotente: lo que ya existe se deja como está.
 */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const TENANT_SLUG = process.env.TENANT_SLUG || 'datalink-tech-corp';
const API = process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3000}/api`;
const PASSWORD = process.env.TEST_PASSWORD;

if (!PASSWORD || PASSWORD.length < 10) {
  console.error('Falta TEST_PASSWORD (mínimo 10 caracteres). Ejemplo: -e TEST_PASSWORD=\'Prueba-2026-segura\'');
  process.exit(1);
}

const CANDIDATOS = [
  ['Cocinero de línea', 'Ana Lucía Benavides', 'ana.benavides@example.com'],
  ['Cocinero de línea', 'Marco Antonio Ruiz', 'marco.ruiz@example.com'],
  ['Cocinero de línea', 'Sofía Carrasco Jara', 'sofia.carrasco@example.com'],
  ['Cocinero de línea', 'Diego Armando Peña', 'diego.pena@example.com'],
  ['Mesero', 'Camila Rojas Vinueza', 'camila.rojas@example.com'],
  ['Mesero', 'Esteban Yépez Mora', 'esteban.yepez@example.com'],
  ['Mesero', 'Nicole Aguirre Salas', 'nicole.aguirre@example.com'],
  ['Mesero', 'Joel Castillo Ramos', 'joel.castillo@example.com'],
  ['Barista', 'Paula Zurita León', 'paula.zurita@example.com'],
  ['Barista', 'Andrés Loor Macías', 'andres.loor@example.com'],
  ['Encargado de almacén', 'Fernando Vélez Cruz', 'fernando.velez@example.com'],
  ['Encargado de almacén', 'Rosa Elena Quiroz', 'rosa.quiroz@example.com'],
];

const USUARIOS = [
  { email: 'supervisor.prueba@example.com', firstName: 'Andrea', lastName: 'Salazar', role: 'SUPERVISOR_PRUEBA', roleName: 'Supervisor de sucursal', branch: 'KendallDr',
    permissions: ['branches.read', 'employees.read', 'employees.update', 'applications.read', 'training.read', 'training.course.read', 'inventory.read', 'asset_inventory.read', 'productivity.view', 'notifications.read_own', 'notifications.update_own'] },
  { email: 'inventario.prueba@example.com', firstName: 'Ricardo', lastName: 'Espinoza', role: 'INVENTARIO_PRUEBA', roleName: 'Encargado de inventario', branch: 'Doral',
    permissions: ['branches.read', 'employees.read', 'inventory.read', 'inventory.manage', 'inventory.create', 'inventory.update', 'asset_inventory.read', 'asset_inventory.manage', 'restaurant_inventory.receipts.create', 'restaurant_inventory.operations.create', 'restaurant_inventory.counts.approve', 'restaurant_inventory.transfers.manage', 'restaurant_inventory.expiry_alerts.view', 'training.read', 'training.course.read', 'notifications.read_own', 'notifications.update_own'] },
  { email: 'empleado.prueba@example.com', firstName: 'Camila', lastName: 'Rojas', role: 'EMPLEADO_PRUEBA', roleName: 'Empleado', branch: 'Brickell',
    permissions: ['branches.read', 'training.read', 'training.course.read', 'notifications.read_own', 'notifications.update_own'] },
];

const prisma = new PrismaClient();

async function json(method, url, body, headers = {}) {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json', 'Accept-Language': 'es', ...headers }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { ok: r.ok, status: r.status, data };
}

async function main() {
  const tenant = await prisma.tenant.findFirst({ where: { slug: TENANT_SLUG } });
  if (!tenant) throw new Error(`No existe la empresa con slug ${TENANT_SLUG}`);
  console.log(`Empresa: ${tenant.name} (${tenant.id})`);

  /* ---- 1. Publicaciones -------------------------------------------- */
  const marketplace = await prisma.careerPortal.findFirst({ where: { slug: 'marketplace', type: 'MARKETPLACE', isActive: true } });
  if (!marketplace) throw new Error('No existe el portal «marketplace»; lo crea la migración 20260826120000');
  const vacantes = await prisma.vacancy.findMany({ where: { tenantId: tenant.id, status: 'OPEN' } });
  for (const v of vacantes) {
    await prisma.jobPublication.upsert({
      where: { vacancyId_channel_portalId: { vacancyId: v.id, channel: 'PUBLIC_MARKETPLACE', portalId: marketplace.id } },
      update: { status: 'PUBLISHED', closesAt: null },
      create: { tenantId: tenant.id, vacancyId: v.id, portalId: marketplace.id, channel: 'PUBLIC_MARKETPLACE', status: 'PUBLISHED', publicSlug: v.id, publishedAt: new Date() },
    });
  }
  console.log(`Publicaciones al día: ${vacantes.length} vacantes abiertas`);

  /* ---- 2. Candidatos y postulaciones --------------------------------- */
  const porTitulo = new Map(vacantes.map((v) => [v.title, v]));
  let postuladas = 0, existentes = 0;
  for (let i = 0; i < CANDIDATOS.length; i++) {
    const [titulo, fullName, email] = CANDIDATOS[i];
    const vacante = porTitulo.get(titulo);
    if (!vacante) { console.warn(`  · sin vacante «${titulo}» para ${email}`); continue; }

    let sesion = await json('POST', `${API}/applicant-auth/register`, { email, password: PASSWORD });
    if (!sesion.ok) sesion = await json('POST', `${API}/applicant-auth/login`, { email, password: PASSWORD });
    if (!sesion.ok) { console.warn(`  · ${email}: no se pudo registrar ni entrar → ${sesion.status} ${JSON.stringify(sesion.data).slice(0, 160)}`); continue; }
    const token = sesion.data.accessToken;

    const yaExiste = await prisma.vacancyApplication.findFirst({ where: { vacancyId: vacante.id, candidate: { email } }, select: { id: true } });
    if (yaExiste) { existentes++; continue; }

    const app = await json('POST', `${API}/public/vacancies/${vacante.id}/applications`, {
      fullName, email, phone: `+1 786 555 02${String(i + 1).padStart(2, '0')}`, city: 'Miami',
      resumeConsent: true, resumeConsentVersion: '2026-01',
      coverLetter: 'Postulación de prueba generada para verificar el flujo de reclutamiento.',
    }, { Authorization: `Bearer ${token}` });
    if (app.ok) postuladas++;
    else console.warn(`  · ${email} → ${vacante.title}: ${app.status} ${JSON.stringify(app.data).slice(0, 200)}`);
  }
  console.log(`Postulaciones: ${postuladas} nuevas, ${existentes} ya existían`);

  /* ---- 3. Usuarios con rol ------------------------------------------- */
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const permisos = await prisma.permission.findMany({ select: { id: true, code: true } });
  const permisoPorCodigo = new Map(permisos.map((p) => [p.code, p.id]));
  const sucursales = await prisma.branch.findMany({ where: { tenantId: tenant.id } });
  const sucursalPorNombre = new Map(sucursales.map((b) => [b.name, b.id]));

  for (const u of USUARIOS) {
    const role = await prisma.role.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: u.role } },
      update: { name: u.roleName },
      create: { tenantId: tenant.id, code: u.role, name: u.roleName, scope: 'BRANCH', isSystem: false },
    });
    const ids = u.permissions.map((code) => permisoPorCodigo.get(code)).filter(Boolean);
    const faltan = u.permissions.filter((code) => !permisoPorCodigo.has(code));
    if (faltan.length) console.warn(`  · rol ${u.role}: permisos inexistentes ignorados: ${faltan.join(', ')}`);
    await prisma.rolePermission.createMany({ data: ids.map((permissionId) => ({ roleId: role.id, permissionId })), skipDuplicates: true });

    const branchId = sucursalPorNombre.get(u.branch) ?? sucursales[0]?.id ?? null;
    const user = await prisma.user.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email: u.email } },
      update: { firstName: u.firstName, lastName: u.lastName, status: 'ACTIVE', activeBranchId: branchId },
      create: { tenantId: tenant.id, email: u.email, passwordHash, firstName: u.firstName, lastName: u.lastName, status: 'ACTIVE', activeBranchId: branchId },
    });
    await prisma.userRole.upsert({ where: { userId_roleId: { userId: user.id, roleId: role.id } }, update: {}, create: { userId: user.id, roleId: role.id } });
    await prisma.userBranchAccess.createMany({ data: sucursales.map((b) => ({ userId: user.id, branchId: b.id })), skipDuplicates: true });
    console.log(`Usuario listo: ${u.email} (${u.roleName}, ${u.branch})`);
  }

  console.log('\nHecho. Las cuentas de candidato y de usuario usan la contraseña de TEST_PASSWORD.');
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());

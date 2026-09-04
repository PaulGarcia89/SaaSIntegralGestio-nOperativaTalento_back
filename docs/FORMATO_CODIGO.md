# Formato de código — Prettier

Origen: auditoría de arquitectura del 2026-09-04, hallazgo **#10** (*métodos completos en una sola línea física*).

## El problema, medido

| Archivo | Línea más larga |
|---|---|
| `src/restaurant-inventory/restaurant-inventory.service.ts` | **5.737 caracteres** |
| `src/restaurant-inventory/restaurant-purchasing.service.ts` | 4.187 |
| `src/productivity/productivity.controller.ts` | 2.365 |
| `src/inventory/inventory.service.ts` | 2.069 |
| `src/restaurant-inventory/restaurant-reports.service.ts` | 1.790 |

**109 archivos** de `src/` tienen al menos una línea por encima de 200 caracteres. Métodos enteros —con transacciones, bucles y condicionales— caben en una sola línea física, lo que hace el código irrevisable en un diff, imposible de anotar con un punto de interrupción por número de línea y opaco a `git blame`.

## Qué queda listo en el repositorio

- **`.prettierrc`** — `printWidth: 120`, comillas simples, comas finales, punto y coma, terminaciones LF.
- **`.prettierignore`** — excluye `dist`, `compiled-server`, `coverage`, `output`, `tmp`, migraciones y el lock.

## Qué falta — requiere una ejecución con acceso a npm

La instalación de Prettier no fue posible durante esta sesión: el registro de npm está bloqueado por la política de red del entorno. El reformateo es **un solo comando**, en un commit aislado:

```bash
cd BackEnd

# 1. Instalar la herramienta (version fija para que el formato sea estable)
npm install --save-dev --save-exact prettier@3.4.2

# 2. Ver el alcance antes de tocar nada
npx prettier --check "src/**/*.ts"

# 3. Reformatear
npx prettier --write "src/**/*.ts"

# 4. Verificar que nada cambio de comportamiento
npx tsc --noEmit
npm test

# 5. Commit EXCLUSIVO de formato, sin mezclar ningun cambio funcional
git add -A && git commit -m "style: aplica Prettier a src (solo formato)"
```

Prettier reescribe a partir del árbol sintáctico: no puede alterar la semántica de TypeScript válido. El paso 4 lo confirma con las 425 pruebas actuales.

Hay una copia de seguridad de `src/` previa a cualquier cambio de esta sesión en `tmp/src-before-format.tar.gz` (carpeta ignorada por git).

### Preservar `git blame`

Un commit de formato masivo ensucia la autoría de todas las líneas. Se evita así:

```bash
git rev-parse HEAD > .git-blame-ignore-revs   # tras el commit de formato
git config blame.ignoreRevsFile .git-blame-ignore-revs
git add .git-blame-ignore-revs && git commit -m "chore: ignora el commit de formato en git blame"
```

GitHub respeta `.git-blame-ignore-revs` automáticamente.

### Scripts a añadir en `package.json`

No se añadieron en esta sesión para no desincronizar `package-lock.json`, lo que haría fallar `npm ci` en el CI. Añadirlos junto con la instalación del paso 1:

```json
"format": "prettier --write \"src/**/*.ts\"",
"format:check": "prettier --check \"src/**/*.ts\""
```

### Paso de CI a añadir después del reformateo

Añadir a `.github/workflows/quality.yml`, dentro del job `unit-security`, **solo cuando el paso 3 esté hecho** (antes fallaría siempre):

```yaml
      - run: npm run format:check
```

## Regla de trabajo

A partir del commit de formato, ningún cambio funcional debe mezclarse con reformateos. `format:check` en CI lo garantiza.

# ICEP Gradebook

Sistema de gestión académica para ICEP: cursos, materias, rúbricas de calificación y notas, con acceso por invitación y tres roles (admin, profesor, estudiante). Interfaz bilingüe (ES/EN).

[![CI](https://github.com/rcorzogutierrez/icep/actions/workflows/ci.yml/badge.svg)](https://github.com/rcorzogutierrez/icep/actions/workflows/ci.yml)

## Qué hace

- **Admin**: aprueba/rechaza usuarios, gestiona el catálogo de materias, arma cursos (agrupan estudiantes por énfasis/año) y asigna profesores a las materias de cada curso.
- **Profesor**: define la rúbrica de una materia (categorías con peso, ej. "Tareas" 40%), crea tareas dentro de cada categoría, carga notas — individualmente o para toda la clase de una vez ("Revisar tarea") — y ve un roster de sus estudiantes a través de todas sus materias ("Mis estudiantes").
- **Estudiante**: ve sus materias, quién las dicta y su nota final (calculada a partir de la rúbrica y las tareas calificadas).
- **Alta de cuentas**: nunca es libre. Un admin o profesor genera un código de invitación (ligado a un email y un rol), y solo esa persona puede canjearlo para crear su perfil — ver [Seguridad](#seguridad-y-modelo-de-datos).

## Stack

| Capa | Tecnología |
|---|---|
| Framework | Angular 22 (standalone components, signals, `@angular/forms/signals`) |
| Estilos | Tailwind CSS 4 |
| Backend | Firebase: Auth, Firestore, Storage, Hosting |
| Íconos | [Lucide](https://lucide.dev/) (`@lucide/angular`) |
| Tests | Vitest (`@angular/build:unit-test`, jsdom, sin browser real) |
| CI | GitHub Actions — ver [`.github/workflows/ci.yml`](.github/workflows/ci.yml) |

## Empezar

### Requisitos

- Node **≥ 22.22.3** (o ≥ 24.15.0 / ≥ 26). Angular CLI 22 rechaza versiones intermedias como 22.22.2 — si `ng` se queja de la versión de Node, ese es el motivo; actualizá antes de reportar el problema.
- npm 11.12.0 (fijado en `"packageManager"` de `package.json`; evita usar una versión distinta, reescribe `package-lock.json`).
- Firebase CLI para emuladores/deploy: `npm install -g firebase-tools` (o usar el que ya está en `devDependencies` vía `npx firebase`).

### Instalación

```bash
npm install
```

### Configurar Firebase

`src/environments/environment.ts` (producción) y `environment.development.ts` (dev server, `ng serve`) necesitan las credenciales del proyecto Firebase real en el bloque `firebase: {...}`. Esas credenciales son **públicas por diseño** — viajan al navegador en cualquier app Firebase; la seguridad real vive en `firestore.rules` y `storage.rules`, no en ocultarlas. `.firebaserc` ya apunta al proyecto `icep-44c27`.

### Correr en local

```bash
npm start          # ng serve → http://localhost:4200, recarga en caliente
npm run emulators   # Auth/Firestore/Storage/Hosting emulados — usa environment.development.ts (useEmulators: true)
```

Con los emuladores corriendo, la UI en `http://localhost:4200` ya conecta a ellos (nada de tocar datos reales del proyecto mientras desarrollás).

## Scripts

| Comando | Qué hace |
|---|---|
| `npm start` | Dev server (`ng serve`) |
| `npm run build` | Build de producción a `dist/icep/browser` |
| `npm run watch` | Build en modo desarrollo con watch |
| `npm test` | Tests unitarios (Vitest) |
| `npm run lint` | ESLint (`.ts` y `.html`) |
| `npm run typecheck` | `tsc --noEmit`, sin pasar por el builder de Angular |
| `npm run emulators` | Levanta los emuladores de Firebase |
| `npm run deploy` | Build + `firebase deploy --only hosting:icep` — **ojo, ver abajo** |

## Seguridad y modelo de datos

Las reglas de Firestore (`firestore.rules`) son la única fuente de verdad de autorización — los guards de Angular (`core/auth/auth.guards.ts`) son UX, no seguridad; asumen que el usuario pudo entrar, no lo autorizan a leer/escribir nada por sí solos.

Colecciones principales:

- **`users/{uid}`** — perfil de acceso (`role`: student/teacher/admin, `status`: approved/rejected). Se crea únicamente al canjear una invitación.
- **`invitations/{code}`** — código de invitación, ligado a un email y un rol. Solo la cuenta con ese email puede canjearlo (ver `firestore.rules`), y una vez usado queda marcado como tal.
- **`subjects/{id}`** — catálogo de materias.
- **`courses/{id}`**, **`courseStudents`**, **`courseTeachers`**, **`courseSubjects`**, **`courseSubjectTeachers`** — agrupan estudiantes por curso (énfasis/año), qué materias tiene cada curso y qué profesor dicta cuál. `subjectAssignments/{subjectId}_{teacherId}` es la tabla derivada de todo esto: lo único que leen las reglas de `grades`/`gradeCategories`/`assignments` para verificar "¿este profesor realmente dicta esta materia?".
- **`gradeCategories/{id}`** — rúbrica de una materia (categorías con peso; la suma a 100% se valida en el cliente, no en las reglas).
- **`assignments/{id}`** — una tarea dentro de una categoría.
- **`grades/{subjectId}_{studentUid}`** — nota de un estudiante en una materia (`scores`: `assignmentId → puntos`). Id determinístico a propósito, para que el propio estudiante pueda consultar su nota con un `getDoc` directo.

Para el detalle campo por campo, los modelos TypeScript en `src/app/core/*/​*.model.ts` están documentados junto a cada interfaz.

## Deploy

`npm run deploy` **solo publica Hosting**. Los cambios en `firestore.rules` o `storage.rules` no se despliegan solos — hace falta:

```bash
firebase deploy --only firestore:rules
firebase deploy --only storage:rules
```

Antes de promover a producción un cambio en `firebase.json` (cabeceras, CSP, rewrites), probalo primero en un preview channel:

```bash
firebase hosting:channel:deploy preview
```

y ejercitá el login completo (Google incluido) con la consola del navegador abierta — una CSP mal ajustada bloquea una llamada en silencio, sin error visible.

## CI

Cada push a `master` y cada pull request corren, en orden, `typecheck` → `lint` → `test` → `build` (ver [`.github/workflows/ci.yml`](.github/workflows/ci.yml)). El job fija Node a la última 22.x — no bajarlo, Angular CLI 22 no arranca con versiones intermedias (ver [Requisitos](#requisitos)).

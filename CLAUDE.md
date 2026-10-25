# CLAUDE.md — CRM Lead (CRM de leads y follow-up)

CRM ligero para un **equipo pequeño compartido** que captura leads y les da seguimiento.
Idea central: **ningún lead activo se queda sin próxima acción**. Todo gira alrededor del
follow-up programado, no del registro.

- Idioma del código de dominio (comentarios): **español**. La interfaz es **bilingüe español/inglés** (español por defecto).
- **i18n en tiempo de ejecución** (`src/app/core/i18n/`), sin librerías y sin recargar: `t('clave', { param })` lee la signal `lang`, así que plantillas y `computed` se actualizan solas. Ningún texto visible va escrito directo en plantillas o servicios: se añade la clave en `es.ts` **y** en `en.ts` (el tipo de `en.ts` obliga a traducirlas todas). Las etiquetas de `STAGES`/`SOURCES`/`CHANNELS` son getters traducidos; fechas y montos usan `intlLocale()`; los `title` de las rutas son claves (`I18nTitleStrategy`). Selector: `shared/lang-switch.ts` (riel, barra móvil, login); la elección se guarda en `localStorage`. No se usa `@angular/localize` porque compila un bundle por idioma y no permite cambiar en caliente.
- **URLs en inglés** (`/today`, `/leads`, `/contacts`, `/pipeline`, `/services`, `/team`, `/login`, `/pending`), igual que los parámetros de filtro (`?search=`, `?stage=open`, `?filter=no-action`…). Las rutas y parámetros antiguos en español redirigen desde `core/legacy-urls.ts`; una ruta nueva va en inglés.
- Skills oficiales de Angular y Firebase en `.claude/skills/` (ver `.claude/skills/README.md`); donde difieran, mandan las convenciones de este archivo.
- Contexto de producto: `PRODUCT.md`. Sistema visual: `DESIGN.md`. Contrato de dirección de diseño: `.impeccable/surfaces/src-app.md`.

## Stack (fijado, no cambiar sin pedirlo)

- **Angular 22**: standalone, zoneless, signals, Signal Forms (`@angular/forms/signals`), control flow nativo, `@Service()` para servicios singleton. OnPush es el default (no declararlo).
- **Firebase JS SDK 13** (Auth con Google + Firestore). **No** se usa `@angular/fire` (no soporta Angular 22): Firebase se inyecta con los tokens `AUTH` y `FIRESTORE` de `src/app/core/firebase.ts`.
- **Tailwind CSS v4** (config CSS-first en `src/styles.css` con `@theme`; sin `tailwind.config.js`).
- **Iconos: `@lucide/angular`**. Importar cada icono como componente (`LucidePhone` → `<svg lucidePhone [size]="16"></svg>`) o `LucideDynamicIcon` con `[lucideIcon]`. Nunca emoji ni glifos unicode como iconos.
- **Prohibido Angular Material / CDK con estilos Material / cualquier estética Material Design.** Controles nativos estilizados con las clases base de `styles.css`.
- Tipografía: Archivo variable autoalojada (`@fontsource-variable/archivo`).
- Node ≥ 22.22.3 (lo exige Angular CLI 22).

## Comandos

```bash
npm start                 # ng serve contra Firebase en la nube
npm run emulators         # Firebase Emulator Suite (auth + firestore, proyecto demo-crm-lead)
npm run start:emulator    # ng serve conectado a los emuladores
npm run build             # build de producción → dist/crm-lead/browser
npm test                  # Vitest
npm run lint              # ESLint (angular-eslint), también plantillas y accesibilidad
npm run test:rules        # pruebas de firestore.rules contra el emulador (necesita Java)
npm run deploy:rules      # publica firestore.rules + firestore.indexes.json
npm run deploy            # build + Firebase Hosting + reglas
```

CI/CD: `.github/workflows/deploy.yml` publica en cada push a `main` (lint + tests + pruebas de reglas + build, y luego `firebase deploy --only hosting,firestore`) con el secreto `FIREBASE_SERVICE_ACCOUNT`; en los PR hace lo mismo sin publicar. Las pruebas de reglas viven en `tests/rules/`: un cambio en `firestore.rules` va con su caso.

Con emuladores, `window.__emulatorSignIn(email, nombre)` hace login sin popup (solo existe en la configuración `emulator`).

## Estructura

```
src/app/
  core/            servicios y modelo (sin UI)
    firebase.ts        init de Firebase + tokens DI (emuladores según environment)
    models.ts          tipos, etapas, orígenes, canales (fuente de verdad del dominio)
    auth.service.ts    sesión + alta en el equipo (fundador / invitación / pendiente)
    auth.guards.ts     memberGuard, guestGuard, adminGuard
    team-query.ts      consulta en vivo que solo corre si el usuario es miembro
    leads / contacts / catalog / followups / activities / members .service.ts
    dates.ts           fechas relativas en español, atajos de reprogramación
  shared/          componentes reutilizables (followup-item, schedule-form, pickers, badges…)
  features/
    auth/          login, acceso pendiente
    shell/         riel/barra de navegación + panel de captura rápida (tecla N)
    today/         "Hoy": página de agenda (vencidos, horas del día, sin próxima acción)
    contacts/      clientes y prospectos; ficha con negocios abiertos, servicios comprados e historial
    services/      catálogo de servicios y % de categorías (solo admin edita)
    leads/         lista con búsqueda/filtros en la URL
    lead-detail/   ficha: etapas, próxima acción, historial, datos editables
    pipeline/      tablero por etapas (drag & drop, Alt+←/→)
    team/          miembros, roles, invitaciones
```

## Modelo de datos (Firestore)

| Colección | Doc | Campos clave |
|---|---|---|
| `meta/team` | único | `ownerUid`, `name` — existe desde que entra el primer usuario |
| `members/{uid}` | miembro | `email`, `displayName`, `photoURL`, `role: admin\|member`, `active` |
| `sessions/{uid}` | última entrada/salida | `signInAt`, `signOutAt`, `signOutReason: manual\|idle` — cada uno escribe solo el suyo con `serverTimestamp()`; solo el admin lee (se muestra en *Equipo*) |
| `invites/{emailEnMinúsculas}` | invitación | `email`, `role`, `invitedBy` — se consume al entrar |
| `contacts/{id}` | persona/empresa | `name`, `company`, `email` (minúsculas), `phone`, `assigneeId`, `notes`, `createdBy` + resumen `statsV`, `wonCount`, `wonTotal`, `firstWonAt`, `openBy` (uid → nº abiertos), `archived`, `archivedAt` — "cliente" si `wonCount > 0` |
| `leads/{id}` | lead = oportunidad (un servicio para un contacto) | `contactId`, copia del contacto (`name`, `company`, `email`, `phone`), `serviceId`, `serviceName`, `detail`, `quantity`, `unitPrice`, `tier`, `tierPct`, `value`, `priceAck`, `source`, `stage`, `wonAt`, `assigneeId`, `notes`, `lostReason`, `nextFollowUpAt`, `lastContactAt`, `createdBy`, timestamps |
| `services/{id}` | catálogo | `name`, `description`, `price` (oficial, por unidad), `unit`, `active` — solo admin escribe; se archivan, no se borran |
| `meta/pricing` | único | `bronze`, `silver`, `gold` (% sobre el precio oficial; por defecto 3/5/7) — solo admin |
| `leads/{id}/activities/{id}` | historial | `type` (call, whatsapp, email, meeting, note, stage, created, followup), `body`, `from`/`to`, `createdBy`, `createdAt` |
| `followups/{id}` | próxima acción | `leadId`, `leadName`, `company`, `assigneeId`, `dueAt`, `channel`, `note`, `status: pending\|done\|cancelled` |

Reglas de dominio:
- Etapas en orden: `new → contacted → qualified → proposal → negotiation → won | lost`. `won`/`lost` son cerradas y no necesitan follow-up.
- `leads.nextFollowUpAt` es una **copia desnormalizada** del follow-up pendiente más próximo. Toda escritura de follow-ups (programar, completar, reprogramar, descartar) debe recalcularla en el **mismo batch** (`FollowUpsService`).
- Completar un follow-up = marcarlo `done` + crear actividad + actualizar `lastContactAt` + (opcional) programar el siguiente, todo en un batch.
- Cambiar etapa siempre deja una actividad `stage` (`LeadsService.moveToStage`); ganar guarda `wonAt`.
- Precio: `value = unitPrice × quantity × (100 + tierPct) / 100` (`salePrice`). El vendedor no escribe el precio: elige servicio, cantidad y categoría (bronce por defecto). Las reglas validan que `unitPrice` y `tierPct` sean los vigentes (o los ya pactados) y que un lead ganado no cambie de precio.
- Cambio de precio oficial: los leads guardan su `unitPrice`; los abiertos muestran aviso (actualizar o mantener → `priceAck`). Los ganados nunca cambian.
- Editar un contacto copia nombre/empresa/email/teléfono a sus leads y follow-ups pendientes (`ContactsService.update`). Los leads antiguos sin `contactId` se vinculan con el botón del admin en *Clientes* (`migrateLegacy`).
- Un equipo pequeño cabe en memoria: leads y follow-ups pendientes se escuchan completos en vivo y se filtran en el cliente. Si el volumen crece (> ~5.000 leads), paginar y filtrar en servidor.
- Resumen del contacto: un vendedor no ve los leads de otros, así que el contacto guarda sus compras y quién tiene negocios abiertos. Toda escritura de leads que cambie etapa, responsable o existencia actualiza el contacto en el **mismo batch** (`statsPatch` en `core/contact-stats.ts`, usado por `LeadsService`). La app de un admin lo recalcula desde todos los leads si no coincide (`ContactsService.syncStats`); solo se confía en él si `statsV` coincide. Las reglas solo dejan a un vendedor moverlo lo que mueve un lead suyo (±1 venta, ±1 en su propio `openBy`, sin tocar `statsV`).
- Índices compuestos requeridos (`firestore.indexes.json`): `followups (status, dueAt)` y `(assigneeId, status, dueAt)`; `leads (assigneeId, createdAt desc)`.

## Acceso y seguridad

- La config web de Firebase en `core/firebase.config.ts` es pública; la seguridad está en `firestore.rules`.
- El **primer** usuario que entra crea `meta/team` y queda como admin. Los demás necesitan `invites/{email}` creado por un admin desde *Equipo*; si no, ven "Acceso pendiente".
- Solo miembros `active` leen/escriben. Contactos y catálogo: todo el equipo.
- **Leads, su historial y sus follow-ups: un vendedor (`member`) solo ve y toca los suyos** (`assigneeId`); el admin ve todo. Las consultas de un vendedor deben filtrar `where('assigneeId', '==', uid)` o las reglas las rechazan (`LeadsService`, `FollowUpsService`).
- Roles (`admin` / `member` = vendedor): solo un admin cambia el rol o el acceso de **otro** miembro, con confirmación en línea en *Equipo*, y el de una invitación pendiente. Nadie cambia su propio rol ni acceso: así el equipo nunca se queda sin admin activo.
- Solo un admin reasigna (`LeadsService.reassign`, que arrastra los follow-ups pendientes) o cambia el responsable de un contacto. Un vendedor crea leads siempre a su nombre.
- Borrar un lead: admin, o su creador si sigue siendo el responsable.
- Una venta ganada solo la reabre (cambia de etapa) o la borra un admin (`LeadsService.locked`; las reglas lo exigen). El vendedor ve las etapas bloqueadas con aviso y la tarjeta fija en el pipeline.
- Archivar un contacto: solo admin (`ContactsService.archive`); sus negocios abiertos pasan a Perdido y sus follow-ups pendientes se cancelan en el mismo batch. Se oculta de *Clientes* salvo con el filtro *Archivados*. Reactivar lo puede hacer cualquiera: abrir un negocio nuevo con él lo reactiva.
- Borrar un contacto: solo admin y solo si no tiene ventas ganadas (las reglas miran `wonCount`); se llevan sus negocios con historial y follow-ups. Un cliente con ventas se archiva.
- Cambios en reglas: añadir o ajustar su caso en `tests/rules/firestore.rules.test.ts` y pasar `npm run test:rules`.
- Cierre por inactividad (`core/idle.service.ts`, arrancado por el shell): 10 min sin ratón, teclado, toque o scroll cierran la sesión y llevan a `/login`, que explica el motivo. El último minuto muestra una cuenta atrás con "Seguir conectado". La última actividad se comparte entre pestañas en `localStorage` (`crm-lead.lastActivity`).
- Última entrada y salida (`sessions/{uid}`): `AuthService` anota la entrada solo si es un inicio nuevo (`metadata.lastSignInTime` de hace < 5 min, sin repetir en recargas) y la salida antes de `signOut` (botón o inactividad, máx. 2 s de espera). Una sesión restaurada ya caducada se cierra sin anotar salida, y cerrar el navegador no deja salida: *Equipo* lo muestra como "Salida sin registrar".
- Cabeceras de seguridad en `firebase.json` (nosniff, `frame-ancestors`, Referrer/Permissions-Policy, HSTS). Si cambia el dominio de hosting, actualizar `frame-ancestors`.
- Configuración necesaria en la consola de Firebase: habilitar el proveedor Google en Authentication y añadir el dominio de hosting a *Authorized domains*.

## Convenciones de UI (ver DESIGN.md)

- Marca: **CRM Lead**, icono de embudo (`public/favicon.svg`, mismo dibujo en `shared/logo.ts`; si cambia uno, cambiar el otro y regenerar los PNG de `public/`).
- Mundo visual "agenda" con paleta **Pizarra**: riel gris pizarra claro, papel blanco frío, renglones, acciones en índigo. Usar los tokens de `@theme` (`bg-rail`, `bg-paper`, `bg-sheet`, `text-ink`, `bg-pen`, `bg-ribbon`, `bg-highlight`, `stage-*`), nunca colores sueltos. El token `pen` es el índigo de acción.
- Clases base en `@layer components`: `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.btn-danger`, `.btn-sm`, `.btn-icon`, `.input`, `.field-label`, `.field-error`, `.sheet`, `.date-face`, `.tabular`.
- Urgencia: vencido = `ribbon` (rojo), hoy = `highlight` (amarillo), sin próxima acción = borde rojo punteado. Siempre con texto, nunca solo color.
- Nada de modales para tareas en línea: completar/posponer/programar se abre debajo del elemento. El único diálogo es el panel de captura (tecla **N**), cuyo primer campo "¿Para quién?" busca contactos existentes; **/** abre la búsqueda de clientes.
- Cada vista maneja cargando (skeleton), vacío (que enseña qué hacer), error (`firestoreErrorMessage`).
- Accesibilidad AA: foco visible, `aria-*` en toggles, objetivos ≥ 32px (44px en la barra móvil), sin depender del color.
- No usar kickers/eyebrows sobre títulos, ni tarjetas de métricas gigantes, ni gradientes de texto.


---

## Guía general de Angular y TypeScript

## TypeScript Best Practices

- Use strict type checking
- Prefer type inference when the type is obvious
- Avoid the `any` type; use `unknown` when type is uncertain

## Angular Best Practices

- Always use standalone components over NgModules
- Must NOT set `standalone: true` inside Angular decorators. It's the default in Angular v20+.
- Do NOT set `changeDetection: ChangeDetectionStrategy.OnPush` explicitly. `OnPush` is the default in Angular v22+.
- Use signals for state management
- Implement lazy loading for feature routes
- Do NOT use the `@HostBinding` and `@HostListener` decorators. Put host bindings inside the `host` object of the `@Component` or `@Directive` decorator instead
- Use `NgOptimizedImage` for all static images.
  - `NgOptimizedImage` does not work for inline base64 images.

## Accessibility Requirements

- It MUST pass all AXE checks.
- It MUST follow all WCAG AA minimums, including focus management, color contrast, and ARIA attributes.

## Components

- Keep components small and focused on a single responsibility
- Use `input()` and `output()` functions instead of decorators
- Use `model()` for two-way bound properties with `[(prop)]` syntax instead of pairing `input()` with `output()`
- Use `computed()` for derived state
- Use `linkedSignal()` for state derived from multiple reactive sources that must stay synchronized
- Prefer inline templates for small components
- Prefer Signal Forms (`@angular/forms/signals`) for new forms. They are stable in Angular v22+ and provide signal-based state, type-safe field access, and schema-based validation
- When not using Signal Forms, prefer Reactive forms instead of Template-driven ones
- Do NOT use `ngClass`, use `class` bindings instead
- Do NOT use `ngStyle`, use `style` bindings instead
- Do NOT import `CommonModule`, import only the directives and pipes the template uses, such as `AsyncPipe` or `DatePipe`
- When using external templates/styles, use paths relative to the component TS file.

## State Management

- Use signals for local component state
- Use `computed()` for derived state
- Keep state transformations pure and predictable
- Do NOT use `mutate` on signals, use `update` or `set` instead

## Templates

- Keep templates simple and avoid complex logic
- Use native control flow (`@if`, `@for`, `@switch`) instead of `*ngIf`, `*ngFor`, `*ngSwitch`
- Use the async pipe to handle observables
- Do not assume globals like (`new Date()`) are available.

## Services

- Design services around a single responsibility
- Use the `providedIn: 'root'` option for singleton services
- Prefer the `@Service` decorator over `@Injectable({providedIn: 'root'})` for new singleton services (Angular v22+)
- Use the `inject()` function instead of constructor injection

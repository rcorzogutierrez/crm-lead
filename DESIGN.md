# Design

Mundo visual: **agenda**, con la paleta **Pizarra** (elegida por Rafa el 24 oct 2026 entre cinco opciones, con el riel aclarado). Superficie de trabajo (modo Operate): la estructura es la de un CRM estándar; el mundo aporta tipografía, paleta, densidad y un gesto propio.

## Reglas fijas

Decididas con Rafa a medida que crece el proyecto. Una pantalla nueva o cambiada las cumple antes de abrir el PR; cambiar una regla es una decisión, no un detalle de un PR.

1. **Revisión con impeccable.** Todo cambio de interfaz (pantallas, componentes, textos de UI) se diseña y se revisa con la skill impeccable antes del PR, y el PR lo dice.
2. **Un solo título de página.** El `h1` de cada pantalla usa `.page-title` (2rem), sea una sección o una fecha. Nada de tamaños propios para el título.
3. **Anchos con el marco.** Toda página va en `.page` (100rem, centrado); formularios y lectura añaden `.page-narrow` (56rem). Nunca `max-w-[…rem]` sueltos en una página; si hace falta otro ancho, se añade un token en `@theme`.
4. **Probar en grande y en el móvil.** Antes del PR se mira a 2560px (Rafa trabaja en un monitor de 32") y en el móvil (≈390px), además del portátil.
5. **Bilingüe.** Todo texto visible sale de `t('clave')` con la clave en `es.ts` y en `en.ts`; fechas y montos con `intlLocale()`. Nunca texto escrito en la plantilla.
6. **URLs en inglés.** Rutas y parámetros de filtro en inglés; si una ruta antigua en español existía, redirige desde `core/legacy-urls.ts`.
7. **Tokens y clases base.** Colores solo con los tokens de `@theme`; botones, campos y hojas con las clases base (`.btn-*`, `.input`, `.sheet`…). Iconos de `@lucide/angular`, nunca emoji. Nada de Material. Si un mismo grupo de utilidades se copia en tres sitios, pasa a ser una clase base de `styles.css`.
8. **Cabecera de página en un solo orden.** `h1.page-title` → línea de resumen (`mt-1 text-ink-2`: cuántos hay, qué es esta vista; `aria-live` si cambia) → pestañas de sección (`app-section-tabs`, `mt-3`) si la sección tiene varias vistas. Con acciones, todo va en `<header class="flex flex-wrap items-end justify-between gap-4">` y las acciones a la derecha, alineadas con la última fila (las pestañas). Sin kickers ni texto encima del título.
9. **Botones.** Una sola `.btn-primary` por bloque (la acción que se espera). En cabecera, tamaño normal; en filas, hojas y paneles en línea, `.btn-sm`. Borrar o anular desde una fila: `.btn-ghost .btn-ghost-danger .btn-sm`; la confirmación final de algo irreversible: `.btn-danger`. Iconos solos con `.btn-icon` y `aria-label`.
10. **Estados de cada vista.** Cargando: esqueleto con la forma del contenido (`animate-pulse rounded bg-sheet-2`, `aria-hidden`), nunca un spinner a pantalla. Vacío: `app-empty-state`, que dice qué falta y ofrece la acción para empezar; si lo vacía un filtro, lo dice y no ofrece crear. Error de la vista: `.alert-error` con `role="alert"` y el mensaje de `firestoreErrorMessage`; dentro de una hoja o un panel, una línea `text-sm text-ribbon`.
11. **Títulos de sección.** Los `h2` de una página usan `.section-title` (14px negrita). Excepciones con su propio tamaño: el título del panel de captura, los rótulos de la factura impresa y los informes de Reportes, que se leen como documento.
12. **Control segmentado.** Filtros de una opción, "Lo mío / Todo el equipo" y pestañas de sección usan `.segmented` con `.segment` dentro. El activo lo marca su estado accesible (`aria-pressed`, `aria-checked` o `aria-current="page"`), no una clase, así que el estado y el aspecto no se pueden separar.
13. **Anchos fuera del marco.** Solo tres: la medida de lectura de un texto largo (`max-w-prose` o en `ch`, como el `46ch` de `app-empty-state`), la hoja del login (25.5rem) y el panel de captura (34rem). Ninguno se usa para encoger una página.

## Gesto firma

La vista **Hoy** es una página de agenda: columna de horas a la izquierda, **línea de margen roja**, renglones de 1px por hora y una **cinta roja de "ahora"** que cruza la hora actual. Lo vencido se "arrastra" arriba en un bloque propio. El historial del lead repite el mismo formato (fecha en el margen, línea roja, entradas a la derecha). La sección activa del riel se marca con una cinta roja.

## Color (tokens en `src/styles.css` → `@theme`)

| Rol | Token | Valor |
|---|---|---|
| Riel (escritorio) y barra superior (móvil) | `rail` / `rail-deep` | oklch(0.38 0.02 262) / oklch(0.31 0.02 262) — gris pizarra claro |
| Texto sobre el riel | `rail-ink` / `rail-muted` | oklch(0.97 0.004 262) / oklch(0.84 0.012 262) |
| Fondo (papel) | `paper` | oklch(0.982 0.003 262) — blanco frío, nunca crema |
| Hoja | `sheet` / `sheet-2` | blanco / oklch(0.965 0.005 262) |
| Renglón | `rule` / `rule-strong` | oklch(0.92 0.006 262) / oklch(0.86 0.01 262) |
| Margen de la agenda | `margin` | oklch(0.80 0.015 262) |
| Tinta | `ink` / `ink-2` / `ink-3` | oklch(0.22 0.02 262) / 0.45 / 0.53 |
| Acción, selección (índigo) | `pen` / `pen-strong` / `pen-soft` | oklch(0.50 0.20 275) / 0.43 / 0.95 |
| Vencido, línea de ahora | `ribbon` / `ribbon-soft` | oklch(0.55 0.20 25) / oklch(0.965 0.02 25) |
| Hoy | `highlight` | oklch(0.92 0.11 92) |
| Hecho | `ok` / `ok-soft` | oklch(0.52 0.13 155) |
| Etapas | `stage-new … stage-lost` (+ `-ink`) | azules hacia índigo; propuesta ámbar, negociación terracota; ganado verde; perdido gris |

Estrategia: Restrained. Base neutra gris azulada; el índigo solo para acciones y selección; rojo y amarillo solo significan urgencia.

## Tipografía

- Una familia: **Archivo** variable (autoalojada), eje de ancho.
- Títulos y fechas: `.date-face` → `wdth 82`, tracking −0.015em, bold. H1 de página: `.page-title` (2rem, igual en todas; las fechas no van más grandes).
- UI: 15px/24px base, 13px etiquetas, 12px meta. Números siempre `.tabular`.

## Componentes

- Página (`.page`): todas en el mismo marco de 100rem (`max-w-page`), centrado en el espacio que deja el riel y con el mismo margen (`px-4 sm:px-6 lg:px-10`); así el título cae siempre en el mismo sitio y, en un monitor grande, el espacio libre se reparte a los dos lados. Las tablas no se estiran más allá del marco (se leen peor). Formularios y lectura (Equipo, Empresa, Registro, Factura) añaden `.page-narrow`: su contenido llega a 56rem pegado al borde izquierdo del marco. El Tablero usa todo el ancho. Nada de `max-w-[…rem]` sueltos en una página.
- Botones: `.btn-primary` (pluma), `.btn-secondary` (hoja con borde), `.btn-ghost`, `.btn-danger`, tamaños `.btn-sm`, `.btn-icon`. Alto 36px (32px sm), radio 8px.
- Campos: `.input` 40px, borde `rule-strong`, foco anillo pluma 3px/15%.
- `.sheet`: hoja con borde `rule`, radio 10px, sombra suave con desplazamiento.
- Chips de fecha (`app-due-chip`): vencido sólido rojo con texto blanco, hoy resaltador, sin próxima acción borde rojo punteado.
- Toggles segmentados (`.segmented` / `.segment`, regla 12) para "Lo mío / Todo el equipo": activo en tinta sólida con texto blanco.
- Agenda Día / Mes (Hoy): pestañas segmentadas (enlaces) y flechas ‹ › para ir de un día o un mes a otro; fuera de hoy aparece el botón "Hoy" / "Este mes". Un día que no es hoy no lleva vencidos arriba ni cinta de "ahora", y los follow-ups hechos se ven atenuados en su hora con "Hecho" en `ok`. El mes (`features/today/agenda-month.ts`) es una hoja con una celda por día: número (hoy en cinta roja con la raya roja arriba), un renglón por canal con su icono y su número, y una barra fina de carga (en `warn` si el día va cargado). Avisos con texto: "N vencidas" en cinta roja y "Cargado" en resaltador; en el móvil la celda solo muestra el número, que cambia de forma (pastilla) con el aviso. Leyenda debajo con iconos y nombres. Tocar un día abre su página.
- El equipo hoy (Hoy, admin con "Todo el equipo", solo en el día de hoy; `features/today/team-day-table.ts`): una hoja encima de los vencidos con una fila por vendedor: hechos de hoy ("3 de 6" con barra fina en `ok`), vencidos en cinta roja, sin próxima acción con borde rojo punteado, ventas de hoy; los ceros en `ink-3`. Tocar un nombre deja la agenda (y el mes) solo con lo suyo, con la fila en `pen-soft` y "Ver todo el equipo" en la cabecera. En el móvil, filas apiladas con los mismos chips.
- Reportes → Lo que entró: cada barra de origen pinta en `ok` la parte ya ganada y a la derecha dice "3 de 5 · 60 %" (el porcentaje solo con 5 o más negocios).
- Pestañas de sección (`shared/section-tabs.ts`): mismo aspecto que los toggles segmentados pero son enlaces (`aria-current="page"`). Negocios: Lista / Tablero; Ajustes: Servicios / Equipo. El riel tiene cinco entradas: Hoy, Contactos, Negocios, Reportes, Ajustes.
- Cerrar un negocio (`shared/close-deal.ts`): panel en línea bajo las etapas (ficha) o encima del tablero (pipeline). Ganado en `ok-soft` con la casilla de postventa marcada; perdido en hoja blanca con los motivos como chips de radio (mismo estilo que el tipo de registro del historial) y un detalle opcional. Dice cuántos follow-ups se cancelan. Sin modal.
- Cobro de una factura (`shared/invoice-payments.ts`, en la ficha de la venta y bajo la factura): estado con `app-pay-state-chip` (Vencida en cinta roja sólida, Pagada en `ok-soft`, Pagada en parte en `pen-soft`, Anulada tachada; siempre texto), saldo en negrita y los pagos como renglones de libro (fecha al margen, importe a la derecha); un pago deshecho queda tachado con su motivo. Registrar pago se abre debajo con el saldo ya puesto; método con chips de radio. En la factura impresa: "Pagos recibidos" y "Saldo pendiente" bajo el total y sello PAGADA en verde.
- Panel de captura: `<dialog>` lateral derecho, entra 240ms ease-out-quart.
- Cerrar la captura con algo escrito (Esc, fondo, Cancelar, X) pregunta en el pie del panel: "Seguir editando" o "Descartar". Nunca se pierde lo escrito sin aviso.
- Confirmaciones en línea (archivar, eliminar, quitar acceso): el foco pasa a la confirmación y vuelve al botón al cancelar. Solo lo irreversible (eliminar) confirma con `.btn-danger`; archivar es reversible y usa `.btn-secondary`.
- Borrar (solo admin): la confirmación en línea va en `ribbon-soft` y termina con "Queda anotado en Ajustes → Registro". Borrar a un cliente con ventas pide escribir su nombre; lo que lo impide (una factura vigente) se dice dentro del panel con el enlace para resolverlo y el botón queda desactivado. Los servicios y los usuarios se borran solo después de archivarlos o quitarles el acceso. Las entradas del historial llevan una papelera pequeña en `ink-3`.
- Registro de borrados (Ajustes → Registro): mismo formato de agenda que el historial (fecha y hora en el margen), filtro segmentado por tipo, y la copia de los datos plegada en un `<details>` con monoespaciada (son datos) y botón Copiar.
- Catálogo (Ajustes → Catálogo): filtro segmentado por tipo (Todo · Servicios · Productos · Materiales, con su número) como el del Registro; el tipo se elige con chips de radio con icono (`Handshake`, `Package`, `Layers`), siempre con su nombre, sin color propio. El selector de concepto agrupa por tipo con `<optgroup>` solo si hay más de uno. Precios por unidad con centavos solo si no son redondos (`unitPriceLabel`).
- Móvil: las tablas anchas (Servicios, servicios comprados) se vuelven listas apiladas; los filtros segmentados van en una fila que se desliza; los controles de una fila bajan a su propio renglón antes de cortar un nombre. La cuenta se abre desde el avatar (botón de 44px con menú), no cierra sesión al tocarlo.

- Táctil: los campos van a 16px (si no, iOS amplía la página al enfocarlos); `viewport-fit=cover` con `env(safe-area-inset-*)` en la barra inferior, la barra superior y el pie del panel de captura.
- Datos largos: en tablas, la primera columna lleva `w-full max-w-0` para que el subtítulo se recorte sin empujar las demás; importes y fechas nunca se recortan (`whitespace-nowrap`). Las rejillas de una columna en móvil usan `grid-cols-1` (minmax(0,1fr)), no la pista implícita.
- Inactividad: el último minuto, un aviso con el aspecto del toast (tinta, reloj en resaltador) con cuenta atrás y "Seguir conectado"; tras el cierre, el login muestra encima del titular una nota translúcida con el motivo.
- Acceso ("Hoja de agenda", elegida por Rafa el 27 oct 2026 entre tres propuestas): sobre el tablero Pizarra (`auth-board.ts`), el titular que rota y debajo una hoja blanca de la agenda (`.login-sheet`: radio 14px, sombra profunda, margen rojo a 22px y cabecera `sheet-2` con el título y la fecha de hoy en semicondensada). Dentro, Google (botón secundario con la G a color) y, tras el renglón "o con tu email", email y contraseña con mostrar/ocultar; "¿La olvidaste?" va en la etiqueta. Botones de 44px. Encima del titular, la marca en grande (`login-brand.ts`: logo de 96px, 64px en el móvil y 72px en un portátil bajo, con "CRM Lead" debajo); la cabecera del tablero se queda solo con el idioma. Debajo, sobre el tablero, "¿Primera vez? Crea tu contraseña" (`.login-link`). Las garantías solo con altura ≥ 760px. Crear contraseña marca sus requisitos en verde al escribir (`password-rules.ts`). "Revisa tu correo", la contraseña nueva y los errores de enlace usan la misma hoja; el email largo va en su propio renglón.

## Movimiento

150–250ms, `cubic-bezier(0.25, 1, 0.5, 1)`. Solo estado: entrada del panel, toasts, transición de vista corta (140ms). Respeta `prefers-reduced-motion`. Sin rebotes. Los toasts entran con transición y `@starting-style` (no keyframes), para que varios seguidos se reacomoden. Los `:hover` con movimiento van dentro de `@media (hover: hover) and (pointer: fine)`. Animar solo `transform`/`translate`/`opacity`, nunca `left`/`top`/`width`.

Excepción autorizada: el fondo del login, "la agenda corre" (`features/auth/login-agenda.ts`, Canvas 2D). La página de agenda sube despacio con renglones, margen y horas; las citas suben con ella y se marcan con el resaltador al cruzar la cinta roja de "ahora". Cada cambio de palabra del titular trae una cita nueva. Textos de las citas y horas traducidos; con movimiento reducido es una imagen fija.

Segunda excepción, la marca del login, "el embudo se llena" (`login-brand.ts`): al entrar, los renglones del logo aparecen de arriba abajo y el lead cae blanco por el embudo y sale amarillo (≈1,5 s, una vez). Con cada palabra del titular el embudo se enciende de arriba abajo y el punto destella, al mismo ritmo que las citas del fondo. Con movimiento reducido, el logo quieto.

## Superficies del navegador

Selección en resaltador, caret y `accent-color` en pluma, scrollbar fina en `rule-strong`, foco 2px pluma.

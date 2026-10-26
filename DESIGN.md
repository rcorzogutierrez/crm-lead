# Design

Mundo visual: **agenda**, con la paleta **Pizarra** (elegida por Rafa el 24 oct 2026 entre cinco opciones, con el riel aclarado). Superficie de trabajo (modo Operate): la estructura es la de un CRM estándar; el mundo aporta tipografía, paleta, densidad y un gesto propio.

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
- Títulos y fechas: `.date-face` → `wdth 82`, tracking −0.015em, bold. H1 2–2.5rem.
- UI: 15px/24px base, 13px etiquetas, 12px meta. Números siempre `.tabular`.

## Componentes

- Botones: `.btn-primary` (pluma), `.btn-secondary` (hoja con borde), `.btn-ghost`, `.btn-danger`, tamaños `.btn-sm`, `.btn-icon`. Alto 36px (32px sm), radio 8px.
- Campos: `.input` 40px, borde `rule-strong`, foco anillo pluma 3px/15%.
- `.sheet`: hoja con borde `rule`, radio 10px, sombra suave con desplazamiento.
- Chips de fecha (`app-due-chip`): vencido sólido rojo con texto blanco, hoy resaltador, sin próxima acción borde rojo punteado.
- Toggles segmentados para "Lo mío / Todo el equipo".
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
- Inactividad: el último minuto, un aviso con el aspecto del toast (tinta, reloj en resaltador) con cuenta atrás y "Seguir conectado"; tras el cierre, el login cambia su insignia por una nota translúcida con el motivo.

## Movimiento

150–250ms, `cubic-bezier(0.25, 1, 0.5, 1)`. Solo estado: entrada del panel, toasts, transición de vista corta (140ms). Respeta `prefers-reduced-motion`. Sin rebotes. Los toasts entran con transición y `@starting-style` (no keyframes), para que varios seguidos se reacomoden. Los `:hover` con movimiento van dentro de `@media (hover: hover) and (pointer: fine)`. Animar solo `transform`/`translate`/`opacity`, nunca `left`/`top`/`width`.

Excepción autorizada: el fondo del login, "la agenda corre" (`features/auth/login-agenda.ts`, Canvas 2D). La página de agenda sube despacio con renglones, margen y horas; las citas suben con ella y se marcan con el resaltador al cruzar la cinta roja de "ahora". Cada cambio de palabra del titular trae una cita nueva. Textos de las citas y horas traducidos; con movimiento reducido es una imagen fija.

## Superficies del navegador

Selección en resaltador, caret y `accent-color` en pluma, scrollbar fina en `rule-strong`, foco 2px pluma.

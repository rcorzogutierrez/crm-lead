# Design

Mundo visual: **agenda de cuero**. Superficie de trabajo (modo Operate): la estructura es la de un CRM estándar; el mundo aporta tipografía, paleta, densidad y un gesto propio.

## Gesto firma

La vista **Hoy** es una página de agenda: columna de horas a la izquierda, **línea de margen roja**, renglones de 1px por hora y una **cinta roja de "ahora"** que cruza la hora actual. Lo vencido se "arrastra" arriba en un bloque propio. El historial del lead repite el mismo formato (fecha en el margen, línea roja, entradas a la derecha). La sección activa del riel se marca con una cinta roja, como el listón de una agenda.

## Color (tokens en `src/styles.css` → `@theme`)

| Rol | Token | Valor |
|---|---|---|
| Riel de cuero | `leather` / `leather-deep` | oklch(0.30 0.055 38) / oklch(0.24 0.045 36) |
| Texto sobre cuero | `leather-ink` / `leather-muted` | oklch(0.94 0.018 70) / oklch(0.78 0.03 60) |
| Costura | `stitch` | oklch(0.62 0.06 65), línea discontinua 1.5px |
| Fondo (papel) | `paper` | oklch(0.982 0.004 250) — blanco frío, nunca crema |
| Hoja | `sheet` / `sheet-2` | blanco / oklch(0.965 0.007 250) |
| Renglón | `rule` / `rule-strong` | oklch(0.915 0.014 250) / oklch(0.85 0.02 250) |
| Margen | `margin` | oklch(0.70 0.13 22) |
| Tinta | `ink` / `ink-2` / `ink-3` | oklch(0.25 0.04 265) / 0.42 / 0.52 |
| Pluma (acción, selección) | `pen` / `pen-strong` / `pen-soft` | oklch(0.47 0.16 262) / 0.40 / 0.95 |
| Vencido, ahora | `ribbon` / `ribbon-soft` | oklch(0.53 0.19 25) / oklch(0.965 0.022 25) |
| Hoy | `highlight` | oklch(0.93 0.12 98) (resaltador) |
| Hecho | `ok` / `ok-soft` | oklch(0.52 0.12 155) |
| Etapas | `stage-new … stage-lost` (+ `-ink`) | azules que se oscurecen hacia la propuesta/negociación ámbar-terracota; ganado verde; perdido gris |

Estrategia: Restrained con color comprometido en el riel. Rojo y amarillo solo significan urgencia.

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
- Panel de captura: `<dialog>` lateral derecho, entra 240ms ease-out-quart.

## Movimiento

150–250ms, `cubic-bezier(0.25, 1, 0.5, 1)`. Solo estado: entrada del panel, toasts, transición de vista corta (140ms). Respeta `prefers-reduced-motion`.

## Superficies del navegador

Selección en resaltador, caret y `accent-color` en pluma, scrollbar fina en `rule-strong`, foco 2px pluma.

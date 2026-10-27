# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Fijado por el usuario: Angular 22 (standalone, signals, zoneless), Firebase (Auth + Firestore), Tailwind CSS v4, iconos lucide (`@lucide/angular`). Prohibido Angular Material o cualquier estética Material Design.

## Users

Rafa, que captura leads (formularios, llamadas, WhatsApp, referidos, redes) y necesita no perder ninguno y darle seguimiento a los clientes existentes. Lo usa en escritorio durante la jornada y en el móvil entre reuniones. Confirmado: lo usa **un equipo pequeño compartido**. Todos los miembros autorizados ven todos los leads; cada lead tiene un responsable (`assigneeId`). Un admin invita miembros por email.

## Product Purpose

Un CRM ligero para dos trabajos: (1) registrar y calificar leads nuevos en segundos, y (2) no dejar caer ningún follow-up. El éxito es que cada día el usuario sepa exactamente a quién contactar, y que ningún lead quede sin próxima acción.

## Positioning

_Inferido del brief:_ la unidad central es la **próxima acción**, no el registro. Todo lead activo debe tener un follow-up programado; el sistema hace visible lo vencido y lo de hoy antes que cualquier métrica.

## Operating Context

- Captura rápida mientras se habla por teléfono o se lee un mensaje.
- Revisión diaria de la bandeja "Hoy" (vencidos + de hoy).
- Mover leads por un pipeline de etapas.
- Registrar cada interacción (llamada, email, WhatsApp, reunión, nota) en un historial.

## Capabilities and Constraints

- Etapas del pipeline: Nuevo, Contactado, Calificado, Propuesta, Negociación, Ganado, Perdido.
- Interfaz en español.
- Autenticación con Google o con email y contraseña (Firebase Auth); el email se confirma antes de entrar.
- Sin backend propio: Firestore con reglas de seguridad.
- Indefinido: importación CSV, integraciones (WhatsApp, email), recordatorios push, roles de equipo.

## Evidence on Hand

No hay datos reales todavía. Cualquier dato de demostración debe etiquetarse como ejemplo.

## Product Principles

1. La próxima acción manda: un lead activo sin follow-up es un error visible.
2. Capturar cuesta menos de 15 segundos; los detalles se completan después.
3. Lo urgente arriba: vencido > hoy > próximos.
4. Una herramienta de trabajo, no un póster: densidad, teclado y estados claros.

## Accessibility & Inclusion

WCAG 2.1 AA: contraste, foco visible, navegación por teclado, objetivos táctiles de 44px en móvil.

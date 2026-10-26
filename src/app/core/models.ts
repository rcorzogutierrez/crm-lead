import { I18nKey, t } from './i18n/i18n';
import type { DealLine } from './deal-lines';

/** Etapas del pipeline, en orden. `won` y `lost` son etapas cerradas. */
export type Stage = 'new' | 'contacted' | 'qualified' | 'proposal' | 'negotiation' | 'won' | 'lost';

export type LeadSource =
  | 'web'
  | 'whatsapp'
  | 'phone'
  | 'referral'
  | 'social'
  | 'event'
  | 'email'
  | 'other';

export type ContactChannel = 'call' | 'whatsapp' | 'email' | 'meeting' | 'task';

export type ActivityType = ContactChannel | 'note' | 'stage' | 'created' | 'followup' | 'pricing' | 'invoice' | 'payment';

/** Motivo de pérdida, de una lista corta para que los reportes puedan agruparlo. */
export type LostCode = 'price' | 'competitor' | 'noResponse' | 'timing' | 'notFit' | 'other';

/** Categoría de venta: porcentaje sobre el precio oficial del servicio. */
export type PriceTier = 'bronze' | 'silver' | 'gold';

export type MemberRole = 'admin' | 'member';

export interface Member {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string | null;
  role: MemberRole;
  active: boolean;
}

/** Cómo terminó la última sesión: botón "Cerrar sesión" o cierre automático por inactividad. */
export type SignOutReason = 'manual' | 'idle';

/** Última entrada y salida de un miembro (`sessions/{uid}`; solo la lee un admin). */
export interface SessionLog {
  uid: string;
  signInAt: Date | null;
  signOutAt: Date | null;
  signOutReason: SignOutReason | null;
}

export interface Invite {
  email: string;
  role: MemberRole;
  invitedBy: string;
  createdAt: Date | null;
}

/**
 * Persona o empresa. Es "cliente" en cuanto gana su primer lead; antes es prospecto.
 * El estado se deriva de sus leads, no se guarda.
 */
export interface Contact {
  id: string;
  name: string;
  company: string;
  /** En minúsculas, para detectar duplicados. */
  email: string;
  phone: string;
  assigneeId: string;
  notes: string;
  createdBy: string;
  createdAt: Date | null;
  updatedAt: Date | null;
  /**
   * Resumen de compras guardado en el contacto, porque un vendedor no ve los leads de
   * los demás. null = aún no calculado (contactos anteriores; lo calcula la app de un admin).
   */
  stats: ContactStats | null;
  /** Archivado por un admin: ya no se trabaja, se oculta de la lista pero conserva su historial. */
  archived: boolean;
  archivedAt: Date | null;
}

export interface ContactStats {
  wonCount: number;
  wonTotal: number;
  firstWonAt: Date | null;
  /** Negocios abiertos por responsable (uid → cantidad). */
  openBy: Record<string, number>;
}

export type ContactDraft = Pick<Contact, 'name' | 'company' | 'email' | 'phone' | 'assigneeId' | 'notes'>;

/** Qué es lo que se vende: un servicio, un producto o un material (sin control de stock). */
export type ItemKind = 'service' | 'product' | 'material';

export const ITEM_KINDS: readonly { id: ItemKind; readonly label: string; readonly plural: string }[] = [
  { id: 'service', get label() { return t('kind.service'); }, get plural() { return t('kind.services'); } },
  { id: 'product', get label() { return t('kind.product'); }, get plural() { return t('kind.products'); } },
  { id: 'material', get label() { return t('kind.material'); }, get plural() { return t('kind.materials'); } },
];

export function kindLabel(kind: ItemKind): string {
  return ITEM_KINDS.find((k) => k.id === kind)?.label ?? kind;
}

/**
 * Elemento del catálogo (servicio, producto o material); en el código y en Firestore sigue
 * siendo `services`. Solo un admin lo crea o edita.
 */
export interface ServiceItem {
  id: string;
  /** Los anteriores a este campo son servicios. */
  kind: ItemKind;
  name: string;
  description: string;
  /** Precio oficial por unidad. */
  price: number;
  /** Unidad de cobro ("hora", "unidad", "metro"…); vacío = precio único. */
  unit: string;
  active: boolean;
  /** ¿Se le suma el impuesto de venta en la factura? (los anteriores a este campo, sí). */
  taxable: boolean;
}

export type ServiceItemDraft = Pick<ServiceItem, 'kind' | 'name' | 'description' | 'price' | 'unit' | 'active' | 'taxable'>;

/** Porcentaje de cada categoría (doc `meta/pricing`). */
export type TierRates = Record<PriceTier, number>;

export const DEFAULT_TIER_RATES: TierRates = { bronze: 3, silver: 5, gold: 7 };

export const TIERS: readonly { id: PriceTier; readonly label: string }[] = [
  { id: 'bronze', get label() { return t('tier.bronze'); } },
  { id: 'silver', get label() { return t('tier.silver'); } },
  { id: 'gold', get label() { return t('tier.gold'); } },
];

export function tierLabel(tier: PriceTier): string {
  return TIERS.find((x) => x.id === tier)?.label ?? tier;
}

/** Precio de venta: oficial × cantidad + porcentaje de la categoría, redondeado a centavos. */
export function salePrice(unitPrice: number, quantity: number, pct: number): number {
  return Math.round(unitPrice * quantity * (100 + pct)) / 100;
}

/**
 * Un lead es una oportunidad: un servicio que se le intenta vender a un contacto.
 * `name`, `company`, `email` y `phone` son copia del contacto (para listas y follow-ups).
 */
export interface Lead {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  source: LeadSource;
  stage: Stage;
  /** Valor estimado del negocio, en la moneda del equipo. */
  value: number;
  assigneeId: string;
  notes: string;
  /** Detalle libre del motivo de pérdida (antes era el único campo). */
  lostReason: string;
  /** Motivo de pérdida de la lista; null en los anteriores a la lista y en los no perdidos. */
  lostCode: LostCode | null;
  /** Fecha del próximo follow-up pendiente (desnormalizada desde `followups`). */
  nextFollowUpAt: Date | null;
  lastContactAt: Date | null;
  createdBy: string;
  createdAt: Date | null;
  updatedAt: Date | null;
  /** Contacto al que pertenece; null en leads anteriores a los contactos. */
  contactId: string | null;
  /** Servicio del catálogo; null si se registró sin servicio. */
  serviceId: string | null;
  serviceName: string;
  /** Detalle libre del servicio ("salida en julio"). */
  detail: string;
  quantity: number;
  /** Precio oficial por unidad, copiado del catálogo al crear (o al aceptar un cambio). */
  unitPrice: number;
  tier: PriceTier;
  tierPct: number;
  /** Precio oficial nuevo que se decidió no aplicar (para no volver a avisar). */
  priceAck: number | null;
  /** Más servicios en la misma compra (el primero va en los campos de arriba). Ver `deal-lines.ts`. */
  extras: DealLine[];
  wonAt: Date | null;
  /** Cuándo pasó a Perdido (null en los anteriores a este campo y en los no perdidos). */
  lostAt: Date | null;
  /** Factura vigente de la venta (`invoices/{id}`); null si no se ha facturado o se anuló. */
  invoiceId: string | null;
}

/** Fecha en que se ganó un lead (los anteriores a `wonAt` usan su última actualización). */
export function wonDate(l: Lead): Date | null {
  return l.wonAt ?? l.updatedAt ?? l.createdAt;
}

/** Datos de precio de un lead con servicio. */
export type LeadPricing = Pick<Lead, 'serviceId' | 'serviceName' | 'quantity' | 'unitPrice' | 'extras' | 'tier' | 'tierPct' | 'value'>;

export type LeadDraft = Pick<
  Lead,
  'name' | 'company' | 'email' | 'phone' | 'source' | 'stage' | 'value' | 'assigneeId' | 'notes'
>;

export interface FollowUp {
  id: string;
  leadId: string;
  leadName: string;
  company: string;
  assigneeId: string;
  dueAt: Date;
  channel: ContactChannel;
  note: string;
  status: 'pending' | 'done' | 'cancelled';
  createdBy: string;
  /** Cuándo se marcó hecho (solo en los `done`). */
  completedAt: Date | null;
}

export interface Activity {
  id: string;
  type: ActivityType;
  body: string;
  createdBy: string;
  createdAt: Date | null;
  /** Para cambios de etapa. */
  from?: Stage;
  to?: Stage;
}

export interface StageMeta {
  id: Stage;
  /** Nombre traducido (getter: sigue al idioma actual). */
  readonly label: string;
  /** Clase de color del punto/borde de la etapa. */
  dot: string;
  /** Clases del badge de la etapa. */
  badge: string;
  closed: boolean;
}

export const STAGES: readonly StageMeta[] = [
  { id: 'new', get label() { return t('stage.new'); }, dot: 'bg-stage-new', badge: 'bg-stage-new/15 text-stage-new-ink', closed: false },
  { id: 'contacted', get label() { return t('stage.contacted'); }, dot: 'bg-stage-contacted', badge: 'bg-stage-contacted/15 text-stage-contacted-ink', closed: false },
  { id: 'qualified', get label() { return t('stage.qualified'); }, dot: 'bg-stage-qualified', badge: 'bg-stage-qualified/15 text-stage-qualified-ink', closed: false },
  { id: 'proposal', get label() { return t('stage.proposal'); }, dot: 'bg-stage-proposal', badge: 'bg-stage-proposal/18 text-stage-proposal-ink', closed: false },
  { id: 'negotiation', get label() { return t('stage.negotiation'); }, dot: 'bg-stage-negotiation', badge: 'bg-stage-negotiation/20 text-stage-negotiation-ink', closed: false },
  { id: 'won', get label() { return t('stage.won'); }, dot: 'bg-stage-won', badge: 'bg-stage-won text-white', closed: true },
  { id: 'lost', get label() { return t('stage.lost'); }, dot: 'bg-stage-lost', badge: 'bg-stage-lost/15 text-ink-2', closed: true },
];

export const OPEN_STAGES = STAGES.filter((s) => !s.closed);

export function stageMeta(stage: Stage): StageMeta {
  return STAGES.find((s) => s.id === stage) ?? STAGES[0];
}

export const SOURCES: readonly { id: LeadSource; readonly label: string }[] = [
  { id: 'web', get label() { return t('source.web'); } },
  { id: 'whatsapp', get label() { return t('source.whatsapp'); } },
  { id: 'phone', get label() { return t('source.phone'); } },
  { id: 'referral', get label() { return t('source.referral'); } },
  { id: 'social', get label() { return t('source.social'); } },
  { id: 'event', get label() { return t('source.event'); } },
  { id: 'email', get label() { return t('source.email'); } },
  { id: 'other', get label() { return t('source.other'); } },
];

export function sourceLabel(source: LeadSource): string {
  return SOURCES.find((s) => s.id === source)?.label ?? t('source.other');
}

export const CHANNELS: readonly { id: ContactChannel; readonly label: string; readonly verb: string }[] = [
  { id: 'call', get label() { return t('channel.call'); }, get verb() { return t('channel.call.verb'); } },
  { id: 'whatsapp', get label() { return t('channel.whatsapp'); }, get verb() { return t('channel.whatsapp.verb'); } },
  { id: 'email', get label() { return t('channel.email'); }, get verb() { return t('channel.email.verb'); } },
  { id: 'meeting', get label() { return t('channel.meeting'); }, get verb() { return t('channel.meeting.verb'); } },
  { id: 'task', get label() { return t('channel.task'); }, get verb() { return t('channel.task.verb'); } },
];

export function channelLabel(channel: ContactChannel): string {
  return CHANNELS.find((c) => c.id === channel)?.label ?? t('channel.task');
}

export const LOST_REASONS: readonly { id: LostCode; readonly label: string }[] = [
  { id: 'price', get label() { return t('lost.price'); } },
  { id: 'competitor', get label() { return t('lost.competitor'); } },
  { id: 'noResponse', get label() { return t('lost.noResponse'); } },
  { id: 'timing', get label() { return t('lost.timing'); } },
  { id: 'notFit', get label() { return t('lost.notFit'); } },
  { id: 'other', get label() { return t('lost.other'); } },
];

/** Motivo de pérdida legible: el de la lista y, si lo hay, el detalle ("Precio · muy caro para julio"). */
export function lostReasonLabel(lead: Pick<Lead, 'lostCode' | 'lostReason'>): string {
  const code = LOST_REASONS.find((r) => r.id === lead.lostCode)?.label ?? '';
  return [code, lead.lostReason.trim()].filter(Boolean).join(' · ');
}

export function isClosed(stage: Stage): boolean {
  return stage === 'won' || stage === 'lost';
}

const ACTIVITY_LABEL: Record<ActivityType, I18nKey> = {
  note: 'act.note',
  call: 'channel.call',
  whatsapp: 'channel.whatsapp',
  email: 'channel.email',
  meeting: 'channel.meeting',
  task: 'channel.task',
  stage: 'act.stage',
  created: 'act.created',
  followup: 'act.followup',
  pricing: 'act.pricing',
  invoice: 'act.invoice',
  payment: 'act.payment',
};

/** Nombre de un tipo de actividad en el idioma actual. */
export function activityLabel(type: ActivityType): string {
  return t(ACTIVITY_LABEL[type] ?? 'act.note');
}

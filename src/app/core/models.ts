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

export type ActivityType = ContactChannel | 'note' | 'stage' | 'created' | 'followup';

export type MemberRole = 'admin' | 'member';

export interface Member {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string | null;
  role: MemberRole;
  active: boolean;
}

export interface Invite {
  email: string;
  role: MemberRole;
  invitedBy: string;
  createdAt: Date | null;
}

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
  lostReason: string;
  /** Fecha del próximo follow-up pendiente (desnormalizada desde `followups`). */
  nextFollowUpAt: Date | null;
  lastContactAt: Date | null;
  createdBy: string;
  createdAt: Date | null;
  updatedAt: Date | null;
}

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
  label: string;
  /** Clase de color del punto/borde de la etapa. */
  dot: string;
  /** Clases del badge de la etapa. */
  badge: string;
  closed: boolean;
}

export const STAGES: readonly StageMeta[] = [
  { id: 'new', label: 'Nuevo', dot: 'bg-stage-new', badge: 'bg-stage-new/15 text-stage-new-ink', closed: false },
  { id: 'contacted', label: 'Contactado', dot: 'bg-stage-contacted', badge: 'bg-stage-contacted/15 text-stage-contacted-ink', closed: false },
  { id: 'qualified', label: 'Calificado', dot: 'bg-stage-qualified', badge: 'bg-stage-qualified/15 text-stage-qualified-ink', closed: false },
  { id: 'proposal', label: 'Propuesta', dot: 'bg-stage-proposal', badge: 'bg-stage-proposal/18 text-stage-proposal-ink', closed: false },
  { id: 'negotiation', label: 'Negociación', dot: 'bg-stage-negotiation', badge: 'bg-stage-negotiation/20 text-stage-negotiation-ink', closed: false },
  { id: 'won', label: 'Ganado', dot: 'bg-stage-won', badge: 'bg-stage-won text-white', closed: true },
  { id: 'lost', label: 'Perdido', dot: 'bg-stage-lost', badge: 'bg-stage-lost/15 text-ink-2', closed: true },
];

export const OPEN_STAGES = STAGES.filter((s) => !s.closed);

export function stageMeta(stage: Stage): StageMeta {
  return STAGES.find((s) => s.id === stage) ?? STAGES[0];
}

export const SOURCES: readonly { id: LeadSource; label: string }[] = [
  { id: 'web', label: 'Formulario web' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'phone', label: 'Llamada' },
  { id: 'referral', label: 'Referido' },
  { id: 'social', label: 'Redes sociales' },
  { id: 'event', label: 'Evento' },
  { id: 'email', label: 'Email' },
  { id: 'other', label: 'Otro' },
];

export function sourceLabel(source: LeadSource): string {
  return SOURCES.find((s) => s.id === source)?.label ?? 'Otro';
}

export const CHANNELS: readonly { id: ContactChannel; label: string; verb: string }[] = [
  { id: 'call', label: 'Llamada', verb: 'Llamar' },
  { id: 'whatsapp', label: 'WhatsApp', verb: 'Escribir por WhatsApp' },
  { id: 'email', label: 'Email', verb: 'Enviar email' },
  { id: 'meeting', label: 'Reunión', verb: 'Reunirse' },
  { id: 'task', label: 'Tarea', verb: 'Hacer' },
];

export function channelLabel(channel: ContactChannel): string {
  return CHANNELS.find((c) => c.id === channel)?.label ?? 'Tarea';
}

export function isClosed(stage: Stage): boolean {
  return stage === 'won' || stage === 'lost';
}

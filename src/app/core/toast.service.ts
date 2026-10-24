import { Service, signal } from '@angular/core';

export interface Toast {
  id: number;
  text: string;
  tone: 'ok' | 'error';
  action?: { label: string; run: () => void };
}

/** Avisos breves en la esquina, con acción opcional (p. ej. "Deshacer"). */
@Service()
export class ToastService {
  private seq = 0;
  readonly toasts = signal<Toast[]>([]);

  show(text: string, opts: { tone?: Toast['tone']; action?: Toast['action'] } = {}): void {
    const toast: Toast = { id: ++this.seq, text, tone: opts.tone ?? 'ok', action: opts.action };
    this.toasts.update((t) => [...t.slice(-2), toast]);
    setTimeout(() => this.dismiss(toast.id), toast.action ? 7000 : 4000);
  }

  error(text: string): void {
    this.show(text, { tone: 'error' });
  }

  dismiss(id: number): void {
    this.toasts.update((t) => t.filter((x) => x.id !== id));
  }
}

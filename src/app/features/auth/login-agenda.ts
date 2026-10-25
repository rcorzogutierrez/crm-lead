import { Component, DestroyRef, ElementRef, afterNextRender, effect, inject, input, untracked, viewChild } from '@angular/core';
import { I18nKey, intlLocale, lang, t } from '../../core/i18n/i18n';

type Oklch = readonly [number, number, number];

/** Colores de la paleta Pizarra (aclarados para leerse sobre el fondo oscuro). */
const INK: Oklch = [0.97, 0.004, 262];
const MUTED: Oklch = [0.84, 0.012, 262];
const HIGHLIGHT: Oklch = [0.92, 0.11, 92];
const RIBBON: Oklch = [0.64, 0.19, 25];
const DONE: Oklch = [0.72, 0.15, 155];
const DARK: Oklch = [0.22, 0.02, 262];
/** Punto de canal de cada cita: llamada, WhatsApp, propuesta, email. */
const CHANNEL: readonly Oklch[] = [[0.78, 0.12, 278], DONE, HIGHLIGHT, [0.74, 0.08, 250]];

const ITEMS: readonly (readonly [I18nKey, number])[] = [
  ['login.bg.item1', 0],
  ['login.bg.item2', 1],
  ['login.bg.item3', 2],
  ['login.bg.item4', 3],
  ['login.bg.item5', 0],
  ['login.bg.item6', 0],
  ['login.bg.item7', 3],
  ['login.bg.item8', 1],
  ['login.bg.item9', 2],
];

const FONT = "'Archivo Variable', ui-sans-serif, system-ui, sans-serif";
/** Píxeles por segundo que sube la página. */
const SPEED = 12;

interface Pill {
  key: I18nKey;
  channel: number;
  x: number;
  /** Renglón (en coordenadas de la página) sobre el que va la cita. */
  wy: number;
  width: number;
  /** Segundos desde que cruzó la línea de "ahora" (-1 si aún no). */
  hit: number;
}

const col = (c: Oklch, a = 1) => `oklch(${c[0]} ${c[1]} ${c[2]} / ${a})`;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const rand = (a: number, b: number) => a + Math.random() * (b - a);

/**
 * Fondo del login, "la agenda corre": la página de agenda sube despacio con sus renglones,
 * margen y horas; las citas suben con ella y, al cruzar la cinta roja de "ahora", se pintan
 * con el resaltador y quedan hechas. Cada cambio de palabra del titular (`beat`) trae una cita
 * nueva por abajo. Con movimiento reducido se dibuja una sola imagen fija.
 */
@Component({
  selector: 'app-login-agenda',
  template: `<canvas #canvas class="block size-full"></canvas>`,
  host: { class: 'login-agenda', 'aria-hidden': 'true' },
})
export class LoginAgenda {
  /** Índice de la palabra del titular: cada cambio es un latido. */
  readonly beat = input(0);

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  private ctx: CanvasRenderingContext2D | null = null;
  private w = 0;
  private h = 0;
  private gap = 36;
  private margin = 72;
  private nowY = 0;
  private offset = 0;
  private pills: Pill[] = [];
  private next = 0;
  /** Hora del primer renglón de hora, para que la línea de "ahora" empiece en la hora real. */
  private startHour = new Date().getHours();
  private hourFormat: { locale: string; fmt: Intl.DateTimeFormat } | null = null;

  constructor() {
    const destroyRef = inject(DestroyRef);
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

    let first = true;
    effect(() => {
      this.beat();
      if (first) {
        first = false;
        return;
      }
      if (!this.reduced) untracked(() => this.spawnBelow());
    });

    // Con movimiento reducido no hay bucle: al cambiar de idioma se vuelve a dibujar la imagen fija.
    effect(() => {
      lang();
      if (this.reduced) untracked(() => this.draw());
    });

    afterNextRender(() => {
      this.ctx = this.canvas().nativeElement.getContext('2d');
      const ro = new ResizeObserver(() => this.resize(host));
      ro.observe(host);
      this.resize(host);

      if (this.reduced) {
        // Unos segundos simulados para que la imagen fija tenga citas ya marcadas
        for (let i = 0; i < 160; i++) this.step(1 / 30);
        this.draw();
        destroyRef.onDestroy(() => ro.disconnect());
        return;
      }

      let raf = 0;
      let last = performance.now();
      const loop = (now: number) => {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        this.step(dt);
        this.draw();
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
      destroyRef.onDestroy(() => {
        cancelAnimationFrame(raf);
        ro.disconnect();
      });
    });
  }

  private resize(host: HTMLElement): void {
    const canvas = this.canvas().nativeElement;
    const rect = host.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.w = Math.max(1, rect.width);
    this.h = Math.max(1, rect.height);
    canvas.width = Math.round(this.w * dpr);
    canvas.height = Math.round(this.h * dpr);
    this.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);

    const narrow = this.w < 640;
    this.gap = narrow ? 30 : 36;
    this.margin = narrow ? 0 : Math.min(this.w * 0.08, 72);
    this.nowY = Math.round(this.h * 0.82);
    if (!this.pills.length) {
      for (let y = this.h * 0.12; y < this.h + this.gap; y += this.gap * rand(1.8, 2.8)) this.spawn(y);
    }
    if (this.reduced) this.draw();
  }

  /** Cita del latido: entra por abajo si la última no está a menos de dos renglones. */
  private spawnBelow(): void {
    const lowest = Math.max(-Infinity, ...this.pills.map((p) => p.wy - this.offset));
    if (this.h + this.gap - lowest >= this.gap * 2) this.spawn(this.h + this.gap);
  }

  /** Nueva cita a los lados del contenido, apoyada en un renglón. */
  private spawn(screenY: number): void {
    const [key, channel] = ITEMS[this.next++ % ITEMS.length];
    const narrow = this.w < 640;
    const width = narrow ? 132 : 188;
    const left = Math.random() < 0.5;
    const x = narrow
      ? left
        ? rand(8, this.w * 0.14)
        : rand(this.w * 0.5, this.w - width - 8)
      : left
        ? rand(this.margin + 16, Math.max(this.margin + 16, this.w * 0.24 - width * 0.4))
        : rand(this.w * 0.7, this.w - width - 24);
    const wy = Math.ceil((screenY + this.offset) / this.gap) * this.gap;
    // Las que nacen por encima de "ahora" (al abrir la página) ya están hechas
    this.pills.push({ key, channel, x, wy, width, hit: wy - this.offset <= this.nowY ? 4 : -1 });
  }

  private step(dt: number): void {
    this.offset += dt * SPEED;
    for (const p of this.pills) {
      if (p.hit < 0 && p.wy - this.offset <= this.nowY) p.hit = 0;
      if (p.hit >= 0) p.hit += dt;
    }
    this.pills = this.pills.filter((p) => p.wy - this.offset > -40);
  }

  private hourLabel(line: number): string {
    const locale = intlLocale();
    if (this.hourFormat?.locale !== locale) {
      this.hourFormat = { locale, fmt: new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }) };
    }
    // Cada dos renglones, una hora; la hora real queda justo encima de "ahora" al empezar
    const nowLine = Math.floor((this.nowY + this.gap / 2) / (this.gap * 2));
    const date = new Date(2000, 0, 1, (((this.startHour + line - nowLine) % 24) + 24) % 24);
    return this.hourFormat.fmt.format(date);
  }

  private draw(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const { w, h, gap, margin, nowY, offset } = this;
    ctx.clearRect(0, 0, w, h);

    // Renglones
    ctx.fillStyle = col(INK, 0.05);
    for (let y = gap - (offset % gap); y < h; y += gap) ctx.fillRect(0, Math.round(y), w, 1);

    // Margen y horas (solo en pantallas anchas)
    if (margin > 0) {
      ctx.fillStyle = col(RIBBON, 0.26);
      ctx.fillRect(Math.round(margin), 0, 1, h);
      ctx.font = `600 10px ${FONT}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = col(MUTED, 0.32);
      for (let k = Math.ceil(offset / (gap * 2)); ; k++) {
        const y = k * gap * 2 - offset;
        if (y > h + gap) break;
        if (Math.abs(y - gap / 2 - (nowY - 8)) > 12) ctx.fillText(this.hourLabel(k), margin - 8, y - gap / 2);
      }
    }

    // Citas
    const narrow = w < 640;
    const fs = narrow ? 10.5 : 12.5;
    const ph = narrow ? 22 : 26;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const p of this.pills) {
      const y = p.wy - offset - ph - 4;
      const fadeTop = clamp((p.wy - offset) / (h * 0.5), 0, 1);
      const lit = p.hit < 0 ? 0 : clamp(p.hit / 0.5, 0, 1);
      const after = p.hit < 0 ? 0 : clamp((p.hit - 1.6) / 1.4, 0, 1);
      ctx.globalAlpha = fadeTop * (1 - after * 0.7);

      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(p.x, y, p.width, ph, 7);
      else ctx.rect(p.x, y, p.width, ph);
      ctx.fillStyle = lit > 0 ? col(HIGHLIGHT, 0.08 + 0.82 * lit * (1 - after * 0.75)) : col(INK, 0.065);
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = lit > 0 ? col(HIGHLIGHT, 0.6 * (1 - after)) : col(INK, 0.14);
      ctx.stroke();

      const cy = y + ph / 2;
      if (lit > 0) {
        // Marca de hecho
        ctx.strokeStyle = col(after > 0.3 ? DONE : DARK);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p.x + 7, cy);
        ctx.lineTo(p.x + 10, cy + 3);
        ctx.lineTo(p.x + 15, cy - 3.5);
        ctx.stroke();
      } else {
        ctx.fillStyle = col(CHANNEL[p.channel], 0.9);
        ctx.beginPath();
        ctx.arc(p.x + 11, cy, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      const text = t(p.key);
      const tx = p.x + 22;
      const maxW = p.width - 28;
      ctx.font = `600 ${fs}px ${FONT}`;
      ctx.fillStyle = lit > 0.5 && after < 0.5 ? col(DARK) : col(INK, lit > 0 ? 0.55 : 0.78);
      ctx.fillText(text, tx, cy + 0.5, maxW);
      if (after > 0) {
        ctx.fillStyle = col(INK, 0.4 * after);
        ctx.fillRect(tx, cy, Math.min(ctx.measureText(text).width, maxW), 1);
      }
      ctx.globalAlpha = 1;
    }

    // Cinta de "ahora"
    ctx.fillStyle = col(RIBBON, 0.85);
    ctx.fillRect(0, nowY, w, 1.5);
    ctx.beginPath();
    ctx.arc(margin > 0 ? margin : 12, nowY + 0.75, 4, 0, Math.PI * 2);
    ctx.fill();
    if (margin > 0) {
      ctx.font = `700 10px ${FONT}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText(t('login.bg.now'), margin - 8, nowY - 3);
    }
  }
}

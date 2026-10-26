import { Component, computed, input } from '@angular/core';
import {
  LucideArrowRightLeft,
  LucideCalendarCheck,
  LucideDynamicIcon,
  LucideFileText,
  LucideMail,
  LucideMessageCircle,
  LucidePhone,
  LucideSparkles,
  LucideStickyNote,
  LucideSquareCheck,
  LucideTag,
  LucideUsers,
} from '@lucide/angular';
import { ActivityType } from '../core/models';

const ICONS = {
  call: LucidePhone,
  whatsapp: LucideMessageCircle,
  email: LucideMail,
  meeting: LucideUsers,
  task: LucideSquareCheck,
  note: LucideStickyNote,
  stage: LucideArrowRightLeft,
  created: LucideSparkles,
  followup: LucideCalendarCheck,
  pricing: LucideTag,
  invoice: LucideFileText,
} as const;

@Component({
  selector: 'app-channel-icon',
  imports: [LucideDynamicIcon],
  template: `<svg [lucideIcon]="icon()" [size]="size()" [strokeWidth]="1.75" aria-hidden="true"></svg>`,
  host: { class: 'inline-flex shrink-0' },
})
export class ChannelIcon {
  readonly type = input.required<ActivityType>();
  readonly size = input(16);
  protected readonly icon = computed(() => ICONS[this.type()] ?? LucideStickyNote);
}

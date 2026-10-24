import { Component, computed, inject, signal } from '@angular/core';
import { FormField, email, form, required, submit } from '@angular/forms/signals';
import { AuthService } from '../../core/auth.service';
import { firestoreErrorMessage } from '../../core/firestore-utils';
import { t } from '../../core/i18n/i18n';
import { LeadsService } from '../../core/leads.service';
import { MembersService } from '../../core/members.service';
import { Member, MemberRole } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { Avatar } from '../../shared/avatar';

/** Equipo: miembros, roles e invitaciones (solo admins pueden cambiar). */
@Component({
  selector: 'app-team',
  imports: [FormField, Avatar],
  templateUrl: './team.html',
})
export class Team {
  protected readonly auth = inject(AuthService);
  protected readonly members = inject(MembersService);
  private readonly leads = inject(LeadsService);
  private readonly toast = inject(ToastService);

  protected readonly t = t;
  protected readonly inviteModel = signal<{ email: string; role: MemberRole }>({ email: '', role: 'member' });
  protected readonly inviteForm = form(this.inviteModel, (p) => {
    required(p.email, { message: 'team.emailRequired' });
    email(p.email, { message: 'form.emailInvalid' });
  });

  protected readonly workload = computed(() => {
    const counts = new Map<string, number>();
    for (const l of this.leads.open()) counts.set(l.assigneeId, (counts.get(l.assigneeId) ?? 0) + 1);
    return counts;
  });

  protected readonly confirmUid = signal<string | null>(null);

  protected async invite(event: Event): Promise<void> {
    event.preventDefault();
    await submit(this.inviteForm, async () => {
      const { email: mail, role } = this.inviteModel();
      if (this.members.members().some((m) => m.email.toLowerCase() === mail.trim().toLowerCase())) {
        this.toast.error(t('team.already'));
        return undefined;
      }
      try {
        await this.members.invite(mail, role);
        this.toast.show(t('team.invited', { email: mail }));
        this.inviteModel.set({ email: '', role: 'member' });
        this.inviteForm().reset();
      } catch (err) {
        this.toast.error(firestoreErrorMessage(err));
      }
      return undefined;
    });
  }

  protected async setRole(m: Member, role: MemberRole): Promise<void> {
    try {
      await this.members.setRole(m.uid, role);
    } catch (err) {
      this.toast.error(firestoreErrorMessage(err));
    }
  }

  protected async toggleActive(m: Member): Promise<void> {
    try {
      await this.members.setActive(m.uid, !m.active);
      this.confirmUid.set(null);
      this.toast.show(t(m.active ? 'team.revoked' : 'team.restored', { name: m.displayName }));
    } catch (err) {
      this.toast.error(firestoreErrorMessage(err));
    }
  }

  protected async revoke(mail: string): Promise<void> {
    try {
      await this.members.revokeInvite(mail);
    } catch (err) {
      this.toast.error(firestoreErrorMessage(err));
    }
  }
}

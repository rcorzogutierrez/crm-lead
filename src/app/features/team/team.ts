import { Component, computed, inject, signal } from '@angular/core';
import { FormField, email, form, required, submit } from '@angular/forms/signals';
import { AuthService } from '../../core/auth.service';
import { firestoreErrorMessage } from '../../core/firestore-utils';
import { t } from '../../core/i18n/i18n';
import { LeadsService } from '../../core/leads.service';
import { MembersService } from '../../core/members.service';
import { Invite, Member, MemberRole } from '../../core/models';
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
  /** Cambio de rol elegido en el selector, a la espera de confirmación en línea. */
  protected readonly pendingRole = signal<{ uid: string; role: MemberRole } | null>(null);

  protected roleLabel(role: MemberRole): string {
    return role === 'admin' ? t('role.admin') : t('role.member');
  }

  /** Valor que muestra el selector: el elegido mientras se confirma, si no el guardado. */
  protected shownRole(m: Member): MemberRole {
    const pending = this.pendingRole();
    return pending?.uid === m.uid ? pending.role : m.role;
  }

  protected pickRole(m: Member, role: MemberRole): void {
    this.pendingRole.set(role === m.role ? null : { uid: m.uid, role });
  }

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

  protected async confirmRole(m: Member): Promise<void> {
    const pending = this.pendingRole();
    if (pending?.uid !== m.uid) return;
    try {
      await this.members.setRole(m.uid, pending.role);
      this.toast.show(t('team.roleChanged', { name: m.displayName, role: this.roleLabel(pending.role) }));
    } catch (err) {
      this.toast.error(firestoreErrorMessage(err));
    } finally {
      this.pendingRole.set(null);
    }
  }

  protected async setInviteRole(inv: Invite, role: MemberRole): Promise<void> {
    try {
      await this.members.setInviteRole(inv.email, role);
      this.toast.show(t('team.inviteRoleChanged', { email: inv.email, role: this.roleLabel(role) }));
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
      this.toast.show(t('team.withdrawn', { email: mail }));
    } catch (err) {
      this.toast.error(firestoreErrorMessage(err));
    }
  }
}

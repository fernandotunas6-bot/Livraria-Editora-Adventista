// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ROLES, MANAGER_PERMISSIONS, DEFAULT_PERMISSIONS } from '@/lib/permissions';
import { PermissionMenuPreview, PermissionSwitches } from './PermissionAreas';
import { createUser, updateUser } from '@/lib/usersApi';
import { assignStaffRole, listStaffRoles, loadTeamRoles } from '@/lib/staffRolesApi';
import PhoneInput from '@/components/PhoneInput';
import { isValidAngolaPhone, localDigits, normalizeAngolaPhone } from '@/lib/angolaPhone';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const emptyForm = {
  name: '',
  email: '',
  phone: '',
  role: 'member',
  permissions: { ...DEFAULT_PERMISSIONS },
  password: '',
  sendLink: true,
  staffRoleId: '',
};

// Valor do Select para «sem cargo»: as permissões são as da pessoa («personalizado»).
const NO_ROLE = 'personalizado';

/**
 * Criar ou editar uma conta.
 * - `user` com `has_account`: edição.
 * - `user` sem conta (cliente que comprou como convidado) ou null: criação, com os dados pré-preenchidos.
 * Papéis e permissões só aparecem para administradores; o servidor volta a verificar tudo.
 */
export default function UserFormDialog({ open, onOpenChange, user, isAdmin, currentUserId, onSaved }) {
  const isEdit = !!user?.has_account;
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // Cargos (Caixa, Atendimento…) e o cargo que a pessoa tem agora; só para administradores.
  const [roles, setRoles] = useState([]);
  const [initialRoleId, setInitialRoleId] = useState('');

  useEffect(() => {
    if (!open || !isAdmin) return undefined;
    let alive = true;
    Promise.all([listStaffRoles(), user?.id ? loadTeamRoles() : Promise.resolve({})])
      .then(([{ roles: list }, team]) => {
        if (!alive) return;
        setRoles(list);
        const current = (user?.id && team[user.id]) || '';
        setInitialRoleId(current);
        setForm((f) => ({ ...f, staffRoleId: current }));
      })
      .catch(() => { if (alive) setRoles([]); });
    return () => { alive = false; };
  }, [open, isAdmin, user?.id]);

  useEffect(() => {
    if (!open) return;
    setError('');
    setForm({
      ...emptyForm,
      name: user?.name || '',
      email: user?.email || '',
      phone: user?.phone || '',
      role: user?.has_account ? user.role : 'member',
      permissions: { ...DEFAULT_PERMISSIONS, ...(user?.permissions || {}) },
    });
  }, [open, user]);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const isSelf = isEdit && user.id === currentUserId;
  const canEditRole = isAdmin && !isSelf;
  const cargo = roles.find((r) => r.id === form.staffRoleId) || null;
  // Com cargo, as permissões são as do cargo (a base de dados garante-o; aqui mostra-se).
  const shownPermissions = cargo ? cargo.permissions : form.permissions;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!EMAIL_RE.test(form.email.trim())) return setError('Indique um email válido.');
    // Telefone opcional; se preenchido, tem de ser um número angolano completo.
    const phone = localDigits(form.phone) ? normalizeAngolaPhone(form.phone) : '';
    if (phone && !isValidAngolaPhone(phone)) return setError('O telefone deve ter 9 dígitos e começar por 9 (ex.: +244 923 000 000).');
    if (form.password && form.password.length < 8) return setError('A palavra-passe deve ter pelo menos 8 caracteres.');
    setSaving(true);
    try {
      let result;
      if (isEdit) {
        const patch = {};
        if (form.name !== (user.name || '')) patch.name = form.name;
        if (phone !== (user.phone || '')) patch.phone = phone;
        if (form.email.trim().toLowerCase() !== (user.email || '').toLowerCase()) patch.email = form.email;
        if (canEditRole) {
          if (form.role !== user.role) patch.role = form.role;
          if (form.role === 'manager') patch.permissions = shownPermissions;
        }
        if (Object.keys(patch).length) await updateUser(user.id, patch);
        result = { id: user.id };
      } else {
        result = await createUser({
          name: form.name,
          email: form.email,
          phone,
          role: isAdmin ? form.role : 'member',
          permissions: form.role === 'manager' ? shownPermissions : undefined,
          password: form.password || undefined,
          send_link: form.password ? form.sendLink : true,
        });
      }
      // O cargo vai à parte (só administradores, pela staff_role_assign): com ele, a base de dados
      // copia as permissões do cargo para a pessoa.
      if (canEditRole && form.role === 'manager' && result?.id && (form.staffRoleId || '') !== (initialRoleId || '')) {
        await assignStaffRole(result.id, form.staffRoleId || null);
      }
      onSaved?.(result, { created: !isEdit, name: form.name, email: form.email, phone });
      onOpenChange(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{isEdit ? 'Editar conta' : user ? 'Criar conta para cliente' : 'Nova conta'}</DialogTitle>
            <DialogDescription>
              {isEdit
                ? 'Altere os dados da conta. As encomendas continuam ligadas ao email.'
                : isAdmin
                  ? 'A conta fica logo confirmada. Sem palavra-passe, a pessoa recebe um link para a definir.'
                  : 'A conta fica logo confirmada e a pessoa recebe no seu email um link para definir a palavra-passe.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="uf-name">Nome</Label>
              <Input id="uf-name" value={form.name} onChange={(e) => set({ name: e.target.value })} maxLength={120} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="uf-email">Email</Label>
              <Input id="uf-email" type="email" required value={form.email} onChange={(e) => set({ email: e.target.value })} disabled={isEdit && !isAdmin} />
              {isEdit && !isAdmin && (
                <p className="text-xs text-muted-foreground">Só um administrador pode mudar o email de uma conta.</p>
              )}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="uf-phone">Telefone</Label>
              <PhoneInput id="uf-phone" value={form.phone} onChange={(phone) => set({ phone })} />
            </div>

            {/* Só um administrador escolhe a palavra-passe (o servidor recusa a um gestor): a conta
                nasce confirmada e com as encomendas de convidado do mesmo email. Para os outros,
                a pessoa recebe um link no próprio email. */}
            {!isEdit && isAdmin && (
              <div className="grid gap-1.5">
                <Label htmlFor="uf-password">Palavra-passe (opcional)</Label>
                <Input id="uf-password" type="password" autoComplete="new-password" value={form.password} onChange={(e) => set({ password: e.target.value })} placeholder="Deixe vazio para enviar um link" />
                {form.password && (
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Checkbox checked={form.sendLink} onCheckedChange={(v) => set({ sendLink: v === true })} />
                    Enviar também um link para a pessoa definir a sua própria palavra-passe
                  </label>
                )}
              </div>
            )}

            {isAdmin && (
              <div className="grid gap-1.5">
                <Label>Papel</Label>
                <Select value={form.role} onValueChange={(role) => set({ role, permissions: role === 'manager' && form.role !== 'manager' ? { ...MANAGER_PERMISSIONS } : form.permissions })} disabled={!canEditRole && isEdit}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(ROLES).map(([key, r]) => (
                      <SelectItem key={key} value={key}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {isSelf ? 'Não pode alterar o seu próprio papel.' : ROLES[form.role]?.description}
                </p>
              </div>
            )}

            {isAdmin && form.role === 'manager' && roles.length > 0 && (
              <div className="grid gap-1.5">
                <Label>Cargo</Label>
                <Select
                  value={form.staffRoleId || NO_ROLE}
                  onValueChange={(v) => set({ staffRoleId: v === NO_ROLE ? '' : v })}
                  disabled={!canEditRole && isEdit}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_ROLE}>Sem cargo (permissões à medida)</SelectItem>
                    {roles.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {cargo
                    ? `As permissões são as do cargo «${cargo.name}»: mudam quando o cargo mudar (Utilizadores › Cargos).`
                    : 'Escolha as permissões uma a uma, ou um cargo para as preencher de uma vez.'}
                </p>
              </div>
            )}

            {isAdmin && form.role === 'manager' && (
              <div className="space-y-3 rounded-lg border p-3 bg-muted/20">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {cargo ? `Permissões do cargo «${cargo.name}»` : 'Permissões do gestor'}
                </p>
                {/* Por área, como a navegação do painel, com o que cada uma abre. */}
                <PermissionSwitches
                  value={shownPermissions}
                  disabled={(!canEditRole && isEdit) || !!cargo}
                  onChange={(permissions) => set({ permissions })}
                />
                <PermissionMenuPreview role={form.role} permissions={shownPermissions} className="border-t pt-3" />
              </div>
            )}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isEdit ? 'Guardar' : 'Criar conta'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

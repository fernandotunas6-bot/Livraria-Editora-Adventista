import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Pencil, Plus, RefreshCw, Trash2, UserCog, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { DEFAULT_PERMISSIONS } from '@/lib/permissions';
import {
  deleteStaffRole, listStaffRoles, loadTeamRoles, rolePermissionLabels, saveStaffRole,
} from '@/lib/staffRolesApi';
import { PermissionMenuPreview, PermissionSwitches } from './PermissionAreas';

const people = (n) => `${n} ${n === 1 ? 'pessoa' : 'pessoas'}`;

/**
 * Cargos da equipa (Utilizadores › Cargos, só administradores): Caixa, Atendimento, Gerente de
 * loja… Cada cargo é um conjunto de permissões com nome. Quem tem o cargo tem as permissões dele, e
 * mudar o cargo muda-as logo a toda a gente que o tem — a base de dados trata disso (migração
 * cargos_e_ver_relatorios). Atribui-se o cargo no formulário de cada pessoa.
 */
export default function StaffRolesPanel() {
  const { toast } = useToast();
  const [state, setState] = useState({ loading: true, roles: [], members: {}, missing: false, error: '' });
  const [editing, setEditing] = useState(null); // { id?, name, description, permissions }
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(null);

  const load = useCallback(async () => {
    try {
      const [{ roles, missing }, team] = await Promise.all([listStaffRoles(), loadTeamRoles()]);
      const members = {};
      for (const roleId of Object.values(team)) members[roleId] = (members[roleId] || 0) + 1;
      setState({ loading: false, roles, members, missing, error: '' });
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: err.message }));
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const editingMembers = editing?.id ? state.members[editing.id] || 0 : 0;
  const nextPosition = useMemo(() => (state.roles.reduce((m, r) => Math.max(m, r.position || 0), 0) + 10), [state.roles]);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await saveStaffRole({ ...editing, position: editing.id ? editing.position : nextPosition });
      toast({
        title: editing.id ? 'Cargo guardado' : 'Cargo criado',
        description: editingMembers ? `As permissões de ${people(editingMembers)} com este cargo mudaram já.` : undefined,
      });
      setEditing(null);
      await load();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Não foi possível', description: err.message });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    const role = removing;
    setRemoving(null);
    try {
      await deleteStaffRole(role.id);
      toast({ title: 'Cargo apagado', description: state.members[role.id] ? 'Quem o tinha fica com as mesmas permissões, sem cargo.' : undefined });
      await load();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Não foi possível', description: err.message });
    }
  };

  if (state.loading) return <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (state.missing) {
    return (
      <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
        Os cargos chegam com a migração <code>20261108130000_cargos_e_ver_relatorios</code>, que ainda não está aplicada.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          <strong className="font-semibold text-foreground">{state.roles.length}</strong> cargos · quem tem um cargo tem as permissões dele, e mudar o cargo muda-as a toda a gente que o tem.
        </p>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={load}><RefreshCw className="mr-1.5 h-4 w-4" />Actualizar</Button>
          <Button size="sm" onClick={() => setEditing({ name: '', description: '', permissions: { ...DEFAULT_PERMISSIONS } })}>
            <Plus className="mr-1.5 h-4 w-4" />Novo cargo
          </Button>
        </div>
      </div>
      {state.error && <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{state.error}</p>}

      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {state.roles.map((role) => {
          const labels = rolePermissionLabels(role.permissions);
          const n = state.members[role.id] || 0;
          return (
            <li key={role.id} className="flex flex-col rounded-xl border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-semibold"><UserCog className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />{role.name}</p>
                  {role.description && <p className="mt-1 text-sm text-muted-foreground">{role.description}</p>}
                </div>
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  <Users className="h-3 w-3" aria-hidden="true" />{people(n)}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {labels.length ? labels.map((l) => (
                  <span key={l} className="rounded-full bg-sky-500/10 px-2 py-0.5 text-xs text-sky-700 dark:text-sky-300">{l}</span>
                )) : <span className="text-xs text-muted-foreground">Sem permissões: só o Início.</span>}
              </div>
              <div className="mt-auto flex gap-2 pt-4">
                <Button size="sm" variant="outline" onClick={() => setEditing({ ...role })}><Pencil className="mr-1.5 h-4 w-4" />Editar</Button>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setRemoving(role)}><Trash2 className="mr-1.5 h-4 w-4" />Apagar</Button>
              </div>
            </li>
          );
        })}
      </ul>

      <Dialog open={!!editing} onOpenChange={(open) => { if (!open) setEditing(null); }}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          {editing && (
            <form onSubmit={save} className="space-y-4">
              <DialogHeader>
                <DialogTitle>{editing.id ? `Editar o cargo «${editing.name}»` : 'Novo cargo'}</DialogTitle>
                <DialogDescription>
                  {editing.id && editingMembers
                    ? `Guardar muda já as permissões de ${people(editingMembers)} com este cargo.`
                    : 'Depois de criado, escolhe-se no formulário de cada pessoa da equipa.'}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-1.5">
                <Label htmlFor="cargo-nome">Nome</Label>
                <Input id="cargo-nome" value={editing.name} maxLength={60} required onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Ex.: Caixa da loja do Huambo" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="cargo-descricao">O que faz</Label>
                <Textarea id="cargo-descricao" rows={2} maxLength={300} value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
              </div>
              <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Permissões do cargo</p>
                <PermissionSwitches value={editing.permissions} onChange={(permissions) => setEditing({ ...editing, permissions })} />
                <PermissionMenuPreview role="manager" permissions={editing.permissions} className="border-t pt-3" />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditing(null)} disabled={saving}>Cancelar</Button>
                <Button type="submit" disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Guardar</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!removing} onOpenChange={(open) => { if (!open) setRemoving(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar o cargo «{removing?.name}»?</AlertDialogTitle>
            <AlertDialogDescription>
              {state.members[removing?.id]
                ? `${people(state.members[removing.id])} com este cargo ficam com as mesmas permissões, sem cargo («personalizado»).`
                : 'Ninguém tem este cargo.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={remove}>Apagar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { LogOut, ShieldAlert, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabaseClient';

const MfaSettings = lazy(() => import('@/components/MfaSettings'));

/** A conta é da equipa (admin ou gestor): só a ela se exige o código. */
export const isStaffRole = (user) => user?.role === 'admin' || user?.role === 'manager';

/**
 * O que mostrar, a partir de `public.staff_mfa_status()` (migração dois_passos_obrigatorio_equipa):
 * - `none`: não é da equipa, já activou o código, ou não se sabe (sem a migração, sem rede);
 * - `notice`: falta activar, e ainda está dentro do prazo — aviso com a data;
 * - `gate`: o prazo passou — o servidor já trata a conta como a de um cliente, por isso o painel
 *   dá lugar ao ecrã de activação.
 */
export function staffMfaView(status) {
  if (!status || status.staff !== true || status.has_factor === true) return 'none';
  return status.enforced === true ? 'gate' : 'notice';
}

/** "quinta-feira, 27 de novembro", em hora de Luanda. Vazio sem data válida. */
export function formatDeadline(value) {
  const t = Date.parse(String(value || ''));
  if (!Number.isFinite(t)) return '';
  return new Date(t).toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Africa/Luanda' });
}

function MfaPanel({ onEnabled }) {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">A carregar…</p>}>
      <MfaSettings isStaff onEnabled={onEnabled} />
    </Suspense>
  );
}

/**
 * Verificação em dois passos obrigatória para a equipa, no painel (`/admin`) e no Painel de Gestão.
 *
 * A regra a sério está no servidor (private.mfa_satisfied e supabase/functions/app/mfa.ts): passado
 * o prazo, uma conta da equipa sem o código vale como a de um cliente. Este componente só torna isso
 * visível — antes do prazo, um aviso com a data; depois, em vez de um painel vazio a dar erros, o
 * ecrã para activar o código. `notice={false}` esconde o aviso (no modo TV, por exemplo).
 */
export default function StaffMfaGate({ children, notice = true }) {
  const { user, logout } = useAuth();
  const staff = isStaffRole(user);
  const [status, setStatus] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    if (!staff) {
      setStatus(null);
      return;
    }
    try {
      const { data, error } = await supabase.rpc('staff_mfa_status');
      setStatus(error ? null : data);
    } catch {
      setStatus(null);
    }
  }, [staff]);

  useEffect(() => {
    load();
  }, [load, user?.id]);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      // Fora do callback: o supabase-js não aceita chamadas ao cliente dentro dele.
      if (['SIGNED_IN', 'MFA_CHALLENGE_VERIFIED', 'USER_UPDATED'].includes(event)) setTimeout(load, 0);
    });
    return () => data?.subscription?.unsubscribe();
  }, [load]);

  const view = staffMfaView(status);
  const deadline = formatDeadline(status?.enforce_after);

  if (view === 'gate') {
    return (
      <main className="min-h-dvh bg-muted/40 px-4 py-10 flex items-start justify-center">
        <div className="w-full max-w-lg">
          <div className="rounded-xl border bg-card p-6">
            <h1 className="font-serif text-2xl font-bold flex items-center gap-2">
              <ShieldAlert className="h-6 w-6 text-primary" aria-hidden="true" />
              Active a verificação em dois passos
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              O painel da equipa só abre com o código de uma aplicação autenticadora no telemóvel (Google Authenticator,
              Microsoft Authenticator, 1Password…). É o que impede que uma palavra-passe roubada mude o IBAN, as
              permissões ou os dados da loja. Leva um minuto: leia o QR com a aplicação e escreva o código.
            </p>
          </div>
          {/* Activado o código, a sessão passa a aal2 e o painel abre de raiz, já com os dados. */}
          <MfaPanel onEnabled={() => window.location.reload()} />
          <Button type="button" variant="ghost" className="mt-4" onClick={() => logout()}>
            <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
            Sair da conta
          </Button>
        </div>
      </main>
    );
  }

  return (
    <>
      {children}
      {view === 'notice' && notice && !dismissed && (
        <div
          role="status"
          className="fixed bottom-4 left-4 z-40 w-[min(26rem,calc(100vw-2rem))] rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950 shadow-lg dark:border-amber-700 dark:bg-amber-950 dark:text-amber-50"
        >
          <button
            type="button"
            className="absolute right-2 top-2 rounded-full p-1 opacity-70 hover:opacity-100"
            onClick={() => setDismissed(true)}
            aria-label="Fechar o aviso"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
          <p className="pr-6 text-sm font-semibold flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
            Verificação em dois passos obrigatória
          </p>
          <p className="mt-1 text-sm">
            {deadline ? `A partir de ${deadline}` : 'Em breve'}, o painel só abre com o código da aplicação autenticadora.
            Active-a agora para não perder o acesso.
          </p>
          <Button type="button" size="sm" className="mt-3" onClick={() => setOpen(true)}>Activar agora</Button>
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Verificação em dois passos</DialogTitle>
            <DialogDescription>
              Leia o QR com a aplicação autenticadora do telemóvel e escreva o código de 6 algarismos.
            </DialogDescription>
          </DialogHeader>
          <MfaPanel onEnabled={() => { setOpen(false); load(); }} />
        </DialogContent>
      </Dialog>
    </>
  );
}

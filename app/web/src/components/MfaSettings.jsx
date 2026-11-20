import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, ShieldCheck, ShieldOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import {
  confirmTotpEnrollment, getMfaState, isTotpCode, mfaErrorMessage, normalizeTotpCode,
  removeTotpFactor, startTotpEnrollment,
} from '@/lib/mfa';

/**
 * Activar ou retirar a verificação em dois passos (aplicação autenticadora: Google
 * Authenticator, Microsoft Authenticator, 1Password…). Para a equipa é o que impede que uma
 * palavra-passe roubada abra o painel; para clientes é opcional.
 */
export default function MfaSettings({ isStaff = false, onEnabled }) {
  const { toast } = useToast();
  const [state, setState] = useState(null); // { verified: [...] }
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(null); // { factorId, qrCode, secret }
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setState(await getMfaState());
    } catch {
      setState(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const active = (state?.verified || [])[0];

  const start = async () => {
    setBusy(true);
    setError('');
    try {
      setEnrolling(await startTotpEnrollment());
      setCode('');
    } catch (err) {
      setError(mfaErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (event) => {
    event.preventDefault();
    const clean = normalizeTotpCode(code);
    if (!isTotpCode(clean)) {
      setError('O código tem 6 algarismos.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await confirmTotpEnrollment(enrolling.factorId, clean);
      setEnrolling(null);
      setCode('');
      toast({ title: 'Verificação em dois passos activada', description: 'Na próxima entrada vamos pedir o código da aplicação.' });
      await refresh();
      onEnabled?.();
    } catch (err) {
      setError(mfaErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setError('');
    try {
      await removeTotpFactor(active.id);
      setConfirmRemove(false);
      toast({ title: 'Verificação em dois passos retirada' });
      await refresh();
    } catch (err) {
      setError(mfaErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-card border rounded-xl p-6 max-w-lg mt-6">
      <h3 className="font-bold text-lg mb-1 flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
        Verificação em dois passos
      </h3>
      <p className="text-sm text-muted-foreground mb-4">
        {isStaff
          ? 'Obrigatória para a equipa: mesmo com a palavra-passe, ninguém entra no painel sem o código do seu telemóvel.'
          : 'Opcional: além da palavra-passe, a entrada pede um código da aplicação autenticadora do telemóvel.'}
      </p>

      {loading ? (
        <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />A verificar…</p>
      ) : active ? (
        <div className="space-y-3">
          <p className="text-sm">
            <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-emerald-700 dark:text-emerald-400 font-medium mr-2">Activa</span>
            {active.friendly_name || 'Aplicação autenticadora'}
          </p>
          {confirmRemove ? (
            <div className="rounded-lg border border-destructive/40 p-3 space-y-3">
              <p className="text-sm">Sem o segundo passo, basta a palavra-passe para entrar na conta. Retirar?</p>
              <div className="flex gap-2">
                <Button type="button" variant="destructive" size="sm" disabled={busy} onClick={remove}>
                  {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                  Retirar
                </Button>
                <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setConfirmRemove(false)}>Cancelar</Button>
              </div>
            </div>
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={() => setConfirmRemove(true)}>
              <ShieldOff className="mr-2 h-4 w-4" aria-hidden="true" />
              Retirar a verificação em dois passos
            </Button>
          )}
        </div>
      ) : enrolling ? (
        <form onSubmit={confirm} className="space-y-4" noValidate>
          <ol className="text-sm space-y-1 list-decimal pl-5 text-muted-foreground">
            <li>Na aplicação autenticadora, escolha adicionar conta e leia o código QR.</li>
            <li>Introduza abaixo o código de 6 algarismos que a aplicação mostrar.</li>
          </ol>
          {enrolling.qrCode && (
            <img src={enrolling.qrCode} alt="Código QR para a aplicação autenticadora" className="mx-auto h-44 w-44 rounded-lg border bg-white p-2" />
          )}
          <p className="text-xs text-muted-foreground break-all">
            Sem câmara? Escreva esta chave na aplicação: <code className="font-mono text-foreground">{enrolling.secret}</code>
          </p>
          <div className="space-y-2">
            <Label htmlFor="mfa-enroll-code">Código da aplicação</Label>
            <Input
              id="mfa-enroll-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              className="tracking-[0.3em] tabular-nums"
              value={code}
              onChange={(e) => setCode(normalizeTotpCode(e.target.value))}
              aria-invalid={!!error}
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={busy || code.length !== 6}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              Activar
            </Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={() => { setEnrolling(null); setError(''); }}>Cancelar</Button>
          </div>
        </form>
      ) : (
        <Button type="button" variant="outline" disabled={busy} onClick={start}>
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
          Activar com aplicação autenticadora
        </Button>
      )}

      {error && <p role="alert" className="text-sm text-destructive mt-3">{error}</p>}
    </div>
  );
}

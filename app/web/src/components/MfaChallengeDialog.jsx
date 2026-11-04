import React, { useState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { isTotpCode, mfaErrorMessage, normalizeTotpCode, verifyTotp } from '@/lib/mfa';

/**
 * O ecrã do código, carregado só quando é preciso (ver MfaGate): o diálogo e os ícones
 * pesavam ~10 KB gzip na página inicial de todos os visitantes, para um ecrã que só quem
 * activou a verificação em dois passos chega a ver.
 */
export default function MfaChallengeDialog({ factorId, onVerified, onLogout }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    const clean = normalizeTotpCode(code);
    if (!isTotpCode(clean)) {
      setError('O código tem 6 algarismos.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await verifyTotp(factorId, clean);
      setCode('');
      onVerified();
    } catch (err) {
      setError(mfaErrorMessage(err));
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent
        className="max-w-sm [&>button:last-child]:hidden"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </div>
          <DialogTitle className="text-center">Verificação em dois passos</DialogTitle>
          <DialogDescription className="text-center">
            Abra a aplicação autenticadora no telemóvel e introduza o código de 6 algarismos da Livraria.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="mfa-code">Código</Label>
            <Input
              id="mfa-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              placeholder="000000"
              className="text-center text-lg tracking-[0.4em] tabular-nums"
              value={code}
              onChange={(e) => setCode(normalizeTotpCode(e.target.value))}
              aria-invalid={!!error}
              aria-describedby={error ? 'mfa-code-error' : undefined}
            />
            {error && <p id="mfa-code-error" role="alert" className="text-sm text-destructive">{error}</p>}
          </div>
          <Button type="submit" className="w-full" disabled={busy || code.length !== 6}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            Confirmar
          </Button>
          <Button type="button" variant="ghost" className="w-full" disabled={busy} onClick={onLogout}>
            Sair da conta
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

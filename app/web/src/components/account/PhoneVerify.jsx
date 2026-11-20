// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { useEffect, useState } from 'react';
import { BadgeCheck, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { useToast } from '@/hooks/use-toast';
import { isValidAngolaPhone, normalizeAngolaPhone } from '@/lib/angolaPhone';
import pb from '@/lib/dataClient';

/**
 * Confirmar o telefone da conta com um código por SMS (docs/SMS.md). Está dentro do formulário do
 * perfil: os botões são `type="button"` e o Enter no código não grava o formulário. Sem o SMS ligado
 * não aparece nada, a não ser que o telefone já esteja confirmado.
 */
export default function PhoneVerify({ phone, user, onConfirmed }) {
  const { toast } = useToast();
  const [available, setAvailable] = useState(false);
  const [sent, setSent] = useState(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(0);

  useEffect(() => {
    let live = true;
    pb.send('/messaging/status').then((s) => { if (live) setAvailable(!!s?.sms?.otp); }).catch(() => {});
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (waiting <= 0) return undefined;
    const timer = setTimeout(() => setWaiting((n) => n - 1), 1000);
    return () => clearTimeout(timer);
  }, [waiting]);

  const current = normalizeAngolaPhone(phone);
  // O número mudou depois de pedir o código: o código era para o outro.
  useEffect(() => { setSent(null); setCode(''); }, [current]);

  const confirmed = !!user?.phone_verified_at && current === normalizeAngolaPhone(user?.phone);
  if (confirmed) {
    return (
      <p className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
        <BadgeCheck className="h-4 w-4" aria-hidden="true" />Telefone confirmado
      </p>
    );
  }
  if (!available) return null;

  const send = async () => {
    setBusy(true);
    try {
      const res = await pb.send('/conta/telefone/enviar', { method: 'POST', body: { phone: current } });
      setSent(res);
      setCode('');
      setWaiting(res.retry_after || 60);
    } catch (err) {
      toast({ variant: 'destructive', title: 'Não foi possível enviar o código', description: err.message });
    } finally {
      setBusy(false);
    }
  };

  const check = async (value) => {
    setBusy(true);
    try {
      const res = await pb.send('/conta/telefone/confirmar', { method: 'POST', body: { code: value } });
      setSent(null);
      setCode('');
      toast({ title: res.message });
      await onConfirmed?.(res.phone);
    } catch (err) {
      setCode('');
      toast({ variant: 'destructive', title: 'Não foi possível confirmar', description: err.message });
    } finally {
      setBusy(false);
    }
  };

  if (!sent) {
    return (
      <Button type="button" size="sm" variant="outline" disabled={busy || !isValidAngolaPhone(phone)} onClick={send}>
        {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}
        Confirmar por SMS
      </Button>
    );
  }

  return (
    <div className="space-y-2 rounded-lg bg-muted/40 p-3">
      <p className="text-xs text-muted-foreground">{sent.message} Vale {sent.expires_minutes} minutos.</p>
      <InputOTP
        maxLength={6}
        value={code}
        onChange={setCode}
        onComplete={check}
        disabled={busy}
        inputMode="numeric"
        autoComplete="one-time-code"
        aria-label="Código recebido por SMS"
        onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
      >
        <InputOTPGroup>
          {[0, 1, 2, 3, 4, 5].map((i) => <InputOTPSlot key={i} index={i} />)}
        </InputOTPGroup>
      </InputOTP>
      <Button type="button" size="sm" variant="ghost" className="h-8 px-2 text-xs" disabled={busy || waiting > 0} onClick={send}>
        {waiting > 0 ? `Pedir outro código daqui a ${waiting} s` : 'Pedir outro código'}
      </Button>
    </div>
  );
}

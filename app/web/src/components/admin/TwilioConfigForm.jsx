import React, { useEffect, useState } from 'react';
import { Loader2, Play, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import PhoneInput from '@/components/PhoneInput';
import { useToast } from '@/hooks/use-toast';
import pb from '@/lib/dataClient';

const CHANNELS = [
  { key: 'otp', label: 'Códigos de confirmação do telefone', hint: 'Na conta do cliente: «Confirmar por SMS».', fallback: true },
  { key: 'orders', label: 'Passos da encomenda', hint: 'Paga, expedida e a caminho, quando o WhatsApp não foi.' },
  { key: 'colporteurs', label: 'Avisos aos colportores', hint: 'Ofertas de entrega, quando o WhatsApp não foi.' },
  { key: 'staff', label: 'Avisos urgentes à equipa', hint: 'Só os urgentes, quando o WhatsApp não foi.' },
];

/**
 * Twilio (docs/SMS.md). As credenciais não passam por aqui: são os segredos TWILIO_ACCOUNT_SID e
 * TWILIO_AUTH_TOKEN da Edge Function. Aqui ficam o remetente, o que vai por SMS e o teto diário, que
 * protege o saldo.
 */
export default function TwilioConfigForm({ app, onSave }) {
  const cfg = app.config || {};
  const { toast } = useToast();
  const [sender, setSender] = useState(cfg.sender || '');
  const [verifyService, setVerifyService] = useState(cfg.verify_service || '');
  const [flags, setFlags] = useState(() => Object.fromEntries(CHANNELS.map((c) => [c.key, cfg[c.key] ?? !!c.fallback])));
  const [dailyLimit, setDailyLimit] = useState(String(cfg.daily_limit ?? 50));
  const [state, setState] = useState(null);
  const [saving, setSaving] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  const [testing, setTesting] = useState(false);

  const loadState = async () => {
    try {
      setState(await pb.send('/admin/sms/estado'));
    } catch (err) {
      setState({ configured: false, error: err.message });
    }
  };
  useEffect(() => { loadState(); }, []);

  const config = () => ({ sender: sender.trim(), verify_service: verifyService.trim(), ...flags, daily_limit: Math.max(1, Number(dailyLimit) || 50) });

  const save = async () => {
    setSaving(true);
    try {
      await onSave(app, config());
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    try {
      await onSave(app, config());
      const res = await pb.send('/admin/sms/teste', { method: 'POST', body: { phone: testPhone } });
      toast({ title: 'Teste enviado', description: res.message });
      loadState();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Teste falhou', description: err.message });
    } finally {
      setTesting(false);
    }
  };

  const codesOff = flags.otp && !/^VA[0-9a-f]{32}$/i.test(verifyService.trim());
  const noBalance = state?.ok && state.balance != null && Number(state.balance) <= 0;

  return (
    <div className="space-y-4 rounded-lg border bg-muted/30 p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-background p-3" aria-live="polite">
        {!state ? (
          <span className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />A ver o saldo…</span>
        ) : !state.configured ? (
          <span className="text-destructive">{state.error || 'Faltam os segredos TWILIO_ACCOUNT_SID e TWILIO_AUTH_TOKEN da Edge Function.'}</span>
        ) : !state.ok ? (
          <span className="text-destructive">{state.error}</span>
        ) : (
          <span>
            {state.balance != null
              ? <strong className="font-semibold tabular-nums">{Number(state.balance).toFixed(2)} {state.currency}</strong>
              : <span className="text-muted-foreground">Ligada à Twilio. Saldo indisponível.</span>}
            {state.account_type === 'Trial' && (
              <span className="mt-1 block text-xs font-medium text-amber-700 dark:text-amber-400">Conta de teste: só envia para números verificados na Twilio.</span>
            )}
            {noBalance && <span className="mt-1 block text-xs font-medium text-destructive">Sem saldo, nenhuma SMS sai. Carregue a conta na Twilio.</span>}
          </span>
        )}
        <Button type="button" size="sm" variant="ghost" className="h-8" onClick={loadState} aria-label="Actualizar o saldo"><RefreshCw className="h-3.5 w-3.5" /></Button>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="sms-sender" className="text-xs">Remetente dos avisos</Label>
        <Input id="sms-sender" className="max-w-xs" maxLength={40} value={sender} onChange={(e) => setSender(e.target.value)} placeholder="LivrariaAdv" />
        <p className="text-xs text-muted-foreground">
          Até 11 letras e números, sem precisar de registo em Angola; ou um número da Twilio, ou um serviço de mensagens (MG…). Vazio: LivrariaAdv.
          {' '}Ligue Angola em <a href="https://console.twilio.com/us1/develop/sms/settings/geo-permissions" target="_blank" rel="noreferrer" className="text-primary underline">Geo Permissions</a>, senão as SMS são recusadas.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="sms-verify" className="text-xs">Serviço Verify, para os códigos</Label>
        <Input id="sms-verify" className="max-w-md font-mono text-xs" maxLength={34} value={verifyService} onChange={(e) => setVerifyService(e.target.value)} placeholder="VA…" />
        <p className="text-xs text-muted-foreground">
          {codesOff ? <strong className="font-medium text-destructive">Sem um serviço válido (VA seguido de 32 caracteres), os códigos não saem. </strong> : null}
          A Twilio Verify gera os códigos, conta as tentativas e protege contra fraude. Os avisos saem pelo remetente acima.
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium">O que vai por SMS</p>
        {CHANNELS.map((c) => (
          <label key={c.key} className="flex items-start justify-between gap-3">
            <span>
              <span className="block">{c.label}</span>
              <span className="block text-xs text-muted-foreground">{c.hint}</span>
            </span>
            <Switch checked={!!flags[c.key]} onCheckedChange={(v) => setFlags((f) => ({ ...f, [c.key]: v }))} aria-label={c.label} />
          </label>
        ))}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="sms-limit" className="text-xs">Teto de SMS por dia</Label>
        <Input id="sms-limit" className="max-w-[8rem]" type="number" min={1} max={5000} value={dailyLimit} onChange={(e) => setDailyLimit(e.target.value)} />
        <p className="text-xs text-muted-foreground">Protege o saldo: passado o teto, nenhuma SMS sai até ao dia seguinte, e fica no registo de envios. Veja o preço para Angola na Twilio antes de o subir.</p>
      </div>

      <Button type="button" size="sm" onClick={save} disabled={saving}>
        {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}Guardar
      </Button>

      <div className="space-y-1.5 border-t pt-3">
        <Label className="text-xs">Enviar uma SMS de teste</Label>
        <div className="flex flex-wrap gap-2">
          <PhoneInput className="max-w-xs" value={testPhone} onChange={setTestPhone} />
          <Button type="button" size="sm" variant="outline" onClick={test} disabled={testing || !testPhone.trim()}>
            {testing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1.5 h-3.5 w-3.5" />}Testar
          </Button>
        </div>
      </div>
    </div>
  );
}

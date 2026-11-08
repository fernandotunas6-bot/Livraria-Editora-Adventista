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
  { key: 'colporteurs', label: 'Avisos aos colportores', hint: 'Ofertas de entrega, quando o WhatsApp não foi. Até 2 partes.' },
  { key: 'staff', label: 'Avisos urgentes à equipa', hint: 'Só os urgentes, quando o WhatsApp não foi. Até 2 partes.' },
];

/**
 * PRO2SMS (docs/SMS.md). A chave não passa por aqui: é o segredo PRO2SMS_API_KEY da Edge Function.
 * Aqui ficam o remetente, o que vai por SMS e o teto diário, que protege o saldo.
 */
export default function Pro2SmsConfigForm({ app, onSave }) {
  const cfg = app.config || {};
  const { toast } = useToast();
  const [sender, setSender] = useState(cfg.sender || '');
  const [flags, setFlags] = useState(() => Object.fromEntries(CHANNELS.map((c) => [c.key, cfg[c.key] ?? !!c.fallback])));
  const [dailyLimit, setDailyLimit] = useState(String(cfg.daily_limit ?? 200));
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

  const config = () => ({ sender: sender.trim(), ...flags, daily_limit: Math.max(1, Number(dailyLimit) || 200) });

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

  const noBalance = state?.ok && state.balance != null && Number(state.balance) <= 0;

  return (
    <div className="space-y-4 rounded-lg border bg-muted/30 p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-background p-3" aria-live="polite">
        {!state ? (
          <span className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />A ver o saldo…</span>
        ) : !state.configured ? (
          <span className="text-destructive">{state.error || 'Falta a chave: o segredo PRO2SMS_API_KEY da Edge Function.'}</span>
        ) : !state.ok ? (
          <span className="text-destructive">{state.error}</span>
        ) : (
          <span>
            <strong className="font-semibold tabular-nums">{state.balance_formatted || `${state.balance} Kz`}</strong>
            {state.sms_estimated != null && <span className="text-muted-foreground"> · cerca de {state.sms_estimated} SMS</span>}
            {state.price_per_sms != null && <span className="text-muted-foreground"> · {state.price_per_sms} Kz por SMS</span>}
            {noBalance && <span className="mt-1 block text-xs font-medium text-destructive">Sem saldo, nenhuma SMS sai. Carregue a conta em pro2sms.ao.</span>}
          </span>
        )}
        <Button type="button" size="sm" variant="ghost" className="h-8" onClick={loadState} aria-label="Actualizar o saldo"><RefreshCw className="h-3.5 w-3.5" /></Button>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="sms-sender" className="text-xs">Remetente</Label>
        <Input id="sms-sender" className="max-w-xs" maxLength={11} value={sender} onChange={(e) => setSender(e.target.value)} placeholder="Vazio: o da chave, ou INFO" />
        <p className="text-xs text-muted-foreground">
          Só um remetente aprovado na{' '}
          <a href="https://pro2sms.ao/area-do-cliente/?p2s_tab=sender_ids#sender-id-request" target="_blank" rel="noreferrer" className="text-primary underline">sua conta da PRO2SMS</a>.
          {' '}Um por aprovar faz as SMS falharem.
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
        <p className="text-xs text-muted-foreground">Protege o saldo: passado o teto, nenhuma SMS sai até ao dia seguinte, e fica no registo de envios.</p>
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

import React, { useEffect, useState } from 'react';
import { Loader2, Play, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import PhoneInput from '@/components/PhoneInput';
import { NativeSelect } from '@/components/admin/igreja/registryUi';
import { useToast } from '@/hooks/use-toast';
import pb from '@/lib/dataClient';

const CHANNELS = [
  { key: 'otp', label: 'Códigos de confirmação do telefone', hint: 'Na conta do cliente: «Confirmar por SMS».', fallback: true },
  { key: 'orders', label: 'Passos da encomenda', hint: 'Paga, expedida e a caminho, quando o WhatsApp não foi.' },
  { key: 'colporteurs', label: 'Avisos aos colportores', hint: 'Ofertas de entrega, quando o WhatsApp não foi.' },
  { key: 'staff', label: 'Avisos urgentes à equipa', hint: 'Só os urgentes, quando o WhatsApp não foi.' },
];

const SECRETS = {
  pro2sms: 'PRO2SMS_API_KEY',
  twilio: 'TWILIO_ACCOUNT_SID e TWILIO_AUTH_TOKEN',
};
const NAMES = { pro2sms: 'PRO2SMS', twilio: 'Twilio' };

function Pro2smsBalance({ status }) {
  return (
    <>
      <strong className="font-semibold tabular-nums">{status.balance_formatted || `${status.balance ?? 0} Kz`}</strong>
      {status.sms_estimated != null && <span className="text-muted-foreground"> · cerca de {status.sms_estimated} SMS</span>}
      {status.price_per_sms != null && <span className="text-muted-foreground"> · {status.price_per_sms} Kz por SMS</span>}
    </>
  );
}

function TwilioBalance({ status }) {
  return (
    <>
      {status.balance != null
        ? <strong className="font-semibold tabular-nums">{Number(status.balance).toFixed(2)} {status.currency}</strong>
        : <span className="text-muted-foreground">Ligada. Saldo indisponível.</span>}
      {status.account_type === 'Trial' && (
        <span className="mt-0.5 block text-xs font-medium text-amber-700 dark:text-amber-400">Conta de teste: só envia para números verificados na Twilio.</span>
      )}
    </>
  );
}

/** Uma linha por serviço: o saldo, ou o que falta para funcionar. */
function ProviderStatus({ provider, status }) {
  const empty = status?.ok && status.balance != null && Number(status.balance) <= 0;
  return (
    <div>
      <span className="text-xs font-medium">{NAMES[provider]}: </span>
      {!status?.configured ? (
        <span className="text-muted-foreground">falta o segredo {SECRETS[provider]}.</span>
      ) : !status.ok ? (
        <span className="text-destructive">{status.error}</span>
      ) : provider === 'pro2sms' ? <Pro2smsBalance status={status} /> : <TwilioBalance status={status} />}
      {empty && <span className="mt-0.5 block text-xs font-medium text-destructive">Sem saldo, nenhuma SMS sai por este serviço.</span>}
    </div>
  );
}

/**
 * SMS pela PRO2SMS e pela Twilio (docs/SMS.md). As credenciais não passam por aqui: são segredos da
 * Edge Function. Aqui escolhe-se quem envia os códigos e os avisos, os remetentes, o que vai por SMS e
 * o teto diário, que protege o saldo.
 */
export default function SmsConfigForm({ app, onSave }) {
  const cfg = app.config || {};
  const { toast } = useToast();
  const [codesProvider, setCodesProvider] = useState(cfg.codes_provider === 'pro2sms' ? 'pro2sms' : 'twilio');
  const [noticesProvider, setNoticesProvider] = useState(cfg.notices_provider === 'twilio' ? 'twilio' : 'pro2sms');
  const [pro2smsSender, setPro2smsSender] = useState(cfg.pro2sms_sender || '');
  const [twilioSender, setTwilioSender] = useState(cfg.twilio_sender || '');
  const [verifyService, setVerifyService] = useState(cfg.verify_service || '');
  const [flags, setFlags] = useState(() => Object.fromEntries(CHANNELS.map((c) => [c.key, cfg[c.key] ?? !!c.fallback])));
  const [dailyLimit, setDailyLimit] = useState(String(cfg.daily_limit ?? 50));
  const [state, setState] = useState(null);
  const [saving, setSaving] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  const [testing, setTesting] = useState('');

  const loadState = async () => {
    try {
      setState(await pb.send('/admin/sms/estado'));
    } catch (err) {
      setState({ error: err.message });
    }
  };
  useEffect(() => { loadState(); }, []);

  const config = () => ({
    codes_provider: codesProvider,
    notices_provider: noticesProvider,
    pro2sms_sender: pro2smsSender.trim(),
    twilio_sender: twilioSender.trim(),
    verify_service: verifyService.trim(),
    ...flags,
    daily_limit: Math.max(1, Number(dailyLimit) || 50),
  });

  const save = async () => {
    setSaving(true);
    try {
      await onSave(app, config());
    } finally {
      setSaving(false);
    }
  };

  const test = async (provider) => {
    setTesting(provider);
    try {
      await onSave(app, config());
      const res = await pb.send('/admin/sms/teste', { method: 'POST', body: { phone: testPhone, provider } });
      toast({ title: 'Teste enviado', description: res.message });
      loadState();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Teste falhou', description: err.message });
    } finally {
      setTesting('');
    }
  };

  const codesOff = flags.otp && codesProvider === 'twilio' && !/^VA[0-9a-f]{32}$/i.test(verifyService.trim());
  // O escolhido sem credenciais não salta para o outro serviço: avisa-se aqui.
  const missing = (provider) => state && !state.error && !state[provider]?.configured;

  return (
    <div className="space-y-4 rounded-lg border bg-muted/30 p-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2 rounded-lg bg-background p-3" aria-live="polite">
        {!state ? (
          <span className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />A ver os saldos…</span>
        ) : state.error ? (
          <span className="text-destructive">{state.error}</span>
        ) : (
          <div className="space-y-1.5">
            <ProviderStatus provider="pro2sms" status={state.pro2sms} />
            <ProviderStatus provider="twilio" status={state.twilio} />
          </div>
        )}
        <Button type="button" size="sm" variant="ghost" className="h-8" onClick={loadState} aria-label="Actualizar os saldos"><RefreshCw className="h-3.5 w-3.5" /></Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="sms-codes" className="text-xs">Quem envia os códigos</Label>
          <NativeSelect id="sms-codes" value={codesProvider} onChange={setCodesProvider}>
            <option value="twilio">Twilio Verify</option>
            <option value="pro2sms">PRO2SMS</option>
          </NativeSelect>
          {missing(codesProvider) && <p className="text-xs font-medium text-destructive">Falta o segredo {SECRETS[codesProvider]}: os códigos não saem.</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sms-notices" className="text-xs">Quem envia os avisos</Label>
          <NativeSelect id="sms-notices" value={noticesProvider} onChange={setNoticesProvider}>
            <option value="pro2sms">PRO2SMS</option>
            <option value="twilio">Twilio</option>
          </NativeSelect>
          {missing(noticesProvider) && <p className="text-xs font-medium text-destructive">Falta o segredo {SECRETS[noticesProvider]}: os avisos não saem.</p>}
        </div>
        <p className="text-xs text-muted-foreground sm:col-span-2">
          Para Angola, a Twilio custa cerca de 25 vezes mais por SMS, e a Verify traz protecção contra fraude. Se o serviço escolhido falhar, a SMS não passa para o outro.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="sms-pro2sms-sender" className="text-xs">Remetente na PRO2SMS</Label>
        <Input id="sms-pro2sms-sender" className="max-w-xs" maxLength={11} value={pro2smsSender} onChange={(e) => setPro2smsSender(e.target.value)} placeholder="Vazio: o da chave, ou INFO" />
        <p className="text-xs text-muted-foreground">
          Só um remetente aprovado na{' '}
          <a href="https://pro2sms.ao/area-do-cliente/?p2s_tab=sender_ids#sender-id-request" target="_blank" rel="noreferrer" className="text-primary underline">sua conta da PRO2SMS</a>.
          {' '}Um por aprovar faz as SMS falharem.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="sms-twilio-sender" className="text-xs">Remetente na Twilio</Label>
        <Input id="sms-twilio-sender" className="max-w-xs" maxLength={40} value={twilioSender} onChange={(e) => setTwilioSender(e.target.value)} placeholder="LivrariaAdv" />
        <p className="text-xs text-muted-foreground">
          Até 11 letras e números, sem precisar de registo em Angola; ou um número da Twilio, ou um serviço de mensagens (MG…). Vazio: LivrariaAdv.
          {' '}Ligue Angola em <a href="https://console.twilio.com/us1/develop/sms/settings/geo-permissions" target="_blank" rel="noreferrer" className="text-primary underline">Geo Permissions</a>, senão as SMS são recusadas.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="sms-verify" className="text-xs">Serviço Twilio Verify</Label>
        <Input id="sms-verify" className="max-w-md font-mono text-xs" maxLength={34} value={verifyService} onChange={(e) => setVerifyService(e.target.value)} placeholder="VA…" />
        <p className="text-xs text-muted-foreground">
          {codesOff ? <strong className="font-medium text-destructive">Sem um serviço válido (VA seguido de 32 caracteres), os códigos não saem. </strong> : null}
          Só para os códigos pela Twilio: gera os códigos, conta as tentativas e protege contra fraude.
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
        <p className="text-xs text-muted-foreground">Para toda a loja, nos dois serviços. Protege o saldo: passado o teto, nenhuma SMS sai até ao dia seguinte, e fica no registo de envios.</p>
      </div>

      <Button type="button" size="sm" onClick={save} disabled={saving}>
        {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}Guardar
      </Button>

      <div className="space-y-1.5 border-t pt-3">
        <Label className="text-xs">Enviar uma SMS de teste</Label>
        <div className="flex flex-wrap gap-2">
          <PhoneInput className="max-w-xs" value={testPhone} onChange={setTestPhone} />
          {['pro2sms', 'twilio'].map((provider) => (
            <Button key={provider} type="button" size="sm" variant="outline" onClick={() => test(provider)} disabled={!!testing || !testPhone.trim()}>
              {testing === provider ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1.5 h-3.5 w-3.5" />}Testar {NAMES[provider]}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}

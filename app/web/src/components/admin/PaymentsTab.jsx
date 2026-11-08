import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Plus, Loader2, Pencil, Trash2, CreditCard, ArrowUp, ArrowDown, AlertTriangle, RefreshCw, Banknote, Landmark, QrCode,
  Copy, Zap,
} from 'lucide-react';
import pb from '@/lib/dataClient';
import { supabase } from '@/lib/supabaseClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import ImageField from '@/components/admin/ImageField';
import { useIntegrations } from '@/hooks/useIntegrations';
import { pbErrorMessage, saveRecordWithMedia } from '@/lib/mediaSave';

const empty = { name: '', code: '', type: 'p2p', enabled: true, instructions: '', account_info: '', payment_link: '', qr_url: '', icon: '', sort_order: 0, shipping_methods: [], gateway_provider: '' };

// Envios em que cada método aparece no checkout (payment_methods.shipping_methods). Nenhum marcado = todos.
const SHIPPING_OPTIONS = [
  { value: 'delivery', label: 'Entrega ao domicílio' },
  { value: 'express', label: 'Entrega expressa' },
  { value: 'pickup', label: 'Levantamento na loja' },
];

const TYPE_LABELS = {
  p2p: { label: 'P2P (referência/QR)', icon: QrCode },
  transfer: { label: 'Transferência', icon: Landmark },
  offline: { label: 'Pagamento na entrega / balcão', icon: Banknote },
};

/** Códigos com significado próprio no servidor: não devem ser renomeados. */
const RESERVED_CODES = { entrega: 'Pagamento na entrega', transferencia: 'Transferência bancária' };

/** Código estável e legível: minúsculas, números, "_" e "-". */
function normalizeCode(value) {
  return String(value || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

export default function PaymentsTab() {
  const { toast } = useToast();
  const [methods, setMethods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [qrFile, setQrFile] = useState(null);
  const [qrRemoved, setQrRemoved] = useState(false);
  const [hadQrFile, setHadQrFile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const { driveImageConfig } = useIntegrations();
  // Estado do gateway de pagamentos (Edge Function): ligado, fornecedor, endereço do webhook.
  const [gateway, setGateway] = useState(null);
  useEffect(() => {
    let alive = true;
    pb.send('/admin/payments/gateway').then((g) => { if (alive) setGateway(g); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const list = await pb.collection('payment_methods').getFullList({ sort: 'sort_order,created' });
      setMethods(list);
    } catch (err) {
      setMethods([]);
      setLoadError(pbErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const duplicateCodes = useMemo(() => {
    const seen = new Map();
    methods.forEach((m) => seen.set(m.code, (seen.get(m.code) || 0) + 1));
    return new Set([...seen].filter(([, n]) => n > 1).map(([code]) => code));
  }, [methods]);
  const activeCount = methods.filter((m) => m.enabled).length;

  const openNew = () => {
    setEditing(null);
    const nextOrder = methods.reduce((max, m) => Math.max(max, Number(m.sort_order) || 0), 0) + 1;
    setForm({ ...empty, sort_order: nextOrder });
    setQrFile(null); setQrRemoved(false); setHadQrFile(false); setShowForm(true);
  };
  const openEdit = (m) => {
    setEditing(m);
    setHadQrFile(!!m.qr_code);
    setQrRemoved(false);
    setQrFile(null);
    setForm({
      name: m.name, code: m.code, type: m.type || 'p2p', enabled: !!m.enabled,
      instructions: m.instructions || '', account_info: m.account_info || '',
      payment_link: m.payment_link || '',
      qr_url: m.qr_url || (m.qr_code ? pb.files.getURL(m, m.qr_code) : ''),
      icon: m.icon || '', sort_order: m.sort_order ?? 0,
      shipping_methods: Array.isArray(m.shipping_methods) ? m.shipping_methods : [],
      gateway_provider: m.gateway_provider || '',
    });
    setShowForm(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const code = normalizeCode(form.code || form.name);
    if (!form.name.trim()) {
      toast({ variant: 'destructive', title: 'Indique o nome do método.' });
      return;
    }
    if (!code) {
      toast({ variant: 'destructive', title: 'Código inválido', description: 'Use letras, números, "_" ou "-".' });
      return;
    }
    if (methods.some((m) => m.code === code && m.id !== editing?.id)) {
      toast({ variant: 'destructive', title: 'Código repetido', description: `Já existe um método com o código "${code}".` });
      return;
    }
    if (editing && RESERVED_CODES[editing.code] && code !== editing.code) {
      toast({
        variant: 'destructive',
        title: 'Código reservado',
        description: `O código "${editing.code}" é usado pela finalização da compra e não pode ser alterado. Desactive o método em vez disso.`,
      });
      return;
    }
    if (form.payment_link.trim() && !/^https:\/\/\S+$/.test(form.payment_link.trim())) {
      toast({ variant: 'destructive', title: 'Link de pagamento inválido', description: 'Tem de começar por https://' });
      return;
    }
    setSaving(true);
    try {
      const data = {
        ...form,
        name: form.name.trim(),
        code,
        instructions: form.instructions.trim(),
        account_info: form.account_info.trim(),
        payment_link: form.payment_link.trim(),
        sort_order: Number(form.sort_order) || 0,
        enabled: !!form.enabled,
        // Nenhum envio marcado = serve para todos (null na base de dados).
        shipping_methods: form.shipping_methods?.length ? form.shipping_methods : null,
        // Confirmado pelo gateway (webhook) ou pela equipa. Só letras, algarismos e _ (regra da base).
        gateway_provider: String(form.gateway_provider || '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 30),
      };
      // A coluna só existe depois da migração 20261106050000; antes, enviá-la partia a gravação.
      if (!methods.some((m) => 'shipping_methods' in m)) delete data.shipping_methods;
      await saveRecordWithMedia({
        collection: 'payment_methods',
        recordId: editing?.id,
        data,
        file: qrFile,
        fileField: 'qr_code',
        urlField: 'qr_url',
        removed: qrRemoved,
        hadFile: hadQrFile,
      });
      toast({ title: editing ? 'Método actualizado' : 'Método criado' });
      setShowForm(false);
      load();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Erro ao guardar', description: pbErrorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  const toggleEnabled = async (m, enabled) => {
    if (!enabled && m.enabled && activeCount === 1) {
      toast({
        title: 'Último método activo',
        description: 'Sem métodos activos, a finalização da compra aceita apenas "Pagamento na entrega".',
      });
    }
    setBusyId(m.id);
    setMethods((prev) => prev.map((x) => (x.id === m.id ? { ...x, enabled } : x)));
    try {
      await pb.collection('payment_methods').update(m.id, { enabled });
    } catch (err) {
      setMethods((prev) => prev.map((x) => (x.id === m.id ? { ...x, enabled: m.enabled } : x)));
      toast({ variant: 'destructive', title: 'Não foi possível alterar', description: pbErrorMessage(err) });
    } finally {
      setBusyId(null);
    }
  };

  // Reordena trocando de lugar com o vizinho e renumerando a lista (1, 2, 3…),
  // o que também corrige ordens repetidas.
  const move = async (index, delta) => {
    const target = index + delta;
    if (target < 0 || target >= methods.length) return;
    const reordered = [...methods];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    const withOrder = reordered.map((m, i) => ({ ...m, sort_order: i + 1 }));
    const before = new Map(methods.map((m) => [m.id, Number(m.sort_order)]));
    const changed = withOrder.filter((m) => before.get(m.id) !== m.sort_order);
    setMethods(withOrder);
    setBusyId(methods[index].id);
    try {
      await Promise.all(changed.map((m) => pb.collection('payment_methods').update(m.id, { sort_order: m.sort_order })));
    } catch (err) {
      toast({ variant: 'destructive', title: 'Não foi possível reordenar', description: pbErrorMessage(err) });
      load();
    } finally {
      setBusyId(null);
    }
  };

  const askDelete = async (m) => {
    let usedIn = null;
    try {
      const { count, error } = await supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('payment_method_code', m.code);
      if (!error) usedIn = count || 0;
    } catch {
      usedIn = null;
    }
    setToDelete({ method: m, usedIn });
  };

  const confirmDelete = async () => {
    const m = toDelete?.method;
    if (!m) return;
    setBusyId(m.id);
    try {
      await pb.collection('payment_methods').delete(m.id);
      toast({ title: 'Método eliminado' });
      load();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Não foi possível eliminar', description: pbErrorMessage(err) });
    } finally {
      setBusyId(null);
      setToDelete(null);
    }
  };

  const deactivateInstead = async () => {
    const m = toDelete?.method;
    setToDelete(null);
    if (m) await toggleEnabled(m, false);
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  const codePreview = normalizeCode(form.code || form.name);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
        <div>
          <h3 className="font-bold text-lg">Métodos de pagamento</h3>
          <p className="text-sm text-muted-foreground">
            Multicaixa, Unitel Money, transferência, pagamento na entrega… A ordem aqui é a ordem no checkout.
          </p>
        </div>
        <Button className="btn-primary" onClick={openNew}><Plus className="h-4 w-4 mr-2" /> Novo método</Button>
      </div>

      {loadError && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <span className="text-destructive">Não foi possível carregar os métodos: {loadError}</span>
          <Button size="sm" variant="outline" onClick={load}><RefreshCw className="h-4 w-4 mr-1" /> Tentar de novo</Button>
        </div>
      )}

      {!loadError && methods.length > 0 && activeCount === 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>Nenhum método está activo. A finalização da compra aceita apenas "Pagamento na entrega" até activar um método.</span>
        </div>
      )}

      <GatewayCard gateway={gateway} />

      {duplicateCodes.size > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            Há métodos com o mesmo código ({[...duplicateCodes].join(', ')}). O checkout usa só um deles:
            elimine os repetidos ou dê-lhes um código diferente.
          </span>
        </div>
      )}

      <div className="grid gap-3">
        {methods.map((m, i) => {
          const TypeIcon = TYPE_LABELS[m.type]?.icon || CreditCard;
          return (
            <div key={m.id} className={`flex flex-wrap sm:flex-nowrap items-center gap-3 sm:gap-4 bg-card border rounded-xl p-4 ${m.enabled ? '' : 'opacity-70'}`}>
              <div className="flex flex-col">
                <Button variant="ghost" size="icon" className="h-6 w-6" disabled={i === 0 || !!busyId} onClick={() => move(i, -1)} aria-label="Subir">
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-6 w-6" disabled={i === methods.length - 1 || !!busyId} onClick={() => move(i, 1)} aria-label="Descer">
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="h-10 w-10 rounded-lg bg-marca/10 flex items-center justify-center shrink-0">
                <TypeIcon className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold flex flex-wrap items-center gap-2">
                  {m.name}
                  <code className="text-xs text-muted-foreground">{m.code}</code>
                  {duplicateCodes.has(m.code) && <Badge variant="outline" className="text-amber-600 border-amber-500/40">código repetido</Badge>}
                  {RESERVED_CODES[m.code] && <Badge variant="secondary">sistema</Badge>}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {TYPE_LABELS[m.type]?.label || m.type}
                  {m.account_info ? ` · ${m.account_info}` : ''}
                  {Array.isArray(m.shipping_methods) && m.shipping_methods.length
                    ? ` · só ${m.shipping_methods.map((v) => SHIPPING_OPTIONS.find((o) => o.value === v)?.label.toLowerCase() || v).join(', ')}`
                    : ''}
                  {(m.qr_url || m.qr_code) ? ' · com QR' : ''}
                  {m.payment_link ? ' · com link de pagamento' : ''}
                  {m.gateway_provider ? ' · confirmação automática (gateway)' : ' · a equipa confirma'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={!!m.enabled}
                  disabled={busyId === m.id}
                  onCheckedChange={(v) => toggleEnabled(m, v)}
                  aria-label={m.enabled ? 'Desactivar' : 'Activar'}
                />
                <span className="text-xs w-12 text-muted-foreground">{m.enabled ? 'Activo' : 'Inactivo'}</span>
              </div>
              <Button variant="ghost" size="icon" onClick={() => openEdit(m)} aria-label="Editar"><Pencil className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" disabled={busyId === m.id} onClick={() => askDelete(m)} aria-label="Eliminar">
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          );
        })}
        {!loadError && methods.length === 0 && (
          <div className="text-center text-muted-foreground py-10 border border-dashed rounded-xl">
            <p>Nenhum método configurado.</p>
            <p className="text-xs mt-1">Sem métodos, a finalização da compra aceita apenas "Pagamento na entrega".</p>
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => !saving && setShowForm(false)}>
          <div className="bg-background rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-bold mb-4">{editing ? 'Editar' : 'Novo'} método de pagamento</h3>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Nome *</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={80} placeholder="Multicaixa Express" />
                </div>
                <div className="space-y-2">
                  <Label>Código</Label>
                  <Input
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value })}
                    placeholder={normalizeCode(form.name) || 'multicaixa'}
                    className="font-mono"
                    disabled={!!(editing && RESERVED_CODES[editing.code])}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {editing && RESERVED_CODES[editing.code]
                      ? 'Código do sistema: não pode ser alterado.'
                      : `Fica guardado como "${codePreview || '…'}". Não o mude depois de haver encomendas.`}
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(TYPE_LABELS).map(([value, { label }]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Conta / número / IBAN</Label>
                <Input value={form.account_info} onChange={(e) => setForm({ ...form, account_info: e.target.value })} maxLength={200} />
              </div>
              <div className="space-y-2">
                <Label>Quem confirma o pagamento</Label>
                <Select value={form.gateway_provider ? 'gateway' : 'equipa'}
                  onValueChange={(v) => setForm({ ...form, gateway_provider: v === 'gateway' ? (gateway?.provider || 'generico') : '' })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="equipa">A equipa (quem tem "Confirmar pagamentos")</SelectItem>
                    <SelectItem value="gateway">O gateway de pagamentos, automaticamente (webhook)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Com gateway, o cliente não indica referência: o pagamento fica confirmado quando o gateway avisa a loja.
                  {form.gateway_provider && gateway && !gateway.configured && ' O gateway ainda não está ligado (falta o segredo do webhook): até lá, ninguém confirma estes pagamentos automaticamente.'}
                </p>
              </div>
              <div className="space-y-2">
                <Label>Link de pagamento (opcional)</Label>
                <Input
                  type="url"
                  value={form.payment_link}
                  onChange={(e) => setForm({ ...form, payment_link: e.target.value })}
                  placeholder="https://…"
                  maxLength={500}
                  className="font-mono text-xs"
                />
                <p className="text-[11px] text-muted-foreground">
                  Ex.: link do Multicaixa Express. Aparece como botão de pagamento na página de sucesso e no rastreio (o cliente paga depois de encomendar), no email de confirmação e nos recibos. Deixe vazio para retirar.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Instruções para o cliente</Label>
                <Textarea rows={3} value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} maxLength={1000} placeholder="Ex.: Transfira o total com o número da encomenda no descritivo…" />
                <p className="text-[11px] text-muted-foreground">Aparecem no checkout, na página de sucesso, no rastreio e no recibo.</p>
              </div>
              {methods.some((m) => 'shipping_methods' in m) && (
                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium">Disponível para</legend>
                  <div className="flex flex-wrap gap-x-4 gap-y-2">
                    {SHIPPING_OPTIONS.map((o) => {
                      const checked = (form.shipping_methods || []).includes(o.value);
                      return (
                        <label key={o.value} className="flex items-center gap-2 text-sm cursor-pointer">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(v) => setForm({
                              ...form,
                              shipping_methods: v
                                ? [...(form.shipping_methods || []), o.value]
                                : (form.shipping_methods || []).filter((x) => x !== o.value),
                            })}
                          />
                          {o.label}
                        </label>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-muted-foreground">Nenhum marcado = aparece em todos. Ex.: "Pagar no Balcão" só no levantamento.</p>
                </fieldset>
              )}
              <ImageField
                label="QR code de pagamento"
                value={form.qr_url}
                onChange={(v) => { setForm({ ...form, qr_url: v }); setQrRemoved(false); }}
                onFileChange={(f) => { setQrFile(f); if (f) setQrRemoved(false); }}
                onClear={() => setQrRemoved(true)}
                aspect="1:1"
                hint="QR: PNG · 300×300px · para pagamentos P2P"
                previewClassName="h-28 w-28"
                driveConfig={driveImageConfig}
              />
              <div className="flex items-center gap-3">
                <Switch checked={form.enabled} onCheckedChange={(v) => setForm({ ...form, enabled: v })} />
                <Label>Activo na finalização da compra</Label>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setShowForm(false)} disabled={saving}>Cancelar</Button>
                <Button type="submit" className="flex-1 btn-primary" disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Guardar
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar "{toDelete?.method?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              {toDelete?.usedIn > 0
                ? `Este método aparece em ${toDelete.usedIn} encomenda(s). Recomendamos desactivá-lo: deixa de aparecer na finalização da compra e o histórico fica intacto.`
                : RESERVED_CODES[toDelete?.method?.code]
                  ? 'Este é um método do sistema. Recomendamos desactivá-lo em vez de o eliminar.'
                  : 'O método deixa de aparecer na finalização da compra. Esta acção não pode ser desfeita.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            {toDelete?.method?.enabled && (toDelete?.usedIn > 0 || RESERVED_CODES[toDelete?.method?.code]) && (
              <Button variant="outline" onClick={deactivateInstead}>Desactivar</Button>
            )}
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={confirmDelete}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/**
 * O gateway de pagamentos: se está ligado e o endereço do webhook a dar ao fornecedor. Regra do
 * dono: os pagamentos confirmam-se pelo gateway; à mão, só quem tem "Confirmar pagamentos".
 */
function GatewayCard({ gateway }) {
  const { toast } = useToast();
  if (!gateway) return null;
  const copy = () => navigator.clipboard?.writeText(gateway.webhook_url).then(() => toast({ title: 'Endereço copiado' })).catch(() => {});
  return (
    <div className={`rounded-xl border p-4 text-sm space-y-2 ${gateway.configured ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/10'}`}>
      <p className="font-semibold flex items-center gap-2">
        <Zap className="h-4 w-4" aria-hidden="true" />
        Gateway de pagamentos: {gateway.configured ? `ligado (${gateway.provider})` : 'por ligar'}
      </p>
      <p className="text-muted-foreground">
        {gateway.configured
          ? 'Os métodos marcados com "O gateway" ficam pagos quando o gateway avisa a loja; cada aviso fica em Relatórios → Pagamentos e caixa.'
          : 'Para ligar: o gateway (ProxyPay, EMIS, AppyPay…) tem de enviar os avisos de pagamento para o endereço abaixo, assinados com um segredo partilhado. O segredo fica nos segredos da Edge Function (PAYMENT_WEBHOOK_SECRET).'}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <code className="rounded bg-background border px-2 py-1 text-xs break-all">{gateway.webhook_url}</code>
        <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={copy}>
          <Copy className="h-3.5 w-3.5 mr-1" aria-hidden="true" /> Copiar
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">Assinatura no cabeçalho {gateway.signature_header}: HMAC-SHA256 do corpo. Contrato em docs/PAGAMENTOS.md.</p>
    </div>
  );
}

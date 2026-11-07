import React, { useEffect, useState } from 'react';
import { Copy, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { applicationLink, saveColporteurSettings } from '@/lib/colporteurApi';
import { matchesQuery } from '@/lib/churchRegistryApi';
import { DataTable, FormField, SearchBox } from '@/components/admin/igreja/registryUi';

const NUM = [
  ['base_pct', 'Percentagem base (%)', 'Quando nenhuma regra se aplica.'],
  ['full_time_weekly_hours', 'Horas por semana para tempo inteiro', 'Abaixo disto, a reclassificação sugere "Tempo parcial".'],
  ['licensed_months', 'Licenciado: meses de trabalho', ''],
  ['licensed_hours', 'Licenciado: horas acumuladas', ''],
  ['credentialed_months', 'Credenciado: meses de trabalho', 'A política da Igreja pede 12 meses.'],
  ['credentialed_hours', 'Credenciado: horas acumuladas', ''],
  ['default_credit_limit', 'Limite em consignação por omissão (Kz)', 'Valor máximo de livros entregues e por pagar. 0 = sem limite.'],
  ['settlement_days', 'Prazo do acerto de contas (dias)', ''],
  ['invite_days', 'Validade do convite (dias)', ''],
];

export function SettingsPanel({ data, run }) {
  const [form, setForm] = useState(data.settings);
  useEffect(() => setForm(data.settings), [data.settings]);
  return (
    <div className="max-w-2xl space-y-4">
      <p className="text-sm text-muted-foreground">Os requisitos de categoria servem de sugestão na reclassificação anual; a decisão é sempre da equipa.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        {NUM.map(([k, label, hint]) => (
          <FormField key={k} label={label} hint={hint}>
            <Input type="number" min={0} step={k === 'base_pct' ? '0.5' : '1'} value={form[k] ?? ''} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
          </FormField>
        ))}
      </div>
      <label className="flex items-center gap-2 text-sm"><Switch checked={!!form.applications_open} onCheckedChange={(v) => setForm({ ...form, applications_open: v })} />Candidaturas abertas</label>
      <FormField label="Nota no formulário de candidatura" hint="Aparece no topo do formulário (ou no lugar dele, se as candidaturas estiverem fechadas).">
        <Textarea value={form.application_note || ''} onChange={(e) => setForm({ ...form, application_note: e.target.value })} rows={2} maxLength={1000} />
      </FormField>
      <Button onClick={() => run(async () => {
        const body = { ...form };
        for (const [k] of NUM) body[k] = Number(body[k] || 0);
        if (body.base_pct < 0 || body.base_pct > 100) throw new Error('A percentagem base tem de estar entre 0 e 100.');
        await saveColporteurSettings(body);
      }, 'Definições guardadas.')}>Guardar</Button>
    </div>
  );
}

/** Links de candidatura: o geral e um por igreja, com a igreja já escolhida. */
export function LinksPanel({ reg, idx }) {
  const [query, setQuery] = useState('');
  const copy = async (t) => { try { await navigator.clipboard.writeText(t); } catch { /* sem permissão */ } };
  const general = applicationLink();
  const churches = reg.churches.filter((c) => c.active && c.cn)
    .filter((c) => !query || matchesQuery(`${c.cn} ${c.name} ${idx.districtName(c.district_id)}`, query))
    .sort((a, b) => String(a.cn).localeCompare(String(b.cn), undefined, { numeric: true }));
  const wa = (link, name) => `https://wa.me/?text=${encodeURIComponent(`Quer ser colportor${name ? ` na igreja ${name}` : ''}? Candidate-se aqui: ${link}`)}`;
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border p-4">
        <h3 className="mb-1 font-semibold">Link de candidatura</h3>
        <p className="mb-3 text-sm text-muted-foreground">Diferente do registo de clientes: quem o abre candidata-se a colportor, sem precisar de conta. Também funciona {window.location.origin}/ser-colportor.</p>
        <div className="flex flex-wrap items-center gap-2">
          <code className="break-all rounded bg-muted px-2 py-1 text-sm">{general}</code>
          <Button size="sm" variant="outline" onClick={() => copy(general)}><Copy className="mr-1.5 h-4 w-4" />Copiar</Button>
          <Button size="sm" asChild><a href={wa(general)} target="_blank" rel="noreferrer"><MessageCircle className="mr-1.5 h-4 w-4" />WhatsApp</a></Button>
        </div>
      </div>
      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">Por igreja</h3>
          <SearchBox value={query} onChange={setQuery} placeholder="Nº ou igreja…" />
        </div>
        <p className="mb-3 text-sm text-muted-foreground">Para os pastores partilharem: o formulário abre com a igreja já escolhida.</p>
        <DataTable head={['Nº', 'Igreja', 'Distrito', '']} empty="Sem igrejas com número no registo.">
          {churches.map((c) => {
            const link = applicationLink(c.cn);
            return (
              <tr key={c.id}>
                <td className="px-3 py-1.5 tabular-nums">{c.cn}</td>
                <td className="px-3 py-1.5 font-medium">{c.name}</td>
                <td className="px-3 py-1.5">{idx.districtName(c.district_id)}</td>
                <td className="px-3 py-1.5 text-right">
                  <Button size="sm" variant="ghost" onClick={() => copy(link)} title={link}><Copy className="h-4 w-4" /></Button>
                  <Button size="sm" variant="ghost" asChild><a href={wa(link, c.name)} target="_blank" rel="noreferrer" title="WhatsApp"><MessageCircle className="h-4 w-4" /></a></Button>
                </td>
              </tr>
            );
          })}
        </DataTable>
      </div>
    </div>
  );
}

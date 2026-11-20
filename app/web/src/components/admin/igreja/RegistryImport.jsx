// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileJson, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { buildImportPlan, parseRegistryFile } from '@/lib/churchImport';
import { importRegistry } from '@/lib/churchRegistryApi';
import { DataTable, FormField, Pill } from './registryUi';

/**
 * Importar os ficheiros de igrejas e pastores. Nada é gravado sem a equipa ver a
 * pré-visualização: o que vai ser criado, os avisos (telefones repetidos, distritos que são só
 * a província…) e as sugestões de fusão, que ficam para depois, no separador de cada tabela.
 * O que já existe não é duplicado: pode importar-se outra vez sem medo.
 */
export default function RegistryImport({ reg, run, canEdit }) {
  const [files, setFiles] = useState({ churches: null, pastors: null });
  const [fileError, setFileError] = useState('');
  const [field, setField] = useState({ name: reg.fields[0]?.name || 'Missão Centro', short_name: reg.fields[0]?.short_name || '' });
  const [result, setResult] = useState(null);
  const [show, setShow] = useState('districts');

  const readFile = async (file) => {
    setFileError('');
    setResult(null);
    try {
      const parsed = parseRegistryFile(await file.text());
      setFiles((f) => ({ ...f, [parsed.kind]: { name: file.name, rows: parsed.rows } }));
    } catch (err) {
      setFileError(`${file.name}: ${err.message}`);
    }
  };

  const built = useMemo(() => {
    if (!files.churches && !files.pastors) return null;
    return buildImportPlan({
      churches: files.churches?.rows || [], pastors: files.pastors?.rows || [],
      provinces: reg.provinces, municipalities: reg.municipalities, defaultField: field,
    });
  }, [files, reg.provinces, reg.municipalities, field]);

  const doImport = () => run(async () => {
    const r = await importRegistry(built.plan);
    setResult(r);
    const c = r?.created || {};
    return `Importado: ${c.districts || 0} distritos, ${c.churches || 0} igrejas, ${c.pastors || 0} pastores, ${c.assignments || 0} atribuições.`;
  });

  const p = built?.preview;
  const tabs = p ? [
    ['districts', `Distritos (${p.counts.districts})`],
    ['churches', `Igrejas (${p.counts.churches})`],
    ['pastors', `Pastores (${p.counts.pastors})`],
    ['fields', `Campos (${p.counts.fields})`],
  ] : [];

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border p-4">
        <h3 className="mb-1 font-semibold">1. Ficheiros</h3>
        <p className="mb-3 text-sm text-muted-foreground">
          Os dois ficheiros JSON (igrejas e pastores), juntos ou um de cada vez. As notas de avaliação dos pastores não são importadas.
        </p>
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border px-4 py-6 text-sm hover:bg-muted/40">
          <Upload className="h-6 w-6 text-muted-foreground" />
          <span>Escolher churches.json e/ou pastores.json</span>
          <input type="file" accept="application/json,.json" multiple className="sr-only"
            onChange={(e) => { [...(e.target.files || [])].forEach(readFile); e.target.value = ''; }} />
        </label>
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          {['churches', 'pastors'].map((k) => files[k] && (
            <span key={k} className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1">
              <FileJson className="h-4 w-4" />{files[k].name} · {files[k].rows.length} {k === 'churches' ? 'igrejas' : 'pastores'}
            </span>
          ))}
        </div>
        {fileError && <p className="mt-2 text-sm text-destructive">{fileError}</p>}
      </div>

      {built && (
        <>
          <div className="rounded-xl border border-border p-4">
            <h3 className="mb-1 font-semibold">2. Campo por omissão</h3>
            <p className="mb-3 text-sm text-muted-foreground">Para os distritos e pastores que não indicam outro. Se já existir um campo com este nome, é esse que se usa.</p>
            <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
              <FormField label="Nome"><Input value={field.name} onChange={(e) => setField({ ...field, name: e.target.value })} maxLength={120} /></FormField>
              <FormField label="Sigla"><Input value={field.short_name} onChange={(e) => setField({ ...field, short_name: e.target.value })} maxLength={20} /></FormField>
            </div>
          </div>

          <div className="rounded-xl border border-border p-4">
            <h3 className="mb-3 font-semibold">3. Rever</h3>
            <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
              {[['Campos', p.counts.fields], ['Distritos', p.counts.districts], ['Igrejas', p.counts.churches], ['Pastores', p.counts.pastors], ['Atribuições', p.counts.assignments]].map(([l, n]) => (
                <div key={l} className="rounded-lg bg-muted/50 px-3 py-2"><p className="text-xs text-muted-foreground">{l}</p><p className="text-xl font-bold tabular-nums">{n}</p></div>
              ))}
            </div>

            {built.warnings.length > 0 && (
              <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/40">
                <p className="mb-2 flex items-center gap-1.5 font-semibold"><AlertTriangle className="h-4 w-4" />{built.warnings.length} avisos</p>
                <ul className="space-y-1">
                  {built.warnings.map((w, i) => (
                    <li key={i}><Pill tone={w.level === 'erro' ? 'red' : 'amber'}>{w.level}</Pill> <span className="text-muted-foreground">{w.ref}:</span> {w.message}</li>
                  ))}
                </ul>
              </div>
            )}

            {p.suggestions.length > 0 && (
              <div className="mb-4 rounded-lg border border-border p-3 text-sm">
                <p className="mb-1 font-semibold">Parecidos — talvez o mesmo ({p.suggestions.length})</p>
                <p className="mb-2 text-muted-foreground">Não se juntam sozinhos. Depois de importar, use "Fundir" no separador Distritos ou Pastores, ou corrija o delegado na igreja.</p>
                <ul className="space-y-1">
                  {p.suggestions.map((s, i) => (
                    <li key={i}><Pill tone="blue">{s.kind}</Pill> {s.a} ≈ {s.b} <span className="text-muted-foreground">({Math.round(s.score * 100)}% · {s.ref})</span></li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mb-3 flex flex-wrap gap-1">
              {tabs.map(([k, l]) => <Button key={k} size="sm" variant={show === k ? 'default' : 'outline'} onClick={() => setShow(k)}>{l}</Button>)}
            </div>
            {show === 'districts' && (
              <DataTable head={['Distrito', 'Província · Município', 'Origem', 'Titular', 'Igrejas']}>
                {p.districts.map((d) => (
                  <tr key={d.key}>
                    <td className="px-3 py-1.5 font-medium">{d.name}</td>
                    <td className="px-3 py-1.5">{d.province || <Pill tone="red">sem província</Pill>}{d.municipality ? ` · ${d.municipality}` : ''}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{d.sources}</td>
                    <td className="px-3 py-1.5">{d.titular || '—'}</td>
                    <td className="px-3 py-1.5 tabular-nums">{d.churches}</td>
                  </tr>
                ))}
              </DataTable>
            )}
            {show === 'churches' && (
              <DataTable head={['Nº', 'Igreja', 'Distrito', 'Província · Município', 'Delegado']}>
                {p.churches.map((c) => (
                  <tr key={c.key}>
                    <td className="px-3 py-1.5 tabular-nums">{c.cn}</td>
                    <td className="px-3 py-1.5 font-medium">{c.name}</td>
                    <td className="px-3 py-1.5">{c.district || <Pill tone="amber">sem distrito</Pill>}</td>
                    <td className="px-3 py-1.5">{c.province}{c.municipality ? ` · ${c.municipality}` : ''}</td>
                    <td className="px-3 py-1.5">{c.delegate} {c.delegateLinked && <Pill tone="green">pastor</Pill>}</td>
                  </tr>
                ))}
              </DataTable>
            )}
            {show === 'pastors' && (
              <DataTable head={['Nome', 'Cargo', 'Campo', 'Distrito / local', 'Telefone']}>
                {p.pastors.map((x) => (
                  <tr key={x.key}>
                    <td className="px-3 py-1.5 font-medium">{x.title} {x.name}</td>
                    <td className="px-3 py-1.5">{x.role}</td>
                    <td className="px-3 py-1.5">{x.field}</td>
                    <td className="px-3 py-1.5">{x.district || x.posting || '—'}</td>
                    <td className="px-3 py-1.5 tabular-nums">{x.phone}</td>
                  </tr>
                ))}
              </DataTable>
            )}
            {show === 'fields' && (
              <DataTable head={['Campo', 'Tipo']}>
                {p.fields.map((f) => <tr key={f.key}><td className="px-3 py-1.5 font-medium">{f.name}</td><td className="px-3 py-1.5">{f.kindLabel}</td></tr>)}
              </DataTable>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={doImport} disabled={!canEdit || p.counts.errors > 0}>
              <Upload className="mr-1.5 h-4 w-4" />Importar
            </Button>
            {!canEdit && <span className="text-sm text-muted-foreground">Precisa da permissão "Registo da Igreja".</span>}
            {p.counts.errors > 0 && <span className="text-sm text-destructive">Corrija os erros no ficheiro antes de importar.</span>}
            {result && (
              <span className="inline-flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="h-4 w-4" />
                Criados: {Object.entries(result.created || {}).map(([k, n]) => `${n} ${LABELS[k]}`).join(', ')} · já existiam: {Object.entries(result.existing || {}).map(([k, n]) => `${n} ${LABELS[k]}`).join(', ')}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

const LABELS = { fields: 'campos', districts: 'distritos', pastors: 'pastores', assignments: 'atribuições', churches: 'igrejas' };

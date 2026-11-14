import React, { useEffect, useMemo, useState } from 'react';
import { Download, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CodeChip } from '@/components/admin/users/userFormat';
import { displayAngolaPhone } from '@/lib/angolaPhone';
import { downloadCsv, matchesQuery } from '@/lib/churchRegistryApi';
import { colporteurRatings, ratingText } from '@/lib/colporteurApi';
import { CATEGORIES, STATUSES } from '@/lib/colporteurCommission';
import { DataTable, NativeSelect, Pill, SearchBox, Toolbar } from '@/components/admin/igreja/registryUi';
import ColporteurSheet from './ColporteurSheet';

const OPEN = ['candidatura', 'em_analise'];

/** Lista de candidaturas (mode="candidaturas") ou de colportores (mode="colportores"). */
export default function ColporteursPanel({ mode, data, reg, idx, run }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState(mode === 'candidaturas' ? 'open' : 'activo');
  const [category, setCategory] = useState('');
  const [district, setDistrict] = useState('');
  // A loja de cada colportor (migração lojas_donas_dos_dados); 'sem' = os que não têm loja.
  const [store, setStore] = useState('');
  const [openId, setOpenId] = useState(null);
  const [igrejaFiltro, setIgrejaFiltro] = useState('');
  const [ratings, setRatings] = useState(() => new Map());
  // A média das avaliações de cada colportor (sem a migração, a lista fica sem a coluna).
  useEffect(() => {
    if (mode !== 'colportores') return undefined;
    let vivo = true;
    colporteurRatings().then((m) => { if (vivo) setRatings(m); }).catch(() => {});
    return () => { vivo = false; };
  }, [mode, data.colporteurs]);
  const stores = data.stores || [];
  const storeName = (id) => stores.find((s) => s.id === id)?.name || '';

  const churchOf = (c) => idx.churchesById.get(c.church_id);
  const districtOf = (c) => churchOf(c)?.district_id || '';
  const rows = useMemo(() => data.colporteurs
    .filter((c) => (mode === 'candidaturas' ? [...OPEN, 'recusado'].includes(c.status) : !OPEN.includes(c.status) && c.status !== 'recusado'))
    .filter((c) => (status === 'all' ? true : status === 'open' ? OPEN.includes(c.status) : c.status === status))
    .filter((c) => !category || c.category === category)
    .filter((c) => !district || districtOf(c) === district)
    .filter((c) => !igrejaFiltro || (igrejaFiltro === 'sem' ? !c.church_id : c.church_id === igrejaFiltro))
    .filter((c) => !store || (store === 'sem' ? !c.store_id : c.store_id === store))
    .filter((c) => !query || matchesQuery(`${c.code || ''} ${c.full_name} ${c.phone} ${churchOf(c)?.name || c.church_other} ${idx.districtName(districtOf(c))}`, query))
    .sort((a, b) => (mode === 'candidaturas' ? String(b.created).localeCompare(String(a.created)) : a.full_name.localeCompare(b.full_name))),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [data.colporteurs, mode, status, category, district, igrejaFiltro, store, query, idx]);

  const statusOptions = mode === 'candidaturas'
    ? [['open', 'Por decidir'], ['candidatura', 'Novas'], ['em_analise', 'Em análise'], ['recusado', 'Recusadas'], ['all', 'Todas']]
    : [['activo', 'Activos'], ['suspenso', 'Suspensos'], ['inactivo', 'Inactivos'], ['all', 'Todos']];

  const exportCsv = () => downloadCsv(mode, ['Código', 'Nome', 'Telefone', 'Email', 'Igreja', 'Distrito', 'Município', 'Província', 'Loja', 'Categoria', 'Estado', 'Conta ligada', 'Desde', 'Candidatura'],
    rows.map((c) => [c.code || '', c.full_name, c.phone, c.email, churchOf(c)?.name || c.church_other, idx.districtName(districtOf(c)),
      idx.municipalityName(c.municipality_id), idx.provinceName(c.province_id), storeName(c.store_id), CATEGORIES[c.category]?.label, STATUSES[c.status]?.label,
      c.profile_id ? 'sim' : 'não', c.start_date || '', String(c.created || '').slice(0, 10)]));

  const current = data.colporteurs.find((c) => c.id === openId);
  return (
    <div>
      <Toolbar>
        <SearchBox value={query} onChange={setQuery} placeholder="Código, nome, telefone, igreja…" />
        <NativeSelect value={status} onChange={setStatus} className="w-auto">
          {statusOptions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </NativeSelect>
        {mode === 'colportores' && (
          <NativeSelect value={category} onChange={setCategory} className="w-auto">
            <option value="">Todas as categorias</option>
            {Object.entries(CATEGORIES).map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}
          </NativeSelect>
        )}
        <NativeSelect value={district} onChange={setDistrict} className="w-auto max-w-56">
          <option value="">Todos os distritos</option>
          {[...reg.districts].sort((a, b) => a.name.localeCompare(b.name)).map((d) => <option key={d.id} value={d.id}>{d.name} · {idx.provinceName(d.province_id)}</option>)}
        </NativeSelect>
        <NativeSelect value={igrejaFiltro} onChange={setIgrejaFiltro} className="w-auto max-w-56">
          <option value="">Todas as igrejas</option>
          <option value="sem">Sem igreja ligada (só texto)</option>
          {[...reg.churches].filter((ch) => !district || ch.district_id === district).sort((a, b) => a.name.localeCompare(b.name)).map((ch) => <option key={ch.id} value={ch.id}>{ch.name}</option>)}
        </NativeSelect>
        {stores.length > 0 && (
          <NativeSelect value={store} onChange={setStore} className="w-auto max-w-56" aria-label="Loja">
            <option value="">Todas as lojas</option>
            {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            <option value="sem">Sem loja</option>
          </NativeSelect>
        )}
        <Button variant="outline" size="sm" className="ml-auto" onClick={exportCsv}><Download className="mr-1.5 h-4 w-4" />Excel</Button>
      </Toolbar>

      <DataTable count={rows.length}
        head={mode === 'candidaturas' ? ['Data', 'Nome', 'Telefone', 'Igreja · Distrito', 'Pede', 'Recomendação', 'Estado'] : ['Código', 'Nome', 'Telefone', 'Igreja · Distrito', 'Categoria', 'Estado', 'Avaliação', 'Conta']}
        empty={mode === 'candidaturas' ? 'Sem candidaturas. Partilhe o link de candidatura (separador "Links").' : 'Ainda não há colportores aprovados.'}>
        {rows.map((c) => {
          const church = churchOf(c);
          const st = STATUSES[c.status] || {};
          return (
            <tr key={c.id} className="cursor-pointer hover:bg-muted/40" onClick={() => setOpenId(c.id)}>
              <td className="px-3 py-2">{mode === 'candidaturas' ? new Date(c.created).toLocaleDateString('pt-AO') : <CodeChip code={c.code} />}</td>
              <td className="px-3 py-2 font-medium">{c.full_name}</td>
              <td className="px-3 py-2 whitespace-nowrap">{displayAngolaPhone(c.phone)}</td>
              <td className="px-3 py-2">{church?.name || c.church_other || '—'}{church?.district_id ? <span className="text-muted-foreground"> · {idx.districtName(church.district_id)}</span> : ''}
                {!church && mode === 'colportores' && <> <Pill tone="amber">sem igreja ligada</Pill></>}</td>
              {mode === 'candidaturas' ? (
                <>
                  <td className="px-3 py-2">{CATEGORIES[c.requested_category]?.label}</td>
                  <td className="px-3 py-2">{c.recommendation_ok ? <Pill tone="green">confirmada</Pill> : (c.recommended_by_pastor_id ? idx.pastorLabel(c.recommended_by_pastor_id) : (c.recommended_by_name || <Pill tone="amber">nenhuma</Pill>))}</td>
                </>
              ) : (
                <td className="px-3 py-2">{CATEGORIES[c.category]?.label}</td>
              )}
              <td className="px-3 py-2"><Pill tone={st.tone}>{st.label}</Pill></td>
              {mode === 'colportores' && <td className="whitespace-nowrap px-3 py-2 text-sm">{ratings.get(c.id) ? <span className="text-amber-600 dark:text-amber-400">{ratingText(ratings.get(c.id).avg, ratings.get(c.id).count)}</span> : <span className="text-muted-foreground">—</span>}</td>}
              {mode === 'colportores' && <td className="px-3 py-2">{c.profile_id ? <Pill tone="green">ligada</Pill> : <span title="Envie o convite na ficha"><Link2 className="h-4 w-4 text-muted-foreground" /></span>}</td>}
            </tr>
          );
        })}
      </DataTable>

      {current && <ColporteurSheet colporteur={current} data={data} reg={reg} idx={idx} run={run} onClose={() => setOpenId(null)} />}
    </div>
  );
}

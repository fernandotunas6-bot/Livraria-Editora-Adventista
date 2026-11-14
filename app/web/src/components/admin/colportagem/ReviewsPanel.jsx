import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Eye, EyeOff, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CodeChip } from '@/components/admin/users/userFormat';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabaseClient';
import { colporteurRatings, hideBookReview, hideColporteurReview, ratingText, recentBookReviews } from '@/lib/colporteurApi';
import { NativeSelect, Pill } from '@/components/admin/igreja/registryUi';
import { Estrelas } from './ColporteurExtras';

/** Uma linha de avaliação com ocultar (pede o motivo) e mostrar. */
function Moderacao({ item, onHide, onShow }) {
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState('');
  if (item.hidden) return <Button size="sm" variant="ghost" onClick={onShow}><Eye className="mr-1.5 h-4 w-4" />Mostrar</Button>;
  if (!aberto) return <Button size="sm" variant="ghost" onClick={() => setAberto(true)}><EyeOff className="mr-1.5 h-4 w-4" />Ocultar</Button>;
  return (
    <span className="flex flex-1 flex-wrap items-center gap-2">
      <Input className="h-8 w-auto flex-1" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Porque oculta" maxLength={300} />
      <Button size="sm" variant="outline" disabled={motivo.trim().length < 3} onClick={() => onHide(motivo.trim())}>Ocultar</Button>
      <Button size="sm" variant="ghost" onClick={() => { setAberto(false); setMotivo(''); }}>Cancelar</Button>
    </span>
  );
}

/**
 * Colportagem › Avaliações: o ranking dos colportores pela média das avaliações dos clientes, as
 * avaliações recentes (ocultar com motivo) e, para a equipa do catálogo, as avaliações dos livros.
 */
export default function ReviewsPanel({ data, run }) {
  const { isAdmin, hasPermission } = useAuth();
  const catalogo = isAdmin || hasPermission('manage_catalog');
  const [ratings, setRatings] = useState(new Map());
  const [recentes, setRecentes] = useState(null);
  const [livros, setLivros] = useState(null);
  const [soOcultasLivros, setSoOcultasLivros] = useState('todas');
  const [erro, setErro] = useState('');
  const porId = useMemo(() => new Map(data.colporteurs.map((c) => [c.id, c])), [data.colporteurs]);

  const load = useCallback(async () => {
    setErro('');
    try {
      const [r, rec] = await Promise.all([
        colporteurRatings(),
        supabase.from('colporteur_reviews').select('id, colporteur_id, rating, comment, kind, hidden, hidden_reason, created, updated').order('updated', { ascending: false }).limit(80),
      ]);
      setRatings(r);
      if (rec.error) throw rec.error;
      setRecentes(rec.data || []);
    } catch (e) {
      setErro(/colporteur_reviews|could not find/i.test(e.message || '') ? 'As avaliações ainda não estão na base de dados (migração 20261114200000 por aplicar).' : (e.message || 'Não foi possível ler as avaliações.'));
      setRecentes([]);
    }
    if (catalogo) {
      try { setLivros(await recentBookReviews(soOcultasLivros === 'ocultas')); } catch { setLivros([]); }
    }
  }, [catalogo, soOcultasLivros]);
  useEffect(() => { load(); }, [load]);

  const ranking = useMemo(() => [...ratings.entries()]
    .map(([id, r]) => ({ c: porId.get(id), ...r }))
    .filter((x) => x.c)
    .sort((a, b) => b.avg - a.avg || b.count - a.count), [ratings, porId]);
  const moderar = (fn, msg) => run(async () => { await fn(); await load(); }, msg);

  return (
    <div className="space-y-6">
      <div className="flex justify-end"><Button variant="ghost" size="sm" onClick={load}><RefreshCw className="mr-1.5 h-4 w-4" />Actualizar</Button></div>
      {erro && <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">{erro}</p>}

      <section className="rounded-xl border border-border p-4">
        <h3 className="mb-1 font-semibold">Os colportores pelas avaliações dos clientes</h3>
        <p className="mb-3 text-sm text-muted-foreground">Média das avaliações visíveis (entregas feitas e vendas com o código). O cliente avalia na página da encomenda, depois de a receber.</p>
        {ranking.length ? (
          <ol className="divide-y divide-border rounded-lg border border-border">
            {ranking.map((x, i) => (
              <li key={x.c.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                <span className="flex items-center gap-2"><span className="w-6 text-right tabular-nums text-muted-foreground">{i + 1}.</span><CodeChip code={x.c.code} /><span className="font-medium">{x.c.full_name}</span></span>
                <span className="flex items-center gap-2"><Estrelas value={x.avg} /><span className="tabular-nums">{ratingText(x.avg, x.count)}</span></span>
              </li>
            ))}
          </ol>
        ) : <p className="text-sm text-muted-foreground">Ainda sem avaliações.</p>}
      </section>

      <section className="rounded-xl border border-border p-4">
        <h3 className="mb-3 font-semibold">Avaliações recentes dos colportores</h3>
        {!recentes ? <p className="text-sm text-muted-foreground">A carregar…</p> : recentes.length ? (
          <ul className="space-y-2">
            {recentes.map((r) => {
              const c = porId.get(r.colporteur_id);
              return (
                <li key={r.id} className={`rounded-lg border border-border p-3 text-sm ${r.hidden ? 'bg-muted/40 opacity-75' : ''}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex flex-wrap items-center gap-2"><Estrelas value={r.rating} />{c && <><CodeChip code={c.code} /><span className="font-medium">{c.full_name}</span></>}
                      <span className="text-muted-foreground">· {r.kind === 'entrega' ? 'entrega' : 'venda com o código'} · {new Date(r.updated || r.created).toLocaleDateString('pt-AO')}</span></span>
                    {r.hidden && <Pill tone="amber">oculta: {r.hidden_reason}</Pill>}
                  </div>
                  {r.comment && <p className="mt-1">{r.comment}</p>}
                  <div className="mt-2 flex">
                    <Moderacao item={r} onHide={(m) => moderar(() => hideColporteurReview(r.id, true, m), 'Avaliação oculta.')} onShow={() => moderar(() => hideColporteurReview(r.id, false), 'Avaliação visível outra vez.')} />
                  </div>
                </li>
              );
            })}
          </ul>
        ) : <p className="text-sm text-muted-foreground">Ainda sem avaliações.</p>}
      </section>

      {catalogo && (
        <section className="rounded-xl border border-border p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-semibold">Avaliações dos livros</h3>
              <p className="text-sm text-muted-foreground">As que os leitores escrevem na página de cada livro. Uma avaliação oculta deixa de aparecer no site e de contar para a média; só o autor e a equipa a vêem.</p>
            </div>
            <NativeSelect value={soOcultasLivros} onChange={setSoOcultasLivros} className="w-auto">
              <option value="todas">As mais recentes</option>
              <option value="ocultas">Só as ocultas</option>
            </NativeSelect>
          </div>
          {!livros ? <p className="text-sm text-muted-foreground">A carregar…</p> : livros.length ? (
            <ul className="space-y-2">
              {livros.map((r) => (
                <li key={r.id} className={`flex gap-3 rounded-lg border border-border p-3 text-sm ${r.hidden ? 'bg-muted/40 opacity-75' : ''}`}>
                  <span className="grid h-16 w-11 shrink-0 place-items-center overflow-hidden rounded bg-muted">{r.cover ? <img src={r.cover} alt="" loading="lazy" className="h-full w-full object-contain" /> : null}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2"><span className="font-medium">{r.title}</span><Estrelas value={r.rating} size="h-3.5 w-3.5" />
                      <span className="text-muted-foreground">{r.user_name}{r.is_verified ? ' · compra verificada' : ''} · {new Date(r.created).toLocaleDateString('pt-AO')}</span>
                      {r.hidden && <Pill tone="amber">oculta: {r.hidden_reason}</Pill>}</span>
                    <span className="mt-1 block">{r.comment}</span>
                    <span className="mt-2 flex">
                      <Moderacao item={r} onHide={(m) => moderar(() => hideBookReview(r.id, true, m), 'Avaliação do livro oculta.')} onShow={() => moderar(() => hideBookReview(r.id, false), 'Avaliação do livro visível outra vez.')} />
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted-foreground">Sem avaliações {soOcultasLivros === 'ocultas' ? 'ocultas' : 'de livros'}.</p>}
        </section>
      )}
    </div>
  );
}

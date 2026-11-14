import React, { useEffect, useState } from 'react';
import { MapPin, Phone, Users } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CodeChip } from '@/components/admin/users/userFormat';
import { displayAngolaPhone } from '@/lib/angolaPhone';
import { CATEGORIES, STATUSES } from '@/lib/colporteurCommission';
import { churchColporteurs, colporteurTopBooks, ratingText } from '@/lib/colporteurApi';
import { Pill } from './registryUi';

const kz = (v) => `${Number(v || 0).toLocaleString('pt-AO', { maximumFractionDigits: 0 })} Kz`;

/** Os números de uma igreja, numa linha: «3 activos · 1 candidatura · ★ 4,5 (8)». */
export function resumoIgreja(s) {
  if (!s) return '';
  const partes = [`${s.active_count} ${s.active_count === 1 ? 'activo' : 'activos'}`];
  if (s.candidates) partes.push(`${s.candidates} ${s.candidates === 1 ? 'candidatura' : 'candidaturas'}`);
  if (s.rating_count) partes.push(ratingText(s.rating_avg, s.rating_count));
  return partes.join(' · ');
}

/**
 * A ficha de uma igreja na colportagem: os seus colportores (estado, categoria, média das
 * avaliações), as horas e vendas validadas no ano, as entregas e os livros mais vendidos.
 */
export default function ChurchColporteurs({ church, idx, onClose }) {
  const [info, setInfo] = useState(null);
  const [books, setBooks] = useState([]);
  const [erro, setErro] = useState('');
  useEffect(() => {
    let vivo = true;
    Promise.all([churchColporteurs(church.id), colporteurTopBooks({ churchId: church.id }).catch(() => [])])
      .then(([r, b]) => { if (vivo) { setInfo((r || [])[0] || null); setBooks(b || []); } })
      .catch((e) => { if (vivo) setErro(e.message || 'Não foi possível ler os colportores desta igreja.'); });
    return () => { vivo = false; };
  }, [church.id]);

  const cats = info ? Object.entries(info.by_category || {}) : [];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2"><Users className="h-5 w-5 text-primary" />{church.name}{church.cn ? <span className="text-sm font-normal text-muted-foreground">nº {church.cn}</span> : null}</DialogTitle>
          <DialogDescription>
            {[idx.districtName(church.district_id), idx.fieldName(church.field_id), idx.provinceName(church.province_id)].filter(Boolean).join(' · ')}
          </DialogDescription>
        </DialogHeader>
        {(church.phone || church.responsible_name || church.members_count != null || church.latitude != null) && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {church.responsible_name && <span>Responsável: <b className="text-foreground">{church.responsible_name}</b></span>}
            {church.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{displayAngolaPhone(church.phone)}</span>}
            {church.members_count != null && <span>{Number(church.members_count).toLocaleString('pt-AO')} membros</span>}
            {church.latitude != null && (
              <a className="inline-flex items-center gap-1 text-primary hover:underline" href={`https://www.google.com/maps?q=${church.latitude},${church.longitude}`} target="_blank" rel="noreferrer">
                <MapPin className="h-3.5 w-3.5" />Ver no mapa
              </a>
            )}
          </div>
        )}
        {erro && <p className="text-sm text-destructive">{erro}</p>}
        {!info && !erro && <p className="text-sm text-muted-foreground">A carregar…</p>}
        {info && (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ['Colportores activos', String(info.active_count)],
                ['Horas validadas no ano', Number(info.hours).toLocaleString('pt-AO')],
                ['Vendas validadas no ano', kz(info.sales)],
                ['Entregas feitas no ano', String(info.deliveries)],
              ].map(([k, v]) => (
                <div key={k} className="rounded-lg bg-muted/50 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{k}</p>
                  <p className="text-lg font-bold tabular-nums">{v}</p>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 text-sm">
              {cats.map(([k, n]) => <Pill key={k} tone="blue">{CATEGORIES[k]?.label || k}: {n}</Pill>)}
              {info.candidates > 0 && <Pill tone="amber">{info.candidates} {info.candidates === 1 ? 'candidatura por decidir' : 'candidaturas por decidir'}</Pill>}
              {info.rating_count > 0 && <Pill tone="green">{ratingText(info.rating_avg, info.rating_count)}</Pill>}
            </div>
            <section>
              <h3 className="mb-2 font-semibold">Colportores desta igreja</h3>
              {info.colporteurs && info.colporteurs.length ? (
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {info.colporteurs.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                      <span className="flex flex-wrap items-center gap-2"><CodeChip code={c.code} /><span className="font-medium">{c.full_name}</span>
                        <span className="text-muted-foreground">{CATEGORIES[c.category]?.label}{c.phone ? ` · ${displayAngolaPhone(c.phone)}` : ''}</span></span>
                      <span className="flex items-center gap-2">
                        {c.rating_count > 0 && <span className="text-amber-600 dark:text-amber-400">{ratingText(c.rating_avg, c.rating_count)}</span>}
                        <Pill tone={STATUSES[c.status]?.tone}>{STATUSES[c.status]?.label || c.status}</Pill>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-muted-foreground">Nenhum colportor ligado a esta igreja. Partilhe o link de candidatura da igreja (Colportagem → Links).</p>}
            </section>
            {books.length > 0 && (
              <section>
                <h3 className="mb-2 font-semibold">Livros mais vendidos pelos colportores da igreja</h3>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {books.map((b) => (
                    <li key={b.book_id} className="flex items-center gap-3 rounded-lg border border-border p-2">
                      <span className="grid h-14 w-10 shrink-0 place-items-center overflow-hidden rounded bg-muted">
                        {b.cover ? <img src={b.cover} alt="" loading="lazy" className="h-full w-full object-contain" /> : null}
                      </span>
                      <span className="min-w-0 text-sm">
                        <span className="line-clamp-2 font-medium">{b.title}</span>
                        <span className="block text-muted-foreground">{Number(b.qty).toLocaleString('pt-AO')} un. · {ratingText(b.rating_avg, b.rating_count)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

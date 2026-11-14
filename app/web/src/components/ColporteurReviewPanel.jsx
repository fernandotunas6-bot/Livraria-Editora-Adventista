import React, { useEffect, useState } from 'react';
import { Loader2, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { colporteurReviewTargets, saveColporteurReview } from '@/lib/colporteurApi';

const ROTULOS = ['', 'Mau', 'Fraco', 'Razoável', 'Bom', 'Excelente'];

function Escolha({ value, onChange, nome }) {
  const [sobre, setSobre] = useState(0);
  const v = sobre || value;
  return (
    <div className="flex items-center gap-2" role="radiogroup" aria-label={`Avaliação de ${nome}`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} ${n === 1 ? 'estrela' : 'estrelas'}`}
          className="rounded p-0.5 focus-visible:outline-2 focus-visible:outline-primary"
          onMouseEnter={() => setSobre(n)} onMouseLeave={() => setSobre(0)} onClick={() => onChange(n)}>
          <Star className={`h-7 w-7 ${n <= v ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40'}`} aria-hidden="true" />
        </button>
      ))}
      <span className="text-sm text-muted-foreground">{ROTULOS[v] || ''}</span>
    </div>
  );
}

/**
 * Na página da encomenda (cliente com sessão): avaliar o colportor que a entregou, ou o do código
 * usado na compra, depois de a encomenda estar paga e entregue. A base de dados decide quem se
 * pode avaliar (colporteur_review_targets); sem ninguém, não aparece nada.
 */
export default function ColporteurReviewPanel({ orderNumber }) {
  const { toast } = useToast();
  const [alvos, setAlvos] = useState([]);
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState('');

  useEffect(() => {
    let vivo = true;
    if (!orderNumber) return undefined;
    colporteurReviewTargets(orderNumber).then((r) => {
      if (!vivo) return;
      setAlvos(r || []);
      setForm(Object.fromEntries((r || []).map((a) => [a.colporteur_id, { rating: a.review?.rating || 0, comment: a.review?.comment || '', saved: !!a.review }])));
    }).catch(() => { /* sem a migração ou sem sessão: não há avaliação */ });
    return () => { vivo = false; };
  }, [orderNumber]);

  if (!alvos.length) return null;
  const set = (id, patch) => setForm((f) => ({ ...f, [id]: { ...f[id], ...patch, saved: false } }));
  const guardar = async (a) => {
    const f = form[a.colporteur_id];
    if (!f.rating) { toast({ variant: 'destructive', title: 'Escolha as estrelas', description: 'De 1 (mau) a 5 (excelente).' }); return; }
    setBusy(a.colporteur_id);
    try {
      await saveColporteurReview({ orderNumber, colporteurId: a.colporteur_id, rating: f.rating, comment: f.comment.trim() });
      setForm((x) => ({ ...x, [a.colporteur_id]: { ...x[a.colporteur_id], saved: true } }));
      toast({ title: 'Obrigado pela avaliação', description: 'Ajuda-nos a acompanhar os colportores.' });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Não foi possível guardar', description: e.message });
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="space-y-4 rounded-2xl border bg-card p-5">
      <div>
        <h3 className="text-lg font-semibold">Avalie o colportor</h3>
        <p className="text-sm text-muted-foreground">A sua opinião fica com a Livraria e o colportor vê só as estrelas e o comentário, sem o seu nome.</p>
      </div>
      {alvos.map((a) => {
        const f = form[a.colporteur_id] || { rating: 0, comment: '' };
        return (
          <div key={a.colporteur_id} className="space-y-2 border-t pt-3 first:border-t-0 first:pt-0">
            <p className="text-sm"><span className="font-semibold">{a.full_name}</span> <span className="font-mono text-xs text-muted-foreground">{a.code}</span>
              <span className="text-muted-foreground"> · {a.kind === 'entrega' ? 'fez a entrega' : 'vendeu-lhe com o código dele'}</span></p>
            <Escolha value={f.rating} nome={a.full_name} onChange={(n) => set(a.colporteur_id, { rating: n })} />
            <Textarea value={f.comment} onChange={(e) => set(a.colporteur_id, { comment: e.target.value })} maxLength={1000} rows={2}
              placeholder="Como foi? (opcional: simpatia, pontualidade, cuidado com os livros…)" aria-label={`Comentário sobre ${a.full_name}`} />
            <div className="flex items-center gap-3">
              <Button size="sm" onClick={() => guardar(a)} disabled={busy === a.colporteur_id}>
                {busy === a.colporteur_id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{a.review ? 'Actualizar avaliação' : 'Enviar avaliação'}
              </Button>
              {f.saved && <span className="text-sm text-emerald-700 dark:text-emerald-400">Avaliação guardada.</span>}
              {a.review?.hidden && <span className="text-xs text-muted-foreground">A equipa ocultou esta avaliação.</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, Film, Image as ImageIcon, Plus, Trash2, Youtube } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/lib/supabaseClient';
import { cn } from '@/lib/utils';
import { playlist, proximo, tipoDoUrl, youtubeEmbed } from '@/lib/painelGestao';

/** A publicidade da TV (public.painel_tv_midia), pela ordem. */
export function useMidiaTv() {
  const [midia, setMidia] = useState([]);
  const carregar = useCallback(async () => {
    const { data } = await supabase.from('painel_tv_midia').select('*').order('ordem').order('id');
    setMidia(data || []);
  }, []);
  useEffect(() => {
    carregar();
    // a lista muda pouco: volta a lê-la de 10 em 10 minutos (a TV fica ligada o dia todo)
    const t = setInterval(carregar, 600_000);
    return () => clearInterval(t);
  }, [carregar]);
  return { midia, recarregar: carregar };
}

/**
 * Passa a publicidade em ciclo: vídeos até ao fim (sem som, salvo `som`), imagens e YouTube pelo tempo de cada um.
 * Um vídeo que não abre passa ao seguinte.
 */
export function LeitorPublicidade({ midia, som = false, logo, nome }) {
  const lista = playlist(midia);
  const [i, setI] = useState(0);
  const atual = lista[i % Math.max(lista.length, 1)];
  const seguinte = useCallback(() => setI((x) => proximo(x, lista.length)), [lista.length]);

  useEffect(() => {
    if (!atual || atual.tipo === 'video') return undefined;
    const t = setTimeout(seguinte, Math.max(Number(atual.duracao_s) || 15, 3) * 1000);
    return () => clearTimeout(t);
  }, [atual, seguinte]);

  if (!atual) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-black p-8 text-center text-white/70">
        {logo && <img src={logo} alt="" className="max-h-28 max-w-[60%] object-contain" />}
        <p className="text-lg font-semibold text-white">{nome}</p>
        <p className="text-sm">Sem publicidade: adicione vídeos ou imagens em «Publicidade da TV».</p>
      </div>
    );
  }
  const chave = `${atual.id}-${i}`;
  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      {atual.tipo === 'video' && (
        <video key={chave} src={atual.url} className="h-full w-full object-contain" autoPlay muted={!som} playsInline
          loop={lista.length === 1} onEnded={seguinte} onError={seguinte} />
      )}
      {atual.tipo === 'imagem' && <img key={chave} src={atual.url} alt={atual.titulo || ''} className="h-full w-full object-contain motion-safe:animate-in motion-safe:fade-in" />}
      {atual.tipo === 'youtube' && youtubeEmbed(atual.url, { som }) && (
        <iframe key={chave} src={youtubeEmbed(atual.url, { som })} title={atual.titulo || 'Vídeo'} className="h-full w-full border-0"
          allow="autoplay; encrypted-media; picture-in-picture" referrerPolicy="strict-origin-when-cross-origin" />
      )}
      {lista.length > 1 && (
        <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
          {lista.map((m, k) => <span key={m.id} className={cn('h-1.5 rounded-full transition-all', k === i % lista.length ? 'w-6 bg-white' : 'w-1.5 bg-white/40')} />)}
        </div>
      )}
    </div>
  );
}

const ICONE = { video: Film, imagem: ImageIcon, youtube: Youtube };

/**
 * A lista da publicidade: vídeos (dos ficheiros do site, no Supabase), imagens e vídeos do YouTube. Quem tem
 * «Configurações» ou «Editar relatórios de vendas».
 */
export function PublicidadeDialog({ open, onOpenChange, onMudou }) {
  const { midia, recarregar } = useMidiaTv();
  const [url, setUrl] = useState('');
  const [titulo, setTitulo] = useState('');
  const [duracao, setDuracao] = useState('15');

  async function feito(promessa, msg) {
    const { error } = await promessa;
    if (error) {
      toast.error(error.message);
      return;
    }
    if (msg) toast.success(msg);
    await recarregar();
    onMudou?.();
  }

  async function acrescentar(e) {
    e.preventDefault();
    const u = url.trim();
    if (!/^https:\/\//i.test(u)) {
      toast.error('Cole um endereço https:// (um vídeo ou imagem dos ficheiros do site, ou um vídeo do YouTube).');
      return;
    }
    const tipo = tipoDoUrl(u);
    const ordem = (midia.reduce((m, x) => Math.max(m, x.ordem ?? 0), 0) || 0) + 1;
    await feito(supabase.from('painel_tv_midia').insert({ url: u, tipo, titulo: titulo.trim(), duracao_s: Math.min(Math.max(Number(duracao) || 15, 3), 3600), ordem }),
      tipo === 'video' ? 'Vídeo acrescentado.' : tipo === 'youtube' ? 'Vídeo do YouTube acrescentado.' : 'Imagem acrescentada.');
    setUrl('');
    setTitulo('');
  }

  async function mover(k, d) {
    const a = midia[k];
    const b = midia[k + d];
    if (!a || !b) return;
    await feito(supabase.from('painel_tv_midia').update({ ordem: b.ordem ?? 0 }).eq('id', a.id));
    await feito(supabase.from('painel_tv_midia').update({ ordem: a.ordem ?? 0 }).eq('id', b.id));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Publicidade da TV</DialogTitle>
          <DialogDescription>
            Passa num dos lados do ecrã, em ciclo, enquanto o painel mostra as vendas. Vídeos dos ficheiros do site
            (Supabase), imagens ou vídeos do YouTube; os vídeos passam até ao fim, as imagens e o YouTube pelo tempo indicado.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={acrescentar} className="grid gap-2 sm:grid-cols-[1fr_10rem_6rem_auto]">
          <Input placeholder="https://… (vídeo, imagem ou YouTube)" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Endereço" />
          <Input placeholder="Título (opcional)" value={titulo} onChange={(e) => setTitulo(e.target.value)} aria-label="Título" />
          <Input type="number" min={3} max={3600} value={duracao} onChange={(e) => setDuracao(e.target.value)} aria-label="Segundos no ecrã" title="Segundos no ecrã (imagens e YouTube)" />
          <Button type="submit"><Plus className="mr-1 h-4 w-4" />Acrescentar</Button>
        </form>
        <ul className="max-h-[50vh] divide-y overflow-y-auto">
          {!midia.length && <li className="py-6 text-center text-sm text-muted-foreground">Ainda sem publicidade.</li>}
          {midia.map((m, k) => {
            const Icone = ICONE[m.tipo] || ImageIcon;
            return (
              <li key={m.id} className="flex items-center gap-2 py-2">
                <Icone className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{m.titulo || m.url.split('/').pop()}</p>
                  <p className="truncate text-xs text-muted-foreground">{m.tipo === 'video' ? 'vídeo até ao fim' : `${m.duracao_s} s`} · {m.url}</p>
                </div>
                <Switch checked={m.activo} onCheckedChange={(v) => feito(supabase.from('painel_tv_midia').update({ activo: v }).eq('id', m.id))} aria-label="Activa" />
                <Button type="button" size="icon" variant="ghost" disabled={k === 0} onClick={() => mover(k, -1)} aria-label="Subir"><ArrowUp className="h-4 w-4" /></Button>
                <Button type="button" size="icon" variant="ghost" disabled={k === midia.length - 1} onClick={() => mover(k, 1)} aria-label="Descer"><ArrowDown className="h-4 w-4" /></Button>
                <Button type="button" size="icon" variant="ghost" onClick={() => feito(supabase.from('painel_tv_midia').delete().eq('id', m.id), 'Retirada.')} aria-label="Apagar">
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </li>
            );
          })}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

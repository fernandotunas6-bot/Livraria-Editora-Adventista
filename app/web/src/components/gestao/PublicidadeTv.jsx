import React, { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, Film, Image as ImageIcon, Newspaper, Plus, Trash2, Youtube } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useMensagensRodape } from '@/components/gestao/RodapeNoticias';
import { supabase } from '@/lib/supabaseClient';
import { cn } from '@/lib/utils';
import { estadoYoutube, playlist, proximo, tipoDoUrl, youtubeEmbed } from '@/lib/painelGestao';

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

const ORIGEM_YOUTUBE = 'https://www.youtube-nocookie.com';

/**
 * Passa a publicidade em ciclo: os vídeos (dos ficheiros do site e do YouTube) até ao fim, sem som salvo `som`; as
 * imagens pelo tempo de cada uma. O único da lista repete. Um vídeo que não abre (ou bloqueado pelo dono no YouTube)
 * passa ao seguinte.
 */
export function LeitorPublicidade({ midia, som = false, logo, nome }) {
  const lista = playlist(midia);
  const [i, setI] = useState(0);
  const atual = lista[i % Math.max(lista.length, 1)];
  const seguinte = useCallback(() => setI((x) => proximo(x, lista.length)), [lista.length]);
  const iframe = useRef(null);
  const origem = typeof window !== 'undefined' ? window.location.origin : '';

  // imagens: o tempo de cada uma
  useEffect(() => {
    if (!atual || atual.tipo !== 'imagem' || lista.length < 2) return undefined;
    const t = setTimeout(seguinte, Math.max(Number(atual.duracao_s) || 15, 3) * 1000);
    return () => clearTimeout(t);
  }, [atual, seguinte, lista.length]);

  // YouTube: o leitor avisa a página quando o vídeo termina (enablejsapi). Pede-se-lhe que comece a avisar
  // («listening», como faz a biblioteca do YouTube) até responder; sem resposta nem imagem em 20 s, passa à frente.
  useEffect(() => {
    if (!atual || atual.tipo !== 'youtube' || lista.length < 2) return undefined;
    let comecou = false;
    const ouvir = () => {
      try {
        iframe.current?.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 'painel-tv', channel: 'widget' }), ORIGEM_YOUTUBE);
      } catch { /* ainda a carregar */ }
    };
    const aoReceber = (e) => {
      if (e.source !== iframe.current?.contentWindow || !/^https:\/\/www\.youtube(-nocookie)?\.com$/.test(e.origin)) return;
      const estado = estadoYoutube(e.data);
      if (estado === 'a-tocar') comecou = true;
      if (estado === 'terminou' || estado === 'erro') seguinte();
    };
    window.addEventListener('message', aoReceber);
    const pedir = setInterval(ouvir, 1500);
    const pararDePedir = setTimeout(() => clearInterval(pedir), 15_000);
    const salvaguarda = setTimeout(() => { if (!comecou) seguinte(); }, 20_000);
    return () => {
      window.removeEventListener('message', aoReceber);
      clearInterval(pedir);
      clearTimeout(pararDePedir);
      clearTimeout(salvaguarda);
    };
  }, [atual, seguinte, lista.length]);

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
        <iframe key={chave} ref={iframe} src={youtubeEmbed(atual.url, { som, repetir: lista.length === 1, origem })} title={atual.titulo || 'Vídeo'}
          className="h-full w-full border-0" allow="autoplay; encrypted-media; picture-in-picture" referrerPolicy="strict-origin-when-cross-origin" />
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
/** As mensagens da direcção para o rodapé (a passar, como nos noticiários): texto, até quando, por ordem. */
function MensagensRodape() {
  const { lista, recarregar } = useMensagensRodape();
  const [texto, setTexto] = useState('');
  const [ate, setAte] = useState('');
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Luanda' });

  async function feito(promessa, msg) {
    const { error } = await promessa;
    if (error) {
      toast.error(error.message);
      return;
    }
    if (msg) toast.success(msg);
    await recarregar();
  }

  async function acrescentar(e) {
    e.preventDefault();
    const t = texto.trim();
    if (t.length < 3) {
      toast.error('Escreva a mensagem (3 a 200 caracteres).');
      return;
    }
    const ordem = (lista.reduce((m, x) => Math.max(m, x.ordem ?? 0), 0) || 0) + 1;
    await feito(supabase.from('painel_rodape').insert({ texto: t.slice(0, 200), ate: ate || null, ordem }), 'Mensagem no rodapé.');
    setTexto('');
    setAte('');
  }

  async function mover(k, d) {
    const a = lista[k];
    const b = lista[k + d];
    if (!a || !b) return;
    await feito(supabase.from('painel_rodape').update({ ordem: b.ordem ?? 0 }).eq('id', a.id));
    await feito(supabase.from('painel_rodape').update({ ordem: a.ordem ?? 0 }).eq('id', b.id));
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Passam no rodapé do painel e da TV, antes das notícias dos números (hoje, a meta, quem lidera, o mais vendido).
        Com uma data, a mensagem sai sozinha no dia seguinte.
      </p>
      <form onSubmit={acrescentar} className="grid gap-2 sm:grid-cols-[1fr_10rem_auto]">
        <Input placeholder="Ex.: Bíblias de estudo com 20 % até sábado" maxLength={200} value={texto} onChange={(e) => setTexto(e.target.value)} aria-label="Mensagem" />
        <Input type="date" min={hoje} value={ate} onChange={(e) => setAte(e.target.value)} aria-label="Até ao dia" title="Até ao dia (opcional)" />
        <Button type="submit"><Plus className="mr-1 h-4 w-4" />Acrescentar</Button>
      </form>
      <ul className="max-h-[45vh] divide-y overflow-y-auto">
        {!lista.length && <li className="py-6 text-center text-sm text-muted-foreground">Ainda sem mensagens: o rodapé mostra só os números.</li>}
        {lista.map((m, k) => {
          const passou = m.ate && String(m.ate) < hoje;
          return (
            <li key={m.id} className={cn('flex items-center gap-2 py-2', passou && 'opacity-50')}>
              <Newspaper className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{m.texto}</p>
                <p className="text-xs text-muted-foreground">{m.ate ? (passou ? `terminou a ${m.ate.split('-').reverse().join('/')}` : `até ${m.ate.split('-').reverse().join('/')}`) : 'sem fim'}</p>
              </div>
              <Switch checked={m.activo} onCheckedChange={(v) => feito(supabase.from('painel_rodape').update({ activo: v }).eq('id', m.id))} aria-label="Activa" />
              <Button type="button" size="icon" variant="ghost" disabled={k === 0} onClick={() => mover(k, -1)} aria-label="Subir"><ArrowUp className="h-4 w-4" /></Button>
              <Button type="button" size="icon" variant="ghost" disabled={k === lista.length - 1} onClick={() => mover(k, 1)} aria-label="Descer"><ArrowDown className="h-4 w-4" /></Button>
              <Button type="button" size="icon" variant="ghost" onClick={() => feito(supabase.from('painel_rodape').delete().eq('id', m.id), 'Retirada.')} aria-label="Apagar">
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

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
          <DialogTitle>Publicidade e rodapé</DialogTitle>
          <DialogDescription>
            A publicidade passa num dos lados do ecrã da TV, em ciclo, enquanto o painel mostra as vendas; as mensagens
            passam no rodapé, como nos noticiários.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="publicidade">
          <TabsList className="mb-3">
            <TabsTrigger value="publicidade">Publicidade da TV</TabsTrigger>
            <TabsTrigger value="rodape">Mensagens do rodapé</TabsTrigger>
          </TabsList>
          <TabsContent value="rodape"><MensagensRodape /></TabsContent>
          <TabsContent value="publicidade" className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Cole o endereço de um vídeo do YouTube (youtube.com/watch, youtu.be ou shorts), de um vídeo dos ficheiros do site
          (Supabase) ou de uma imagem. Os vídeos passam até ao fim e depois vem o seguinte; as imagens ficam os segundos indicados.
        </p>
        <form onSubmit={acrescentar} className="grid gap-2 sm:grid-cols-[1fr_10rem_6rem_auto]">
          <Input placeholder="https://… (vídeo, imagem ou YouTube)" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Endereço" />
          <Input placeholder="Título (opcional)" value={titulo} onChange={(e) => setTitulo(e.target.value)} aria-label="Título" />
          <Input type="number" min={3} max={3600} value={duracao} onChange={(e) => setDuracao(e.target.value)} aria-label="Segundos no ecrã (imagens)" title="Segundos no ecrã (só imagens: os vídeos passam até ao fim)" />
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
                  <p className="truncate text-xs text-muted-foreground">{m.tipo === 'imagem' ? `${m.duracao_s} s` : m.tipo === 'youtube' ? 'YouTube, até ao fim' : 'vídeo até ao fim'} · {m.url}</p>
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
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

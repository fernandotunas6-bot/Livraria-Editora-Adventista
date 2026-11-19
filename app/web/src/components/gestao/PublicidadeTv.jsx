import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, Clapperboard, Film, Image as ImageIcon, Newspaper, Plus, Trash2, Upload, Youtube } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useMensagensRodape } from '@/components/gestao/RodapeNoticias';
import { supabase } from '@/lib/supabaseClient';
import { cn } from '@/lib/utils';
import { estadoYoutube, estiloDaPassagem, proximo, sequenciaTv, tipoDoUrl, youtubeEmbed } from '@/lib/painelGestao';

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

/** Envia um ficheiro (vídeo ou imagem) para o bucket público «painel-tv» e devolve o endereço dele. */
export async function enviarFicheiroTv(ficheiro, pasta) {
  const nome = ficheiro.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9._-]+/g, '-').slice(-80);
  const caminho = `${pasta}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${nome}`;
  const { error } = await supabase.storage.from('painel-tv').upload(caminho, ficheiro, { contentType: ficheiro.type, upsert: false });
  if (error) {
    throw new Error(/size|large|maximum/i.test(error.message)
      ? `${ficheiro.name}: o ficheiro passa do limite (100 MB). Encurte o vídeo ou baixe a qualidade.`
      : `${ficheiro.name}: ${error.message}`);
  }
  return supabase.storage.from('painel-tv').getPublicUrl(caminho).data.publicUrl;
}
// a passagem de uma peça para a seguinte (ms); a anterior fica por baixo até a nova estar pronta (máx. 2,5 s)
export const PASSAGEM_MS = 900;
const ESPERA_MAX_MS = 2500;

export const ESTILO = `
@keyframes pub-entra{from{opacity:0;transform:scale(1.035)}to{opacity:1;transform:scale(1)}}
@keyframes pub-legenda{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
@keyframes pub-kenburns{from{transform:scale(1) translate(0,0)}to{transform:scale(1.09) translate(-1.5%,-1%)}}
@keyframes pub-barra{from{transform:scaleX(0)}to{transform:scaleX(1)}}
.pub-espera{opacity:0}
@keyframes pub-deslizar{from{transform:translateX(100%)}to{transform:translateX(0)}}
@keyframes pub-sai-deslizar{from{transform:translateX(0);opacity:1}to{transform:translateX(-35%);opacity:.35}}
@keyframes pub-zoom{from{opacity:0;transform:scale(1.32)}to{opacity:1;transform:scale(1)}}
@keyframes pub-cortina{from{clip-path:inset(0 100% 0 0)}to{clip-path:inset(0 0 0 0)}}
.pub-t-esbater{animation:pub-entra ${PASSAGEM_MS}ms cubic-bezier(.2,.7,.2,1) both}
.pub-t-deslizar{animation:pub-deslizar ${PASSAGEM_MS}ms cubic-bezier(.7,0,.2,1) both}
.pub-t-zoom{animation:pub-zoom ${PASSAGEM_MS}ms cubic-bezier(.2,.7,.2,1) both}
.pub-t-cortina{animation:pub-cortina ${PASSAGEM_MS + 200}ms cubic-bezier(.7,0,.2,1) both}
.pub-s-deslizar{animation:pub-sai-deslizar ${PASSAGEM_MS}ms cubic-bezier(.7,0,.2,1) both}
.pub-entra{animation:pub-entra ${PASSAGEM_MS}ms cubic-bezier(.2,.7,.2,1) both}
.pub-legenda{animation:pub-legenda 700ms ease-out 400ms both}
@media (prefers-reduced-motion: reduce){.pub-entra,.pub-legenda,.pub-kb,.pub-barra,.pub-t-esbater,.pub-t-deslizar,.pub-t-zoom,.pub-t-cortina,.pub-s-deslizar{animation:none!important}.pub-espera{opacity:1}}
`;

/** O progresso de um vídeo do YouTube numa mensagem do leitor (currentTime ÷ duration), ou null. */
function progressoYoutube(dados) {
  try {
    const d = typeof dados === 'string' ? JSON.parse(dados) : dados;
    const t = Number(d?.info?.currentTime);
    const total = Number(d?.info?.duration);
    return total > 0 && Number.isFinite(t) ? Math.min(t / total, 1) : null;
  } catch {
    return null;
  }
}

/** Uma peça da publicidade (vídeo, imagem ou YouTube) a ocupar a moldura toda. */
function Peca({ m, som, unica, origem, iframeRef, onPronto, onFim, onProgresso }) {
  if (m.tipo === 'video') {
    return (
      <video src={m.url} className="h-full w-full object-contain" autoPlay muted={!som} playsInline loop={unica}
        onPlaying={onPronto} onEnded={onFim} onError={onFim}
        onTimeUpdate={(e) => e.currentTarget.duration > 0 && onProgresso?.(e.currentTarget.currentTime / e.currentTarget.duration)} />
    );
  }
  if (m.tipo === 'youtube') {
    const src = youtubeEmbed(m.url, { som, repetir: unica, origem });
    if (!src) return null;
    return (
      <iframe ref={iframeRef} src={src} title={m.titulo || 'Vídeo'} className="h-full w-full border-0"
        allow="autoplay; encrypted-media; picture-in-picture" referrerPolicy="strict-origin-when-cross-origin"
        onLoad={() => setTimeout(() => onPronto?.(), 600)} />
    );
  }
  const dur = Math.max(Number(m.duracao_s) || 15, 3);
  return (
    <div className="h-full w-full overflow-hidden">
      {/* um zoom lento sobre a imagem, pelo tempo dela (Ken Burns) */}
      <img src={m.url} alt={m.titulo || ''} onLoad={onPronto} onError={onFim}
        className="pub-kb h-full w-full object-contain" style={{ animation: `pub-kenburns ${dur + 1}s ease-out both` }} />
    </div>
  );
}

/**
 * Passa a publicidade em ciclo: os vídeos (dos ficheiros do site e do YouTube) até ao fim, sem som salvo `som`; as
 * imagens pelo tempo de cada uma, com um zoom lento. A peça seguinte entra por cima da anterior (que só sai quando a
 * nova já está a tocar): sem cortes nem ecrã preto. O título e uma barra de progresso em baixo. O único da lista
 * repete; um vídeo que não abre (ou bloqueado pelo dono no YouTube) passa ao seguinte.
 */
export function LeitorPublicidade({ midia, som = false, logo, nome, transicao = 'esbater', vinhetas = true, inicial = 0, onPassagem }) {
  // os anúncios, com uma vinheta entre eles (se houver e estiverem ligadas)
  const lista = sequenciaTv(midia, { vinhetas });
  const n = lista.length;
  const [i, setI] = useState(() => Math.max(Number(inicial) || 0, 0));
  const iRef = useRef(i);
  iRef.current = i;
  const onPassagemRef = useRef(onPassagem);
  onPassagemRef.current = onPassagem;
  const [anterior, setAnterior] = useState(null);
  const [pronto, setPronto] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const atual = lista[i % Math.max(n, 1)];
  const chave = atual ? `${atual.id}-${i}` : '';
  const iframe = useRef(null);
  const origem = typeof window !== 'undefined' ? window.location.origin : '';
  const atualRef = useRef(null);
  atualRef.current = atual ? { m: atual, chave } : null;

  const seguinte = useCallback(() => {
    if (n < 2) return;
    // entre duas peças, quem usa o leitor pode pô-lo de parte (a montra de livros entra aqui)
    if (onPassagemRef.current?.(proximo(iRef.current, n)) === true) return;
    setAnterior(atualRef.current);
    setPronto(false);
    setProgresso(0);
    setI((x) => proximo(x, n));
  }, [n]);

  // a anterior sai depois da passagem — quando a nova está pronta, ou ao fim da espera máxima
  useEffect(() => {
    if (!anterior) return undefined;
    const t = setTimeout(() => setPronto(true), ESPERA_MAX_MS);
    return () => clearTimeout(t);
  }, [anterior]);
  useEffect(() => {
    if (!pronto || !anterior) return undefined;
    const t = setTimeout(() => setAnterior(null), PASSAGEM_MS + 50);
    return () => clearTimeout(t);
  }, [pronto, anterior]);

  // imagens: o tempo de cada uma
  useEffect(() => {
    if (!atual || atual.tipo !== 'imagem' || n < 2) return undefined;
    const t = setTimeout(seguinte, Math.max(Number(atual.duracao_s) || 15, 3) * 1000);
    return () => clearTimeout(t);
  }, [atual, seguinte, n]);

  // YouTube: o leitor avisa a página quando o vídeo termina (enablejsapi), e de quanto vai; pede-se-lhe que comece
  // a avisar («listening», como faz a biblioteca do YouTube) até responder; sem resposta nem imagem em 20 s, passa.
  useEffect(() => {
    if (!atual || atual.tipo !== 'youtube') return undefined;
    let comecou = false;
    const ouvir = () => {
      try {
        iframe.current?.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 'painel-tv', channel: 'widget' }), ORIGEM_YOUTUBE);
      } catch { /* ainda a carregar */ }
    };
    const aoReceber = (e) => {
      if (e.source !== iframe.current?.contentWindow || !/^https:\/\/www\.youtube(-nocookie)?\.com$/.test(e.origin)) return;
      const estado = estadoYoutube(e.data);
      const p = progressoYoutube(e.data);
      if (p != null) setProgresso(p);
      if (estado === 'a-tocar') {
        comecou = true;
        setPronto(true);
      }
      if (estado === 'terminou' || estado === 'erro') seguinte();
    };
    window.addEventListener('message', aoReceber);
    const pedir = setInterval(ouvir, 1500);
    const pararDePedir = setTimeout(() => clearInterval(pedir), 15_000);
    const salvaguarda = setTimeout(() => { if (!comecou && n > 1) seguinte(); }, 20_000);
    return () => {
      window.removeEventListener('message', aoReceber);
      clearInterval(pedir);
      clearTimeout(pararDePedir);
      clearTimeout(salvaguarda);
    };
  }, [atual, seguinte, n]);

  if (!atual) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-black p-8 text-center text-white/70">
        {logo && <img src={logo} alt="" className="max-h-28 max-w-[60%] object-contain" />}
        <p className="text-lg font-semibold text-white">{nome}</p>
        <p className="text-sm">Sem publicidade: adicione vídeos ou imagens em «Publicidade e rodapé».</p>
      </div>
    );
  }
  const unica = n === 1;
  // o estilo desta passagem (na «aleatória», um diferente de cada vez)
  const estilo = estiloDaPassagem(transicao, i);
  const durImagem = Math.max(Number(atual.duracao_s) || 15, 3);
  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      <style>{ESTILO}</style>
      {/* a anterior por baixo, a tocar até a nova a cobrir */}
      {anterior && anterior.chave !== chave && (
        <div key={anterior.chave} className={cn('absolute inset-0', pronto && estilo === 'deslizar' && 'pub-s-deslizar')}>
          <Peca m={anterior.m} som={false} unica={false} origem={origem} />
        </div>
      )}
      <div key={chave} className={cn('absolute inset-0', anterior ? (pronto ? `pub-t-${estilo}` : 'pub-espera') : '')}>
        <Peca m={atual} som={som} unica={unica} origem={origem} iframeRef={iframe}
          onPronto={() => setPronto(true)} onFim={seguinte} onProgresso={setProgresso} />
      </div>
      {atual.titulo && (
        <div key={`t-${chave}`} className="pub-legenda pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent px-5 pb-7 pt-16">
          <p className="font-serif text-xl font-semibold text-white drop-shadow sm:text-2xl">{atual.titulo}</p>
        </div>
      )}
      {/* o progresso da peça: as imagens pelo tempo delas, os vídeos pelo que já passou */}
      {!unica && (
        <div className="absolute inset-x-0 bottom-0 h-1 bg-white/10">
          {atual.tipo === 'imagem'
            ? <div key={`b-${chave}`} className="pub-barra h-full origin-left bg-[#7fd3e6]" style={{ animation: `pub-barra ${durImagem}s linear both` }} />
            : <div className="h-full origin-left bg-[#7fd3e6] transition-transform duration-300 ease-linear" style={{ transform: `scaleX(${progresso})` }} />}
        </div>
      )}
      {n > 1 && (
        <div className="absolute right-3 top-3 flex gap-1.5 rounded-full bg-black/35 px-2 py-1.5 backdrop-blur-sm">
          {lista.map((m, k) => <span key={m.id} className={cn('h-1.5 rounded-full transition-all duration-500', k === i % n ? 'w-5 bg-white' : 'w-1.5 bg-white/45')} />)}
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
  const [imagem, setImagem] = useState(null);
  const [aEnviar, setAEnviar] = useState(false);
  const previa = useMemo(() => (imagem ? URL.createObjectURL(imagem) : ''), [imagem]);
  useEffect(() => () => { if (previa) URL.revokeObjectURL(previa); }, [previa]);
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
    setAEnviar(true);
    try {
      const url = imagem ? await enviarFicheiroTv(imagem, 'rodape') : null;
      await feito(supabase.from('painel_rodape').insert({ texto: t.slice(0, 200), ate: ate || null, ordem, imagem: url }), 'Mensagem no rodapé.');
      setTexto('');
      setAte('');
      setImagem(null);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setAEnviar(false);
    }
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
      <form onSubmit={acrescentar} className="grid gap-2 sm:grid-cols-[1fr_10rem_auto_auto]">
        <Input placeholder="Ex.: Bíblias de estudo com 20 % até sábado" maxLength={200} value={texto} onChange={(e) => setTexto(e.target.value)} aria-label="Mensagem" />
        <Input type="date" min={hoje} value={ate} onChange={(e) => setAte(e.target.value)} aria-label="Até ao dia" title="Até ao dia (opcional)" />
        <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-sm hover:bg-muted" title="Uma imagem pequena ao lado da mensagem (opcional)">
          {previa ? <img src={previa} alt="" className="h-6 w-6 rounded object-cover" /> : <ImageIcon className="h-4 w-4" />}
          {imagem ? 'Trocar' : 'Imagem'}
          <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" onChange={(e) => setImagem(e.target.files?.[0] || null)} />
        </label>
        <Button type="submit" disabled={aEnviar}><Plus className="mr-1 h-4 w-4" />{aEnviar ? 'A enviar…' : 'Acrescentar'}</Button>
      </form>
      <ul className="max-h-[45vh] divide-y overflow-y-auto">
        {!lista.length && <li className="py-6 text-center text-sm text-muted-foreground">Ainda sem mensagens: o rodapé mostra só os números.</li>}
        {lista.map((m, k) => {
          const passou = m.ate && String(m.ate) < hoje;
          return (
            <li key={m.id} className={cn('flex items-center gap-2 py-2', passou && 'opacity-50')}>
              {m.imagem ? <img src={m.imagem} alt="" className="h-9 w-9 shrink-0 rounded-md object-cover" /> : <Newspaper className="h-4 w-4 shrink-0 text-muted-foreground" />}
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
  const [comoVinheta, setComoVinheta] = useState(false);
  const [envio, setEnvio] = useState('');

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
    await feito(supabase.from('painel_tv_midia').insert({ url: u, tipo, titulo: titulo.trim(), duracao_s: Math.min(Math.max(Number(duracao) || 15, 3), 3600), ordem, papel: comoVinheta ? 'vinheta' : 'publicidade' }),
      tipo === 'video' ? 'Vídeo acrescentado.' : tipo === 'youtube' ? 'Vídeo do YouTube acrescentado.' : 'Imagem acrescentada.');
    setUrl('');
    setTitulo('');
  }

  /** Um ou mais vídeos e imagens do computador: vão para o bucket da TV e entram na lista, pela ordem escolhida. */
  async function carregar(ficheiros) {
    const lista = [...(ficheiros || [])];
    if (!lista.length) return;
    let ordem = (midia.reduce((m, x) => Math.max(m, x.ordem ?? 0), 0) || 0) + 1;
    let feitos = 0;
    for (const [k, f] of lista.entries()) {
      setEnvio(`A enviar ${k + 1} de ${lista.length}: ${f.name}`);
      try {
        const url = await enviarFicheiroTv(f, comoVinheta ? 'vinhetas' : 'publicidade');
        const { error } = await supabase.from('painel_tv_midia').insert({
          url, tipo: f.type.startsWith('video/') ? 'video' : 'imagem', titulo: f.name.replace(/\.[^.]+$/, '').slice(0, 120),
          duracao_s: Math.min(Math.max(Number(duracao) || 15, 3), 3600), ordem: ordem++, papel: comoVinheta ? 'vinheta' : 'publicidade',
        });
        if (error) throw new Error(error.message);
        feitos++;
      } catch (err) {
        toast.error(err.message);
      }
    }
    setEnvio('');
    if (feitos) toast.success(feitos === 1 ? '1 ficheiro carregado.' : `${feitos} ficheiros carregados.`);
    await recarregar();
    onMudou?.();
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
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed p-3">
          <label className={cn('inline-flex cursor-pointer items-center gap-2 rounded-md bg-[#0a748f] px-3 py-2 text-sm font-semibold text-white hover:bg-[#075a70]', envio && 'pointer-events-none opacity-60')}>
            <Upload className="h-4 w-4" />Carregar do computador
            <input type="file" multiple accept="video/mp4,video/webm,video/quicktime,image/jpeg,image/png,image/webp,image/gif" className="sr-only"
              onChange={(e) => { carregar(e.target.files); e.target.value = ''; }} />
          </label>
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
            <Switch checked={comoVinheta} onCheckedChange={setComoVinheta} />
            Como vinheta <span className="text-xs text-muted-foreground">(passa entre os anúncios, como nos canais de TV)</span>
          </label>
          <span className="w-full text-xs text-muted-foreground">
            {envio || 'Um ou vários de uma vez: MP4, WebM ou MOV e imagens, até 100 MB cada.'}
          </span>
        </div>
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
                <button type="button" title={m.papel === 'vinheta' ? 'Vinheta: passa entre os anúncios' : 'Anúncio (carregue para passar a vinheta)'}
                  onClick={() => feito(supabase.from('painel_tv_midia').update({ papel: m.papel === 'vinheta' ? 'publicidade' : 'vinheta' }).eq('id', m.id))}
                  className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', m.papel === 'vinheta' ? 'bg-[#b8892f]/15 text-[#7a5716]' : 'bg-muted text-muted-foreground')}>
                  <Clapperboard className="h-3 w-3" />{m.papel === 'vinheta' ? 'Vinheta' : 'Anúncio'}
                </button>
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

// KanGest — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

/**
 * O centro de ajuda do KanGest (src-tauri/src/services/ajuda.rs): o botão «Ajuda» no canto, o sino na barra e a tecla
 * F1 abrem o mesmo painel, com o aspecto do assistente do site da livraria:
 * - **Avisos:** o que precisa de atenção (o KanGest, a loja online e a equipa do site), cada um com o botão que leva
 *   ao ecrã onde se resolve;
 * - **Assistente:** as encomendas do site pelo número (com o mesmo cartão do site), um resumo delas e os dados da loja,
 *   calculado neste computador;
 * - **Atalhos:** os do ecrã onde se está e os de sempre.
 * O que se mostra é escolha de cada pessoa (a engrenagem do painel; fica neste aparelho).
 */
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { create } from "zustand";
import { toast } from "sonner";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Bell,
  BookOpen,
  Check,
  CheckCheck,
  DatabaseBackup,
  ExternalLink,
  Headset,
  Info,
  LifeBuoy,
  MessageCircle,
  RotateCcw,
  Send,
  Settings2,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { call, NA_APP } from "@/lib/api";
import { kz, pct, qtd } from "@/lib/format";
import { useKz } from "@/lib/privacidade";
import { navegador } from "@/lib/navegador";
import { cn } from "@/components/ui";
import { useSession } from "@/store/session";

// ------------------------------------------------------------------ o estado do painel

export type SeparadorAjuda = "avisos" | "atendimento" | "assistente" | "atalhos";

interface EstadoAjuda {
  aberto: boolean;
  separador: SeparadorAjuda;
  abrir: (s?: SeparadorAjuda) => void;
  fechar: () => void;
}

/** Abre e fecha o painel de qualquer sítio (o sino, o botão, a tecla F1). */
export const useAjuda = create<EstadoAjuda>((set) => ({
  aberto: false,
  separador: "avisos",
  abrir: (s) => set((e) => ({ aberto: true, separador: s ?? e.separador })),
  fechar: () => set({ aberto: false }),
}));

// ------------------------------------------------------------------ as escolhas de cada pessoa

interface Preferencias {
  /** o botão «Ajuda» no canto do ecrã */
  botao: boolean;
  /** também no POS e no ecrã da TV (por omissão, não tapa os botões da venda) */
  noPos: boolean;
  /** o botão do lado esquerdo */
  esquerda: boolean;
  /** que avisos aparecem */
  sistema: boolean;
  loja: boolean;
  equipa: boolean;
}

const PREFERENCIAS: Preferencias = { botao: true, noPos: false, esquerda: false, sistema: true, loja: true, equipa: true };

function chavePreferencias(id?: number) {
  return `kangest.ajuda.${id ?? 0}`;
}

function lerPreferencias(id?: number): Preferencias {
  try {
    return { ...PREFERENCIAS, ...JSON.parse(localStorage.getItem(chavePreferencias(id)) ?? "{}") };
  } catch {
    return PREFERENCIAS;
  }
}

function usePreferencias(): [Preferencias, (p: Partial<Preferencias>) => void] {
  const id = useSession((s) => s.sessao?.id);
  const [p, setP] = useState(() => lerPreferencias(id));
  useEffect(() => setP(lerPreferencias(id)), [id]);
  const mudar = (novo: Partial<Preferencias>) => {
    const v = { ...p, ...novo };
    setP(v);
    try {
      localStorage.setItem(chavePreferencias(id), JSON.stringify(v));
    } catch {
      /* sem armazenamento: vale até fechar */
    }
    window.dispatchEvent(new Event("kangest-ajuda-preferencias"));
  };
  // o painel e o botão ficam iguais quando a escolha muda no outro
  useEffect(() => {
    const ler = () => setP(lerPreferencias(id));
    window.addEventListener("kangest-ajuda-preferencias", ler);
    return () => window.removeEventListener("kangest-ajuda-preferencias", ler);
  }, [id]);
  return [p, mudar];
}

// ------------------------------------------------------------------ os avisos

interface Aviso {
  id: string;
  origem: "kangest" | "loja" | "site";
  gravidade: "grave" | "atencao" | "info";
  titulo: string;
  texto: string;
  quando: string | null;
  lido: boolean;
  destino: string | null;
  site: string | null;
}

interface AvisosSite {
  ligado: boolean;
  site: string;
  motivo?: string;
  avisos: Aviso[];
}

function useAvisos(p: Preferencias) {
  const sessao = useSession((s) => s.sessao);
  const activo = !!sessao && !sessao.bloqueada;
  const locais = useQuery({ queryKey: ["ajuda-avisos"], queryFn: () => call<Aviso[]>("ajuda.avisos"), refetchInterval: 60_000, enabled: activo });
  const site = useQuery({
    queryKey: ["ajuda-avisos-site"],
    queryFn: () => call<AvisosSite>("ajuda.avisosSite"),
    refetchInterval: 120_000,
    retry: false,
    enabled: activo,
  });
  const avisos = useMemo(() => {
    const todos = [...(locais.data ?? []), ...(p.equipa ? (site.data?.avisos ?? []) : [])];
    const peso = { grave: 0, atencao: 1, info: 2 } as const;
    return todos
      .filter((a) => (a.origem === "kangest" ? p.sistema : a.origem === "loja" ? p.loja : true))
      .sort((a, b) => Number(a.lido) - Number(b.lido) || peso[a.gravidade] - peso[b.gravidade] || (b.quando ?? "").localeCompare(a.quando ?? ""));
  }, [locais.data, site.data, p.sistema, p.loja, p.equipa]);
  return { avisos, porLer: avisos.filter((a) => !a.lido).length, site: site.data, carregando: locais.isLoading };
}

/** «há 5 min», «há 2 h», «ontem», «12/11». */
function haQuanto(q: string | null) {
  if (!q) return "";
  const t = new Date(q).getTime();
  if (Number.isNaN(t)) return "";
  const min = Math.round((Date.now() - t) / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  if (min < 24 * 60) return `há ${Math.round(min / 60)} h`;
  if (min < 48 * 60) return "ontem";
  return new Date(t).toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit" });
}

/** Abre uma página do painel do site no navegador do KanGest (ou numa janela, no modo web). */
async function abrirNoSite(url: string) {
  try {
    if (NA_APP) await navegador("abrir", { texto: url });
    else window.open(url, "_blank", "noopener");
  } catch (x) {
    toast.error((x as Error).message);
  }
}

const ORIGEM: Record<Aviso["origem"], string> = { kangest: "KanGest", loja: "Loja online", site: "Equipa do site" };
const ICONE: Record<Aviso["gravidade"], [LucideIcon, string]> = {
  grave: [AlertTriangle, "text-danger bg-danger-50"],
  atencao: [AlertCircle, "text-accent-ink bg-accent-50"],
  info: [Info, "text-brand bg-brand-50"],
};

// ------------------------------------------------------------------ o sino da barra

/** O sino na barra de cima: o número de avisos por ler; abre o painel nos avisos. */
export function SinoAvisos() {
  const [p] = usePreferencias();
  const { porLer } = useAvisos(p);
  const abrir = useAjuda((s) => s.abrir);
  return (
    <button
      onClick={() => abrir("avisos")}
      className="relative grid size-10 place-items-center rounded-lg text-ink-2 hover:bg-sunken hover:text-ink"
      aria-label={porLer ? `Avisos: ${porLer} por ler` : "Avisos"}
      title="Avisos e ajuda (F1)"
    >
      <Bell className="size-[18px]" />
      {porLer > 0 && (
        <span className="absolute right-1 top-1 grid min-w-[17px] place-items-center rounded-full bg-danger px-1 text-[10.5px] font-semibold leading-[17px] text-white">
          {porLer > 99 ? "99+" : porLer}
        </span>
      )}
    </button>
  );
}

// ------------------------------------------------------------------ o centro de ajuda (botão e painel)

/** O botão «Ajuda» no canto e o painel; a tecla F1 abre e fecha. Vai uma vez na moldura do programa (AppShell). */
export function CentroAjuda() {
  const [p, mudar] = usePreferencias();
  const { aberto, abrir, fechar } = useAjuda();
  const { porLer, ...av } = useAvisos(p);
  const loc = useLocation();
  const ecraCheio = loc.pathname.startsWith("/pos") || loc.pathname.startsWith("/tv");
  // F1: a ajuda, como nos programas do Windows
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== "F1") return;
      e.preventDefault();
      if (useAjuda.getState().aberto) fechar();
      else abrir("assistente");
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [abrir, fechar]);
  // ?ajuda=avisos (a ligação kangest://ajuda): abre o painel nesse separador
  const nav = useNavigate();
  useEffect(() => {
    const pedido = new URLSearchParams(loc.search).get("ajuda");
    if (!pedido) return;
    abrir(["avisos", "atendimento", "assistente", "atalhos"].includes(pedido) ? (pedido as SeparadorAjuda) : "avisos");
    nav(loc.pathname, { replace: true });
  }, [loc.search, loc.pathname, abrir, nav]);
  const mostrarBotao = p.botao && (!ecraCheio || p.noPos);
  const lado = p.esquerda ? "left-4 sm:left-6" : "right-4 sm:right-6";
  return (
    <>
      {mostrarBotao && !aberto && (
        <button
          onClick={() => abrir(porLer ? "avisos" : "assistente")}
          className={cn(
            "fixed bottom-4 z-40 flex items-center gap-2 rounded-full border-2 border-white/80 bg-brand py-2.5 pl-3.5 pr-4 text-[14px] font-semibold text-white shadow-pop transition hover:bg-brand-600 sm:bottom-6",
            lado,
          )}
          aria-label={porLer ? `Ajuda — ${porLer} aviso(s) por ler` : "Ajuda"}
          title="Ajuda, avisos e assistente (F1)"
        >
          <span className="relative">
            <MessageCircle className="size-5" />
            <Bell className="absolute -right-1.5 -top-1.5 size-3 fill-brand" />
          </span>
          Ajuda
          {porLer > 0 && <span className="ml-0.5 grid min-w-[20px] place-items-center rounded-full bg-white px-1.5 text-[12px] font-bold text-brand">{porLer > 99 ? "99+" : porLer}</span>}
        </button>
      )}
      {aberto && <Painel p={p} mudar={mudar} lado={lado} avisos={av.avisos} site={av.site} carregando={av.carregando} porLer={porLer} />}
    </>
  );
}

function Painel({
  p,
  mudar,
  lado,
  avisos,
  site,
  carregando,
  porLer,
}: {
  p: Preferencias;
  mudar: (v: Partial<Preferencias>) => void;
  lado: string;
  avisos: Aviso[];
  site?: AvisosSite;
  carregando: boolean;
  porLer: number;
}) {
  const { separador, abrir, fechar } = useAjuda();
  const [opcoes, setOpcoes] = useState(false);
  // Esc fecha
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && fechar();
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [fechar]);
  const separadores: [SeparadorAjuda, string, LucideIcon][] = [
    ["avisos", "Avisos", Bell],
    ["atendimento", "Clientes", Headset],
    ["assistente", "Assistente", Sparkles],
    ["atalhos", "Atalhos", Zap],
  ];
  // as conversas dos clientes por ler (o separador «Clientes»)
  const conversas = useQuery({ queryKey: ["ajuda-conversas"], queryFn: () => call<Conversas>("ajuda.conversas"), refetchInterval: 30_000, retry: false });
  const conversasPorLer = (conversas.data?.conversas ?? []).filter((c) => c.por_ler).length;
  return (
    <section
      role="dialog"
      aria-label="Ajuda do KanGest"
      className={cn(
        "fixed bottom-4 z-50 flex h-[min(660px,calc(100vh-5rem))] w-[420px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-pop sm:bottom-6",
        lado,
      )}
    >
      <header className="flex items-center gap-3 bg-brand px-4 py-3 text-white">
        <span className="grid size-10 place-items-center rounded-full bg-white/15">
          <LifeBuoy className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[16px] font-semibold leading-tight">Ajuda do KanGest</div>
          <div className="flex items-center gap-1.5 text-[12.5px] text-white/80">
            <span className={cn("size-2 rounded-full", site?.ligado ? "bg-emerald-300" : "bg-white/50")} />
            {site?.ligado ? "Ligado ao site da livraria" : "Neste computador"}
          </div>
        </div>
        <button onClick={() => setOpcoes((o) => !o)} className={cn("grid size-9 place-items-center rounded-lg hover:bg-white/15", opcoes && "bg-white/15")} aria-label="Opções da ajuda" title="Opções">
          <Settings2 className="size-[18px]" />
        </button>
        <button onClick={fechar} className="grid size-9 place-items-center rounded-lg hover:bg-white/15" aria-label="Fechar a ajuda" title="Fechar (Esc)">
          <X className="size-5" />
        </button>
      </header>
      {opcoes ? (
        <Opcoes p={p} mudar={mudar} onFechar={() => setOpcoes(false)} />
      ) : (
        <>
          <div className="grid grid-cols-4 gap-1 border-b border-line bg-surface p-2" role="tablist">
            {separadores.map(([id, rotulo, Icone]) => (
              <button
                key={id}
                role="tab"
                aria-selected={separador === id}
                onClick={() => abrir(id)}
                className={cn(
                  "flex items-center justify-center gap-1 rounded-lg py-2 text-[12.5px] font-medium",
                  separador === id ? "bg-brand-50 text-brand" : "text-ink-3 hover:bg-sunken hover:text-ink",
                )}
              >
                <Icone className="size-4" /> {rotulo}
                {id === "avisos" && porLer > 0 && <span className="rounded-full bg-danger px-1.5 text-[11px] font-semibold text-white">{porLer}</span>}
                {id === "atendimento" && conversasPorLer > 0 && <span className="rounded-full bg-danger px-1.5 text-[11px] font-semibold text-white">{conversasPorLer}</span>}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1">
            {separador === "avisos" && <ListaAvisos avisos={avisos} site={site} carregando={carregando} />}
            {separador === "atendimento" && <Atendimento dados={conversas.data} carregando={conversas.isLoading} site={site?.site ?? ""} />}
            {separador === "assistente" && <Assistente />}
            {separador === "atalhos" && <Atalhos site={site?.site ?? ""} />}
          </div>
        </>
      )}
    </section>
  );
}

// ------------------------------------------------------------------ separador: avisos

function ListaAvisos({ avisos, site, carregando }: { avisos: Aviso[]; site?: AvisosSite; carregando: boolean }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const fechar = useAjuda((s) => s.fechar);
  const porLer = avisos.filter((a) => !a.lido);
  async function marcar(ids: string[]) {
    if (!ids.length) return;
    try {
      await call("ajuda.lido", { ids });
    } catch (e) {
      toast.error((e as Error).message);
    }
    void qc.invalidateQueries({ queryKey: ["ajuda-avisos"] });
    void qc.invalidateQueries({ queryKey: ["ajuda-avisos-site"] });
  }
  function abrirAviso(a: Aviso) {
    void marcar(a.lido ? [] : [a.id]);
    if (a.destino) {
      nav(a.destino);
      fechar();
    } else if (a.site) void abrirNoSite(a.site);
  }
  return (
    <div className="flex h-full flex-col">
      {porLer.length > 0 && (
        <div className="flex items-center justify-between px-4 pt-3 text-[12.5px]">
          <span className="text-ink-3">{porLer.length === 1 ? "1 aviso por ler" : `${porLer.length} avisos por ler`}</span>
          <button onClick={() => marcar(porLer.map((a) => a.id))} className="flex items-center gap-1 font-medium text-brand hover:underline">
            <CheckCheck className="size-3.5" /> Marcar todos como lidos
          </button>
        </div>
      )}
      <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {carregando && <li className="p-6 text-center text-[13px] text-ink-3">A carregar…</li>}
        {!carregando && avisos.length === 0 && (
          <li className="flex flex-col items-center gap-2 p-8 text-center">
            <span className="grid size-12 place-items-center rounded-full bg-ok-50 text-ok">
              <ShieldCheck className="size-6" />
            </span>
            <span className="font-medium">Está tudo em dia</span>
            <span className="text-[13px] text-ink-3">Os avisos das cópias, da AGT, da ligação ao site e das encomendas aparecem aqui.</span>
          </li>
        )}
        {avisos.map((a) => {
          const [Icone, cor] = ICONE[a.gravidade];
          return (
            <li key={a.id} className={cn("rounded-xl border p-3", a.lido ? "border-line bg-surface opacity-75" : "border-line-strong bg-bg")}>
              <div className="flex gap-3">
                <span className={cn("grid size-8 shrink-0 place-items-center rounded-full", cor)}>
                  <Icone className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className={cn("text-[13.5px]", a.lido ? "font-medium" : "font-semibold")}>{a.titulo}</span>
                    {!a.lido && <span className="size-2 shrink-0 rounded-full bg-brand" aria-label="por ler" />}
                  </div>
                  {a.texto && <p className="mt-0.5 text-[13px] leading-snug text-ink-2">{a.texto}</p>}
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
                    <span className="text-ink-3">
                      {ORIGEM[a.origem]}
                      {a.quando ? ` · ${haQuanto(a.quando)}` : ""}
                    </span>
                    {(a.destino || a.site) && (
                      <button onClick={() => abrirAviso(a)} className="flex items-center gap-1 font-medium text-brand hover:underline">
                        {a.destino ? (
                          <>
                            Resolver <ArrowRight className="size-3.5" />
                          </>
                        ) : (
                          <>
                            Abrir no painel do site <ExternalLink className="size-3.5" />
                          </>
                        )}
                      </button>
                    )}
                    {!a.lido && (
                      <button onClick={() => marcar([a.id])} className="flex items-center gap-1 text-ink-3 hover:text-ink">
                        <Check className="size-3.5" /> Lido
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {site && !site.ligado && site.motivo && (
        <p className="border-t border-line px-4 py-2.5 text-[12px] text-ink-3">
          Avisos da equipa do site: {site.motivo}{" "}
          <button
            onClick={() => {
              nav("/loja-online");
              fechar();
            }}
            className="font-medium text-brand hover:underline"
          >
            Entrar com a conta do site
          </button>
        </p>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ separador: atendimento (as conversas dos clientes)

interface Conversa {
  id: string;
  subject: string | null;
  status: "open" | "pending" | "closed" | "bot";
  assigned_to: string | null;
  last_message_at: string | null;
  ticket_number: number | null;
  priority: string | null;
  order_id: string | null;
  cliente: string;
  encomenda: string | null;
  por_ler: boolean;
}

interface Conversas {
  ligado: boolean;
  motivo?: string;
  conversas: Conversa[];
}

interface MensagemSite {
  id: number;
  body: string;
  created_at: string;
  author_kind: "customer" | "staff" | "assistant" | "system" | "note";
}

/** As conversas dos clientes do site (src-tauri/src/sinc/atendimento.rs), com a conta do site e as regras de lá. */
function Atendimento({ dados, carregando, site }: { dados?: Conversas; carregando: boolean; site: string }) {
  const [aberta, setAberta] = useState<Conversa | null>(null);
  const nav = useNavigate();
  const fechar = useAjuda((s) => s.fechar);
  if (aberta) return <ConversaAberta c={aberta} site={site} onVoltar={() => setAberta(null)} />;
  if (carregando) return <p className="p-6 text-center text-[13px] text-ink-3">A pedir ao site…</p>;
  if (!dados?.ligado)
    return (
      <div className="space-y-3 p-5 text-[13px] text-ink-2">
        <p>As mensagens dos clientes vêm do site, com a sua conta de lá e a permissão «Gerir encomendas».</p>
        {dados?.motivo && <p className="text-ink-3">{dados.motivo}</p>}
        <button
          onClick={() => {
            nav("/loja-online");
            fechar();
          }}
          className="font-medium text-brand hover:underline"
        >
          Entrar com a conta do site
        </button>
      </div>
    );
  if (dados.conversas.length === 0)
    return (
      <div className="flex flex-col items-center gap-2 p-8 text-center">
        <span className="grid size-12 place-items-center rounded-full bg-ok-50 text-ok">
          <Headset className="size-6" />
        </span>
        <span className="font-medium">Nenhuma conversa à espera</span>
        <span className="text-[13px] text-ink-3">As mensagens dos clientes do site aparecem aqui.</span>
      </div>
    );
  return (
    <ul className="h-full space-y-2 overflow-y-auto p-3">
      {dados.conversas.map((c) => (
        <li key={c.id}>
          <button onClick={() => setAberta(c)} className={cn("w-full rounded-xl border p-3 text-left hover:border-brand/50", c.por_ler ? "border-line-strong bg-bg" : "border-line bg-surface")}>
            <div className="flex items-baseline gap-2">
              <span className={cn("min-w-0 flex-1 truncate text-[13.5px]", c.por_ler ? "font-semibold" : "font-medium")}>{c.cliente}</span>
              <span className="shrink-0 text-[11.5px] text-ink-3">{haQuanto(c.last_message_at)}</span>
              {c.por_ler && <span className="size-2 shrink-0 rounded-full bg-brand" aria-label="por ler" />}
            </div>
            <div className="mt-0.5 truncate text-[12.5px] text-ink-2">{c.subject || "Sem assunto"}</div>
            <div className="mt-1 flex gap-2 text-[11.5px] text-ink-3">
              {c.ticket_number && <span>Pedido #{c.ticket_number}</span>}
              {c.encomenda && <span className="font-mono">{c.encomenda}</span>}
              {c.status === "pending" && <span className="text-accent-ink">em espera</span>}
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}

function ConversaAberta({ c, site, onVoltar }: { c: Conversa; site: string; onVoltar: () => void }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const fechar = useAjuda((s) => s.fechar);
  const [texto, setTexto] = useState("");
  const [aEnviar, setAEnviar] = useState(false);
  const fim = useRef<HTMLDivElement>(null);
  const mensagens = useQuery({ queryKey: ["ajuda-conversa", c.id], queryFn: () => call<MensagemSite[]>("ajuda.conversa", { id: c.id }), refetchInterval: 15_000 });
  useEffect(() => fim.current?.scrollIntoView({ block: "end" }), [mensagens.data]);
  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!texto.trim() || aEnviar) return;
    setAEnviar(true);
    try {
      await call("ajuda.responder", { id: c.id, texto });
      setTexto("");
      void qc.invalidateQueries({ queryKey: ["ajuda-conversa", c.id] });
      void qc.invalidateQueries({ queryKey: ["ajuda-conversas"] });
    } catch (x) {
      toast.error((x as Error).message);
    } finally {
      setAEnviar(false);
    }
  }
  async function estado(novo: "pending" | "closed") {
    try {
      await call("ajuda.estadoConversa", { id: c.id, estado: novo, responsavel: c.assigned_to });
      toast.success(novo === "closed" ? "Conversa resolvida." : "Conversa em espera do cliente.");
      void qc.invalidateQueries({ queryKey: ["ajuda-conversas"] });
      onVoltar();
    } catch (x) {
      toast.error((x as Error).message);
    }
  }
  const estilo: Record<MensagemSite["author_kind"], string> = {
    customer: "mr-auto rounded-tl-md border border-line bg-surface",
    staff: "ml-auto rounded-tr-md bg-brand text-white",
    note: "mx-auto border border-accent/40 bg-accent-50 text-accent-ink",
    assistant: "mr-auto rounded-tl-md bg-sunken text-ink-2",
    system: "mx-auto bg-transparent text-[12px] text-ink-3",
  };
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <button onClick={onVoltar} className="rounded-md px-2 py-1 text-[13px] text-brand hover:bg-brand-50">
          ← Conversas
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13.5px] font-semibold">{c.cliente}</div>
          <div className="truncate text-[12px] text-ink-3">
            {c.subject || "Sem assunto"}
            {c.ticket_number ? ` · Pedido #${c.ticket_number}` : ""}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 border-b border-line px-3 py-2 text-[12.5px]">
        {c.order_id && (
          <button
            onClick={() => {
              nav(`/loja-online?encomenda=${encodeURIComponent(c.order_id ?? "")}`);
              fechar();
            }}
            className="rounded-md border border-line px-2 py-1 hover:bg-sunken"
          >
            <ShoppingBag className="mr-1 inline size-3.5" />
            {c.encomenda ?? "A encomenda"}
          </button>
        )}
        {c.status !== "pending" && (
          <button onClick={() => estado("pending")} className="rounded-md border border-line px-2 py-1 hover:bg-sunken">
            Em espera do cliente
          </button>
        )}
        <button onClick={() => estado("closed")} className="rounded-md border border-line px-2 py-1 text-ok hover:bg-ok-50">
          <Check className="mr-1 inline size-3.5" />
          Resolver
        </button>
        {site && (
          <button onClick={() => abrirNoSite(`${site}/admin?tab=support`)} className="ml-auto rounded-md px-2 py-1 text-ink-3 hover:text-ink">
            <ExternalLink className="inline size-3.5" />
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-bg p-3">
        {mensagens.isLoading && <p className="text-center text-[13px] text-ink-3">A carregar…</p>}
        {mensagens.isError && <p className="text-center text-[13px] text-danger">{(mensagens.error as Error).message}</p>}
        {(mensagens.data ?? []).map((m) => (
          <div key={m.id} className={cn("w-fit max-w-[85%] rounded-2xl px-3.5 py-2 text-[13.5px]", estilo[m.author_kind] ?? estilo.customer)}>
            {m.author_kind === "note" && <span className="mb-0.5 block text-[11px] font-semibold uppercase">Nota interna</span>}
            {m.author_kind === "assistant" && <span className="mb-0.5 block text-[11px] font-semibold">Assistente</span>}
            <span className="whitespace-pre-wrap">{m.body}</span>
            <span className={cn("mt-0.5 block text-[10.5px]", m.author_kind === "staff" ? "text-white/70" : "text-ink-3")}>{haQuanto(m.created_at)}</span>
          </div>
        ))}
        <div ref={fim} />
      </div>
      <form onSubmit={enviar} className="flex items-end gap-2 border-t border-line bg-surface p-3">
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void enviar(e as unknown as FormEvent);
            }
          }}
          rows={2}
          maxLength={4000}
          placeholder="Responder ao cliente…"
          aria-label="A resposta ao cliente"
          className="min-h-[44px] min-w-0 flex-1 resize-none rounded-xl border-2 border-brand/40 bg-bg px-3 py-2 text-[14px] outline-none focus:border-brand"
        />
        <button type="submit" disabled={!texto.trim() || aEnviar} className="grid size-11 shrink-0 place-items-center rounded-full bg-brand text-white disabled:opacity-40" aria-label="Enviar">
          <Send className="size-4" />
        </button>
      </form>
    </div>
  );
}

// ------------------------------------------------------------------ separador: assistente

type Parte = string | { kz: number } | { qtd: number } | { pct: number };

interface RespostaDados {
  entendi: string;
  resposta: Parte[];
  linhas: { rotulo: string; valor: Parte[] }[];
  ligacao: string;
  nota: string | null;
}

interface CartaoEncomenda {
  id: string;
  numero: string;
  feita: string;
  etapa: string;
  etapa_texto: string;
  cancelada: boolean;
  levantamento: boolean;
  passos: { rotulo: string; feito: boolean; actual: boolean }[];
  pagamento: string;
  metodo_pagamento: string;
  cliente: string;
  telefone: string;
  livros: string[];
  total: number;
}

type Resposta =
  | { tipo: "encomenda"; texto: string; encomenda: CartaoEncomenda }
  | { tipo: "encomendas"; texto: string; encomendas: CartaoEncomenda[] }
  | { tipo: "dados"; resposta: RespostaDados }
  | { tipo: "nao_percebi"; texto: string };

interface Mensagem {
  de: "eu" | "kangest";
  texto?: string;
  resposta?: Resposta;
}

/** As perguntas sugeridas, conforme o ecrã onde se está. */
function sugestoesPara(caminho: string): string[] {
  if (caminho.startsWith("/loja-online")) return ["Encomendas em aberto", "Quanto vendi hoje?", "O que vai esgotar?"];
  if (caminho.startsWith("/clientes") || caminho.startsWith("/contas")) return ["Quem me deve mais?", "Melhores clientes este mês", "Quanto vendi este mês?"];
  if (caminho.startsWith("/stock") || caminho.startsWith("/artigos") || caminho.startsWith("/inventario")) return ["O que vai esgotar?", "Artigos mais vendidos este mês", "Stock parado"];
  if (caminho.startsWith("/pos") || caminho.startsWith("/caixa")) return ["Quanto vendi hoje?", "Ticket médio desta semana", "Encomendas em aberto"];
  if (caminho.startsWith("/relatorios") || caminho === "/") return ["Quanto vendi ontem?", "Lucro deste mês", "Previsão do fecho do mês"];
  return ["Quanto vendi hoje?", "Encomendas em aberto", "Quem me deve mais?"];
}

/** **negrito** do texto das respostas. */
function Negrito({ texto }: { texto: string }) {
  return (
    <>
      {texto.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
        p.startsWith("**") && p.endsWith("**") ? (
          <strong key={i} className="font-semibold">
            {p.slice(2, -2)}
          </strong>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

function Partes({ p }: { p: Parte[] }) {
  const kzV = useKz();
  return (
    <>
      {p.map((x, i) =>
        typeof x === "string" ? (
          <span key={i}>{x}</span>
        ) : (
          <span key={i} className="num font-semibold">
            {"kz" in x ? kzV(x.kz) : "qtd" in x ? qtd(x.qtd) : pct(x.pct)}
          </span>
        ),
      )}
    </>
  );
}

function Assistente() {
  const loc = useLocation();
  const nav = useNavigate();
  const fechar = useAjuda((s) => s.fechar);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [texto, setTexto] = useState("");
  const [aEspera, setAEspera] = useState(false);
  const fim = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLInputElement>(null);
  useEffect(() => campo.current?.focus(), []);
  useEffect(() => fim.current?.scrollIntoView({ block: "end" }), [mensagens, aEspera]);
  async function perguntar(pergunta: string) {
    const t = pergunta.trim();
    if (!t || aEspera) return;
    setMensagens((m) => [...m, { de: "eu", texto: t }]);
    setTexto("");
    setAEspera(true);
    try {
      const r = await call<Resposta>("ajuda.perguntar", { texto: t });
      setMensagens((m) => [...m, { de: "kangest", resposta: r }]);
    } catch (e) {
      setMensagens((m) => [...m, { de: "kangest", texto: (e as Error).message }]);
    } finally {
      setAEspera(false);
    }
  }
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    void perguntar(texto);
  };
  const ir = (destino: string) => {
    nav(destino);
    fechar();
  };
  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-bg p-3">
        <Bolha>
          Olá! Pergunte pelas <strong>encomendas do site</strong> (o número, como ENC-6W05J5GH6), pelas <strong>vendas</strong>, pelo{" "}
          <strong>stock</strong> de um livro ou por <strong>quem deve</strong> à loja.
        </Bolha>
        {mensagens.map((m, i) =>
          m.de === "eu" ? (
            <div key={i} className="flex justify-end">
              <span className="max-w-[85%] rounded-2xl rounded-br-md bg-brand px-3.5 py-2 text-[14px] text-white">{m.texto}</span>
            </div>
          ) : (
            <RespostaKanGest key={i} m={m} ir={ir} />
          ),
        )}
        {aEspera && <Bolha>A procurar…</Bolha>}
        {mensagens.length === 0 && (
          <div className="flex flex-wrap gap-2 pl-10">
            {sugestoesPara(loc.pathname).map((s) => (
              <button key={s} onClick={() => perguntar(s)} className="rounded-full border border-brand/30 bg-surface px-3 py-1.5 text-[13px] text-brand hover:bg-brand-50">
                {s}
              </button>
            ))}
          </div>
        )}
        <div ref={fim} />
      </div>
      <div className="border-t border-line bg-surface p-3">
        <form onSubmit={enviar} className="flex items-center gap-2">
          {mensagens.length > 0 && (
            <button type="button" onClick={() => setMensagens([])} className="grid size-10 shrink-0 place-items-center rounded-full text-ink-3 hover:bg-sunken" title="Começar de novo" aria-label="Começar de novo">
              <RotateCcw className="size-4" />
            </button>
          )}
          <input
            ref={campo}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Escreva a sua pergunta…"
            aria-label="A sua pergunta"
            className="h-11 min-w-0 flex-1 rounded-full border-2 border-brand/40 bg-bg px-4 text-[14px] outline-none focus:border-brand"
          />
          <button type="submit" disabled={!texto.trim() || aEspera} className="grid size-11 shrink-0 place-items-center rounded-full bg-brand text-white disabled:opacity-40" aria-label="Enviar">
            <Send className="size-4" />
          </button>
        </form>
        <p className="mt-2 text-center text-[11.5px] text-ink-3">Respondido neste computador, com os dados da loja. Nada sai para fora.</p>
      </div>
    </div>
  );
}

function Bolha({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand text-white">
        <Sparkles className="size-4" />
      </span>
      <div className="min-w-0 max-w-[85%] rounded-2xl rounded-tl-md border border-line bg-surface px-3.5 py-2.5 text-[14px] leading-relaxed shadow-xs">{children}</div>
    </div>
  );
}

function RespostaKanGest({ m, ir }: { m: Mensagem; ir: (destino: string) => void }) {
  const r = m.resposta;
  if (!r) return <Bolha>{m.texto}</Bolha>;
  if (r.tipo === "dados") {
    const d = r.resposta;
    return (
      <Bolha>
        <span className="block text-[12px] text-ink-3">{d.entendi}</span>
        <Partes p={d.resposta} />
        {d.linhas.length > 0 && (
          <ul className="mt-2 space-y-1 border-t border-line pt-2 text-[13px]">
            {d.linhas.map((l, k) => (
              <li key={k} className="flex justify-between gap-3">
                <span className="truncate text-ink-2">{l.rotulo}</span>
                <span className="shrink-0">
                  <Partes p={l.valor} />
                </span>
              </li>
            ))}
          </ul>
        )}
        {d.nota && <span className="mt-1.5 block text-[12px] text-ink-3">{d.nota}</span>}
        {d.ligacao && (
          <button onClick={() => ir(d.ligacao)} className="mt-2 flex items-center gap-1 text-[13px] font-medium text-brand hover:underline">
            Ver em pormenor <ArrowRight className="size-3.5" />
          </button>
        )}
      </Bolha>
    );
  }
  if (r.tipo === "encomenda")
    return (
      <div className="space-y-2">
        <Bolha>
          <Negrito texto={r.texto} />
        </Bolha>
        <div className="pl-10">
          <CartaoDaEncomenda c={r.encomenda} ir={ir} />
        </div>
      </div>
    );
  if (r.tipo === "encomendas")
    return (
      <div className="space-y-2">
        <Bolha>
          <Negrito texto={r.texto} />
        </Bolha>
        <div className="space-y-2 pl-10">
          {r.encomendas.map((c) => (
            <CartaoDaEncomenda key={c.id} c={c} ir={ir} />
          ))}
          <button onClick={() => ir("/loja-online?filtro=por_confirmar")} className="flex items-center gap-1 text-[13px] font-medium text-brand hover:underline">
            <ShoppingBag className="size-3.5" /> Abrir a Loja online
          </button>
        </div>
      </div>
    );
  return <Bolha>{r.texto}</Bolha>;
}

/** O cartão da encomenda, como o do assistente do site: o número, as etapas, o pagamento, os livros e o total. */
function CartaoDaEncomenda({ c, ir }: { c: CartaoEncomenda; ir: (destino: string) => void }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-xs">
      <div className="flex items-start justify-between gap-2 border-b border-line bg-bg px-3.5 py-2.5">
        <div>
          <div className="font-mono text-[14px] font-semibold text-brand">{c.numero}</div>
          <div className="text-[12px] text-ink-3">Feita a {c.feita}</div>
        </div>
        <span
          className={cn(
            "rounded-full px-2.5 py-0.5 text-[12px] font-medium",
            c.cancelada ? "bg-danger-50 text-danger" : c.etapa === "delivered" ? "bg-ok-50 text-ok" : "bg-brand-50 text-brand",
          )}
        >
          {c.etapa_texto}
        </span>
      </div>
      {!c.cancelada && (
        <ol className="flex items-start px-2 pb-1 pt-3" aria-label="Etapas da encomenda">
          {c.passos.map((p, i) => (
            <li key={p.rotulo} className="relative flex flex-1 flex-col items-center text-center">
              {i > 0 && <span className={cn("absolute right-1/2 top-3 h-0.5 w-full -translate-y-1/2", p.feito || p.actual ? "bg-brand" : "bg-line")} />}
              <span
                className={cn(
                  "relative z-10 grid size-6 place-items-center rounded-full border-2",
                  p.feito ? "border-brand bg-brand text-white" : p.actual ? "border-brand bg-surface text-brand" : "border-line bg-surface text-ink-3",
                )}
              >
                {p.feito ? <Check className="size-3.5" /> : <span className={cn("size-2 rounded-full", p.actual ? "bg-brand" : "bg-line")} />}
              </span>
              <span className={cn("mt-1 text-[10.5px] leading-tight", p.actual ? "font-semibold text-ink" : "text-ink-3")}>{p.rotulo}</span>
            </li>
          ))}
        </ol>
      )}
      <dl className="grid grid-cols-[92px_minmax(0,1fr)] gap-x-2 gap-y-1 px-3.5 py-2.5 text-[12.5px]">
        <dt className="text-ink-3">Cliente</dt>
        <dd className="truncate">
          {c.cliente || "—"}
          {c.telefone ? ` · ${c.telefone}` : ""}
        </dd>
        {c.pagamento && (
          <>
            <dt className="text-ink-3">Pagamento</dt>
            <dd>
              {c.pagamento.charAt(0).toUpperCase() + c.pagamento.slice(1)}
              {c.metodo_pagamento ? ` · ${c.metodo_pagamento}` : ""}
            </dd>
          </>
        )}
        <dt className="text-ink-3">{c.levantamento ? "Levantamento" : "Entrega"}</dt>
        <dd>{c.levantamento ? "Nesta loja" : "Na morada do cliente"}</dd>
        {c.livros.length > 0 && (
          <>
            <dt className="text-ink-3">Livros</dt>
            <dd>{c.livros.join(", ")}</dd>
          </>
        )}
        <dt className="text-ink-3">Total</dt>
        <dd className="num font-semibold">{kz(Math.round(c.total * 100))}</dd>
      </dl>
      <button onClick={() => ir(`/loja-online?encomenda=${encodeURIComponent(c.id)}`)} className="flex w-full items-center justify-center gap-1 border-t border-line py-2 text-[13px] font-medium text-brand hover:bg-brand-50">
        Abrir na Loja online <ArrowRight className="size-3.5" />
      </button>
    </div>
  );
}

// ------------------------------------------------------------------ separador: atalhos

interface AtalhoAjuda {
  rotulo: string;
  icone: LucideIcon;
  destino?: string;
  site?: string;
  permissao?: string;
}

/** Os atalhos do ecrã onde se está. */
function atalhosDoEcra(caminho: string): AtalhoAjuda[] {
  if (caminho.startsWith("/loja-online"))
    return [
      { rotulo: "Encomendas por confirmar", icone: ShoppingBag, destino: "/loja-online?filtro=por_confirmar" },
      { rotulo: "Levantamentos por fazer", icone: ShoppingBag, destino: "/loja-online?filtro=levantamentos" },
    ];
  if (caminho.startsWith("/pos") || caminho.startsWith("/caixa"))
    return [
      { rotulo: "Caixa e fechos", icone: Zap, destino: "/caixa" },
      { rotulo: "Atalhos de teclado do POS", icone: BookOpen, destino: "/sobre?vista=manual" },
    ];
  if (caminho.startsWith("/documentos"))
    return [
      { rotulo: "Nova factura-recibo", icone: Zap, destino: "/documentos/novo/FR", permissao: "vendas.fatura_recibo" },
      { rotulo: "Nova factura", icone: Zap, destino: "/documentos/novo/FT" },
    ];
  if (caminho.startsWith("/stock") || caminho.startsWith("/artigos"))
    return [
      { rotulo: "Sugestão de encomendas", icone: Zap, destino: "/compras/sugestao", permissao: "compras.fatura" },
      { rotulo: "Relatório de stock", icone: Zap, destino: "/relatorios/stock" },
    ];
  if (caminho.startsWith("/clientes") || caminho.startsWith("/contas")) return [{ rotulo: "Contas a receber", icone: Zap, destino: "/contas/receber" }];
  return [];
}

function Atalhos({ site }: { site: string }) {
  const loc = useLocation();
  const nav = useNavigate();
  const fechar = useAjuda((s) => s.fechar);
  const tem = useSession((s) => s.tem);
  const ver = (a: AtalhoAjuda) => !a.permissao || tem(a.permissao);
  const doEcra = atalhosDoEcra(loc.pathname).filter(ver);
  const sempre: AtalhoAjuda[] = [
    { rotulo: "Cópia de segurança", icone: DatabaseBackup, destino: "/configuracoes?aba=sistema", permissao: "sistema.backup" },
    { rotulo: "Verificação da base e actualizações", icone: ShieldCheck, destino: "/sobre" },
    { rotulo: "Loja online", icone: ShoppingBag, destino: "/loja-online" },
    { rotulo: "Manual e atalhos de teclado", icone: BookOpen, destino: "/sobre?vista=manual" },
    ...(site ? [{ rotulo: "Abrir o painel do site", icone: ExternalLink, site: `${site}/admin` }] : []),
  ].filter(ver);
  const usar = (a: AtalhoAjuda) => {
    if (a.destino) {
      nav(a.destino);
      fechar();
    } else if (a.site) void abrirNoSite(a.site);
  };
  const lista = (titulo: string, itens: AtalhoAjuda[]) =>
    itens.length > 0 && (
      <div>
        <div className="mb-1.5 px-1 text-[11.5px] font-semibold uppercase tracking-wide text-ink-3">{titulo}</div>
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          {itens.map((a) => (
            <button key={a.rotulo} onClick={() => usar(a)} className="flex w-full items-center gap-3 border-b border-line px-3.5 py-2.5 text-left text-[13.5px] last:border-b-0 hover:bg-sunken">
              <a.icone className="size-4 text-brand" />
              <span className="flex-1">{a.rotulo}</span>
              {a.site ? <ExternalLink className="size-3.5 text-ink-3" /> : <ArrowRight className="size-3.5 text-ink-3" />}
            </button>
          ))}
        </div>
      </div>
    );
  return (
    <div className="h-full space-y-4 overflow-y-auto bg-bg p-3">
      {lista("Neste ecrã", doEcra)}
      {lista("Sempre à mão", sempre)}
      <p className="px-1 text-[12px] text-ink-3">
        <kbd>F1</kbd> abre a ajuda em qualquer ecrã; <kbd>{navigator.platform.toLowerCase().includes("mac") ? "⌘" : "Ctrl"}</kbd> <kbd>K</kbd> pesquisa ecrãs, documentos, clientes e artigos.
      </p>
    </div>
  );
}

// ------------------------------------------------------------------ opções

function Opcoes({ p, mudar, onFechar }: { p: Preferencias; mudar: (v: Partial<Preferencias>) => void; onFechar: () => void }) {
  const opcao = (chave: keyof Preferencias, titulo: string, texto?: string, desligada?: boolean) => (
    <label className={cn("flex cursor-pointer items-start gap-3 px-1 py-1.5", desligada && "pointer-events-none opacity-50")}>
      <input type="checkbox" className="mt-0.5 size-4" checked={p[chave]} disabled={desligada} onChange={(e) => mudar({ [chave]: e.target.checked })} />
      <span>
        <span className="block text-[13.5px] font-medium">{titulo}</span>
        {texto && <span className="block text-[12.5px] text-ink-3">{texto}</span>}
      </span>
    </label>
  );
  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-bg p-4">
      <div>
        <div className="mb-1 text-[11.5px] font-semibold uppercase tracking-wide text-ink-3">O botão «Ajuda»</div>
        {opcao("botao", "Mostrar o botão no canto do ecrã", "O sino na barra e a tecla F1 abrem a ajuda sempre.")}
        {opcao("noPos", "Também no POS e no ecrã da TV", "Por omissão não aparece, para não tapar os botões da venda.", !p.botao)}
        {opcao("esquerda", "Do lado esquerdo", undefined, !p.botao)}
      </div>
      <div>
        <div className="mb-1 text-[11.5px] font-semibold uppercase tracking-wide text-ink-3">Que avisos aparecem</div>
        {opcao("sistema", "Do KanGest", "Cópias de segurança, disco, AGT, ligação ao site, actualizações e caixa.")}
        {opcao("loja", "Da loja online", "Encomendas por confirmar e levantamentos por fazer.")}
        {opcao("equipa", "Da equipa do site", "Encomendas novas e mensagens de clientes, com a sua conta do site.")}
      </div>
      <p className="text-[12px] text-ink-3">Estas escolhas são suas e ficam neste computador.</p>
      <button onClick={onFechar} className="w-full rounded-lg bg-brand py-2 text-[13.5px] font-medium text-white hover:bg-brand-600">
        Feito
      </button>
    </div>
  );
}

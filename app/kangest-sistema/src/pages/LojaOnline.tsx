// KanGest — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

/**
 * Livraria → Loja online (docs/LOJA-ONLINE.md): as encomendas desta loja e o catálogo do site, da cópia local que chega
 * com cada sincronização. Lê-se também sem Internet (a última cópia). As alterações fazem-se no painel do site, aberto
 * no navegador do KanGest, com o login de cada pessoa.
 */
import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { toast } from "sonner";
import { CheckCircle2, CloudOff, Copy, ExternalLink, Eye, EyeOff, KeyRound, Link2, Package, Pencil, Plus, Search, ShoppingBag, Store, Trash2, UserRound } from "lucide-react";
import { call, NA_APP } from "@/lib/api";
import { kz } from "@/lib/format";
import { navegador } from "@/lib/navegador";
import { Badge, Button, Card, Empty, Field, Input, Modal, PageHeader, Select, Table, Td, Th, cn } from "@/components/ui";

type Tom = "neutral" | "brand" | "ok" | "danger" | "accent";

// Os mesmos nomes do painel do site (app/web/src/lib/orderUtils.js).
const ESTADOS: Record<string, [string, Tom]> = {
  pending: ["Pendente", "accent"],
  confirmed: ["Confirmada", "brand"],
  shipped: ["Enviada", "brand"],
  delivered: ["Concluída", "ok"],
  cancelled: ["Cancelada", "danger"],
};
const PAGAMENTOS: Record<string, [string, Tom]> = {
  pending: ["Pendente", "neutral"],
  awaiting_confirmation: ["Aguarda confirmação", "accent"],
  partially_paid: ["Pago em parte", "accent"],
  paid: ["Pago", "ok"],
  failed: ["Falhou", "danger"],
  refunded: ["Reembolsado", "neutral"],
};

interface EstadoLoja {
  ligada: boolean;
  ligacao: { site_url: string; posto_nome: string; loja: string; ultima_sinc: string | null; ultimo_erro: string } | null;
  encomendas: Record<"total" | "por_confirmar" | "em_curso" | "levantamentos" | "concluidas" | "canceladas", number>;
  produtos: Record<"total" | "a_venda" | "ocultos" | "sem_referencia", number>;
}
interface LinhaEncomenda {
  id: string;
  numero: string;
  criada_em: string;
  estado: string;
  pagamento: string;
  total: number;
  levantamento: number;
  cliente: string;
  telefone: string;
  artigos: number;
}
interface LinhaProduto {
  id: string;
  titulo: string;
  referencia: string;
  isbn: string;
  preco: number;
  stock: number;
  activo: number;
  artigo_id: number | null;
  stock_loja: number | null;
}
interface Encomenda {
  numero: string;
  criada_em: string;
  estado: string;
  pagamento: string;
  entrega: string;
  levantamento: boolean;
  cliente: string;
  telefone: string;
  morada: string | null;
  notas: string | null;
  metodo_pagamento: string | null;
  total: number;
  portes: number | null;
  pago: number | null;
  itens: { title?: string; quantity?: number; price?: number }[];
}

/** A hora de Angola de um momento que o site manda em UTC. */
const quando = (d?: string | null) =>
  d ? new Date(d).toLocaleString("pt-PT", { timeZone: "Africa/Luanda", dateStyle: "short", timeStyle: "short" }) : "—";
const emKz = (v: number | null | undefined) => kz(Math.round(Number(v ?? 0) * 100));

/** Abre uma página do painel do site no navegador do KanGest (ou numa janela, no modo web). */
async function abrirNoSite(url: string) {
  try {
    if (NA_APP) await navegador("abrir", { texto: url });
    else window.open(url, "_blank", "noopener");
  } catch (x) {
    toast.error((x as Error).message);
  }
}

function Contador({ rotulo, n, activo, onClick, tom }: { rotulo: string; n: number; activo: boolean; onClick: () => void; tom?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={cn("rounded-xl border bg-surface px-4 py-3 text-left transition-colors hover:border-brand/60", activo ? "border-brand ring-1 ring-brand" : "border-line")}
    >
      <p className="text-[12px] text-ink-3">{rotulo}</p>
      <p className={cn("text-2xl font-semibold tabular-nums", tom ?? "text-ink")}>{n}</p>
    </button>
  );
}

export default function LojaOnline() {
  const qc = useQueryClient();
  // tempo real: o servidor da loja avisa quando chegam novidades do site (src-tauri/src/sinc/tempo_real.rs)
  useEffect(() => {
    if (!NA_APP) return;
    let desligar: (() => void) | undefined;
    let fechado = false;
    void listen("loja-novidades", () => {
      for (const k of ["loja-estado", "loja-encomendas", "loja-produtos", "loja-encomenda", "loja-conta"]) qc.invalidateQueries({ queryKey: [k] });
    }).then((f) => {
      if (fechado) f();
      else desligar = f;
    });
    return () => {
      fechado = true;
      desligar?.();
    };
  }, [qc]);
  const estado = useQuery({ queryKey: ["loja-estado"], queryFn: () => call<EstadoLoja>("loja.estado"), refetchInterval: 30000 });
  const [aba, setAba] = useState<"encomendas" | "produtos">("encomendas");
  const e = estado.data;
  const site = e?.ligacao?.site_url || "https://livrariaadventista.ao";

  return (
    <>
      <PageHeader title="Loja online" subtitle="As encomendas desta loja e o catálogo do site, da última sincronização" />
      {!e ? (
        <Card className="max-w-3xl">
          <div className="p-6 text-ink-3">{estado.error ? (estado.error as Error).message : "A carregar…"}</div>
        </Card>
      ) : !e.ligada ? (
        <Card className="max-w-3xl">
          <Empty
            icon={<Link2 className="size-6" />}
            title="Esta loja ainda não está ligada ao site"
            text="Ligue-a em Livraria → Ligação ao site, com o código do painel. As encomendas e o catálogo chegam na primeira sincronização."
            action={
              <Link to="/ligacao-site">
                <Button>Ligar ao site</Button>
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="max-w-6xl space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            {e.ligacao?.ultimo_erro ? (
              <Badge tone="danger">
                <CloudOff className="mr-1 size-3.5" />
                Sem ligação: a mostrar a cópia de {quando(e.ligacao?.ultima_sinc)}
              </Badge>
            ) : (
              <Badge tone="ok">
                <CheckCircle2 className="mr-1 size-3.5" />
                Actualizado {quando(e.ligacao?.ultima_sinc)}
              </Badge>
            )}
            {e.ligacao?.loja && (
              <span className="flex items-center gap-1 text-[13px] text-ink-3">
                <Store className="size-3.5" /> {e.ligacao.loja}
              </span>
            )}
            <div className="ml-auto flex gap-1 rounded-lg bg-sunken p-1" role="tablist">
              {(
                [
                  ["encomendas", "Encomendas", ShoppingBag],
                  ["produtos", "Produtos", Package],
                ] as const
              ).map(([id, rotulo, Icone]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={aba === id}
                  onClick={() => setAba(id)}
                  className={cn("flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium", aba === id ? "bg-surface text-ink shadow-sm" : "text-ink-3")}
                >
                  <Icone className="size-4" /> {rotulo}
                </button>
              ))}
            </div>
          </div>
          <ContaSite />
          {aba === "encomendas" ? <Encomendas e={e} site={site} /> : <Produtos e={e} site={site} />}
          <p className="text-[12px] text-ink-3">
            Com a sua conta do site, as encomendas confirmam-se, preparam-se e entregam-se aqui, com as suas permissões, e o cliente é
            avisado como no painel. Sem Internet, a alteração fica na fila e segue quando a ligação voltar. Os produtos mudam-se no painel
            do site («Abrir no painel do site»).
          </p>
        </div>
      )}
    </>
  );
}

function Encomendas({ e, site }: { e: EstadoLoja; site: string }) {
  // ?filtro=por_confirmar e ?encomenda=<id>: os avisos e o assistente da ajuda abrem aqui (components/Ajuda.tsx)
  const [sp, setSp] = useSearchParams();
  const [filtro, setFiltro] = useState(sp.get("filtro") ?? "");
  const [q, setQ] = useState("");
  const [aberta, setAberta] = useState<string | null>(sp.get("encomenda"));
  useEffect(() => {
    const f = sp.get("filtro");
    const enc = sp.get("encomenda");
    if (f === null && enc === null) return;
    if (f !== null) setFiltro(f);
    if (enc) setAberta(enc);
    // o pedido já foi atendido: o endereço volta ao da Loja online (e Voltar não o repete)
    setSp({}, { replace: true });
  }, [sp, setSp]);
  const lista = useQuery({
    queryKey: ["loja-encomendas", filtro, q],
    queryFn: () => call<LinhaEncomenda[]>("loja.encomendas", { filtro, q }),
    refetchInterval: 30000,
  });
  const c = e.encomendas;
  const filtros: [string, string, number, string?][] = [
    ["", "Todas", c.total],
    ["por_confirmar", "Pendentes", c.por_confirmar, c.por_confirmar > 0 ? "text-accent-ink" : undefined],
    ["levantamentos", "Levantamentos por fazer", c.levantamentos],
    ["em_curso", "Em curso", c.em_curso],
    ["concluidas", "Concluídas", c.concluidas],
    ["canceladas", "Canceladas", c.canceladas],
  ];
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {filtros.map(([id, rotulo, n, tom]) => (
          <Contador key={id || "todas"} rotulo={rotulo} n={n} tom={tom} activo={filtro === id} onClick={() => setFiltro(id)} />
        ))}
      </div>
      <Card>
        <div className="relative p-3">
          <Search className="pointer-events-none absolute left-6 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
          <Input id="loja-encomendas-q" value={q} onChange={(x) => setQ(x.target.value)} placeholder="Número, cliente ou telefone" aria-label="Pesquisar encomendas" className="pl-9" />
        </div>
        {(lista.data ?? []).length === 0 ? (
          <p className="px-4 pb-5 text-ink-3">{lista.isLoading ? "A carregar…" : "Nenhuma encomenda com este filtro."}</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Encomenda</Th>
                <Th>Data</Th>
                <Th>Cliente</Th>
                <Th>Artigos</Th>
                <Th>Total</Th>
                <Th>Pagamento</Th>
                <Th>Estado</Th>
              </tr>
            </thead>
            <tbody>
              {(lista.data ?? []).map((o) => {
                const [estado, tomEstado] = ESTADOS[o.estado] ?? [o.estado || "—", "neutral"];
                const [pagamento, tomPagamento] = PAGAMENTOS[o.pagamento] ?? [o.pagamento || "—", "neutral"];
                return (
                  <tr key={o.id} className="cursor-pointer hover:bg-sunken/60" onClick={() => setAberta(o.id)}>
                    <Td className="whitespace-nowrap font-medium">
                      {o.numero}
                      {o.levantamento === 1 && <span className="ml-1.5 text-[11px] font-normal text-ink-3">levantamento</span>}
                    </Td>
                    <Td className="whitespace-nowrap tabular-nums">{quando(o.criada_em)}</Td>
                    <Td>
                      <span className="block">{o.cliente}</span>
                      <span className="text-[12px] text-ink-3">{o.telefone}</span>
                    </Td>
                    <Td className="tabular-nums">{o.artigos}</Td>
                    <Td className="whitespace-nowrap tabular-nums">{emKz(o.total)}</Td>
                    <Td><Badge tone={tomPagamento}>{pagamento}</Badge></Td>
                    <Td><Badge tone={tomEstado}>{estado}</Badge></Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
      {aberta && <DetalheEncomenda id={aberta} site={site} onFechar={() => setAberta(null)} />}
    </>
  );
}

function DetalheEncomenda({ id, site, onFechar }: { id: string; site: string; onFechar: () => void }) {
  const qc = useQueryClient();
  const d = useQuery({ queryKey: ["loja-encomenda", id], queryFn: () => call<Encomenda>("loja.encomenda", { id }) });
  const conta = useContaSite();
  const [aFazer, setAFazer] = useState<string | null>(null);
  const [pagar, setPagar] = useState(false);
  const [cancelar, setCancelar] = useState(false);
  const o = d.data;
  const [estado] = ESTADOS[o?.estado ?? ""] ?? [o?.estado ?? "—"];
  const [pagamento] = PAGAMENTOS[o?.pagamento ?? ""] ?? [o?.pagamento ?? "—"];
  const falta = o ? Math.max(Number(o.total ?? 0) - Number(o.pago ?? 0), 0) : 0;
  const accoes = o && conta.data?.entrou ? accoesPossiveis(o) : [];

  async function fazer(accao: string, extra: Record<string, unknown> = {}) {
    setAFazer(accao);
    try {
      const r = await call<{ feito: boolean; na_fila?: boolean; aviso?: string | null }>("loja.conta.accao", { id, accao, ...extra });
      if (r.na_fila) toast.warning("Sem Internet: a alteração fica na fila e segue quando a ligação voltar.");
      else toast.success(r.aviso || "Feito. O site já tem a alteração e o cliente foi avisado.");
      for (const k of ["loja-encomenda", "loja-encomendas", "loja-estado", "loja-conta"]) qc.invalidateQueries({ queryKey: [k] });
      setPagar(false);
      setCancelar(false);
    } catch (x) {
      toast.error((x as Error).message);
    } finally {
      setAFazer(null);
    }
  }

  return (
    <Modal
      open
      onClose={onFechar}
      title={o ? `Encomenda ${o.numero}` : "Encomenda"}
      footer={
        <>
          <Button variant="ghost" onClick={onFechar}>Fechar</Button>
          {o && (
            <Button variant="secondary" onClick={() => abrirNoSite(`${site}/admin?tab=orders&encomenda=${encodeURIComponent(o.numero)}`)}>
              <ExternalLink className="size-4" /> Abrir no painel do site
            </Button>
          )}
        </>
      }
    >
      {!o ? (
        <p className="text-ink-3">{d.error ? (d.error as Error).message : "A carregar…"}</p>
      ) : (
        <div className="space-y-4 text-[14px]">
          {accoes.length > 0 && (
            <div className="flex flex-wrap gap-2 rounded-xl bg-sunken p-3">
              {accoes.map((a) => (
                <Button
                  key={a}
                  size="sm"
                  variant={a === "cancelar" ? "ghost" : a === "entregue" || a === "confirmar" ? "primary" : "secondary"}
                  loading={aFazer === a}
                  onClick={() => (a === "cancelar" ? setCancelar(true) : a === "entregue" && falta > 0 && o.pagamento !== "paid" ? setPagar(true) : fazer(a))}
                >
                  {rotuloAccao(a, o.levantamento)}
                </Button>
              ))}
            </div>
          )}
          {!conta.data?.entrou && !["cancelled", "delivered"].includes(o.estado) && (
            <p className="text-[13px] text-ink-3">Para alterar esta encomenda aqui, entre com a sua conta do site (em cima).</p>
          )}
          <dl className="grid grid-cols-[140px_1fr] gap-x-4 gap-y-1.5">
            <dt className="text-ink-3">Feita em</dt>
            <dd>{quando(o.criada_em)}</dd>
            <dt className="text-ink-3">Estado</dt>
            <dd>{estado}</dd>
            <dt className="text-ink-3">Pagamento</dt>
            <dd>{pagamento}{o.metodo_pagamento ? ` · ${o.metodo_pagamento}` : ""}{o.pago ? ` · pago ${emKz(o.pago)}` : ""}</dd>
            <dt className="text-ink-3">Cliente</dt>
            <dd>{o.cliente} · {o.telefone}</dd>
            <dt className="text-ink-3">{o.levantamento ? "Levantamento" : "Entrega"}</dt>
            <dd>{o.levantamento ? "Na loja" : o.morada || "—"}</dd>
            {o.notas && (
              <>
                <dt className="text-ink-3">Notas</dt>
                <dd className="whitespace-pre-line">{o.notas}</dd>
              </>
            )}
          </dl>
          <Table>
            <thead>
              <tr>
                <Th>Artigo</Th>
                <Th>Qtd.</Th>
                <Th>Preço</Th>
              </tr>
            </thead>
            <tbody>
              {(o.itens ?? []).map((i, n) => (
                <tr key={n}>
                  <Td>{i.title || "—"}</Td>
                  <Td className="tabular-nums">{i.quantity ?? 1}</Td>
                  <Td className="whitespace-nowrap tabular-nums">{emKz((i.price ?? 0) * (i.quantity ?? 1))}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <p className="text-right font-semibold">
            {o.portes ? <span className="mr-3 font-normal text-ink-3">portes {emKz(o.portes)}</span> : null}
            Total {emKz(o.total)}
            {falta > 0 && o.pagamento !== "paid" && <span className="ml-3 font-normal text-accent-ink">por receber {emKz(falta)}</span>}
          </p>
        </div>
      )}
      {o && pagar && <PagamentoEntrega encomenda={o} falta={falta} aFazer={aFazer === "entregue"} onFechar={() => setPagar(false)} onEntregar={(extra) => fazer("entregue", extra)} />}
      {o && cancelar && (
        <Modal
          open
          onClose={() => setCancelar(false)}
          title={`Cancelar a encomenda ${o.numero}?`}
          width="max-w-md"
          footer={
            <>
              <Button variant="ghost" onClick={() => setCancelar(false)}>Não</Button>
              <Button variant="danger" loading={aFazer === "cancelar"} onClick={() => fazer("cancelar")}>Cancelar a encomenda</Button>
            </>
          }
        >
          <p className="text-ink-2">O stock volta à loja, o cliente é avisado e a encomenda não se reabre.</p>
        </Modal>
      )}
    </Modal>
  );
}

function Produtos({ e, site }: { e: EstadoLoja; site: string }) {
  const qc = useQueryClient();
  const [filtro, setFiltro] = useState("");
  const [q, setQ] = useState("");
  // o editor: null fechado, "" um produto novo, ou o id do produto
  const [editar, setEditar] = useState<string | null>(null);
  const [eliminar, setEliminar] = useState<LinhaProduto | null>(null);
  const [aFazer, setAFazer] = useState("");
  const recarregar = () => {
    for (const k of ["loja-produtos", "loja-estado"]) qc.invalidateQueries({ queryKey: [k] });
  };
  async function accao(chave: string, metodo: string, params: object, ok: string) {
    setAFazer(chave);
    try {
      await call(metodo, params);
      toast.success(ok);
      recarregar();
    } catch (x) {
      toast.error((x as Error).message);
    } finally {
      setAFazer("");
    }
  }
  const lista = useQuery({
    queryKey: ["loja-produtos", filtro, q],
    queryFn: () => call<LinhaProduto[]>("loja.produtos", { filtro, q }),
  });
  const c = e.produtos;
  const filtros: [string, string, number | null][] = [
    ["", "Todos", c.total],
    ["a_venda", "À venda", c.a_venda],
    ["ocultos", "Ocultos", c.ocultos],
    ["sem_stock", "Sem stock no site", null],
    ["sem_referencia", "Sem referência", c.sem_referencia],
    ["nao_na_loja", "Não existem cá", null],
  ];
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => setEditar("")}>
          <Plus className="size-4" /> Novo produto
        </Button>
        {filtros.map(([id, rotulo, n]) => (
          <button
            key={id || "todos"}
            type="button"
            onClick={() => setFiltro(id)}
            aria-pressed={filtro === id}
            className={cn("rounded-full border px-3 py-1 text-[13px]", filtro === id ? "border-brand bg-brand-50 text-brand-700" : "border-line text-ink-2 hover:border-brand/60")}
          >
            {rotulo}
            {n !== null && <span className="ml-1.5 tabular-nums text-ink-3">{n}</span>}
          </button>
        ))}
      </div>
      <Card>
        <div className="relative p-3">
          <Search className="pointer-events-none absolute left-6 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
          <Input id="loja-produtos-q" value={q} onChange={(x) => setQ(x.target.value)} placeholder="Título, referência ou ISBN" aria-label="Pesquisar produtos" className="pl-9" />
        </div>
        {(lista.data ?? []).length === 0 ? (
          <p className="px-4 pb-5 text-ink-3">{lista.isLoading ? "A carregar…" : "Nenhum produto com este filtro."}</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Produto</Th>
                <Th>Referência</Th>
                <Th>Preço no site</Th>
                <Th>Stock no site</Th>
                <Th>Nesta loja</Th>
                <Th>No site</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {(lista.data ?? []).map((p) => (
                <tr key={p.id}>
                  <Td className="font-medium">{p.titulo}</Td>
                  <Td className="whitespace-nowrap font-mono text-[12px]">{p.referencia || <span className="text-ink-3">—</span>}</Td>
                  <Td className="whitespace-nowrap tabular-nums">{emKz(p.preco)}</Td>
                  <Td className="tabular-nums">{p.stock}</Td>
                  <Td className="tabular-nums">
                    {p.artigo_id ? p.stock_loja : <span className="text-[12px] text-ink-3">{p.referencia ? "não existe cá" : "—"}</span>}
                  </Td>
                  <Td>{p.activo === 1 ? <Badge tone="ok">À venda</Badge> : <Badge tone="neutral">Oculto</Badge>}</Td>
                  <Td className="whitespace-nowrap">
                    <Button variant="ghost" size="sm" title="Editar" aria-label={`Editar «${p.titulo}»`} onClick={() => setEditar(p.id)}>
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      title={p.activo === 1 ? "Ocultar no site" : "Publicar no site"}
                      aria-label={`${p.activo === 1 ? "Ocultar" : "Publicar"} «${p.titulo}»`}
                      loading={aFazer === `pub-${p.id}`}
                      onClick={() => accao(`pub-${p.id}`, "loja.produto.publicar", { id: p.id, activo: p.activo !== 1 }, p.activo === 1 ? "Ocultado no site." : "Publicado no site.")}
                    >
                      {p.activo === 1 ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      title="Duplicar (a cópia fica oculta)"
                      aria-label={`Duplicar «${p.titulo}»`}
                      loading={aFazer === `dup-${p.id}`}
                      onClick={() => accao(`dup-${p.id}`, "loja.produto.duplicar", { id: p.id }, "Duplicado: a cópia está oculta.")}
                    >
                      <Copy className="size-4" />
                    </Button>
                    <Button variant="ghost" size="sm" title="Eliminar do site" aria-label={`Eliminar «${p.titulo}»`} onClick={() => setEliminar(p)}>
                      <Trash2 className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      title="Abrir este produto no painel do site"
                      aria-label={`Abrir «${p.titulo}» no painel do site`}
                      onClick={() => abrirNoSite(`${site}/admin?tab=books&produto=${encodeURIComponent(p.titulo)}`)}
                    >
                      <ExternalLink className="size-4" />
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <Coleccoes />
      {editar !== null && <EditorProduto id={editar || null} onFechar={() => setEditar(null)} onGuardado={recarregar} />}
      {eliminar && (
        <Modal
          open
          onClose={() => setEliminar(null)}
          title={`Eliminar «${eliminar.titulo}» do site?`}
          width="max-w-md"
          footer={
            <>
              <Button variant="ghost" onClick={() => setEliminar(null)}>Não</Button>
              <Button
                variant="danger"
                loading={aFazer === "eliminar"}
                onClick={async () => {
                  await accao("eliminar", "loja.produto.eliminar", { id: eliminar.id, confirmar: true }, "Eliminado do site.");
                  setEliminar(null);
                }}
              >
                Eliminar
              </Button>
            </>
          }
        >
          <p className="text-ink-2">O produto sai do site e não se recupera. Para o tirar só da venda, oculte-o. Fica na auditoria.</p>
        </Modal>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// O editor dos produtos e das colecções do site (src-tauri/src/sinc/produtos.rs)
// ---------------------------------------------------------------------------------------------------------------

type CamposProduto = Record<string, string | number | boolean | null>;
interface Coleccao {
  id: string;
  title: string;
  description: string | null;
  sort_order: number | null;
  active: boolean;
  featured: boolean;
}

/** O que o editor mostra, pela ordem: [campo, rótulo, tipo]. */
const CAMPOS_EDITOR: [string, string, "texto" | "numero" | "longo"][] = [
  ["title", "Título", "texto"],
  ["author", "Autor", "texto"],
  ["publisher", "Editora", "texto"],
  ["isbn", "ISBN", "texto"],
  ["book_code", "Código", "texto"],
  ["kigest_ref", "Referência no KanGest", "texto"],
  ["language", "Língua", "texto"],
  ["pages", "Páginas", "numero"],
  ["year", "Ano", "numero"],
  ["price", "Preço (Kz)", "numero"],
  ["sale_price", "Preço em promoção (Kz)", "numero"],
  ["stock", "Stock no site", "numero"],
  ["cover_image", "Capa (endereço da imagem)", "texto"],
  ["description", "Descrição", "longo"],
];

/** Criar ou editar um produto do site. Num produto ligado a um artigo do KanGest, o preço e o stock vêm de cá. */
function EditorProduto({ id, onFechar, onGuardado }: { id: string | null; onFechar: () => void; onGuardado: () => void }) {
  const atual = useQuery({
    queryKey: ["loja-produto", id],
    queryFn: () => call<{ produto: CamposProduto; ligado: boolean; bloqueados: string[] }>("loja.produto.obter", { id }),
    enabled: !!id,
  });
  const coleccoes = useQuery({ queryKey: ["loja-coleccoes"], queryFn: () => call<Coleccao[]>("loja.coleccao.listar") });
  const [campos, setCampos] = useState<CamposProduto>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (atual.data) setCampos(atual.data.produto);
  }, [atual.data]);
  const ligado = !!atual.data?.ligado;
  const bloqueado = (k: string) => ligado && (atual.data?.bloqueados ?? []).includes(k);
  const mudar = (k: string, v: string | number | boolean | null) => setCampos((c) => ({ ...c, [k]: v }));
  async function guardar() {
    setBusy(true);
    try {
      const envio: CamposProduto = {};
      for (const [k] of CAMPOS_EDITOR) if (!bloqueado(k) && k in campos) envio[k] = campos[k];
      for (const k of ["collection_id", "active", "featured"]) if (k in campos) envio[k] = campos[k];
      await call("loja.produto.guardar", { id, campos: envio });
      toast.success(id ? "Produto guardado no site." : "Produto criado no site (oculto, até o publicar).");
      onGuardado();
      onFechar();
    } catch (x) {
      toast.error((x as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      onClose={onFechar}
      title={id ? "Editar o produto no site" : "Novo produto no site"}
      footer={
        <>
          <Button variant="ghost" onClick={onFechar}>Cancelar</Button>
          <Button loading={busy} disabled={!!id && !atual.data} onClick={guardar}>Guardar</Button>
        </>
      }
    >
      {id && atual.isLoading ? (
        <p className="text-ink-3">A abrir o produto no site…</p>
      ) : atual.error ? (
        <p className="text-danger">{(atual.error as Error).message}</p>
      ) : (
        <div className="space-y-4">
          {ligado && (
            <p className="rounded-lg bg-sunken px-3 py-2 text-[13px] text-ink-2">
              Este produto está ligado a um artigo do KanGest: o preço, a promoção e o stock vêm daqui, pela sincronização, e não se mudam no site.
            </p>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {CAMPOS_EDITOR.map(([k, rotulo, tipo]) =>
              tipo === "longo" ? (
                <Field key={k} label={rotulo} className="sm:col-span-2">
                  <textarea
                    className="kg-campo min-h-24 rounded-lg border border-line bg-surface px-3 py-2 text-[14px]"
                    value={String(campos[k] ?? "")}
                    onChange={(x) => mudar(k, x.target.value)}
                  />
                </Field>
              ) : (
                <Field key={k} label={rotulo} hint={bloqueado(k) ? "Vem do KanGest" : undefined}>
                  <Input
                    type={tipo === "numero" ? "number" : "text"}
                    disabled={bloqueado(k)}
                    value={campos[k] === null || campos[k] === undefined ? "" : String(campos[k])}
                    onChange={(x) => mudar(k, tipo === "numero" ? (x.target.value === "" ? null : Number(x.target.value)) : x.target.value)}
                  />
                </Field>
              ),
            )}
            <Field label="Colecção">
              <Select value={String(campos.collection_id ?? "")} onChange={(x) => mudar("collection_id", x.target.value)}>
                <option value="">Sem colecção</option>
                {(coleccoes.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </Select>
            </Field>
            <div className="flex items-end gap-4 pb-2 text-[13px]">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={!!campos.active} onChange={(x) => mudar("active", x.target.checked)} /> À venda no site
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={!!campos.featured} onChange={(x) => mudar("featured", x.target.checked)} /> Em destaque
              </label>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** As colecções do site: a lista, criar e editar (título, descrição, ordem, visível, destaque). */
function Coleccoes() {
  const qc = useQueryClient();
  const lista = useQuery({ queryKey: ["loja-coleccoes"], queryFn: () => call<Coleccao[]>("loja.coleccao.listar"), retry: false });
  const [editar, setEditar] = useState<Partial<Coleccao> | null>(null);
  const [busy, setBusy] = useState(false);
  async function guardar() {
    if (!editar) return;
    setBusy(true);
    try {
      const { id, ...campos } = editar;
      await call("loja.coleccao.guardar", { id: id ?? null, campos });
      toast.success("Colecção guardada no site.");
      qc.invalidateQueries({ queryKey: ["loja-coleccoes"] });
      setEditar(null);
    } catch (x) {
      toast.error((x as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="font-semibold">Colecções do site</div>
        <Button size="sm" variant="secondary" onClick={() => setEditar({ title: "", active: false, featured: false })}>
          <Plus className="size-4" /> Nova colecção
        </Button>
      </div>
      {lista.error ? (
        <p className="text-[13px] text-ink-3">{(lista.error as Error).message}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {(lista.data ?? []).map((c) => (
            <button key={c.id} type="button" onClick={() => setEditar(c)} className="rounded-full border border-line px-3 py-1 text-[13px] hover:border-brand/60">
              {c.title} {!c.active && <span className="text-ink-3">(oculta)</span>}
            </button>
          ))}
          {lista.data && !lista.data.length && <span className="text-[13px] text-ink-3">Ainda não há colecções.</span>}
        </div>
      )}
      {editar && (
        <Modal
          open
          onClose={() => setEditar(null)}
          title={editar.id ? "Editar a colecção" : "Nova colecção"}
          width="max-w-md"
          footer={
            <>
              <Button variant="ghost" onClick={() => setEditar(null)}>Cancelar</Button>
              <Button loading={busy} onClick={guardar}>Guardar</Button>
            </>
          }
        >
          <div className="space-y-3">
            <Field label="Título">
              <Input value={editar.title ?? ""} onChange={(x) => setEditar({ ...editar, title: x.target.value })} />
            </Field>
            <Field label="Descrição">
              <Input value={editar.description ?? ""} onChange={(x) => setEditar({ ...editar, description: x.target.value })} />
            </Field>
            <Field label="Ordem">
              <Input type="number" value={editar.sort_order ?? ""} onChange={(x) => setEditar({ ...editar, sort_order: x.target.value === "" ? null : Number(x.target.value) })} />
            </Field>
            <div className="flex gap-4 text-[13px]">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={!!editar.active} onChange={(x) => setEditar({ ...editar, active: x.target.checked })} /> Visível no site
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={!!editar.featured} onChange={(x) => setEditar({ ...editar, featured: x.target.checked })} /> Em destaque
              </label>
            </div>
          </div>
        </Modal>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// A conta do site de cada pessoa (src-tauri/src/sinc/pessoa.rs)
// ---------------------------------------------------------------------------------------------------------------

interface ContaSiteEstado {
  entrou: boolean;
  falta_codigo: boolean;
  email: string | null;
  aal: string | null;
  acaba_em: number | null;
  pendentes: number;
}
interface ComandoLinha {
  id: number;
  numero: string;
  accao: string;
  estado: string;
  erro: string;
  criado_em: string;
  feito_em: string | null;
}

const ROTULOS: Record<string, string> = {
  confirmar: "Confirmar",
  preparar: "A preparar",
  pronta: "Pronta para levantar",
  enviada: "Enviada",
  entregue: "Entregue",
  cancelar: "Cancelar",
};
const rotuloAccao = (a: string, levantamento: boolean) => (a === "entregue" && levantamento ? "Levantada pelo cliente" : ROTULOS[a] ?? a);
const hora = (s: number) => new Date(s * 1000).toLocaleTimeString("pt-PT", { timeZone: "Africa/Luanda", hour: "2-digit", minute: "2-digit" });

/** O que se pode fazer a uma encomenda, pelo estado dela (os mesmos passos do painel). */
function accoesPossiveis(o: Encomenda): string[] {
  if (["cancelled", "delivered"].includes(o.estado) || ["cancelled", "delivered"].includes(o.entrega)) return [];
  const a: string[] = [];
  if (o.estado === "pending") a.push("confirmar");
  if (!["preparing", "shipped", "in_transit", "out_for_delivery"].includes(o.entrega)) a.push("preparar");
  if (o.levantamento) {
    if (o.entrega !== "shipped") a.push("pronta");
  } else if (!["shipped", "in_transit", "out_for_delivery"].includes(o.entrega)) {
    a.push("enviada");
  }
  a.push("entregue", "cancelar");
  return a;
}

function useContaSite() {
  return useQuery({ queryKey: ["loja-conta"], queryFn: () => call<ContaSiteEstado>("loja.conta.estado"), refetchInterval: 30000 });
}

function ContaSite() {
  const qc = useQueryClient();
  const conta = useContaSite();
  const [entrar, setEntrar] = useState(false);
  const [verFila, setVerFila] = useState(false);
  const c = conta.data;
  if (!c) return null;
  const pronto = (novo: ContaSiteEstado) => qc.setQueryData(["loja-conta"], novo);
  async function sair() {
    try {
      pronto(await call<ContaSiteEstado>("loja.conta.sair"));
      toast.success("Saiu da conta do site.");
    } catch (x) {
      toast.error((x as Error).message);
    }
  }
  return (
    <Card className="flex flex-wrap items-center gap-3 px-4 py-3">
      <UserRound className="size-4 text-ink-3" />
      {c.entrou ? (
        <>
          <span className="text-[13px] text-ink-2">
            Entrou com a conta do site <b>{c.email}</b>
            {c.acaba_em ? ` · até às ${hora(c.acaba_em)}` : ""}
          </span>
          <Button size="sm" variant="ghost" onClick={sair}>Sair</Button>
        </>
      ) : (
        <>
          <span className="text-[13px] text-ink-2">Para alterar encomendas aqui, entre com a sua conta do site.</span>
          <Button size="sm" onClick={() => setEntrar(true)}>
            <KeyRound className="size-4" /> Entrar
          </Button>
        </>
      )}
      {c.pendentes > 0 && (
        <button type="button" className="ml-auto" onClick={() => setVerFila(true)} title="Ver as alterações à espera">
          <Badge tone="accent">{c.pendentes} à espera de Internet</Badge>
        </button>
      )}
      {(entrar || c.falta_codigo) && (
        <EntrarSite
          faltaCodigo={c.falta_codigo}
          onFechar={() => (c.falta_codigo ? sair() : setEntrar(false))}
          onFeito={(n) => {
            pronto(n);
            setEntrar(false);
          }}
        />
      )}
      {verFila && <FilaAlteracoes onFechar={() => setVerFila(false)} />}
    </Card>
  );
}

function EntrarSite({ faltaCodigo, onFechar, onFeito }: { faltaCodigo: boolean; onFechar: () => void; onFeito: (n: ContaSiteEstado) => void }) {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [codigo, setCodigo] = useState("");
  const [aEntrar, setAEntrar] = useState(false);
  async function submeter(ev: FormEvent) {
    ev.preventDefault();
    setAEntrar(true);
    try {
      const r = faltaCodigo
        ? await call<ContaSiteEstado>("loja.conta.codigo", { codigo })
        : await call<ContaSiteEstado>("loja.conta.entrar", { email, senha });
      setSenha("");
      if (r.entrou) toast.success(`Entrou com a conta do site ${r.email}.`);
      onFeito(r);
    } catch (x) {
      toast.error((x as Error).message);
    } finally {
      setAEntrar(false);
    }
  }
  return (
    <Modal open onClose={onFechar} title={faltaCodigo ? "Código da aplicação de autenticação" : "Entrar com a conta do site"} width="max-w-md">
      <form onSubmit={submeter} className="space-y-4">
        {faltaCodigo ? (
          <Field label="Código de 6 algarismos">
            <Input id="conta-site-codigo" value={codigo} onChange={(x) => setCodigo(x.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus />
          </Field>
        ) : (
          <>
            <Field label="Email da conta do site">
              <Input id="conta-site-email" type="email" value={email} onChange={(x) => setEmail(x.target.value)} autoComplete="username" autoFocus />
            </Field>
            <Field label="Senha">
              <Input id="conta-site-senha" type="password" value={senha} onChange={(x) => setSenha(x.target.value)} autoComplete="current-password" />
            </Field>
          </>
        )}
        <p className="text-[12px] text-ink-3">
          A senha não fica guardada. A sessão fica cifrada neste computador, só para si, e acaba ao fim de 12 horas ou quando sair. Cada
          alteração fica registada no site em seu nome, com as suas permissões.
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onFechar}>Cancelar</Button>
          <Button type="submit" loading={aEntrar} disabled={faltaCodigo ? codigo.replace(/\D/g, "").length !== 6 : !email.includes("@") || !senha}>
            {faltaCodigo ? "Confirmar" : "Entrar"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function PagamentoEntrega({
  encomenda,
  falta,
  aFazer,
  onFechar,
  onEntregar,
}: {
  encomenda: Encomenda;
  falta: number;
  aFazer: boolean;
  onFechar: () => void;
  onEntregar: (extra: Record<string, unknown>) => void;
}) {
  const metodos = useQuery({
    queryKey: ["loja-metodos"],
    queryFn: () => call<{ methods?: { code: string; name: string; automatic?: boolean }[] }>("loja.conta.metodos"),
    staleTime: 600000,
  });
  const lista = (metodos.data?.methods ?? []).filter((m) => !m.automatic);
  const [valor, setValor] = useState(String(falta));
  const [metodo, setMetodo] = useState("");
  const [referencia, setReferencia] = useState("");
  const [semPagamento, setSemPagamento] = useState(false);
  const [motivo, setMotivo] = useState("");
  const quantia = Number(valor.replace(",", "."));
  return (
    <Modal open onClose={onFechar} title={`${encomenda.levantamento ? "Levantada" : "Entregue"}: ${encomenda.numero}`} width="max-w-md">
      <div className="space-y-4">
        <p className="text-ink-2">Esta encomenda tem {emKz(falta)} por receber.</p>
        {!semPagamento ? (
          <>
            <Field label="Quanto recebeu (Kz)">
              <Input id="entrega-valor" value={valor} onChange={(x) => setValor(x.target.value)} inputMode="decimal" />
            </Field>
            <Field label="Como pagou">
              <Select id="entrega-metodo" value={metodo} onChange={(x) => setMetodo(x.target.value)}>
                <option value="">Escolha…</option>
                {lista.map((m) => (
                  <option key={m.code} value={m.code}>{m.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Referência (opcional)">
              <Input id="entrega-referencia" value={referencia} onChange={(x) => setReferencia(x.target.value)} />
            </Field>
            <div className="flex flex-wrap justify-between gap-2">
              <Button variant="ghost" onClick={() => setSemPagamento(true)}>Entregar sem receber</Button>
              <Button
                loading={aFazer}
                disabled={!(quantia > 0) || !metodo}
                onClick={() => onEntregar({ pagamento: { amount: quantia, methodCode: metodo, reference: referencia.trim() } })}
              >
                Registar e entregar
              </Button>
            </div>
          </>
        ) : (
          <>
            <Field label="Porque entrega sem receber">
              <Input id="entrega-motivo" value={motivo} onChange={(x) => setMotivo(x.target.value)} placeholder="Ex.: paga por transferência amanhã" />
            </Field>
            <p className="text-[12px] text-ink-3">Fica no registo de segurança do site e os administradores são avisados.</p>
            <div className="flex flex-wrap justify-between gap-2">
              <Button variant="ghost" onClick={() => setSemPagamento(false)}>Voltar</Button>
              <Button variant="danger" loading={aFazer} disabled={motivo.trim().length < 5} onClick={() => onEntregar({ motivo: motivo.trim() })}>
                Entregar sem receber
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

function FilaAlteracoes({ onFechar }: { onFechar: () => void }) {
  const qc = useQueryClient();
  const fila = useQuery({ queryKey: ["loja-comandos"], queryFn: () => call<ComandoLinha[]>("loja.conta.comandos"), refetchInterval: 15000 });
  const linhas = fila.data ?? [];
  async function repetir() {
    try {
      qc.setQueryData(["loja-comandos"], await call<ComandoLinha[]>("loja.conta.repetir"));
      qc.invalidateQueries({ queryKey: ["loja-conta"] });
    } catch (x) {
      toast.error((x as Error).message);
    }
  }
  return (
    <Modal
      open
      onClose={onFechar}
      title="As suas alterações às encomendas"
      footer={
        <>
          {linhas.some((l) => l.estado === "erro") && <Button variant="secondary" onClick={repetir}>Repetir as que falharam</Button>}
          <Button variant="ghost" onClick={onFechar}>Fechar</Button>
        </>
      }
    >
      {linhas.length === 0 ? (
        <p className="text-ink-3">Nenhuma alteração à espera.</p>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Encomenda</Th>
              <Th>Alteração</Th>
              <Th>Estado</Th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.id}>
                <Td className="whitespace-nowrap font-medium">{l.numero || "—"}</Td>
                <Td>{ROTULOS[l.accao] ?? l.accao}</Td>
                <Td>
                  {l.estado === "feito" ? (
                    <Badge tone="ok">Enviada</Badge>
                  ) : l.estado === "erro" ? (
                    <span className="text-[13px] text-danger">{l.erro}</span>
                  ) : (
                    <Badge tone="accent">À espera de Internet</Badge>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Modal>
  );
}

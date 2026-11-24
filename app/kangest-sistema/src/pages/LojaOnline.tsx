// KanGest — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

/**
 * Livraria → Loja online (docs/LOJA-ONLINE.md): as encomendas desta loja e o catálogo do site, da cópia local que chega
 * com cada sincronização. Lê-se também sem Internet (a última cópia). As alterações fazem-se no painel do site, aberto
 * no navegador do KanGest, com o login de cada pessoa.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, CloudOff, ExternalLink, Link2, Package, Search, ShoppingBag, Store } from "lucide-react";
import { call, NA_APP } from "@/lib/api";
import { kz } from "@/lib/format";
import { navegador } from "@/lib/navegador";
import { Badge, Button, Card, Empty, Input, Modal, PageHeader, Table, Td, Th, cn } from "@/components/ui";

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
          {aba === "encomendas" ? <Encomendas e={e} site={site} /> : <Produtos e={e} site={site} />}
          <p className="text-[12px] text-ink-3">
            Esta página só lê. Para confirmar, preparar ou entregar uma encomenda, ou publicar e mudar um produto, use «Abrir no painel do
            site»: abre no navegador do KanGest, com o seu login.
          </p>
        </div>
      )}
    </>
  );
}

function Encomendas({ e, site }: { e: EstadoLoja; site: string }) {
  const [filtro, setFiltro] = useState("");
  const [q, setQ] = useState("");
  const [aberta, setAberta] = useState<string | null>(null);
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
  const d = useQuery({ queryKey: ["loja-encomenda", id], queryFn: () => call<Encomenda>("loja.encomenda", { id }) });
  const o = d.data;
  const [estado] = ESTADOS[o?.estado ?? ""] ?? [o?.estado ?? "—"];
  const [pagamento] = PAGAMENTOS[o?.pagamento ?? ""] ?? [o?.pagamento ?? "—"];
  return (
    <Modal
      open
      onClose={onFechar}
      title={o ? `Encomenda ${o.numero}` : "Encomenda"}
      footer={
        <>
          <Button variant="ghost" onClick={onFechar}>Fechar</Button>
          {o && (
            <Button onClick={() => abrirNoSite(`${site}/admin?tab=orders&encomenda=${encodeURIComponent(o.numero)}`)}>
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
          </p>
        </div>
      )}
    </Modal>
  );
}

function Produtos({ e, site }: { e: EstadoLoja; site: string }) {
  const [filtro, setFiltro] = useState("");
  const [q, setQ] = useState("");
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
      <div className="flex flex-wrap gap-2">
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
                  <Td>
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
    </>
  );
}

// KanGest — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Link, useSearchParams } from "react-router-dom";
import { AlertTriangle, BookOpen, CheckCircle2, Database, DatabaseBackup, Download, FolderOpen, Info, Keyboard, ListChecks, Mail, Phone, RefreshCw, ShieldAlert, ShieldCheck, XCircle } from "lucide-react";
import { call, MODO_WEB } from "@/lib/api";
import { numero } from "@/lib/format";
import { MENU } from "@/lib/menu";
import { Badge, Button, Card, Field, Input, PageHeader, cn } from "@/components/ui";
import { useSession } from "@/store/session";
import { useLicenca } from "@/lib/licenca";
import { escolherPasta } from "@/lib/dialogos";
import { RestaurarCopia } from "@/pages/Configuracoes";

/**
 * A pasta onde o KanGest grava o que exporta (listas, relatórios, SAF-T, cópias portáteis): por omissão
 * «Documentos/KanGest Livraria», criada sozinha, com uma subpasta por tipo. Pode abrir-se, mudar-se ou repor-se.
 */
function PastaDocumentos({ info }: { info?: Info }) {
  const qc = useQueryClient();
  const mudar = async (caminho: string | null) => {
    try {
      await call("sistema.exportarPasta", { caminho });
      qc.invalidateQueries({ queryKey: ["sistema-info"] });
      toast.success(caminho ? "A pasta dos documentos mudou." : "A pasta dos documentos voltou a «Documentos/KanGest Livraria».");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  return (
    <div className="space-y-1.5">
      <div className="break-all font-mono text-[12px]">{info?.pasta_exportacao}</div>
      <div className="text-[12px] text-ink-3">Com uma subpasta por tipo: Relatórios e listas, SAF-T, Cópias de segurança.</div>
      {!MODO_WEB && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => call("sistema.exportarAbrir", {}).catch((e) => toast.error((e as Error).message))}>
            <FolderOpen className="size-4" /> Abrir
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              const p = await escolherPasta("A pasta dos documentos do KanGest");
              if (p) await mudar(p);
            }}
          >
            Mudar…
          </Button>
          {info?.pasta_escolhida && (
            <Button size="sm" variant="ghost" onClick={() => mudar(null)}>
              Repor
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

interface Info {
  versao: string;
  plataforma: string;
  sqlite: string;
  migracoes: number;
  pasta_dados: string;
  pasta_exportacao: string;
  /** a pasta escolhida à mão (sistema.exportarPasta); sem ela, «Documentos/KanGest Livraria» */
  pasta_escolhida?: boolean;
  base_bytes: number;
  ultima_copia: string | null;
  artigos: number;
  entidades: number;
  documentos: number;
  importados: number;
  utilizadores: number;
  /** o que o KanGest encontrou no computador da base e como a configurou (src-tauri/src/recursos.rs) */
  computador?: {
    nucleos: number;
    memoria: number | null;
    espaco_livre: number | null;
    ligacoes: number;
    cache_kib: number;
    temporarios_em_memoria: boolean;
  };
}

const ATALHOS_POS: [string, string][] = [
  ["F2", "Pesquisar artigo / ler código de barras (3*código = 3 unidades)"],
  ["F3", "Quantidade da linha"],
  ["F4", "Escolher cliente"],
  ["F5", "Novo cliente / alterar dados do cliente"],
  ["F6", "Desconto da linha"],
  ["F7", "Alterar preço (permissão ou PIN de supervisor)"],
  ["F8", "Desconto global (% ou valor)"],
  ["F9", "Descrição da linha"],
  ["F10", "Suspender documento"],
  ["F11", "Abrir documentos suspensos"],
  ["F12", "Pagamento e finalizar"],
  ["Del", "Apagar linha (permissão ou PIN)"],
  ["↑ / ↓", "Mudar de linha"],
  ["Ctrl+G", "Abrir a gaveta (impressora térmica)"],
  ["Alt+N", "Abrir outra venda em paralelo (a actual fica à espera)"],
  ["Alt+← / Alt+→", "Passar para a venda anterior / seguinte"],
];

const ATALHOS_GESTAO: [string, string][] = [
  ["Ctrl+K", "Pesquisar ou ir para: ecrãs, documentos, clientes, NIF e artigos (⌘K no Mac)"],
  ["↑ / ↓", "Escolher um resultado da pesquisa; Enter abre"],
  ["Esc", "Fechar a pesquisa, menus e janelas"],
];

const MANUAL: { titulo: string; texto: string }[] = [
  { titulo: "Navegação", texto: "Prima Ctrl+K (⌘K no Mac) em qualquer ecrã para ir para um ecrã ou encontrar um documento, cliente ou artigo. Marque com a estrela os ecrãs que mais usa: ficam em Favoritos, no topo do menu. O menu pode recolher-se (fica só com os ícones) e, no menu do utilizador (canto superior direito), escolhe o tema claro ou escuro e tabelas compactas." },
  { titulo: "Primeiros passos", texto: "Preencha a empresa (Configurações), crie os utilizadores e as permissões, configure o posto e a impressora e, se vem do KIGEST ou de outro programa, use «Importar dados» (KIGEST, SAF-T ou Excel) antes de começar a facturar." },
  { titulo: "Documentos", texto: "Todos os documentos (facturas, recibos, notas de crédito, guias, compras e stock) usam o mesmo ecrã. As séries são automáticas por posto e ano. Um documento emitido não se altera: anula-se com motivo ou corrige-se com nota de crédito." },
  { titulo: "POS", texto: "O caixa tem de estar aberto para vender. No fecho conte o dinheiro: o sistema mostra a diferença para o valor esperado. Os talões podem sair na impressora térmica (ESC/POS) ou pelo diálogo de impressão." },
  { titulo: "Stock", texto: "O stock muda em cada documento. Artigos com lotes saem pelo lote que expira primeiro. Use o Inventário para acertar contagens e o Recálculo de Stock se suspeitar de existências erradas." },
  { titulo: "Tesouraria", texto: "Recebimentos e pagamentos dos documentos entram sozinhos no fluxo de caixa. Movimentos manuais, transferências entre contas e centros de custo estão em Tesouraria. Em Tesouraria › Conciliação Bancária importa o extracto do banco: cada linha casa com os movimentos da conta e o que sobra fica à vista. Em Sistema › Regras de Aprovação o administrador escolhe que operações (anular, saídas de tesouraria, vales de caixa, notas de crédito) pedem o PIN de quem pode aprovar, e a partir de que valor. O administrador fecha os meses já conferidos em Gestão de Finanças › Fecho de Períodos: depois disso, nada com data desses meses se lança nem se anula (os documentos corrigem-se com nota de crédito)." },
  { titulo: "Relatórios e análise", texto: "Em Gestão de Finanças › Construtor de Relatórios escolhe a fonte (vendas, linhas vendidas, tesouraria, stock, compras ou contas a receber), o período, o que agrupar e somar e os filtros; o resultado actualiza-se sozinho e sai em Excel, CSV ou impresso. Compare com o período anterior ou com o ano anterior, abra um dos relatórios prontos ou guarde o seu como modelo (só seu ou partilhado). No Painel, clique no nome de um indicador para ver o detalhe. Em Sistema › Qualidade dos Dados vê o que está repetido ou incompleto (NIF, códigos de barras, isentos sem motivo, preços, stock) e o ecrã onde se corrige." },
  { titulo: "Recursos humanos", texto: "Lance as alterações do mês (horas extra, faltas, subsídios), simule, processe e pague pela tesouraria. Confirme a tabela de IRT na Configuração Salarial antes do primeiro processamento." },
  { titulo: "SAF-T e AGT", texto: "Exporte o SAF-T (facturação, aquisição ou Estado) em Gestão de Finanças. Carregue a chave privada da empresa em Configurações para assinar os documentos." },
  { titulo: "Cópias de segurança", texto: "É feita uma cópia automática por dia (as últimas 14 ficam guardadas). Faça também cópias manuais para um disco externo ou para a nuvem." },
];

const mb = (b: number) => (b < 1024 * 1024 ? `${numero(Math.max(1, Math.round(b / 1024)), 0)} KB` : `${numero(b / 1024 / 1024, 1)} MB`);
const tamanho = (b: number) => (b >= 1024 ** 3 ? `${numero(b / 1024 ** 3, 1)} GB` : mb(b));

/** O computador da base: núcleos, memória e espaço livre, e como a base se configurou. Com pouco espaço (menos do que
 * uma cópia de segurança precisa: a base, mais um décimo, mais 200 MB), avisa. */
function Computador({ info }: { info?: Info }) {
  const c = info?.computador;
  if (!info || !c) return <>…</>;
  const precisa = info.base_bytes * 1.1 + 200 * 1024 * 1024;
  const pouco = c.espaco_livre != null && c.espaco_livre < precisa;
  return (
    <>
      {c.nucleos} núcleos{c.memoria ? ` · ${tamanho(c.memoria)} de memória` : ""}
      {c.espaco_livre != null && (
        <span className={cn(pouco && "font-medium text-danger")}>
          {" "}
          · {tamanho(c.espaco_livre)} livres no disco{pouco ? " (pouco: a próxima cópia de segurança pode não caber)" : ""}
        </span>
      )}
      <div className="text-[12px] text-ink-3">
        Base adaptada a este computador: {c.ligacoes} ligações, cache até {tamanho(c.ligacoes * c.cache_kib * 1024)}
        {c.temporarios_em_memoria ? ", ordenações em memória" : ""}
      </div>
    </>
  );
}

/** Sobre o KanGest, manual rápido e atalhos de teclado. */
export default function Sobre() {
  const [sp, setSp] = useSearchParams();
  const vista = sp.get("vista") === "manual" ? "manual" : "sobre";
  const info = useQuery({ queryKey: ["sistema-info"], queryFn: () => call<Info>("sistema.info") }).data;

  return (
    <>
      <PageHeader title={vista === "manual" ? "Manual e Atalhos" : "Sobre o KanGest"} subtitle="Gestão comercial e ponto de venda para Angola" />
      <div className="mb-4 flex w-fit gap-1 rounded-lg bg-sunken p-1">
        {(
          [
            ["sobre", "Sobre"],
            ["manual", "Manual e atalhos"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setSp({ vista: id })}
            className={cn("rounded-md px-3 py-1.5 text-[13px]", vista === id ? "bg-surface font-medium shadow-sm" : "text-ink-2 hover:text-ink")}
          >
            {label}
          </button>
        ))}
      </div>

      {vista === "sobre" ? (
        <div className="grid grid-cols-2 gap-4">
          <Autoria />
          <Card className="p-6">
            <div className="mb-4 flex items-center gap-2 font-medium">
              <Info className="size-4 text-brand" /> Aplicação
            </div>
            <dl className="grid grid-cols-[150px_minmax(0,1fr)] gap-y-2 text-[13.5px]">
              <dt className="text-ink-3">Versão</dt>
              <dd className="num font-medium">{info?.versao ?? "…"}</dd>
              <dt className="text-ink-3">Sistema</dt>
              <dd>{info?.plataforma}</dd>
              <dt className="text-ink-3">Motor da base</dt>
              <dd>
                SQLite {info?.sqlite} · {info?.migracoes} actualizações de estrutura aplicadas
              </dd>
              <dt className="text-ink-3">{MODO_WEB ? "Computador da base" : "Este computador"}</dt>
              <dd>
                <Computador info={info} />
              </dd>
            </dl>
          </Card>
          <Card className="p-6">
            <div className="mb-4 flex items-center gap-2 font-medium">
              <Database className="size-4 text-brand" /> Dados
            </div>
            <dl className="grid grid-cols-[150px_minmax(0,1fr)] gap-y-2 text-[13.5px]">
              <dt className="text-ink-3">Pasta de dados</dt>
              <dd className="break-all font-mono text-[12px]">{info?.pasta_dados}</dd>
              <dt className="text-ink-3">Pasta dos documentos</dt>
              <dd>
                <PastaDocumentos info={info} />
              </dd>
              <dt className="text-ink-3">Tamanho da base</dt>
              <dd className="num">{info ? mb(info.base_bytes) : "…"}</dd>
              <dt className="text-ink-3">Última cópia</dt>
              <dd>{info?.ultima_copia ?? "nenhuma ainda"}</dd>
              <dt className="text-ink-3">Registos</dt>
              <dd>
                {info && (
                  <>
                    {info.artigos} artigos · {info.entidades} entidades · {info.documentos} documentos
                    {info.importados ? ` (${info.importados} importados do KIGEST)` : ""} · {info.utilizadores} {info.utilizadores === 1 ? "utilizador" : "utilizadores"}
                  </>
                )}
              </dd>
            </dl>
          </Card>
          {MODO_WEB ? (
            <Card className="p-5 text-[13px] text-ink-2">
              No browser, o KanGest é sempre o do servidor da loja: as actualizações instalam-se no computador servidor (Sobre → Actualizações, lá) e este aparelho
              recebe-as ao recarregar a página.
            </Card>
          ) : (
            <Atualizacoes />
          )}
          <VerificacaoBase />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <Card className="p-6">
            <div className="mb-4 flex items-center gap-2 font-medium">
              <BookOpen className="size-4 text-brand" /> Manual rápido
            </div>
            <div className="space-y-4">
              {MANUAL.map((m) => (
                <div key={m.titulo}>
                  <div className="font-medium">{m.titulo}</div>
                  <p className="mt-0.5 text-[13.5px] leading-relaxed text-ink-2">{m.texto}</p>
                </div>
              ))}
            </div>
            <div className="mt-6 border-t border-line pt-4">
              <div className="mb-2 text-[12px] uppercase tracking-wide text-ink-3">Menus</div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-[13px]">
                {MENU.map((g) => (
                  <div key={g.id}>
                    <div className="font-medium">{g.titulo}</div>
                    <div className="text-ink-3">
                      {g.itens
                        .filter((i) => i.to)
                        .map((i, k) => (
                          <span key={i.label}>
                            {k > 0 && " · "}
                            <Link className="hover:text-brand hover:underline" to={i.to!}>
                              {i.label}
                            </Link>
                          </span>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>
          <Card className="h-fit p-6">
            {(
              [
                ["Atalhos da gestão", ATALHOS_GESTAO],
                ["Atalhos do POS", ATALHOS_POS],
              ] as const
            ).map(([titulo, lista], n) => (
              <div key={titulo} className={n > 0 ? "mt-6" : ""}>
                <div className="mb-4 flex items-center gap-2 font-medium">
                  <Keyboard className="size-4 text-brand" /> {titulo}
                </div>
                <table className="w-full text-[13.5px]">
                  <tbody>
                    {lista.map(([k, d]) => (
                      <tr key={k} className="border-b border-line last:border-0">
                        <td className="w-20 py-1.5 align-top">
                          <kbd className="rounded border border-line bg-sunken px-1.5 py-0.5 font-mono text-[12px]">{k}</kbd>
                        </td>
                        <td className="py-1.5 text-ink-2">{d}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </Card>
        </div>
      )}
    </>
  );
}

interface EstadoAtualizacao {
  versao_atual: string;
  plataforma: string;
  fonte: string;
  /** a origem usada de facto (a antiga do GitHub passa à do site) */
  fonte_efectiva?: string | null;
  /** origem oficial: o site da livraria (livrariaadventista.ao/kangest/actualizacoes) */
  origem_oficial?: string;
  chave_publica: boolean;
  /** A chave das actualizações vem com o programa: assinatura obrigatória. */
  chave_embutida?: boolean;
  ultima_verificacao: string | null;
  /** procurar sozinho de 6 em 6 horas (desliga-se aqui; a procura à mão fica sempre) */
  automatica?: boolean;
  /** a versão nova que a última procura (sozinha ou à mão) encontrou */
  disponivel?: string | null;
  /** posto em rede: a procura sozinha corre no servidor */
  posto_cliente?: boolean;
}
interface Verificacao {
  versao_atual: string;
  versao: string;
  data: string | null;
  notas: string | null;
  disponivel: boolean;
  pacote: string | null;
}

/** Verificar Atualização (KIGEST GC → Sistema): origem num endereço ou numa pasta partilhada na rede. */
function Atualizacoes() {
  const qc = useQueryClient();
  const admin = useSession((s) => s.tem)("sistema.atualizacoes");
  const estado = useQuery({ queryKey: ["atualizacao"], queryFn: () => call<EstadoAtualizacao>("atualizacao.estado") }).data;
  const [fonte, setFonte] = useState<string | null>(null);
  const [chave, setChave] = useState("");
  const [v, setV] = useState<Verificacao | null>(null);
  const [baixado, setBaixado] = useState<{ ficheiro: string; versao: string; copia: string | null } | null>(null);
  const [busy, setBusy] = useState<"" | "gravar" | "verificar" | "descarregar" | "instalar" | "automatica">("");
  // a versão nova: a da verificação à mão ou a que a procura sozinha encontrou
  const nova = v ? (v.disponivel ? v.versao : null) : (estado?.disponivel ?? null);

  async function executar<T>(qual: typeof busy, f: () => Promise<T>) {
    setBusy(qual);
    try {
      return await f();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  const gravar = () =>
    executar("gravar", async () => {
      await call("atualizacao.guardar", { fonte: fonte ?? estado?.fonte ?? "", chave_publica: chave.trim() ? chave : undefined });
      toast.success("Origem das actualizações gravada.");
      setFonte(null);
      setChave("");
      qc.invalidateQueries({ queryKey: ["atualizacao"] });
    });
  const verificar = () =>
    executar("verificar", async () => {
      const r = await call<Verificacao>("atualizacao.verificar");
      setV(r);
      qc.invalidateQueries({ queryKey: ["atualizacao"] });
      if (!r.disponivel) toast.success(`Já tem a versão mais recente (${r.versao_atual}).`);
    });
  const descarregar = () =>
    executar("descarregar", async () => {
      const r = await call<{ ficheiro: string; versao: string; copia: string | null }>("atualizacao.descarregar");
      setBaixado(r);
      toast.success(`Versão ${r.versao} descarregada e conferida.${r.copia ? " Foi feita uma cópia de segurança da base." : ""}`);
    });
  const instalar = () =>
    executar("instalar", async () => {
      const r = await call<{ versao: string; copia: string | null }>("atualizacao.instalar", { ficheiro: baixado?.ficheiro });
      toast.success(
        `O instalador foi aberto. Feche o KanGest para concluir a instalação.${r?.copia ? " A cópia de segurança de antes da actualização foi feita e verificada." : ""}`,
        { duration: 12000 },
      );
    });
  const automatica = (ligada: boolean) =>
    executar("automatica", async () => {
      await call("atualizacao.automatica", { ligada });
      qc.invalidateQueries({ queryKey: ["atualizacao"] });
      toast.success(ligada ? "O KanGest procura sozinho as versões novas." : "As versões novas procuram-se só à mão.");
    });

  return (
    <Card className="col-span-2 p-6">
      <div className="mb-4 flex items-center gap-2 font-medium">
        <RefreshCw className="size-4 text-brand" /> Actualizações
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-3">
          <Field
            label="Origem (endereço ou pasta partilhada na rede)"
            hint={
              estado?.fonte_efectiva && estado.fonte.trim() && estado.fonte_efectiva !== estado.fonte.trim().replace(/[/\\]+$/, "")
                ? `Esta origem antiga lê-se agora em ${estado.fonte_efectiva}.`
                : "Onde está o ficheiro kangest-atualizacao.json, ex.: https://… ou \\\\SERVIDOR\\KanGest. Vazia: a origem oficial."
            }
          >
            <Input disabled={!admin} value={fonte ?? estado?.fonte ?? ""} onChange={(e) => setFonte(e.target.value)} placeholder={estado?.origem_oficial ?? "https://… ou \\\\SERVIDOR\\KanGest"} />
          </Field>
          {/* vazia já usa a oficial */}
          {admin && estado?.origem_oficial && (fonte ?? estado.fonte).trim() !== "" && (fonte ?? estado.fonte).trim() !== estado.origem_oficial && (
            <button type="button" className="text-[13px] font-medium text-brand-700 hover:underline" onClick={() => setFonte(estado.origem_oficial ?? "")}>
              Usar a origem oficial ({estado.origem_oficial})
            </button>
          )}
          {estado?.chave_embutida ? (
            <p className="rounded-lg bg-ok-50 px-3 py-2 text-[13px] text-ok">
              Só se instalam pacotes assinados pelo produtor do KanGest: a chave pública vem com o programa e não se altera aqui.
            </p>
          ) : (
            <Field
              label="Chave pública de assinatura (opcional)"
              hint={estado?.chave_publica ? "Configurada: só se instalam pacotes assinados com esta chave." : "Sem chave, o pacote é conferido apenas pelo SHA-256 do manifesto."}
            >
              <Input disabled={!admin} value={chave} onChange={(e) => setChave(e.target.value)} placeholder={estado?.chave_publica ? "•••• (deixe vazio para manter)" : "Chave minisign (tauri signer)"} />
            </Field>
          )}
          {admin && (
            <Button variant="secondary" loading={busy === "gravar"} disabled={fonte === null && !chave.trim()} onClick={gravar}>
              Gravar origem
            </Button>
          )}
          <label className={cn("flex items-start gap-2 text-[13px]", !admin && "opacity-60")}>
            <input
              type="checkbox"
              className="mt-0.5"
              disabled={!admin || busy === "automatica" || !estado}
              checked={estado?.automatica ?? true}
              onChange={(e) => automatica(e.target.checked)}
            />
            <span>
              Procurar sozinho as versões novas, de 6 em 6 horas, e avisar neste computador
              <span className="block text-[12px] text-ink-3">
                {estado?.posto_cliente
                  ? "Neste posto em rede procura-se à mão: a procura sozinha corre no computador servidor."
                  : "Descarregar e instalar continuam à mão, aqui. Desligado, procura-se só com «Verificar atualização»."}
              </span>
            </span>
          </label>
        </div>
        <div className="text-[13.5px]">
          <dl className="grid grid-cols-[130px_minmax(0,1fr)] gap-y-2">
            <dt className="text-ink-3">Versão instalada</dt>
            <dd className="num font-medium">{estado?.versao_atual ?? "…"}</dd>
            <dt className="text-ink-3">Sistema</dt>
            <dd>{estado?.plataforma}</dd>
            <dt className="text-ink-3">Última verificação</dt>
            <dd>{estado?.ultima_verificacao?.replace("T", " ") ?? "nunca"}</dd>
            {!v && estado?.disponivel && (
              <>
                <dt className="text-ink-3">Versão nova</dt>
                <dd className="num font-medium text-brand-700">{estado.disponivel}</dd>
              </>
            )}
            {v && (
              <>
                <dt className="text-ink-3">Versão publicada</dt>
                <dd className="num">
                  {v.versao}
                  {v.data ? ` · ${v.data}` : ""}
                </dd>
              </>
            )}
          </dl>
          {v?.notas && <p className="mt-3 whitespace-pre-line rounded-lg bg-sunken p-3 text-ink-2">{v.notas}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="secondary" loading={busy === "verificar"} onClick={verificar}>
              <RefreshCw className="size-4" /> Verificar atualização
            </Button>
            {admin && nova && !baixado && (
              <Button loading={busy === "descarregar"} disabled={!!v && !v.pacote} onClick={descarregar}>
                <Download className="size-4" /> Descarregar {nova}
              </Button>
            )}
            {admin && baixado && (
              <Button loading={busy === "instalar"} onClick={instalar}>
                Instalar {baixado.versao}
              </Button>
            )}
          </div>
          {v?.disponivel && !v.pacote && <p className="mt-2 text-danger">A versão {v.versao} não tem pacote para este sistema.</p>}
          <p className="mt-3 text-[12.5px] text-ink-3">
            Os dados e as cópias ficam na pasta de dados e não são apagados pela instalação. Antes de instalar, o KanGest faz e verifica uma cópia da base; depois de
            actualizado, verifica a base sozinho (em baixo). Cada posto actualiza-se a si próprio.
          </p>
        </div>
      </div>
    </Card>
  );
}

/** Uma das verificações da base (services/verificacao.rs). */
interface ItemVerificacao {
  id: "base" | "ligacoes" | "agt" | "auditoria" | "stock" | "caixa";
  nome: string;
  /** grave: o ficheiro, as ligações, a AGT, a auditoria (oferece a cópia de antes); as outras corrigem-se nos ecrãs de sempre */
  grave: boolean;
  ok: boolean;
  resumo: string;
  detalhe: unknown;
}
interface ResultadoVerificacao {
  id: number;
  feita_em: string;
  /** actualizacao | manual */
  motivo: string;
  versao: string;
  versao_anterior: string | null;
  ok: boolean;
  graves: number;
  avisos: number;
  resumo: string;
  detalhe: ItemVerificacao[];
  copia: string | null;
  copia_existe?: boolean;
  copia_verificada?: boolean;
  duracao_ms: number;
  utilizador: string;
}
interface AjusteDados {
  nome: string;
  versao: string;
  descricao: string;
  /** aplicado | falhou | por_aplicar | desconhecido (de outra versão) */
  estado: string;
  aplicado_em: string | null;
  resultado: string | null;
  erro: string | null;
  tentativas: number;
  tentado_em: string | null;
}
interface EstadoVerificacao {
  versao: string;
  versao_arranque: string | null;
  /** a verificação por fazer depois de uma actualização */
  pendente: { de: string | null; para: string; em: string } | null;
  automatica: boolean;
  a_correr: boolean;
  ultima: ResultadoVerificacao | null;
  historico: { id: number; feita_em: string; motivo: string; versao: string; versao_anterior: string | null; ok: number | boolean; graves: number; avisos: number; resumo: string }[];
  /** a cópia feita antes de instalar esta versão */
  copia_antes: { ficheiro: string; verificada: boolean; versao: string } | null;
  ajustes: AjusteDados[];
}

const quando = (d: string | null | undefined) => (d ? d.replace("T", " ").slice(0, 16) : "");

/** O que cada verificação encontrou, em poucas linhas, e onde se corrige. */
function PormenorVerificacao({ item }: { item: ItemVerificacao }) {
  const d = item.detalhe as Record<string, unknown> | unknown[] | null;
  if (!d) return null;
  const linhas: string[] = [];
  let onde: { to: string; texto: string } | null = null;
  if (item.id === "base" && Array.isArray(d)) linhas.push(...d.map(String));
  if (item.id === "ligacoes" && Array.isArray(d)) for (const l of d as { ligacao: string; registos: number }[]) linhas.push(`${l.ligacao}: ${l.registos}`);
  if (item.id === "agt" && !Array.isArray(d)) {
    for (const s of (d.series as { tipo: string; serie: string; total_erros: number }[] | undefined) ?? []) linhas.push(`${s.tipo} ${s.serie}: ${s.total_erros} problema(s)`);
    for (const t of (d.em_falta as string[] | undefined) ?? []) linhas.push(`Protecção em falta: ${t}`);
    onde = { to: "/configuracoes?aba=agt", texto: "Certificação AGT → Verificar integridade" };
  }
  if (item.id === "auditoria" && !Array.isArray(d)) linhas.push(`Linha ${String(d.id ?? "")}${d.data_hora ? ` (${quando(String(d.data_hora))})` : ""}`);
  if (item.id === "stock" && !Array.isArray(d)) {
    for (const x of (d.existencias as { descricao: string; armazem: string | null; gravado: number; calculado: number }[] | undefined) ?? [])
      linhas.push(`${x.descricao}${x.armazem ? ` (${x.armazem})` : ""}: gravado ${numero(x.gravado, 2)}, pelos movimentos ${numero(x.calculado, 2)}`);
    for (const x of (d.lotes as { descricao: string; lote: string; gravado: number; calculado: number }[] | undefined) ?? [])
      linhas.push(`${x.descricao}, lote ${x.lote}: gravado ${numero(x.gravado, 2)}, pelos movimentos ${numero(x.calculado, 2)}`);
    onde = { to: "/stock/recalculo", texto: "Recálculo de stock" };
  }
  if (item.id === "caixa" && !Array.isArray(d)) {
    for (const c of (d.abertas_ha_mais_de_um_dia as { posto: string; aberta_em: string; utilizador: string }[] | undefined) ?? [])
      linhas.push(`Caixa de ${c.posto || "posto ?"} aberto desde ${quando(c.aberta_em)}${c.utilizador ? ` por ${c.utilizador}` : ""}`);
  }
  if (!linhas.length && !onde) return null;
  return (
    <div className="mt-1 space-y-0.5 text-[12px] text-ink-3">
      {linhas.slice(0, 8).map((l, i) => (
        <div key={i} className="break-words">
          {l}
        </div>
      ))}
      {linhas.length > 8 && <div>… e mais {linhas.length - 8}</div>}
      {onde && (
        <Link className="font-medium text-brand-700 hover:underline" to={onde.to}>
          Corrigir em {onde.texto}
        </Link>
      )}
    </div>
  );
}

const ESTADOS_AJUSTE: Record<string, { texto: string; tom: "ok" | "danger" | "neutral" | "accent" }> = {
  aplicado: { texto: "Aplicado", tom: "ok" },
  falhou: { texto: "Falhou", tom: "danger" },
  por_aplicar: { texto: "Por aplicar", tom: "accent" },
  desconhecido: { texto: "De outra versão", tom: "neutral" },
};

/**
 * A verificação da base depois de cada actualização (corre sozinha, sem sessão, e só avisa), o «Verificar agora», a
 * cópia de antes da actualização para restaurar à mão quando há problemas graves, e os ajustes de dados entre versões.
 */
function VerificacaoBase() {
  const qc = useQueryClient();
  const tem = useSession((s) => s.tem);
  const admin = tem("sistema.configuracoes");
  const podeRestaurar = admin && tem("sistema.backup") && !MODO_WEB;
  const q = useQuery({
    queryKey: ["verificacao-base"],
    queryFn: () => call<EstadoVerificacao>("verificacao.estado"),
    // enquanto verifica, o ecrã vai perguntando
    refetchInterval: (x) => (x.state.data?.a_correr ? 2500 : false),
  });
  const e = q.data;
  // num posto em rede, o restauro faz-se no servidor
  const postoCliente = useQuery({ queryKey: ["atualizacao"], queryFn: () => call<EstadoAtualizacao>("atualizacao.estado"), enabled: !MODO_WEB }).data?.posto_cliente;
  const [busy, setBusy] = useState<"" | "agora" | "automatica" | "ajustes">("");
  const [restaurar, setRestaurar] = useState(false);

  async function executar(qual: typeof busy, f: () => Promise<unknown>) {
    setBusy(qual);
    try {
      await f();
      qc.invalidateQueries({ queryKey: ["verificacao-base"] });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy("");
    }
  }
  const agora = () =>
    executar("agora", async () => {
      await call("verificacao.agora");
      toast.success("A verificação começou. Pode continuar a trabalhar: o resultado aparece aqui.");
    });
  const automatica = (ligada: boolean) =>
    executar("automatica", async () => {
      await call("verificacao.automatica", { ligada });
      toast.success(ligada ? "A base passa a ser verificada sozinha depois de cada actualização." : "Depois das actualizações, a base verifica-se só à mão.");
    });
  const ajustes = () =>
    executar("ajustes", async () => {
      const r = await call<{ resultado: { aplicados: number; falhou?: string; erro?: string } }>("verificacao.ajustesAplicar");
      if (r.resultado.falhou) toast.error(`O ajuste ${r.resultado.falhou} voltou a falhar: ${r.resultado.erro ?? ""}`);
      else toast.success(r.resultado.aplicados ? `${r.resultado.aplicados} ajuste(s) aplicado(s).` : "Não havia ajustes por aplicar.");
    });

  const u = e?.ultima;
  const copia = e?.copia_antes;
  const oferecer = !!u && u.graves > 0 && !!copia;
  const ajustesPorFazer = e?.ajustes.some((a) => a.estado === "falhou" || a.estado === "por_aplicar");

  return (
    <Card className="col-span-2 p-6">
      <div className="mb-1 flex items-center gap-2 font-medium">
        <ListChecks className="size-4 text-brand" /> Verificação da base
      </div>
      <p className="mb-4 text-[13px] text-ink-2">
        Depois de cada actualização, o KanGest confere sozinho, em segundo plano, o ficheiro da base, as ligações entre tabelas, a cadeia de assinaturas da AGT, o
        registo de auditoria, o stock e o caixa. Só avisa: as vendas continuam e nada se corrige nem se restaura sozinho.
      </p>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-3">
          {e?.a_correr && (
            <div className="flex items-center gap-2 rounded-lg bg-sunken px-3 py-2 text-[13px]">
              <span className="size-4 animate-spin rounded-full border-2 border-brand border-t-transparent" /> A verificar… Numa base grande demora uns minutos.
            </div>
          )}
          {e?.pendente && !e.a_correr && (
            <div className="rounded-lg bg-accent-50 px-3 py-2 text-[13px] text-accent-ink">
              A actualização {e.pendente.de ? `da ${e.pendente.de} ` : ""}para a {e.pendente.para} ainda não foi verificada
              {e.automatica ? ": a verificação corre sozinha pouco depois de o programa abrir." : " (a verificação sozinha está desligada): use «Verificar agora»."}
            </div>
          )}
          {u ? (
            <>
              <div className="flex flex-wrap items-center gap-2 text-[13.5px]">
                {u.ok ? <CheckCircle2 className="size-4 text-ok" /> : u.graves > 0 ? <XCircle className="size-4 text-danger" /> : <AlertTriangle className="size-4 text-accent-ink" />}
                <span className="font-medium">{u.resumo}</span>
              </div>
              <div className="text-[12.5px] text-ink-3">
                {quando(u.feita_em)} ·{" "}
                {u.motivo === "actualizacao" ? `depois da actualização${u.versao_anterior ? ` da ${u.versao_anterior}` : ""} para a ${u.versao}` : `à mão${u.utilizador ? `, por ${u.utilizador}` : ""}`} ·{" "}
                {numero(u.duracao_ms / 1000, 1)} s
              </div>
              <ul className="divide-y divide-line rounded-lg border border-line">
                {u.detalhe.map((x) => (
                  <li key={x.id} className="flex items-start gap-2 px-3 py-2 text-[13px]">
                    {x.ok ? (
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" />
                    ) : x.grave ? (
                      <XCircle className="mt-0.5 size-4 shrink-0 text-danger" />
                    ) : (
                      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-accent-ink" />
                    )}
                    <div className="min-w-0">
                      <div className="font-medium">{x.nome}</div>
                      <div className="text-ink-2">{x.resumo}</div>
                      {!x.ok && <PormenorVerificacao item={x} />}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            !e?.a_correr && <p className="text-[13px] text-ink-3">Ainda não há nenhuma verificação da base. Corre sozinha depois da próxima actualização, ou já, com «Verificar agora».</p>
          )}
          {oferecer && copia && (
            <div className="rounded-lg border border-danger/30 bg-danger-50 p-3 text-[13px]">
              <div className="flex items-center gap-2 font-medium text-danger">
                <DatabaseBackup className="size-4" /> Cópia de antes da actualização
              </div>
              <p className="mt-1 text-ink-2">
                Antes de instalar a {copia.versao} ficou uma cópia da base{copia.verificada ? ", verificada" : ""}. Restaurá-la volta a base a esse momento: o que se registou
                depois deixa de aparecer, e as actualizações de estrutura desta versão voltam a correr sobre ela. Veja primeiro o que está mal; restaure só se for preciso.
              </p>
              <div className="mt-1 break-all font-mono text-[11.5px] text-ink-3">{copia.ficheiro}</div>
              {podeRestaurar && !postoCliente ? (
                <Button size="sm" variant="danger" className="mt-2" onClick={() => setRestaurar(true)}>
                  Restaurar esta cópia…
                </Button>
              ) : (
                <p className="mt-1 text-[12px] text-ink-3">O restauro faz-se no computador que guarda a base, por quem pode restaurar cópias.</p>
              )}
            </div>
          )}
        </div>
        <div className="space-y-4 text-[13.5px]">
          <div className="flex flex-wrap gap-2">
            {admin && (
              <Button variant="secondary" loading={busy === "agora"} disabled={!!e?.a_correr} onClick={agora}>
                <RefreshCw className="size-4" /> Verificar agora
              </Button>
            )}
          </div>
          <label className={cn("flex items-start gap-2 text-[13px]", !admin && "opacity-60")}>
            <input type="checkbox" className="mt-0.5" disabled={!admin || !e || busy === "automatica"} checked={e?.automatica ?? true} onChange={(x) => automatica(x.target.checked)} />
            <span>
              Verificar sozinho depois de cada actualização
              <span className="block text-[12px] text-ink-3">Desligado, a verificação faz-se só com «Verificar agora».</span>
            </span>
          </label>
          {!!e?.historico.length && (
            <div>
              <div className="mb-1 text-[12px] uppercase tracking-wide text-ink-3">Verificações anteriores</div>
              <table className="w-full text-[12.5px]">
                <tbody>
                  {e.historico.map((h) => (
                    <tr key={h.id} className="border-b border-line last:border-0">
                      <td className="num py-1 pr-2 align-top whitespace-nowrap text-ink-3">{quando(h.feita_em)}</td>
                      <td className="py-1 pr-2 align-top">{h.motivo === "actualizacao" ? `Actualização ${h.versao}` : "À mão"}</td>
                      <td className="py-1 text-right align-top">
                        {h.ok ? <Badge tone="ok">Tudo certo</Badge> : h.graves > 0 ? <Badge tone="danger">{h.graves} grave(s)</Badge> : <Badge tone="accent">{h.avisos} aviso(s)</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      <div className="mt-6 border-t border-line pt-4">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <div className="font-medium">Ajustes de dados entre versões</div>
          {admin && ajustesPorFazer && (
            <Button size="sm" variant="secondary" loading={busy === "ajustes"} onClick={ajustes}>
              Tentar outra vez
            </Button>
          )}
        </div>
        <p className="mb-2 text-[12.5px] text-ink-3">
          O que uma versão nova precisa de acertar nos dados corre sozinho no arranque, uma vez, depois de uma cópia de segurança. Um ajuste que falhe desfaz-se, fica
          aqui com o erro e volta a tentar-se no arranque seguinte, sem impedir o programa de abrir.
        </p>
        {e?.ajustes.length ? (
          <ul className="divide-y divide-line rounded-lg border border-line">
            {e.ajustes.map((a) => {
              const est = ESTADOS_AJUSTE[a.estado] ?? ESTADOS_AJUSTE.desconhecido;
              return (
                <li key={a.nome} className="flex flex-wrap items-start justify-between gap-2 px-3 py-2 text-[13px]">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{a.descricao}</div>
                    <div className="text-[12px] text-ink-3">
                      {a.nome} · versão {a.versao}
                      {a.aplicado_em ? ` · aplicado em ${quando(a.aplicado_em)}` : a.tentado_em ? ` · tentado em ${quando(a.tentado_em)}` : ""}
                      {a.tentativas > 1 ? ` · ${a.tentativas} tentativas` : ""}
                    </div>
                    {a.resultado && <div className="text-[12.5px] text-ink-2">{a.resultado}</div>}
                    {a.erro && <div className="text-[12.5px] text-danger">{a.erro}</div>}
                  </div>
                  <Badge tone={est.tom}>{est.texto}</Badge>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-[13px] text-ink-3">Sem ajustes nesta versão.</p>
        )}
      </div>
      {restaurar && copia && (
        <RestaurarCopia
          alvo={{ ficheiro: copia.ficheiro, cifrada: false, descricao: `de antes da actualização para a ${copia.versao}` }}
          temSenha={false}
          onClose={() => setRestaurar(false)}
          metodo="sistema.restaurar"
        />
      )}
    </Card>
  );
}

/** Autoria e direitos: quem desenvolveu o KanGest e o aviso de protecção (igual ao do ficheiro LICENSE). */
/**
 * O selo de integridade do executável, dito por palavras (ver src-tauri/src/selo). Só se mostra quando diz alguma
 * coisa: válido ou alterado (sem selo — compilação sem as chaves do selo — e «a confirmar» não se mostram).
 */
const SELOS: Partial<Record<string, { texto: string; alerta: boolean }>> = {
  VALIDO: { texto: "Selo de integridade válido: este KanGest é o original, sem alterações.", alerta: false },
  ALTERADO: { texto: "O executável foi alterado: reinstale o KanGest a partir do site. Até lá não se emitem documentos.", alerta: true },
};

function Autoria() {
  const selo = useLicenca().data?.selo;
  const s = selo ? SELOS[selo] : undefined;
  return (
    <Card className="col-span-2 flex flex-wrap items-center gap-x-8 gap-y-3 border-brand/25 bg-brand-50/40 p-5">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand text-white">
          <ShieldCheck className="size-5" />
        </span>
        <div className="min-w-0">
          <div className="font-semibold">Desenvolvido por Valentino Canguele</div>
          <div className="text-[12.5px] text-ink-2">
            © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar, descompilar ou redistribuir o KanGest sem autorização escrita do autor.
          </div>
          {s && (
            <div className={cn("mt-1.5 flex items-center gap-1.5 text-[12.5px] font-medium", s.alerta ? "text-danger" : "text-ok")}>
              {s.alerta ? <ShieldAlert className="size-4 shrink-0" /> : <ShieldCheck className="size-4 shrink-0" />}
              {s.texto}
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-[13.5px]">
        <a className="inline-flex items-center gap-1.5 text-brand-700 hover:underline" href="tel:+244926445277">
          <Phone className="size-4" /> 926 445 277
        </a>
        <a className="inline-flex items-center gap-1.5 text-brand-700 hover:underline" href="mailto:valentinocanguele@gmail.com">
          <Mail className="size-4" /> valentinocanguele@gmail.com
        </a>
      </div>
    </Card>
  );
}

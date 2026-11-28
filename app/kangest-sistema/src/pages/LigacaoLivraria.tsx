// KanGest — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

/**
 * Livraria → Ligação ao site (docs/SINCRONIZACAO.md): emparelhar este KanGest com o posto criado no painel do site e
 * acompanhar o envio das facturas para a base central. Sem Internet, a loja vende como sempre e a fila espera.
 */
import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, CloudOff, KeyRound, Link2, PackageCheck, RefreshCw, RotateCcw, ShieldCheck, Unplug } from "lucide-react";
import { call } from "@/lib/api";
import { dataHora } from "@/lib/format";
import { Badge, Button, Card, Field, Input, Modal, PageHeader, Select, Table, Td, Th } from "@/components/ui";

interface ErroFila {
  id: number;
  documento_id: number;
  numero_doc: string | null;
  operacao: string;
  tentativas: number;
  erro: string;
}

interface EstadoSinc {
  ligada: boolean;
  ligacao: { url: string; posto_id: string; posto_nome: string; loja: string; emparelhado_em: string; ultima_sinc: string | null; ultimo_erro: string } | null;
  pendentes: number;
  com_erro: number;
  feitos: number;
  erros: ErroFila[];
  /** O stock e os artigos que mudaram e ainda não seguiram para o site (sinc/catalogo.rs). */
  catalogo?: { pendentes: number; com_erro: number };
  /** As fichas (clientes, fornecedores, artigos, utilizadores) por enviar (sinc/registos.rs). */
  registos?: { pendentes: number; com_erro: number };
  /** Quando as configurações chegaram ao site da última vez (sinc/configuracoes.rs). */
  configuracoes?: { guardadas_em: string | null; erro: string };
  intervalo: number;
  aviso?: string;
}

const OPERACOES: Record<string, string> = { emitido: "emissão", anulado: "anulação", facturado: "facturação" };

interface EstadoEncomendas {
  chave: { id: number; ativa: number; utilizador_id: number; utilizador: string; posto_id: number | null; posto: string | null } | null;
  utilizadores: { id: number; nome: string; login: string }[];
  postos: { id: number; descricao: string }[];
  feitas: number;
  com_erro: number;
  erros: { id: number; accao: string; erro: string; feito_em: string }[];
  por_enviar: number;
}

const ACCOES: Record<string, string> = { ne: "Nota de encomenda", fr: "Factura/Recibo", nc: "Nota de crédito", anular: "Anulação" };

/**
 * As encomendas online (docs/SINCRONIZACAO.md §Encomendas online): com «Emitir os documentos das encomendas online»
 * ligado no painel do site, este KanGest emite a NE, a FR, a NC e as anulações de cada encomenda da loja, pela própria
 * API e em nome do utilizador escolhido aqui (a chave interna «Loja online (ligação ao site)»).
 */
function EncomendasOnline() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["sinc-encomendas"], queryFn: () => call<EstadoEncomendas>("sinc.encomendas"), refetchInterval: 30000 });
  const [utilizador, setUtilizador] = useState<string>("");
  const [posto, setPosto] = useState<string>("");
  const [aGuardar, setAGuardar] = useState(false);
  const e = q.data;
  if (!e) return null;
  const activa = !!e.chave && e.chave.ativa === 1;
  const uSel = utilizador || (e.chave ? String(e.chave.utilizador_id) : "");
  const pSel = posto || (e.chave?.posto_id ? String(e.chave.posto_id) : e.postos[0] ? String(e.postos[0].id) : "");
  async function guardar() {
    setAGuardar(true);
    try {
      const r = await call<EstadoEncomendas>("sinc.encomendas.configurar", { utilizador_id: Number(uSel), posto_id: Number(pSel) });
      qc.setQueryData(["sinc-encomendas"], r);
      toast.success("As encomendas online passam a ser emitidas em nome de " + (e!.utilizadores.find((u) => String(u.id) === uSel)?.nome || "") + ".");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setAGuardar(false);
    }
  }
  async function desligar() {
    try {
      qc.setQueryData(["sinc-encomendas"], await call<EstadoEncomendas>("sinc.encomendas.desligar"));
      toast.success("Este KanGest deixou de emitir as encomendas online.");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }
  return (
    <Card>
      <div className="space-y-4 px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <PackageCheck className="size-4 text-brand" />
          <h2 className="text-[15px] font-semibold text-ink">Encomendas online</h2>
          <Badge tone={activa ? "ok" : "neutral"}>{activa ? `Emitidas em nome de ${e.chave!.utilizador}` : "Ninguém emite"}</Badge>
        </div>
        <p className="text-[13px] text-ink-2">
          Com «Emitir os documentos das encomendas online» ligado no painel do site, este KanGest emite a nota de encomenda de cada
          encomenda da loja, a factura/recibo quando o pagamento for confirmado no site, a nota de crédito dos reembolsos e a anulação
          das canceladas. O utilizador escolhido tem de poder emitir esses documentos; o posto dá a série e o armazém.
        </p>
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <Field label="Em nome de">
            <Select value={uSel} onChange={(ev) => setUtilizador(ev.target.value)}>
              <option value="">Escolha…</option>
              {e.utilizadores.map((u) => <option key={u.id} value={u.id}>{u.nome} ({u.login})</option>)}
            </Select>
          </Field>
          <Field label="Posto (série e armazém)">
            <Select value={pSel} onChange={(ev) => setPosto(ev.target.value)}>
              {e.postos.map((p) => <option key={p.id} value={p.id}>{p.descricao}</option>)}
            </Select>
          </Field>
          <div className="flex gap-2">
            <Button onClick={guardar} loading={aGuardar} disabled={!uSel || !pSel}>Guardar</Button>
            {activa && <Button variant="ghost" onClick={desligar}>Deixar de emitir</Button>}
          </div>
        </div>
        <p className="text-[12.5px] text-ink-3">
          Últimos 30 dias: {e.feitas} documento(s) emitido(s){e.com_erro > 0 ? `, ${e.com_erro} com erro` : ""}{e.por_enviar > 0 ? ` · ${e.por_enviar} resultado(s) a seguir para o site` : ""}.
          Os erros aparecem também no painel do site, onde se repete depois de corrigir.
        </p>
        {e.erros.length > 0 && (
          <Table>
            <thead>
              <tr>
                <Th>Documento</Th>
                <Th>Quando</Th>
                <Th>Erro</Th>
              </tr>
            </thead>
            <tbody>
              {e.erros.map((x) => (
                <tr key={x.id}>
                  <Td className="whitespace-nowrap font-medium">{ACCOES[x.accao] || x.accao}</Td>
                  <Td className="whitespace-nowrap">{dataHora(x.feito_em)}</Td>
                  <Td className="text-danger">{x.erro}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>
    </Card>
  );
}

type Loja = { id: string; name: string; province?: string | null };

/**
 * A ligação automática (pedido do dono a 27/11): quem tem «Gerir configurações» no site liga este KanGest com a sua conta,
 * sem ir ao painel nem copiar códigos. O site cria o posto e emparelha-o no mesmo pedido (src-tauri/src/sinc/mod.rs,
 * `ligar_com_a_conta`); a sessão só serve para isso e não se guarda.
 */
function LigacaoAutomatica({ onLigado }: { onLigado: (r: EstadoSinc) => void }) {
  const inicio = useQuery({ queryKey: ["sinc", "inicio"], queryFn: () => call<{ url: string; lojas: Loja[] }>("sinc.ligar_inicio"), retry: false });
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [codigo, setCodigo] = useState("");
  const [pedirCodigo, setPedirCodigo] = useState(false);
  const [loja, setLoja] = useState("");
  const [aLigar, setALigar] = useState(false);
  const lojas = inicio.data?.lojas ?? [];

  async function ligar(ev: FormEvent) {
    ev.preventDefault();
    setALigar(true);
    try {
      const r = await call<EstadoSinc | { dois_passos: true }>("sinc.ligar_com_a_conta", {
        email,
        senha,
        store_id: loja,
        ...(pedirCodigo ? { codigo } : {}),
      });
      if ("dois_passos" in r) {
        setPedirCodigo(true);
        return;
      }
      setSenha("");
      setCodigo("");
      onLigado(r);
      toast.success(`Ligado à livraria como «${r.ligacao?.posto_nome || "posto"}». As facturas começam a seguir.`);
      if (r.aviso) toast.warning(r.aviso);
    } catch (x) {
      toast.error((x as Error).message);
      setCodigo("");
    } finally {
      setALigar(false);
    }
  }

  if (inicio.isError) return null;
  return (
    <form onSubmit={ligar} className="space-y-4 p-5">
      <div className="flex items-start gap-3">
        <Link2 className="mt-0.5 size-5 shrink-0 text-brand" />
        <div>
          <p className="font-medium text-ink">Ligar com a conta do site (automático)</p>
          <p className="text-ink-2">
            Entre com a conta do site de quem tem «Gerir configurações». O posto desta loja é criado e ligado sozinho, sem
            ir ao painel nem copiar códigos.
          </p>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Email da conta do site">
          <Input id="sinc-email" type="email" autoComplete="username" value={email} onChange={(x) => setEmail(x.target.value)} />
        </Field>
        <Field label="Senha">
          <Input id="sinc-senha" type="password" autoComplete="current-password" value={senha} onChange={(x) => setSenha(x.target.value)} />
        </Field>
      </div>
      <Field label="A loja deste computador">
        <Select id="sinc-loja" value={loja} onChange={(x) => setLoja(x.target.value)}>
          <option value="">{inicio.isLoading ? "A carregar as lojas…" : "Sem loja (só facturas e stock)"}</option>
          {lojas.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
              {l.province ? ` — ${l.province}` : ""}
            </option>
          ))}
        </Select>
      </Field>
      {pedirCodigo && (
        <Field label="Código dos dois passos (a aplicação autenticadora)">
          <Input
            id="sinc-2fa"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            value={codigo}
            onChange={(x) => setCodigo(x.target.value.replace(/\D/g, "").slice(0, 6))}
            className="font-mono tracking-[0.3em]"
            placeholder="000000"
          />
        </Field>
      )}
      <Button type="submit" loading={aLigar} disabled={!email.includes("@") || !senha || (pedirCodigo && codigo.length !== 6)}>
        <KeyRound className="size-4" /> Ligar automaticamente
      </Button>
    </form>
  );
}

export default function LigacaoLivraria() {
  const qc = useQueryClient();
  const estado = useQuery({ queryKey: ["sinc"], queryFn: () => call<EstadoSinc>("sinc.estado"), refetchInterval: 15000 });
  const [url, setUrl] = useState("");
  const [codigo, setCodigo] = useState("");
  const [aLigar, setALigar] = useState(false);
  const [aEnviar, setAEnviar] = useState(false);
  const [desligar, setDesligar] = useState(false);
  const e = estado.data;
  const pronto = (novo: EstadoSinc) => qc.setQueryData(["sinc"], novo);

  async function ligar(ev: FormEvent) {
    ev.preventDefault();
    setALigar(true);
    try {
      const r = await call<EstadoSinc>("sinc.emparelhar", { url, codigo });
      pronto(r);
      setCodigo("");
      toast.success(`Ligado à livraria como «${r.ligacao?.posto_nome || "posto"}». As facturas começam a seguir.`);
      if (r.aviso) toast.warning(r.aviso);
    } catch (x) {
      toast.error((x as Error).message);
    } finally {
      setALigar(false);
    }
  }

  async function agora() {
    setAEnviar(true);
    try {
      pronto(await call<EstadoSinc>("sinc.agora"));
    } catch (x) {
      toast.error((x as Error).message);
    } finally {
      setAEnviar(false);
    }
  }

  async function accao(metodo: string, ok: string) {
    try {
      pronto(await call<EstadoSinc>(metodo));
      toast.success(ok);
    } catch (x) {
      toast.error((x as Error).message);
    }
  }

  return (
    <>
      <PageHeader title="Ligação ao site" subtitle="As facturas desta loja seguem para a base central da livraria, assinadas e cifradas" />
      {!e ? (
        <Card className="max-w-3xl">
          <div className="p-6 text-ink-3">{estado.error ? (estado.error as Error).message : "A carregar…"}</div>
        </Card>
      ) : !e.ligada || !e.ligacao ? (
        <Card className="max-w-3xl">
          <LigacaoAutomatica onLigado={pronto} />
          <form onSubmit={ligar} className="space-y-4 border-t border-line p-5">
            <div className="flex items-start gap-3">
              <Link2 className="mt-0.5 size-5 shrink-0 text-brand" />
              <p className="text-ink-2">
                <b>Ou com um código do painel:</b> no painel do site, em <b>Sistema → Ligação ao KanGest → Postos do KanGest Livraria</b>, crie o posto desta loja.
                O painel mostra o endereço e um código de 8 letras, que serve uma vez durante 10 minutos.
              </p>
            </div>
            <Field label="Endereço da ligação">
              <Input id="sinc-url" value={url} onChange={(x) => setUrl(x.target.value)} placeholder="https://…supabase.co/functions/v1/app" autoComplete="off" />
            </Field>
            <Field label="Código">
              <Input
                id="sinc-codigo"
                value={codigo}
                onChange={(x) => setCodigo(x.target.value.toUpperCase())}
                placeholder="XXXX-XXXX"
                maxLength={9}
                autoComplete="off"
                className="font-mono tracking-[0.2em]"
              />
            </Field>
            <Button type="submit" loading={aLigar} disabled={!url.trim() || codigo.replace(/[^A-Za-z0-9]/g, "").length !== 8}>
              <KeyRound className="size-4" /> Ligar à livraria
            </Button>
            <p className="flex items-start gap-2 border-t border-line pt-4 text-[12px] text-ink-3">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-brand" />
              Este KanGest cria a sua própria chave de assinatura. Só a parte pública vai para o site; a outra fica cifrada neste
              computador. Cada envio vai assinado por ela e cifrado para o site.
            </p>
          </form>
        </Card>
      ) : (
        <div className="max-w-5xl space-y-5">
          <Card>
            <div className="flex flex-wrap items-start gap-4 p-5">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  {e.ligacao.ultimo_erro ? (
                    <Badge tone="danger"><CloudOff className="mr-1 size-3.5" />Sem ligação ao site</Badge>
                  ) : (
                    <Badge tone="ok"><CheckCircle2 className="mr-1 size-3.5" />Ligado</Badge>
                  )}
                  <span className="font-semibold text-ink">{e.ligacao.posto_nome || "Posto"}</span>
                  {e.ligacao.loja && <span className="text-ink-3">· {e.ligacao.loja}</span>}
                </div>
                <p className="text-[13px] text-ink-3">
                  Última sincronização: {dataHora(e.ligacao.ultima_sinc)} · emparelhado em {dataHora(e.ligacao.emparelhado_em)} · volta de{" "}
                  {e.intervalo} em {e.intervalo} segundos
                </p>
                {e.ligacao.ultimo_erro && (
                  <p className="flex items-start gap-1.5 text-[13px] text-danger">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                    {e.ligacao.ultimo_erro}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={agora} loading={aEnviar}>
                  <RefreshCw className="size-4" /> Sincronizar agora
                </Button>
                {e.com_erro > 0 && (
                  <Button variant="secondary" onClick={() => accao("sinc.repetir", "Os documentos com erro voltaram à fila.")}>
                    <RotateCcw className="size-4" /> Repetir os com erro
                  </Button>
                )}
                <Button variant="ghost" onClick={() => setDesligar(true)}>
                  <Unplug className="size-4" /> Desligar
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 border-t border-line md:grid-cols-4">
              {[
                ["Documentos por enviar", e.pendentes, e.pendentes > 0 ? "text-accent-ink" : "text-ink"],
                ["Stock e preços por enviar", e.catalogo?.pendentes ?? 0, (e.catalogo?.com_erro ?? 0) > 0 ? "text-danger" : (e.catalogo?.pendentes ?? 0) > 0 ? "text-accent-ink" : "text-ink"],
                ["Com erro", e.com_erro + (e.catalogo?.com_erro ?? 0), e.com_erro + (e.catalogo?.com_erro ?? 0) > 0 ? "text-danger" : "text-ink"],
                ["Enviados (30 dias)", e.feitos, "text-ink"],
              ].map(([rotulo, n, cor]) => (
                <div key={String(rotulo)} className="border-r border-line px-5 py-4 last:border-r-0">
                  <p className="text-[12px] text-ink-3">{rotulo}</p>
                  <p className={`text-2xl font-semibold tabular-nums ${cor}`}>{n}</p>
                </div>
              ))}
            </div>
            {/* tudo na base central (27/11): as fichas e as configurações também seguem, e esperam sem Internet */}
            <p className="border-t border-line px-5 py-3 text-[13px] text-ink-3">
              Fichas por enviar (clientes, fornecedores, artigos, utilizadores): <span className="font-medium text-ink">{e.registos?.pendentes ?? 0}</span>
              {(e.registos?.com_erro ?? 0) > 0 && <span className="text-danger"> ({e.registos?.com_erro} com erro)</span>}
              {" · "}
              {e.configuracoes?.guardadas_em
                ? `Configurações guardadas no site a ${new Date(e.configuracoes.guardadas_em).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" })}`
                : "Configurações: seguem na próxima volta"}
              {e.configuracoes?.erro ? <span className="text-danger"> ({e.configuracoes.erro})</span> : null}
            </p>
          </Card>

          {e.erros.length > 0 && (
            <Card>
              <div className="px-5 pb-2 pt-4">
                <h2 className="text-[15px] font-semibold text-ink">Documentos que o site recusou</h2>
                <p className="text-[13px] text-ink-3">Voltam a tentar sozinhos, cada vez mais espaçados (até 6 horas). Depois de corrigir, use «Repetir os com erro».</p>
              </div>
              <Table>
                <thead>
                  <tr>
                    <Th>Documento</Th>
                    <Th>Operação</Th>
                    <Th>Tentativas</Th>
                    <Th>Erro</Th>
                  </tr>
                </thead>
                <tbody>
                  {e.erros.map((x) => (
                    <tr key={x.id}>
                      <Td className="whitespace-nowrap font-medium">{x.numero_doc || `#${x.documento_id}`}</Td>
                      <Td>{OPERACOES[x.operacao] || x.operacao}</Td>
                      <Td className="tabular-nums">{x.tentativas}</Td>
                      <Td className="text-danger">{x.erro}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          )}

          <EncomendasOnline />

          <p className="flex items-start gap-2 text-[12px] text-ink-3">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-brand" />
            As facturas continuam a ser emitidas e assinadas aqui, mesmo sem Internet (AGT). O site guarda uma cópia que não se altera,
            confere a cadeia de assinaturas e cifra os dados dos clientes. Endereço: {e.ligacao.url}
          </p>
        </div>
      )}

      <Modal
        open={desligar}
        onClose={() => setDesligar(false)}
        title="Desligar da livraria?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDesligar(false)}>Cancelar</Button>
            <Button
              variant="danger"
              onClick={async () => {
                setDesligar(false);
                await accao("sinc.desligar", "Desligado. Revogue também este posto no painel do site.");
              }}
            >
              <Unplug className="size-4" /> Desligar
            </Button>
          </>
        }
      >
        <p className="text-ink-2">
          A chave deste posto é apagada e as facturas que ainda não seguiram ficam por enviar. As que já chegaram ao site ficam lá.
          No painel do site, revogue também este posto.
        </p>
      </Modal>
    </>
  );
}

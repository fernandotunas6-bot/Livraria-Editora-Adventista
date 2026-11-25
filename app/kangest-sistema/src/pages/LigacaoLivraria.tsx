// KanGest — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

/**
 * Livraria → Ligação ao site (docs/SINCRONIZACAO.md): emparelhar este KanGest com o posto criado no painel do site e
 * acompanhar o envio das facturas para a base central. Sem Internet, a loja vende como sempre e a fila espera.
 */
import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, CloudOff, KeyRound, Link2, RefreshCw, RotateCcw, ShieldCheck, Unplug } from "lucide-react";
import { call } from "@/lib/api";
import { dataHora } from "@/lib/format";
import { Badge, Button, Card, Field, Input, Modal, PageHeader, Table, Td, Th } from "@/components/ui";

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
  intervalo: number;
  aviso?: string;
}

const OPERACOES: Record<string, string> = { emitido: "emissão", anulado: "anulação", facturado: "facturação" };

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
          <form onSubmit={ligar} className="space-y-4 p-5">
            <div className="flex items-start gap-3">
              <Link2 className="mt-0.5 size-5 shrink-0 text-brand" />
              <p className="text-ink-2">
                No painel do site, em <b>Sistema → Ligação ao KanGest → Postos do KanGest Livraria</b>, crie o posto desta loja.
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

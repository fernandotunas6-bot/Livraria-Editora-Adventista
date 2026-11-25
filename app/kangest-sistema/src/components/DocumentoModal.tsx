// KanGest — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { Fragment, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Ban, Printer, Receipt, FileText, Send, Truck, Undo2, UserRound } from "lucide-react";
import { call } from "@/lib/api";
import { dataHora } from "@/lib/format";
import { useTabelas, useTalao58 } from "@/lib/hooks";
import { imprimir, NOMES_VIAS } from "@/lib/print";
import type { DocCompleto } from "@/lib/types";
import { useSession } from "@/store/session";
import { A4, nomeDoDocumento, NotaEntrega, PrintPortal, Ticket } from "./DocumentoPrint";
import { EstadoDocumento } from "./EstadoDocumento";
import EnviarDocumento from "./EnviarDocumento";
import { Badge, Button, Field, Input, Modal, Select, cn } from "./ui";

export { imprimir };

export function useDocumento(id: number | null) {
  return useQuery({ queryKey: ["documento", id], queryFn: () => call<DocCompleto>("documentos.obter", { id }), enabled: !!id });
}

type Formato = "a4" | "ticket";

/** A designação de cada via: Original, Duplicado… e, numa reimpressão, «2.ª Via — Original»… */
export function nomesDasVias(vias: number, segundaVia?: boolean): string[] {
  return Array.from({ length: Math.max(1, vias) }, (_, i) => {
    const nome = NOMES_VIAS[i] ?? `Cópia ${i + 1}`;
    return segundaVia ? `2.ª Via — ${nome}` : nome;
  });
}

/** «2.ª via impressa por Ana em 25/11/2026 10:30» (vai no documento, junto de quem o emitiu). */
export function textoReimpressao(quem: string | undefined, quando = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const em = `${p(quando.getDate())}/${p(quando.getMonth() + 1)}/${quando.getFullYear()} ${p(quando.getHours())}:${p(quando.getMinutes())}`;
  return `2.ª via impressa por ${quem || "—"} em ${em}`;
}

/** Regista uma impressão (a base do «Original» e da 2.ª via automáticos). Não impede a impressão se falhar. */
export async function registarImpressao(id: number, vias: string[], segundaVia: boolean, formato: string) {
  try {
    await call("documentos.impressao", { id, vias, segunda_via: segundaVia, formato });
  } catch {
    // sem registo, a impressão seguinte só sai como 2.ª via se alguém a marcar
  }
}

/** N cópias do documento, cada uma com a sua designação (Original, Duplicado…). */
export function Copias({ d, formato, vias, segundaVia, reimpressao }: { d: DocCompleto; formato: Formato; vias: number; segundaVia?: boolean; reimpressao?: string }) {
  const nomes = nomesDasVias(vias, segundaVia);
  return (
    <>
      {formato === "a4" && d.documento.formato === "A5" && <style>{"@media print { @page { size: A5; margin: 7mm; } }"}</style>}
      {nomes.map((nome, i) => (
        <Fragment key={i}>
          {formato === "a4" ? (
            <>
              <A4 d={d} via={nome} reimpressao={reimpressao} />
              {i < nomes.length - 1 && <div className="break-after-page" />}
            </>
          ) : (
            // cada via na sua página do tamanho do talão (lib/print.ts), e a impressora corta entre elas
            <div className="via-talao">
              <Ticket d={d} via={nome} reimpressao={reimpressao} />
            </div>
          )}
        </Fragment>
      ))}
    </>
  );
}

/** Impressão directa (sem pré-visualização), usada pelo POS quando "imprimir automaticamente" está activo. */
export function ImpressaoAutomatica({ id, formato, vias, onDone }: { id: number; formato: Formato; vias: number; onDone: () => void }) {
  const { data: d } = useDocumento(id);
  useEffect(() => {
    if (!d) return;
    imprimir();
    // a primeira impressão, logo a seguir à emissão: o Original (e o Duplicado…); a seguinte já sai como 2.ª via
    void registarImpressao(id, nomesDasVias(vias), false, formato === "ticket" ? "talao" : (d.documento.formato || "A4").toLowerCase());
    const t = setTimeout(onDone, 1500);
    return () => clearTimeout(t);
  }, [d, onDone, id, vias, formato]);
  if (!d) return null;
  return (
    <PrintPortal>
      <Copias d={d} formato={formato} vias={vias} />
    </PrintPortal>
  );
}

export default function DocumentoModal({
  id,
  onClose,
  formatoInicial,
  anularAoAbrir,
}: {
  id: number | null;
  onClose: () => void;
  formatoInicial?: Formato;
  /** abre logo o pedido de anulação (ex.: arrastar para «Anuladas» no quadro de propostas) */
  anularAoAbrir?: boolean;
}) {
  // documento à vista: começa no pedido e muda ao abrir um documento ligado (origem, recibo, nota de crédito…)
  const [atual, setAtual] = useState(id);
  useEffect(() => setAtual(id), [id]);
  const { data: d } = useDocumento(atual);
  const opcoes = useTabelas().data?.posto?.opcoes;
  const talao58 = useTalao58();
  // impressão da nota de entrega (sem preços) em vez do documento
  const [notaEntrega, setNotaEntrega] = useState(false);
  const [formato, setFormato] = useState<Formato>(formatoInicial ?? opcoes?.formato ?? "a4");
  const [vias, setVias] = useState(1);
  const [segundaVia, setSegundaVia] = useState(false);
  // «Para o cliente»: só a via do cliente (o Original; numa reimpressão, a 2.ª via)
  const [soCliente, setSoCliente] = useState(false);
  const [anular, setAnular] = useState(false);
  const [enviar, setEnviar] = useState(false);
  const [motivo, setMotivo] = useState("");
  const tem = useSession((s) => s.tem);
  const quem = useSession((s) => s.sessao?.nome);
  const qc = useQueryClient();
  // as impressões já feitas: um documento já impresso sai sempre como 2.ª via (a AGT exige-o), sem ninguém a marcar
  const historico = useQuery({
    queryKey: ["impressoes", atual],
    queryFn: () => call<{ total: number; ultima: { em: string; utilizador: string } | null }>("documentos.impressoes", { id: atual }),
    enabled: !!atual,
  });
  const jaImpresso = (historico.data?.total ?? 0) > 0;
  const segunda = jaImpresso || segundaVia;
  const reimpressao = segunda ? textoReimpressao(quem) : undefined;
  const formatoRegisto = formato === "ticket" ? "talao" : (d?.documento.formato || "A4").toLowerCase();
  const registar = async (nomes: string[]) => {
    if (!atual) return;
    await registarImpressao(atual, nomes, segunda, formatoRegisto);
    qc.invalidateQueries({ queryKey: ["impressoes", atual] });
  };
  const nav = useNavigate();
  useEffect(() => {
    if (anularAoAbrir && d && d.documento.id === id && d.documento.estado === "N" && !d.documento.importado && tem("documentos.anular")) setAnular(true);
  }, [anularAoAbrir, d, id, tem]);

  // n.º de vias: o do posto (POS) ou o do tipo de documento
  useEffect(() => {
    if (d) setVias(formatoInicial === "ticket" ? (opcoes?.vias ?? 1) : d.documento.vias || 1);
  }, [d, formatoInicial, opcoes?.vias]);

  // Com impressão térmica directa configurada, o talão vai em ESC/POS (corta o papel e abre a gaveta). O talão térmico
  // decide a 2.ª via e regista a impressão sozinho (impressao.rs).
  const termica = !!opcoes?.escpos?.ativo && formato === "ticket";
  async function imprimirDoc(quantas = vias) {
    setNotaEntrega(false);
    if (!termica) {
      if (d) imprimir(nomeDoDocumento(d, segunda ? " (2.ª via)" : ""));
      return registar(nomesDasVias(quantas, segunda));
    }
    try {
      await call("impressao.talao", { id: atual, vias: quantas, segunda_via: segunda });
      qc.invalidateQueries({ queryKey: ["impressoes", atual] });
      toast.success("Talão enviado à impressora térmica.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  // «Para o cliente»: a cópia de impressão passa a ter só uma via e imprime-se depois de desenhada
  useEffect(() => {
    if (!soCliente) return;
    if (d) imprimir(nomeDoDocumento(d, segunda ? " (2.ª via)" : ""));
    void registar(nomesDasVias(1, segunda));
    setSoCliente(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soCliente]);
  function paraCliente() {
    setNotaEntrega(false);
    if (termica) return imprimirDoc(1);
    setSoCliente(true);
  }

  async function confirmarAnulacao() {
    try {
      await call("documentos.anular", { id: atual, motivo });
      toast.success("Documento anulado.");
      setAnular(false);
      qc.invalidateQueries();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <Modal
      open={!!id}
      onClose={onClose}
      title={d ? `${d.documento.tipo_desc} ${d.documento.numero_doc}` : "Documento"}
      width="max-w-4xl"
      footer={
        d && (
          <>
            {tem("documentos.anular") && d.documento.estado === "N" && !d.documento.importado && (
              <Button variant="ghost" className="mr-auto text-danger" onClick={() => setAnular(true)}>
                <Ban className="size-4" /> Anular
              </Button>
            )}
            {d.documento.estado === "N" && ["PROFORMA", "TRANSPORTE"].includes(d.documento.classe) && tem("vendas.fatura") && (
              <Button variant="secondary" onClick={() => nav(`/documentos/novo/FT?origem=${d.documento.id}`)}>
                <FileText className="size-4" /> Converter em factura
              </Button>
            )}
            {d.documento.estado === "N" && d.documento.classe === "COMPRA_DOC" && tem("compras.fatura") && (
              <Button variant="secondary" onClick={() => nav(`/documentos/novo/FC?origem=${d.documento.id}`)}>
                <FileText className="size-4" /> Converter em V/Factura
              </Button>
            )}
            {tem("vendas.nota_credito") && d.documento.estado === "N" && ["FT", "FR"].includes(d.documento.tipo_codigo) && (
              <Button variant="secondary" onClick={() => nav(`/documentos/novo/NC?origem=${d.documento.id}`)}>
                <Undo2 className="size-4" /> Nota de crédito
              </Button>
            )}
            {tem("compras.fatura") && d.documento.estado === "N" && ["FC", "VFR"].includes(d.documento.tipo_codigo) && (
              <Button variant="secondary" onClick={() => nav(`/documentos/novo/VNC?origem=${d.documento.id}`)}>
                <Undo2 className="size-4" /> V/Nota de crédito
              </Button>
            )}
            {d.documento.grupo === "VENDAS" && d.documento.estado !== "A" && d.linhas.length > 0 && !["RC", "RA"].includes(d.documento.tipo_codigo) && (
              <Button
                variant="secondary"
                title="Artigos e quantidades, sem preços, com assinaturas de entrega (no formato escolhido: A4 ou talão)"
                onClick={() => {
                  setNotaEntrega(true);
                  imprimir(nomeDoDocumento(d, " — Nota de entrega"));
                }}
              >
                <Truck className="size-4" /> Nota de entrega
              </Button>
            )}
            {d.documento.grupo === "VENDAS" && d.documento.estado !== "A" && (
              <Button variant="secondary" title="Recibo digital: por email ou por WhatsApp" onClick={() => setEnviar(true)}>
                <Send className="size-4" /> Enviar
              </Button>
            )}
            <label className="flex items-center gap-2 text-[13px] text-ink-2">
              Vias
              <Select className="h-8 w-16" value={vias} onChange={(e) => setVias(Number(e.target.value))}>
                {[1, 2, 3, 4].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </Select>
            </label>
            <label
              className="mr-2 flex items-center gap-2 text-[13px] text-ink-2"
              title={jaImpresso ? "Este documento já foi impresso: a impressão seguinte sai como 2.ª via, como a AGT exige." : "Marcar à mão como 2.ª via"}
            >
              <input type="checkbox" checked={segunda} disabled={jaImpresso} onChange={(e) => setSegundaVia(e.target.checked)} />
              {jaImpresso ? "2.ª via (automática)" : "2.ª via"}
            </label>
            <Button variant="secondary" onClick={paraCliente} title="Só a via do cliente: o Original e, numa reimpressão, a 2.ª via">
              <UserRound className="size-4" /> Para o cliente
            </Button>
            <Button onClick={() => imprimirDoc()}>
              <Printer className="size-4" /> {termica ? "Imprimir na térmica" : "Imprimir"}
            </Button>
          </>
        )
      }
    >
      {!d ? (
        <div className="py-10 text-center text-ink-3">A carregar…</div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg bg-sunken p-1">
              {(["a4", "ticket"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFormato(f)}
                  className={cn("flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px]", formato === f ? "bg-surface font-medium shadow-sm" : "text-ink-2")}
                >
                  {f === "a4" ? <FileText className="size-4" /> : <Receipt className="size-4" />}
                  {f === "a4" ? (d.documento.formato === "A5" ? "A5" : "A4") : `Talão ${talao58 ? 58 : 80} mm`}
                </button>
              ))}
            </div>
            {termica && <Badge tone="accent">Impressão directa (ESC/POS)</Badge>}
            {d.documento.estado === "A" && <Badge tone="danger">Anulado: {d.documento.motivo_anulacao}</Badge>}
            {d.documento.hash_controlo && <Badge tone="brand">Assinado · {d.documento.hash_controlo}</Badge>}
            {d.documento.autorizado_por_nome && <Badge tone="accent">Autorizado por {d.documento.autorizado_por_nome}</Badge>}
            {jaImpresso && historico.data?.ultima && (
              <Badge tone="neutral">
                Impresso {historico.data.total}× · a última por {historico.data.ultima.utilizador || "—"} em {dataHora(historico.data.ultima.em)}
              </Badge>
            )}
          </div>
          <EstadoDocumento d={d} onAbrir={setAtual} />
          <div className="max-h-[60vh] overflow-auto rounded-xl border border-line bg-sunken p-6">
            <div className="mx-auto w-fit bg-white shadow-card">
              {formato === "a4" ? (
                <A4 d={d} via={segunda ? "2.ª Via" : "Original"} reimpressao={reimpressao} />
              ) : (
                <Ticket d={d} via={segunda ? "2.ª Via" : "Original"} reimpressao={reimpressao} />
              )}
            </div>
          </div>
          <PrintPortal>
            {notaEntrega ? (
              <NotaEntrega d={d} talao={formato === "ticket"} />
            ) : (
              <Copias d={d} formato={formato} vias={soCliente ? 1 : vias} segundaVia={segunda} reimpressao={reimpressao} />
            )}
          </PrintPortal>
          {enviar && <EnviarDocumento id={d.documento.id} numero={d.documento.numero_doc} onClose={() => setEnviar(false)} />}

          <Modal
            open={anular}
            onClose={() => setAnular(false)}
            title="Anular documento"
            width="max-w-md"
            footer={
              <>
                <Button variant="secondary" onClick={() => setAnular(false)}>
                  Cancelar
                </Button>
                <Button variant="danger" onClick={confirmarAnulacao}>
                  Anular
                </Button>
              </>
            }
          >
            <p className="mb-4 text-ink-2">
              A anulação repõe o stock e fica registada na auditoria e no SAF-T. Para devoluções parciais use uma Nota de Crédito.
            </p>
            <Field label="Motivo">
              <Input autoFocus value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            </Field>
          </Modal>
        </>
      )}
    </Modal>
  );
}

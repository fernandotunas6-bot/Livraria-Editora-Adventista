// KanGest — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

/**
 * As capas dos livros do site como fotografias dos artigos (KANGEST ONE, integração total; src-tauri/src/sinc/capas.rs).
 * Cada artigo sem fotografia cuja referência tem um produto do site com capa recebe-a: o programa descarrega-a, este ecrã
 * reduz-a como a qualquer fotografia (`prepararFoto`) e guarda-a (`fotos.guardar`). Uma fotografia escolhida à mão nunca
 * é substituída.
 *
 * Automático com opção manual: corre sozinho em segundo plano (`<CapasDoSite automatico />` no AppShell), e na Loja
 * online há o cartão com «Trazer agora» e o interruptor para o desligar neste computador.
 */
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { call } from "@/lib/api";
import { prepararFoto } from "@/lib/fotos";
import { useSession } from "@/store/session";
import { Badge, Button, Card, Modal, Select } from "@/components/ui";

type Pendente = { artigo_id: number; referencia: string; descricao: string };
type Pendentes = { capas: Pendente[]; falhadas: number };

const CHAVE_AUTOMATICO = "kg-capas-automaticas";
const automaticoLigado = () => {
  try {
    return localStorage.getItem(CHAVE_AUTOMATICO) !== "nao";
  } catch {
    return true;
  }
};

/** Uma data URL em ficheiro, sem `fetch` (a política de conteúdo da janela pode recusá-lo). */
function ficheiroDe(dados: string, nome: string): File {
  const [cab, b64] = dados.split(",", 2);
  const tipo = cab.replace(/^data:/, "").replace(/;base64$/, "") || "image/jpeg";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], nome, { type: tipo });
}

/** Traz uma capa: descarrega, reduz e guarda. Uma falha fica registada (e só se tenta outra vez com outro endereço). */
async function trazer(c: Pendente): Promise<void> {
  const { dados } = await call<{ dados: string }>("loja.capas.descarregar", { artigo_id: c.artigo_id });
  try {
    const foto = await prepararFoto(ficheiroDe(dados, `capa-${c.referencia}`));
    await call("fotos.guardar", { artigo_id: c.artigo_id, ...foto });
  } catch (e) {
    await call("loja.capas.falhou", { artigo_id: c.artigo_id, erro: (e as Error).message }).catch(() => {});
    throw e;
  }
}

export function CapasDoSite({ automatico = false }: { automatico?: boolean }) {
  const pode = useSession((s) => s.tem)("artigos.editar");
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["capas-do-site"],
    queryFn: () => call<Pendentes>("loja.capas.pendentes"),
    enabled: pode,
    // sozinho: confere de dez em dez minutos (chegam produtos novos do site)
    refetchInterval: automatico ? 10 * 60_000 : false,
    retry: false,
  });
  const [progresso, setProgresso] = useState<{ feitas: number; total: number } | null>(null);
  const [ligado, setLigado] = useState(automaticoLigado);
  const aCorrer = useRef(false);
  const lista = q.data?.capas ?? [];

  async function correr(silencioso: boolean) {
    if (aCorrer.current || !lista.length) return;
    aCorrer.current = true;
    let trazidas = 0;
    let falhadas = 0;
    setProgresso({ feitas: 0, total: lista.length });
    for (const [i, c] of lista.entries()) {
      try {
        await trazer(c);
        trazidas++;
      } catch {
        falhadas++;
      }
      setProgresso({ feitas: i + 1, total: lista.length });
    }
    aCorrer.current = false;
    setProgresso(null);
    await qc.invalidateQueries();
    if (trazidas || !silencioso) {
      toast.success(`${trazidas} capa(s) do site como fotografia dos artigos${falhadas ? `; ${falhadas} não se puderam trazer` : ""}.`);
    }
  }

  useEffect(() => {
    if (automatico && pode && ligado && lista.length && !aCorrer.current) void correr(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [automatico, pode, ligado, lista.length]);

  if (automatico || !pode || (!lista.length && !q.data?.falhadas && !progresso)) return null;
  return (
    <Card className="mb-4 flex flex-wrap items-center gap-3 p-4 text-[13.5px]" aria-label="As capas do site">
      <div className="min-w-0 flex-1">
        <div className="font-medium">As capas dos livros do site</div>
        <div className="text-ink-3">
          {progresso
            ? `A trazer ${progresso.feitas} de ${progresso.total}…`
            : lista.length
              ? `${lista.length} artigo(s) sem fotografia têm capa no site.`
              : "Todas as capas do site já estão nos artigos."}
          {q.data?.falhadas ? ` ${q.data.falhadas} não se puderam trazer (tentam-se outra vez quando a capa mudar no site).` : ""}
        </div>
      </div>
      <label className="flex items-center gap-2 text-ink-2">
        <input
          type="checkbox"
          checked={ligado}
          onChange={(e) => {
            setLigado(e.target.checked);
            try {
              localStorage.setItem(CHAVE_AUTOMATICO, e.target.checked ? "sim" : "nao");
            } catch {
              /* sem armazenamento: fica só nesta sessão */
            }
          }}
        />
        Trazer sozinho
      </label>
      <Button variant="secondary" loading={!!progresso} disabled={!lista.length} onClick={() => void correr(false)}>
        Trazer agora
      </Button>
    </Card>
  );
}

type Envio = { ligado: boolean; por_enviar: number; postas: number; recusadas: number; ultimo_erro: string | null };

/**
 * O sentido contrário (src-tauri/src/sinc/capas.rs, `para_o_site`): a fotografia de um artigo segue sozinha, uma por
 * volta da sincronização, para o produto do site que ainda não tem capa. No site só a aceita o KanGest que manda no
 * catálogo, e nunca substitui uma capa. Aqui vê-se o que já foi e o que espera, e desliga-se neste computador.
 */
export function FotosParaOSite() {
  const pode = useSession((s) => s.tem)("artigos.editar");
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["capas-para-o-site"],
    queryFn: () => call<Envio>("loja.capas.envio"),
    enabled: pode,
    refetchInterval: 60_000,
    retry: false,
  });
  const e = q.data;
  if (!pode || !e || (!e.por_enviar && !e.postas && !e.recusadas && e.ligado)) return null;
  async function ligar(ligado: boolean) {
    try {
      qc.setQueryData(["capas-para-o-site"], await call<Envio>("loja.capas.envio_ligar", { ligado }));
    } catch (err) {
      toast.error((err as Error).message);
    }
  }
  const partes = [
    e.postas ? `${e.postas} já são capas no site` : "",
    e.por_enviar ? `${e.por_enviar} à espera (uma por volta da sincronização)` : "",
    e.recusadas ? `${e.recusadas} não foram aceites${e.ultimo_erro ? `: ${e.ultimo_erro}` : ""}` : "",
  ].filter(Boolean);
  return (
    <Card className="mb-4 flex flex-wrap items-center gap-3 p-4 text-[13.5px]" aria-label="As fotografias para o site">
      <div className="min-w-0 flex-1">
        <div className="font-medium">As fotografias dos artigos para o site</div>
        <div className="text-ink-3">
          {e.ligado ? "Os produtos do site sem capa recebem a fotografia do artigo." : "Desligado neste computador."}
          {partes.length ? ` ${partes.join("; ")}.` : ""}
        </div>
      </div>
      <label className="flex items-center gap-2 text-ink-2">
        <input type="checkbox" checked={e.ligado} onChange={(ev) => void ligar(ev.target.checked)} />
        Enviar sozinho
      </label>
    </Card>
  );
}

type Fichas = {
  ligado: boolean;
  por_completar: number;
  completadas: number;
  ultima: string | null;
  agora?: { fichas: number; dados: number; codigos: number; familias: number };
  para_o_site: { ligado: boolean; por_enviar: number; enviados: number; recusados: number; ultimo_erro: string | null };
};

/**
 * Os dados dos livros do site nas fichas dos artigos (src-tauri/src/sinc/fichas.rs): o autor, a editora, o idioma, o ano
 * e as páginas, e o ISBN como código de barras, só nos artigos que não os têm. Corre sozinho depois de cada volta da
 * sincronização que traga produtos; aqui completa-se já ou desliga-se neste computador. Nunca substitui o que está na
 * ficha, e um dado que já veio uma vez não volta.
 *
 * E o sentido contrário: o que a ficha tem e o produto do site não segue na volta (até 50 de cada vez). No site só o
 * aceita o KanGest que manda no catálogo, e só preenche o que lá está vazio.
 */
export function DadosDosLivros() {
  const pode = useSession((s) => s.tem)("artigos.editar");
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["dados-dos-livros"],
    queryFn: () => call<Fichas>("loja.fichas.estado"),
    enabled: pode,
    refetchInterval: 60_000,
    retry: false,
  });
  const [aCorrer, setACorrer] = useState(false);
  const f = q.data;
  const o = f?.para_o_site;
  if (!pode || !f || !o) return null;
  if (!f.por_completar && !f.completadas && f.ligado && !o.por_enviar && !o.enviados && !o.recusados && o.ligado) return null;
  async function completar() {
    setACorrer(true);
    try {
      const r = await call<Fichas>("loja.fichas.completar");
      qc.setQueryData(["dados-dos-livros"], r);
      const a = r.agora;
      toast.success(
        a?.fichas
          ? `${a.fichas} ficha(s) completada(s) com os dados do site (${a.dados} dado(s) do livro, ${a.codigos} código(s) de barras, ${a.familias} família(s)).`
          : "Não havia nada a completar.",
      );
      await qc.invalidateQueries({ queryKey: ["artigos"] });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setACorrer(false);
    }
  }
  async function ligar(qual: "ligado" | "para_o_site", valor: boolean) {
    try {
      qc.setQueryData(["dados-dos-livros"], await call<Fichas>("loja.fichas.ligar", { [qual]: valor }));
    } catch (err) {
      toast.error((err as Error).message);
    }
  }
  const paraOSite = [
    o.enviados ? `${o.enviados} já foram para o site` : "",
    o.por_enviar ? `${o.por_enviar} à espera (até 50 por volta da sincronização)` : "",
    o.recusados ? `${o.recusados} não foram aceites${o.ultimo_erro ? `: ${o.ultimo_erro}` : ""}` : "",
  ].filter(Boolean);
  return (
    <Card className="mb-4 flex flex-wrap items-center gap-3 p-4 text-[13.5px]" aria-label="Os dados dos livros do site">
      <div className="min-w-0 flex-1">
        <div className="font-medium">Os dados dos livros do site</div>
        <div className="text-ink-3">
          {f.por_completar
            ? `${f.por_completar} artigo(s) podem receber do site o autor, a editora, o idioma, o ano, as páginas ou o ISBN como código de barras.`
            : "As fichas dos artigos já têm o que o site sabe dos livros."}
          {f.completadas ? ` ${f.completadas} já foram completadas.` : ""}
          {f.ligado ? "" : " Desligado neste computador."}
        </div>
        <div className="text-ink-3">
          {o.ligado
            ? "Para o site: o que a ficha tem e o produto do site não."
            : "Para o site: desligado neste computador."}
          {paraOSite.length ? ` ${paraOSite.join("; ")}.` : ""}
        </div>
      </div>
      <label className="flex items-center gap-2 text-ink-2">
        <input type="checkbox" checked={f.ligado} onChange={(ev) => void ligar("ligado", ev.target.checked)} />
        Completar sozinho
      </label>
      <label className="flex items-center gap-2 text-ink-2">
        <input type="checkbox" checked={o.ligado} onChange={(ev) => void ligar("para_o_site", ev.target.checked)} />
        Enviar para o site
      </label>
      <Button variant="secondary" loading={aCorrer} disabled={!f.por_completar} onClick={() => void completar()}>
        Completar agora
      </Button>
    </Card>
  );
}

type Promocoes = { ligado: boolean; por_enviar: number; no_site: number; do_painel: number; recusadas: number; ultimo_erro: string | null };

/**
 * As promoções dos artigos no site (src-tauri/src/sinc/promocoes.rs): a regra do preço. O KanGest que manda no catálogo
 * põe a promoção do artigo no produto do site e retira-a quando acaba, mas nunca mexe numa promoção do painel.
 */
export function PromocoesParaOSite() {
  const pode = useSession((s) => s.tem)("artigos.editar");
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["promocoes-para-o-site"],
    queryFn: () => call<Promocoes>("loja.promocoes.estado"),
    enabled: pode,
    refetchInterval: 60_000,
    retry: false,
  });
  const e = q.data;
  if (!pode || !e || (!e.por_enviar && !e.no_site && !e.do_painel && !e.recusadas && e.ligado)) return null;
  async function ligar(ligado: boolean) {
    try {
      qc.setQueryData(["promocoes-para-o-site"], await call<Promocoes>("loja.promocoes.ligar", { ligado }));
    } catch (err) {
      toast.error((err as Error).message);
    }
  }
  const partes = [
    e.no_site ? `${e.no_site} em promoção no site` : "",
    e.por_enviar ? `${e.por_enviar} à espera (até 50 por volta da sincronização)` : "",
    e.do_painel ? `${e.do_painel} ficaram com a promoção do painel do site` : "",
    e.recusadas ? `${e.recusadas} não foram aceites${e.ultimo_erro ? `: ${e.ultimo_erro}` : ""}` : "",
  ].filter(Boolean);
  return (
    <Card className="mb-4 flex flex-wrap items-center gap-3 p-4 text-[13.5px]" aria-label="As promoções no site">
      <div className="min-w-0 flex-1">
        <div className="font-medium">As promoções dos artigos no site</div>
        <div className="text-ink-3">
          {e.ligado
            ? "A promoção de cada artigo passa ao produto do site, e sai quando acaba. Uma promoção do painel do site fica."
            : "Desligado neste computador."}
          {partes.length ? ` ${partes.join("; ")}.` : ""}
        </div>
      </div>
      <label className="flex items-center gap-2 text-ink-2">
        <input type="checkbox" checked={e.ligado} onChange={(ev) => void ligar(ev.target.checked)} />
        Enviar sozinho
      </label>
    </Card>
  );
}

type LigacaoGeneros = {
  generos: { genero: string; produtos: number }[];
  familias: { id: number; descricao: string; artigos: number; genero: string | null; a_mao: boolean; geral: boolean }[];
};

/** O valor do quadro: «sozinho» (pelo nome), «não ligar» ou um género. */
const PELO_NOME = "__pelo_nome__";
const NAO_LIGAR = "__nao_ligar__";

/**
 * As famílias do KanGest e os géneros do site (src-tauri/src/sinc/fichas.rs, `generos`). Cada família liga-se sozinha ao
 * género com o mesmo nome; aqui liga-se à mão, ou desliga-se. Com a ligação, um artigo na «Geral» recebe a família do
 * género do seu produto, e um produto em «Catálogo Geral» recebe o género da família do artigo.
 */
export function FamiliasEGeneros() {
  const pode = useSession((s) => s.tem)("artigos.editar");
  const qc = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const q = useQuery({
    queryKey: ["familias-e-generos"],
    queryFn: () => call<LigacaoGeneros>("loja.fichas.generos"),
    enabled: pode,
    retry: false,
  });
  const d = q.data;
  if (!pode || !d || !d.generos.length) return null;
  const ligadas = d.familias.filter((f) => f.genero).length;
  async function ligar(familia_id: number, valor: string) {
    const genero = valor === PELO_NOME ? null : valor === NAO_LIGAR ? "" : valor;
    try {
      qc.setQueryData(["familias-e-generos"], await call<LigacaoGeneros>("loja.fichas.ligar_genero", { familia_id, genero }));
      await qc.invalidateQueries({ queryKey: ["dados-dos-livros"] });
    } catch (err) {
      toast.error((err as Error).message);
    }
  }
  return (
    <Card className="mb-4 flex flex-wrap items-center gap-3 p-4 text-[13.5px]" aria-label="As famílias e os géneros do site">
      <div className="min-w-0 flex-1">
        <div className="font-medium">As famílias e os géneros do site</div>
        <div className="text-ink-3">
          {ligadas
            ? `${ligadas} família(s) ligada(s) a um género do site. Os artigos na «Geral» recebem a família do género do produto, e os produtos em «Catálogo Geral», o género da família.`
            : "Nenhuma família está ligada a um género do site. Ligam-se sozinhas quando o nome é igual, ou aqui, à mão."}
        </div>
      </div>
      <Button variant="secondary" onClick={() => setAberto(true)}>
        Ligar famílias
      </Button>
      {aberto && (
        <Modal open onClose={() => setAberto(false)} title="As famílias e os géneros do site" width="max-w-2xl">
          <p className="mb-3 text-[13px] text-ink-3">
            «Pelo nome» liga a família ao género do site com o mesmo nome, se houver. Só se usam géneros que o site já tem.
          </p>
          <div className="max-h-[60vh] overflow-y-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-ink-3">
                  <th className="py-1.5 pr-3 font-medium">Família</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Artigos</th>
                  <th className="py-1.5 font-medium">Género do site</th>
                </tr>
              </thead>
              <tbody>
                {d.familias.map((f) => (
                  <tr key={f.id} className="border-t border-line">
                    <td className="py-1.5 pr-3">
                      {f.descricao} {f.geral && <Badge>a «Geral»</Badge>}
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{f.artigos}</td>
                    <td className="py-1.5">
                      {f.geral ? (
                        <span className="text-ink-3">não se liga</span>
                      ) : (
                        <Select
                          aria-label={`Género do site para ${f.descricao}`}
                          value={!f.a_mao ? PELO_NOME : f.genero ?? NAO_LIGAR}
                          onChange={(e) => void ligar(f.id, e.target.value)}
                        >
                          <option value={PELO_NOME}>Pelo nome{!f.a_mao && f.genero ? ` (${f.genero})` : ""}</option>
                          <option value={NAO_LIGAR}>Não ligar</option>
                          {d.generos.map((g) => (
                            <option key={g.genero} value={g.genero}>
                              {g.genero} ({g.produtos})
                            </option>
                          ))}
                        </Select>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Modal>
      )}
    </Card>
  );
}

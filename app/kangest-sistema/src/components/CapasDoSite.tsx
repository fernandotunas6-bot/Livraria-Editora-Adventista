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
import { Button, Card } from "@/components/ui";

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

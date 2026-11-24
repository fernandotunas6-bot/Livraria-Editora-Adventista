// KanGest — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

/**
 * Internet: o navegador integrado da edição da livraria (docs/NAVEGADOR.md). Cada separador abre numa janela própria,
 * sem acesso ao programa; esta página é a barra de endereço e a lista dos separadores, dos favoritos, do histórico e
 * das transferências.
 */
import { useState, type FormEvent, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, ExternalLink, Globe, History, Lock, Search, ShieldCheck, Star, Trash2, X } from "lucide-react";
import { Badge, Button, Card, Empty, Input, PageHeader } from "@/components/ui";
import { NA_APP } from "@/lib/api";
import { dataHora } from "@/lib/format";
import { enderecoCurto, navegador, type EstadoNavegador, type Pagina } from "@/lib/navegador";

export default function Internet() {
  return NA_APP ? <Navegador /> : <SoNoPrograma />;
}

function SoNoPrograma() {
  return (
    <>
      <PageHeader title="Internet" />
      <Card className="max-w-3xl">
        <Empty
          icon={<Globe className="size-6" />}
          title="O navegador só existe no programa instalado"
          text="No Windows e no macOS, cada separador abre numa janela própria. Aqui, no browser, use o próprio browser."
        />
      </Card>
    </>
  );
}

function Navegador() {
  const qc = useQueryClient();
  const estado = useQuery({
    queryKey: ["navegador"],
    queryFn: () => navegador("estado"),
    // os separadores abrem e fecham nas janelas deles: a lista acompanha
    refetchInterval: 3000,
  });
  const [texto, setTexto] = useState("");
  const [privado, setPrivado] = useState(false);
  const [aAbrir, setAAbrir] = useState(false);
  const e = estado.data;

  const pronto = (novo?: EstadoNavegador) => {
    if (novo) qc.setQueryData(["navegador"], novo);
    else qc.invalidateQueries({ queryKey: ["navegador"] });
  };
  const tentar = async (f: () => Promise<unknown>) => {
    try {
      await f();
    } catch (x) {
      toast.error((x as Error).message);
    }
  };

  async function abrir(endereco: string, sessaoPrivada = privado) {
    setAAbrir(true);
    await tentar(async () => {
      await navegador("abrir", { texto: endereco, privado: sessaoPrivada });
      pronto();
    });
    setAAbrir(false);
  }

  function submeter(ev: FormEvent) {
    ev.preventDefault();
    if (!texto.trim()) return;
    void abrir(texto);
    setTexto("");
  }

  const favorito = (p: Pagina, remover = false) =>
    tentar(async () => {
      pronto(await navegador("favorito", { url: p.url, titulo: p.titulo, remover }));
      if (!remover) toast.success(`«${p.titulo || enderecoCurto(p.url)}» nos favoritos.`);
    });
  const eFavorito = (url: string) => !!e?.favoritos.some((f) => f.url === url);

  return (
    <>
      <PageHeader title="Internet" subtitle="Sites da Internet em separadores à parte, sem acesso ao programa, aos ficheiros nem às chaves" />
      <div className="space-y-5">
        <Card className="max-w-4xl">
          <form onSubmit={submeter} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
              <Input
                id="navegador-endereco"
                value={texto}
                onChange={(x) => setTexto(x.target.value)}
                placeholder="Endereço (livrariaadventista.ao) ou o que quer pesquisar"
                aria-label="Endereço ou pesquisa"
                className="pl-9"
                autoFocus
              />
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-[13px] text-ink-2">
              <input id="navegador-privado" type="checkbox" checked={privado} onChange={(x) => setPrivado(x.target.checked)} />
              <Lock className="size-3.5" /> Sessão privada
            </label>
            <Button type="submit" loading={aAbrir}>
              <ExternalLink className="size-4" /> Abrir
            </Button>
          </form>
          <p className="flex items-start gap-2 border-t border-line px-4 py-3 text-[12px] text-ink-3">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-brand" />
            Só abrem sites da Internet. Ficam de fora os ficheiros do computador, a rede da loja e o próprio programa. Na sessão
            privada não fica histórico nem sessões guardadas.
          </p>
        </Card>

        {!e ? (
          <Card className="max-w-4xl">
            <div className="p-6 text-ink-3">{estado.error ? (estado.error as Error).message : "A carregar…"}</div>
          </Card>
        ) : (
          <div className="grid max-w-6xl gap-5 lg:grid-cols-2">
            <Card>
              <Cabecalho icon={<Globe className="size-4" />} titulo="Separadores abertos" />
              {e.separadores.length === 0 ? (
                <p className="px-4 pb-4 text-ink-3">Nenhum separador aberto. Escreva um endereço acima ou abra um favorito.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {e.separadores.map((s) => (
                    <li key={s.label} className="flex items-center gap-2 px-4 py-2.5">
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        onClick={() => tentar(() => navegador("focar", { label: s.label }))}
                        title="Mostrar este separador"
                      >
                        <span className="block truncate font-medium text-ink">{s.titulo || enderecoCurto(s.url) || "A carregar…"}</span>
                        <span className="block truncate text-[12px] text-ink-3">{enderecoCurto(s.url)}</span>
                      </button>
                      {s.url.startsWith("http") && (
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={eFavorito(s.url) ? "Já está nos favoritos" : "Guardar nos favoritos"}
                          title={eFavorito(s.url) ? "Já está nos favoritos" : "Guardar nos favoritos"}
                          disabled={eFavorito(s.url)}
                          onClick={() => favorito({ url: s.url, titulo: s.titulo, em: "" })}
                        >
                          <Star className={eFavorito(s.url) ? "size-4 fill-current" : "size-4"} />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label="Fechar o separador"
                        title="Fechar o separador"
                        onClick={() => tentar(async () => { await navegador("fechar", { label: s.label }); pronto(); })}
                      >
                        <X className="size-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <Cabecalho icon={<Star className="size-4" />} titulo="Favoritos" />
              {e.favoritos.length === 0 ? (
                <p className="px-4 pb-4 text-ink-3">Sem favoritos. Guarde um separador aberto com a estrela.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {e.favoritos.map((f) => (
                    <li key={f.url} className="flex items-center gap-2 px-4 py-2.5">
                      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => abrir(f.url)} title={`Abrir ${f.url}`}>
                        <span className="block truncate font-medium text-ink">{f.titulo || enderecoCurto(f.url)}</span>
                        <span className="block truncate text-[12px] text-ink-3">{enderecoCurto(f.url)}</span>
                      </button>
                      <Button variant="ghost" size="sm" aria-label={`Tirar «${f.titulo}» dos favoritos`} title="Tirar dos favoritos" onClick={() => favorito(f, true)}>
                        <Trash2 className="size-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <Cabecalho
                icon={<History className="size-4" />}
                titulo="Histórico"
                accao={e.historico.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => tentar(async () => pronto(await navegador("limparHistorico")))}>
                    Limpar
                  </Button>
                )}
              />
              {e.historico.length === 0 ? (
                <p className="px-4 pb-4 text-ink-3">Ainda sem páginas visitadas.</p>
              ) : (
                <ul className="max-h-[420px] divide-y divide-line overflow-y-auto">
                  {e.historico.map((h) => (
                    <li key={h.url} className="px-4 py-2">
                      <button type="button" className="w-full min-w-0 text-left" onClick={() => abrir(h.url)} title={`Abrir ${h.url}`}>
                        <span className="block truncate text-ink">{h.titulo || enderecoCurto(h.url)}</span>
                        <span className="flex gap-2 text-[12px] text-ink-3">
                          <span className="min-w-0 flex-1 truncate">{enderecoCurto(h.url)}</span>
                          <span className="shrink-0 tabular-nums">{dataHora(h.em)}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <Cabecalho
                icon={<Download className="size-4" />}
                titulo="Transferências"
                accao={e.transferencias.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => tentar(async () => pronto(await navegador("limparTransferencias")))}>
                    Limpar a lista
                  </Button>
                )}
              />
              {e.transferencias.length === 0 ? (
                <p className="px-4 pb-4 text-ink-3">Os ficheiros que descarregar vão para a pasta Transferências do computador.</p>
              ) : (
                <ul className="max-h-[420px] divide-y divide-line overflow-y-auto">
                  {e.transferencias.map((t) => (
                    <li key={`${t.em}-${t.ficheiro}`} className="flex items-start gap-2 px-4 py-2">
                      <div className="min-w-0 flex-1">
                        <span className="block truncate text-ink" title={t.ficheiro}>{t.ficheiro.split(/[\\/]/).pop() || enderecoCurto(t.url)}</span>
                        <span className="block truncate text-[12px] text-ink-3" title={t.ficheiro}>{t.ficheiro || enderecoCurto(t.url)}</span>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <Badge tone={t.ok ? "ok" : "danger"}>{t.ok ? "Concluída" : "Falhou"}</Badge>
                        <span className="text-[12px] tabular-nums text-ink-3">{dataHora(t.em)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        )}
      </div>
    </>
  );
}

function Cabecalho({ icon, titulo, accao }: { icon: ReactNode; titulo: string; accao?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-4">
      <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
        <span className="text-brand">{icon}</span>
        {titulo}
      </h2>
      {accao}
    </div>
  );
}

// KanGest — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

/**
 * O Centro de Integrações (src-tauri/src/services/integracoes.rs): cada ligação do KanGest numa só vista, a pior
 * primeiro, com o que está por enviar ou falhou e o botão para o ecrã onde se resolve (Repetir, Testar, configurar).
 */
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, CheckCircle2, CircleOff, Globe, KeyRound, Receipt, RefreshCw, Store, Upload, Webhook, type LucideIcon } from "lucide-react";
import { call } from "@/lib/api";
import { Button, Card, PageHeader, cn } from "@/components/ui";

interface Ligacao {
  id: string;
  nome: string;
  estado: "erro" | "atencao" | "ok" | "desligada";
  resumo: string;
  detalhes: string[];
  destino: string;
}

const ICONES: Record<string, LucideIcon> = { site: Store, api: KeyRound, avisos: Webhook, fe: Receipt, kigest: Upload, web: Globe };
const ESTADOS: Record<Ligacao["estado"], [string, string, LucideIcon]> = {
  erro: ["Com erro", "bg-danger-50 text-danger", AlertTriangle],
  atencao: ["Atenção", "bg-accent-50 text-accent-ink", AlertTriangle],
  ok: ["A funcionar", "bg-ok-50 text-ok", CheckCircle2],
  desligada: ["Desligada", "bg-sunken text-ink-3", CircleOff],
};

export default function CentroIntegracoes() {
  const nav = useNavigate();
  const r = useQuery({ queryKey: ["integracoes-resumo"], queryFn: () => call<Ligacao[]>("integracoes.resumo"), refetchInterval: 30_000 });
  const lista = r.data ?? [];
  const problemas = lista.filter((l) => l.estado === "erro" || l.estado === "atencao").length;
  return (
    <>
      <PageHeader
        title="Centro de Integrações"
        subtitle={problemas ? `${problemas} ligação(ões) precisam de atenção` : "Todas as ligações do KanGest numa só vista"}
        actions={
          <Button variant="secondary" onClick={() => r.refetch()} disabled={r.isFetching}>
            <RefreshCw className={cn("size-4", r.isFetching && "animate-spin")} /> Actualizar
          </Button>
        }
      />
      {r.isError && <Card className="p-4 text-[13.5px] text-danger">{(r.error as Error).message}</Card>}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {lista.map((l) => {
          const Icone = ICONES[l.id] ?? Globe;
          const [rotulo, cor, IconeEstado] = ESTADOS[l.estado];
          return (
            <Card key={l.id} className="flex flex-col p-5">
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand">
                  <Icone className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{l.nome}</div>
                  <div className="text-[13px] text-ink-3">{l.resumo}</div>
                </div>
                <span className={cn("flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-[12px] font-medium", cor)}>
                  <IconeEstado className="size-3.5" /> {rotulo}
                </span>
              </div>
              {l.detalhes.length > 0 && (
                <ul className="mt-3 space-y-1 text-[13px] text-ink-2">
                  {l.detalhes.map((d) => (
                    <li key={d}>• {d}</li>
                  ))}
                </ul>
              )}
              {l.id === "servidor" && <SaudeDoSite />}
              <div className="mt-auto pt-4">
                <Button variant="ghost" onClick={() => nav(l.destino)}>
                  {l.estado === "desligada" ? "Configurar" : "Abrir"} <ArrowRight className="size-4" />
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
      {lista.length === 0 && !r.isLoading && <Card className="p-5 text-[13.5px] text-ink-3">Não tem permissões para ver as ligações deste KanGest.</Card>}
    </>
  );
}

type SaudeSite = {
  estado: "ok" | "aviso" | "grave";
  base?: { estado: string; ms?: number };
  auth?: { estado: string; ms?: number };
  storage?: { estado: string; ms?: number };
  emails?: { estado: string; motivo?: string };
  postos?: { nome: string; estado: string; motivo?: string }[];
  ultima_migracao?: string | null;
};

/**
 * A saúde do servidor central, como o site a vê (KANGEST ONE, fase E; GET /api/v1/system/health), pedida com a conta do
 * site da pessoa (`integracoes.servidor`). Sem essa conta nesta sessão, ou sem «Gerir configurações» no site, diz porquê.
 */
function SaudeDoSite() {
  const q = useQuery({
    queryKey: ["integracoes-servidor"],
    queryFn: () => call<{ saude?: SaudeSite; motivo?: string }>("integracoes.servidor"),
    refetchInterval: 60_000,
    retry: false,
  });
  if (q.isLoading) return <p className="mt-3 text-[12.5px] text-ink-3">A perguntar ao site pela saúde do servidor…</p>;
  const s = q.data?.saude;
  if (!s) return <p className="mt-3 text-[12.5px] text-ink-3">{q.data?.motivo ?? (q.error as Error | null)?.message ?? "Sem resposta do site."}</p>;
  const tom = (e?: string) => (e === "ok" ? "text-estado-ok" : e === "grave" ? "text-estado-erro" : "text-estado-aviso");
  const pecas: [string, { estado: string; ms?: number } | undefined][] = [["Base", s.base], ["Contas", s.auth], ["Ficheiros", s.storage]];
  return (
    <div className="mt-3 space-y-1 rounded-campo bg-sunken px-3 py-2 text-[12.5px] text-ink-2" aria-label="A saúde do servidor central">
      <div className="font-medium text-ink">
        No site: <span className={tom(s.estado)}>{s.estado === "ok" ? "tudo bem" : s.estado === "grave" ? "problema" : "atenção"}</span>
      </div>
      <div className="flex flex-wrap gap-x-3">
        {pecas.map(([n, p]) => (
          <span key={n}>
            {n} <span className={tom(p?.estado)}>{p?.estado ?? "—"}</span>
            {p?.ms != null ? ` · ${p.ms} ms` : ""}
          </span>
        ))}
        <span>
          Emails <span className={tom(s.emails?.estado)}>{s.emails?.estado ?? "—"}</span>
          {s.emails?.motivo ? ` · ${s.emails.motivo}` : ""}
        </span>
      </div>
      {(s.postos ?? []).filter((p) => p.estado !== "ok").map((p) => (
        <div key={p.nome} className={tom(p.estado)}>
          {p.nome}: {p.motivo}
        </div>
      ))}
      {s.ultima_migracao && <div className="text-ink-3">Base na migração {s.ultima_migracao}</div>}
    </div>
  );
}

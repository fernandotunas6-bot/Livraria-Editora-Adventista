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

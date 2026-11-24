// KanGest — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

/**
 * O estado da ligação ao site na barra de cima (docs/SINCRONIZACAO.md): ligado, ou sem ligação, e quantos documentos
 * esperam por seguir. Só aparece a quem gere a ligação e quando este KanGest está ligado; leva ao ecrã da ligação.
 */
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { call } from "@/lib/api";
import { useSession } from "@/store/session";
import { cn } from "@/components/ui";

interface Estado {
  ligada: boolean;
  ligacao: { ultimo_erro: string; ultima_sinc: string | null } | null;
  pendentes: number;
}

export function EstadoLivraria() {
  const { tem } = useSession();
  const navigate = useNavigate();
  const pode = tem("sistema.api");
  const estado = useQuery({
    queryKey: ["sinc"],
    queryFn: () => call<Estado>("sinc.estado"),
    enabled: pode,
    refetchInterval: 30000,
    retry: false,
  });
  const e = estado.data;
  if (!pode || !e?.ligada || !e.ligacao) return null;
  const semLigacao = !!e.ligacao.ultimo_erro;
  const titulo = semLigacao
    ? `Sem ligação ao site: ${e.ligacao.ultimo_erro}. A loja vende na mesma; ${e.pendentes} documento(s) à espera.`
    : `Ligado ao site da livraria${e.pendentes ? `: ${e.pendentes} documento(s) a seguir` : ", tudo enviado"}.`;
  return (
    <button
      type="button"
      onClick={() => navigate("/ligacao-site")}
      title={titulo}
      aria-label={titulo}
      className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-[12px] font-medium text-ink-2 hover:bg-sunken hover:text-ink"
    >
      <span className={cn("size-2 rounded-full", semLigacao ? "bg-accent" : "bg-ok")} aria-hidden />
      <span className="hidden lg:inline">{semLigacao ? "Sem ligação" : "Livraria"}</span>
      {e.pendentes > 0 && <span className="tabular-nums text-ink-3">{e.pendentes}</span>}
    </button>
  );
}

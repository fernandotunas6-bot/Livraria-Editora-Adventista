// KanGest — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

/**
 * O estado do servidor central na barra de cima (docs/KANGEST-SINCRONIZACAO.md; KANGEST ONE, fase G): ligado, sem
 * ligação, o modo sem Internet desta sessão, ou «Actualizar» abaixo da versão mínima do site, e quanto espera para ir
 * para o site. Aparece a toda a gente num KanGest ligado (`dashboard.ecossistema` só pede sessão); quem gere a ligação
 * (`sistema.api`) vai ao ecrã da ligação, e abaixo da versão mínima vai-se a «Sobre o KanGest» para actualizar.
 * As cores são os estados partilhados com o site (packages/marca/tokens.css).
 */
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { call } from "@/lib/api";
import { useSession } from "@/store/session";
import { cn } from "@/components/ui";

interface Ecossistema {
  ligado: boolean;
  em_linha?: boolean;
  erro?: string;
  por_enviar?: number;
  desactualizado?: string | null;
}

export function EstadoLivraria() {
  const { tem, sessao } = useSession();
  const navigate = useNavigate();
  const estado = useQuery({
    queryKey: ["dashboard", "ecossistema"],
    queryFn: () => call<Ecossistema>("dashboard.ecossistema"),
    refetchInterval: 30000,
    retry: false,
  });
  const e = estado.data;
  if (!e?.ligado) return null;
  const fila = e.por_enviar ?? 0;
  const tipo: "ok" | "aviso" | "erro" = e.desactualizado ? "erro" : sessao?.offline || !e.em_linha ? "aviso" : "ok";
  const rotulo = e.desactualizado ? "Actualizar" : sessao?.offline ? "Sem Internet" : e.em_linha ? "Livraria" : "Sem ligação";
  const titulo = e.desactualizado
    ? `O site da livraria pede o KanGest ${e.desactualizado} ou mais recente: até actualizar, só se consulta.`
    : sessao?.offline
      ? "Modo sem Internet: vende-se e factura-se; a loja online, o atendimento e os pagamentos do site voltam quando entrar com Internet."
      : e.em_linha
        ? `Ligado ao servidor central${fila ? `: ${fila} à espera da volta seguinte` : ", tudo enviado"}.`
        : `Sem ligação ao servidor central${e.erro ? `: ${e.erro}` : ""}. A loja vende na mesma; ${fila} à espera.`;
  const destino = e.desactualizado ? "/sobre" : tem("sistema.api") ? "/ligacao-site" : null;
  return (
    <button
      type="button"
      onClick={destino ? () => navigate(destino) : undefined}
      disabled={!destino}
      title={titulo}
      aria-label={titulo}
      className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-[12px] font-medium text-ink-2 enabled:hover:bg-sunken enabled:hover:text-ink disabled:cursor-default"
    >
      <span className={cn("size-2 rounded-pilula", tipo === "ok" ? "bg-estado-ok" : tipo === "aviso" ? "bg-estado-aviso" : "bg-estado-erro")} aria-hidden />
      <span className="hidden lg:inline">{rotulo}</span>
      {fila > 0 && <span className="tabular-nums text-ink-3">{fila}</span>}
    </button>
  );
}

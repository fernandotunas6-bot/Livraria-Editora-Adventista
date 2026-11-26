// KanGest — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

/**
 * KANGEST ONE (fase A): os avisos da identidade, por cima de cada ecrã (src-tauri/src/services/auth.rs, `conta_local`).
 * - **sem Internet:** entrou com a cópia local da conta do site, no modo limitado;
 * - **conta local num KanGest ligado ao site:** tem de se ligar à conta do site até à data; depois dela, só lê.
 */
import { CloudOff, UserRoundCog } from "lucide-react";
import { useSession } from "@/store/session";
import { data } from "@/lib/format";

export function AvisoIdentidade() {
  const s = useSession((x) => x.sessao);
  if (!s) return null;
  const caixa = "mb-4 flex items-start gap-3 rounded-xl border px-4 py-3 text-[13.5px]";
  return (
    <>
      {s.offline && (
        <div className={`${caixa} border-accent/40 bg-accent-50 text-accent-ink`} role="status">
          <CloudOff className="mt-0.5 size-4 shrink-0" />
          <span>
            <strong>Modo sem Internet.</strong> Entrou com a cópia local da sua conta do site: pode vender e facturar, e tudo segue para o site quando a
            Internet voltar. A loja online, o atendimento e os pagamentos do site pedem que entre outra vez com Internet.
          </span>
        </div>
      )}
      {s.so_leitura && (
        <div className={`${caixa} border-danger/40 bg-danger-50 text-danger`} role="alert">
          <UserRoundCog className="mt-0.5 size-4 shrink-0" />
          <span>
            <strong>Esta conta local só pode consultar</strong> desde {s.ligar_ate ? data(s.ligar_ate) : "a data marcada"}. Este KanGest está ligado ao site:
            entre com a sua conta do site (o email e a senha de lá). Se ainda não a tem, peça-a ao administrador.
          </span>
        </div>
      )}
      {!s.so_leitura && s.ligar_ate !== undefined && s.ligar_ate !== null && (
        <div className={`${caixa} border-line-strong bg-surface text-ink-2`} role="status">
          <UserRoundCog className="mt-0.5 size-4 shrink-0 text-brand" />
          <span>
            <strong>Esta é uma conta local.</strong> Este KanGest está ligado ao site, e as pessoas passam a entrar com a conta do site
            {s.ligar_ate ? ` até ${data(s.ligar_ate)}` : ""}. Depois disso, esta conta só poderá consultar. Peça a sua conta do site ao administrador.
          </span>
        </div>
      )}
    </>
  );
}

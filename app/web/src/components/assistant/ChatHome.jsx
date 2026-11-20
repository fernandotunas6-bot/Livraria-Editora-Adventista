// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { useId } from 'react';
import { CreditCard, Headset, Package, Search, Truck } from 'lucide-react';
import { teamAvailability } from '@/lib/teamHours';
import { Dot, useNow } from '@/components/assistant/TeamAvailability';

// Os atalhos enviam a pergunta como se o cliente a escrevesse: o motor do servidor percebe-as
// (são as mesmas frases das sugestões) e a conversa fica com o que foi pedido.
export const HOME_ACTIONS = [
  { label: 'A minha encomenda', hint: 'Estado, pagamento e rastreio', icon: Package, message: 'A minha encomenda' },
  { label: 'Envios e prazos', hint: 'Quanto custa e quanto demora', icon: Truck, message: 'Quanto custa a entrega?' },
  { label: 'Formas de pagamento', hint: 'Transferência, Multicaixa…', icon: CreditCard, message: 'Formas de pagamento' },
  { label: 'Falar com a equipa', hint: 'Uma pessoa continua a conversa', icon: Headset, message: 'Falar com a equipa', team: true },
];

const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || '';

/**
 * Início da conversa: saudação (com o nome de quem tem sessão), o que o assistente faz e os
 * atalhos mais pedidos — como a "home" dos mensageiros de atendimento. Desaparece quando a
 * conversa começa; daí em diante, as sugestões vêm em cada resposta.
 */
export default function ChatHome({ name, welcome, onPick, disabled = false, onSearch, teamHours = null }) {
  const first = firstName(name);
  // No atalho da equipa, em vez da frase fixa: "Disponível agora" ou "Volta amanhã às 08h".
  const team = teamAvailability(teamHours, useNow());
  const hintId = useId();
  // O título já cumprimenta: um "Olá!" no início do texto de boas-vindas ficava repetido.
  const intro = String(welcome || '').replace(/^\s*ol[aá]\s*[!,.]?\s*/i, '');
  return (
    <div className="space-y-4 pb-1">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary shadow-xs" aria-hidden>
          <img src="/logo-icon-light.svg" alt="" className="h-6 w-6 object-contain" />
        </span>
        <div className="min-w-0">
          <p className="text-lg font-semibold leading-tight text-foreground">
            Olá{first ? `, ${first}` : ''}! Como podemos ajudar?
          </p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{intro}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {HOME_ACTIONS.map((a, i) => (
          <button
            key={a.label}
            type="button"
            aria-label={a.label}
            aria-describedby={`${hintId}-${i}`}
            disabled={disabled}
            onClick={() => onPick(a.message)}
            className="group flex flex-col items-start gap-1.5 rounded-xl border border-border/70 bg-card p-3 text-left shadow-xs transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus:outline-hidden focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-marca/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
              <a.icon className="h-4 w-4" />
            </span>
            <span className="text-[13px] font-semibold leading-tight text-foreground">{a.label}</span>
            {a.team && team ? (
              <span id={`${hintId}-${i}`} className="flex items-center gap-1.5 text-[11px] leading-snug text-muted-foreground">
                <Dot open={team.open} /> {team.short}
              </span>
            ) : (
              <span id={`${hintId}-${i}`} className="text-[11px] leading-snug text-muted-foreground">{a.hint}</span>
            )}
          </button>
        ))}
      </div>

      {onSearch && (
        <button
          type="button"
          onClick={onSearch}
          disabled={disabled}
          className="flex w-full items-center gap-2 rounded-xl border border-dashed border-border px-3 py-2.5 text-left text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground disabled:opacity-50"
        >
          <Search className="h-3.5 w-3.5" /> Procurar um livro por título, autor ou tema — escreva-o abaixo
        </button>
      )}
    </div>
  );
}

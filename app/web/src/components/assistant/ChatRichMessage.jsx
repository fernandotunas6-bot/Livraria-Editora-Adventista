import React from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, BookOpen, ChevronRight, ThumbsDown, ThumbsUp } from 'lucide-react';
import OrderStatusCard from '@/components/assistant/OrderStatusCard';

// Caminhos que a IA (ou um texto antigo) ainda escreva no meio da frase — "Explore /shop." —
// passam a ligação com um nome legível, em vez de aparecerem crus ao cliente.
const PATH_LABELS = {
  '/shop': 'catálogo',
  '/track': 'rastreio',
  '/contact': 'contacto',
  '/faq': 'perguntas frequentes',
  '/shipping-returns': 'envios e devoluções',
  '/lojas': 'lojas',
  '/profile': 'a sua conta',
  '/login': 'entrar',
};
// Sem lookbehind: o Safari antes do iOS 16.4 recusa-o e o chat inteiro deixava de carregar.
const TOKEN = /\*\*([^*]+)\*\*|(^|[^\w/])(\/(?:shop|track|contact|faq|shipping-returns|lojas|profile|login))(?![\w/-])/g;

// Endereços escritos no texto ficam clicáveis. Ligações web só nas mensagens da equipa: as do
// assistente são filtradas no servidor para não levarem o cliente para fora do site, e um
// endereço que escapasse ao filtro não pode ganhar um link. Emails, em ambas (o de contacto).
const AUTO_LINK = /\bhttps?:\/\/[^\s<>"']+|[\w.+-]+@[\w-]+(?:\.[\w-]+)+/gi;

export function linkify(text, { urls = false, keyPrefix = 'l' } = {}) {
  const s = String(text || '');
  const out = [];
  let at = 0;
  for (const m of s.matchAll(AUTO_LINK)) {
    const web = /^https?:/i.test(m[0]);
    if (web && !urls) continue;
    // A pontuação do fim da frase não faz parte do endereço.
    const addr = web ? m[0].replace(/[.,;:!?)\]]+$/, '') : m[0];
    if (m.index > at) out.push(s.slice(at, m.index));
    out.push(
      <a
        key={`${keyPrefix}${m.index}`}
        href={web ? addr : `mailto:${addr}`}
        {...(web ? { target: '_blank', rel: 'noopener noreferrer nofollow' } : {})}
        className="break-all font-medium underline underline-offset-2"
      >
        {addr}
      </a>,
    );
    at = m.index + addr.length;
  }
  if (at < s.length) out.push(s.slice(at));
  return out;
}

export function formatText(text) {
  if (!text) return null;
  const s = String(text);
  const out = [];
  let at = 0;
  for (const m of s.matchAll(TOKEN)) {
    const [whole, bold, before, path] = m;
    const start = m.index + (path ? before.length : 0);
    if (start > at) out.push(...linkify(s.slice(at, start), { keyPrefix: `t${at}-` }));
    if (bold !== undefined) {
      out.push(<strong key={m.index}>{bold}</strong>);
    } else {
      out.push(
        <Link key={m.index} to={path} className="font-medium text-primary underline underline-offset-2">
          {PATH_LABELS[path]}
        </Link>,
      );
    }
    at = m.index + whole.length;
  }
  if (at < s.length) out.push(...linkify(s.slice(at), { keyPrefix: `t${at}-` }));
  return out;
}

const chip = 'inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors';

// Frases que o cartão da encomenda já mostra (são as de describeOrder no servidor): com o
// cartão, o texto fica só com a primeira frase e o que for extra ("Tem 3 encomendas…").
const CARD_SENTENCES = /^(Livros|Pagamento|Levantamento na loja|Código de rastreio|Previsão de entrega)\b/;
export function cardLead(text) {
  const parts = String(text || '').split(/\.\s+/).map((p, i, all) => (i < all.length - 1 ? `${p}.` : p));
  return parts.filter((p, i) => i === 0 || !CARD_SENTENCES.test(p.trim())).join(' ').trim();
}

/** Avatar do assistente (o logótipo), no início de cada bloco de mensagens dele. */
function BotAvatar({ visible }) {
  return (
    <span
      aria-hidden
      className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${visible ? 'bg-primary shadow-sm' : ''}`}
    >
      {visible && <img src="/logo-icon-light.svg" alt="" className="h-4 w-4 object-contain" />}
    </span>
  );
}

const Time = ({ time, align = 'left' }) => (time
  ? <p className={`px-1 text-[10px] text-muted-foreground ${align === 'right' ? 'text-right' : ''}`}>{time}</p>
  : null);

export default function ChatRichMessage({
  message, onSuggestionClick, showSuggestions = false, disabled = false, onFeedback,
  showAvatar = true, time = '', authed = false,
}) {
  if (message.role === 'user') {
    return (
      <div className="flex flex-col items-end gap-0.5">
        <div className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-sm text-primary-foreground shadow-sm ${message.pending ? 'opacity-70' : ''}`}>
          {message.text}
        </div>
        <Time time={message.pending ? 'A enviar…' : time} align="right" />
      </div>
    );
  }

  // Aviso do sistema (pedido aberto, encaminhamento): ao centro, discreto.
  if (message.role === 'system') {
    return (
      <p className="mx-auto max-w-[92%] rounded-xl bg-primary/5 px-3 py-2 text-center text-xs leading-relaxed text-muted-foreground">
        {message.text}
      </p>
    );
  }

  // Resposta de uma pessoa da equipa: com o nome, para o cliente saber que já não é o assistente.
  if (message.role === 'staff') {
    return (
      <div className="flex items-start gap-2">
        <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${showAvatar ? 'bg-emerald-600' : ''}`} aria-hidden>
          {showAvatar ? (message.author || 'E').slice(0, 1).toUpperCase() : ''}
        </span>
        <div className="min-w-0 max-w-[85%] space-y-0.5">
          {showAvatar && <p className="text-[11px] font-semibold text-emerald-700">{message.author || 'Equipa'} · Equipa</p>}
          <div className="whitespace-pre-line break-words rounded-2xl rounded-tl-md border border-emerald-600/25 bg-emerald-50 px-3.5 py-2.5 text-sm leading-relaxed text-foreground shadow-sm">
            {linkify(message.text, { urls: true })}
          </div>
          <Time time={time} />
        </div>
      </div>
    );
  }

  // Com o cartão da encomenda, a ligação ao rastreio ou às encomendas já está no rodapé dele.
  const links = (message.links || []).filter((l) => !(message.order_card && ['/track', '/profile'].includes(l.path)));
  const suggestions = showSuggestions ? message.suggestions || [] : [];
  const text = message.order_card ? cardLead(message.text) : message.text;

  return (
    <div className="flex items-start gap-2">
    <BotAvatar visible={showAvatar} />
    <div className="min-w-0 flex-1 space-y-2">
      {text && (
        <div className="max-w-[92%] whitespace-pre-line break-words rounded-2xl rounded-tl-md border border-border/70 bg-card px-3.5 py-2.5 text-sm leading-relaxed text-foreground shadow-sm">
          {formatText(text)}
        </div>
      )}

      {message.order_card && <OrderStatusCard card={message.order_card} authed={authed} />}

      {message.products?.length > 0 && (
        <ul className="space-y-1.5">
          {message.products.map((p) => (
            <li key={p.id}>
              <Link
                to={`/product/${p.id}`}
                className="group flex items-center gap-3 rounded-xl border border-border/70 bg-card p-2 pr-3 transition-colors hover:border-marca/50 hover:bg-marca/5"
              >
                {p.cover ? (
                  <img src={p.cover} alt="" loading="lazy" className="h-14 w-10 shrink-0 rounded object-cover bg-muted shadow-sm" />
                ) : (
                  <div className="flex h-14 w-10 shrink-0 items-center justify-center rounded bg-muted">
                    <BookOpen className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-foreground">{p.title}</p>
                  {p.author && <p className="line-clamp-1 text-xs text-muted-foreground">{p.author}</p>}
                  {p.price && (
                    <p className="mt-0.5 text-xs font-bold text-primary">
                      {p.price}
                      {p.stock === 0 && <span className="ml-1.5 font-medium text-muted-foreground">· esgotado</span>}
                    </p>
                  )}
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {links.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {links.map((link, i) => {
            const href = link.path || link.url;
            const label = link.label || href;
            // A cor viva da marca fica no fundo e na borda; o texto usa o token legível
            // (`primary` = cor da marca escurecida), que sobre branco passa o contraste da WCAG.
            const cls = `${chip} border-marca/20 bg-marca/10 text-primary hover:bg-marca/20`;
            return href?.startsWith('/') ? (
              <Link key={i} to={href} className={cls}>
                {label} <ChevronRight className="h-3 w-3" />
              </Link>
            ) : (
              <a key={i} href={href} target="_blank" rel="noreferrer" className={cls}>
                {label} <ExternalLink className="h-3 w-3" />
              </a>
            );
          })}
        </div>
      )}

      {/* Depois dos livros e das ligações: a resposta lê-se inteira antes de se avaliar. */}
      {onFeedback && typeof message.id === 'number' && (
        <div className="flex items-center gap-1 pl-1 text-muted-foreground">
          {message.feedback ? (
            <span className="text-[11px]">{message.feedback === 1 ? 'Obrigado pela avaliação.' : 'Obrigado. Vamos melhorar.'}</span>
          ) : (
            <>
              <span className="mr-1 text-[11px]">Ajudou?</span>
              <button type="button" onClick={() => onFeedback(message, 1)} aria-label="Sim, ajudou" className="rounded-full p-1 hover:bg-muted hover:text-foreground">
                <ThumbsUp className="h-3.5 w-3.5" />
              </button>
              <button type="button" onClick={() => onFeedback(message, -1)} aria-label="Não ajudou" className="rounded-full p-1 hover:bg-muted hover:text-foreground">
                <ThumbsDown className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              disabled={disabled}
              onClick={() => onSuggestionClick?.(s)}
              className={`${chip} border-border bg-background text-foreground hover:border-primary/40 hover:bg-primary/5 disabled:opacity-50`}
            >
              {s}
            </button>
          ))}
        </div>
      )}
      <Time time={time} />
    </div>
    </div>
  );
}

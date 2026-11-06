-- Páginas onde os botões flutuantes do site não aparecem: o assistente (chat) e o "Voltar ao
-- topo". Escolha do painel (Configurações → Assistente IA → Botões flutuantes).
--
-- Por omissão ficam escondidos na ficha do produto (tapavam os botões de compra e os avisos de
-- stock), na encomenda feita e no rastreio (tapavam o formulário de pagamento) e ao entrar.
-- As chaves são as de app/web/src/lib/floatingButtons.js e de
-- supabase/functions/app/floatingPages.ts: mudar uma obriga a mudar as outras.

alter table public.site_settings
  add column if not exists chat_hidden_on text[] not null default array['produto', 'encomenda', 'entrar']::text[],
  add column if not exists scroll_top_hidden_on text[] not null default array['produto', 'encomenda', 'entrar']::text[];

alter table public.site_settings drop constraint if exists site_settings_chat_hidden_on_check;
alter table public.site_settings add constraint site_settings_chat_hidden_on_check
  check (chat_hidden_on <@ array['inicio', 'loja', 'produto', 'encomenda', 'entrar', 'perfil', 'informacao', 'painel']::text[]);

alter table public.site_settings drop constraint if exists site_settings_scroll_top_hidden_on_check;
alter table public.site_settings add constraint site_settings_scroll_top_hidden_on_check
  check (scroll_top_hidden_on <@ array['inicio', 'loja', 'produto', 'encomenda', 'entrar', 'perfil', 'informacao', 'painel']::text[]);

comment on column public.site_settings.chat_hidden_on is
  'Páginas sem o botão do assistente (inicio, loja, produto, encomenda, entrar, perfil, informacao, painel).';
comment on column public.site_settings.scroll_top_hidden_on is
  'Páginas sem o botão "Voltar ao topo" (as mesmas chaves de chat_hidden_on).';

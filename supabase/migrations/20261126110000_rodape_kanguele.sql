-- O crédito do rodapé, «Desenvolvido pela Kanguele», liga ao site da Kanguele (o KanGest). O endereço fica nas
-- Configurações (painel → Configurações → Rodapé): se o domínio mudar, muda-se lá e o link dos dois rodapés acompanha,
-- sem mexer no código (app/web/src/lib/kanguele.js). Só https://, para o link nunca levar a outro lado.
alter table public.site_settings
  add column if not exists kangest_url text not null default 'https://kangest.livrariaadventista.com/';

alter table public.site_settings drop constraint if exists site_settings_kangest_url_check;
alter table public.site_settings add constraint site_settings_kangest_url_check
  check (kangest_url ~ '^https://[^\s"''<>]+$' and char_length(kangest_url) <= 200);

comment on column public.site_settings.kangest_url is
  'O site da Kanguele, no crédito «Desenvolvido pela Kanguele» do rodapé. Só https://; muda-se no painel (Configurações → Rodapé).';

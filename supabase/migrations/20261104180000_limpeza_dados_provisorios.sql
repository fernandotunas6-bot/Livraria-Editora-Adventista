-- Limpeza dos dados provisórios e repetidos que a auditoria encontrou (docs/AUDITORIA.md, 9.5).
--
-- 1. site_settings tinha três linhas. A função lê a mais antiga (created asc, id desc), e o
--    painel lê a mesma pela ordem por omissão do cliente de dados: as outras duas eram
--    restos quase vazios. Ficam só em cópia; um índice impede que voltem a aparecer.
-- 2. site_url ainda era o projecto antigo (https://livraria-adventista.pages.dev): os links
--    dos emails, incluindo o de cancelar a subscrição, iam para lá.
-- 3. Telefones provisórios (+244 923 000 000/001/002) no site e nas lojas: saem. O site já
--    esconde o telefone e o botão de WhatsApp quando estão vazios.
-- 4. Coordenadas trocadas: "Catumbela" apontava para Luanda e "Lubango" para Benguela.
--    Ficam em NULL (não 0: a localização trata 0 como um ponto real) até haver as certas;
--    o link "ver no mapa" passa a procurar pela morada escrita.
-- 5. Gralha "LIvraria" no nome da loja do Huambo.
-- 6. Três métodos "unitel_money" iguais e desligados: fica um, e o código passa a ser único.
--
-- Tudo o que muda ou sai fica antes em private.correcoes_dados (linha inteira em jsonb).
-- Reverter: ver o fim do ficheiro.

create table if not exists private.correcoes_dados (
  id bigint generated always as identity primary key,
  migracao text not null,
  tabela text not null,
  accao text not null check (accao in ('apagada', 'alterada')),
  linha jsonb not null,
  em timestamptz not null default now()
);
alter table private.correcoes_dados enable row level security;
revoke all on private.correcoes_dados from public, anon, authenticated;

-- 1. site_settings: só a linha que a função lê.
with activa as (
  select id from public.site_settings order by created asc, id desc limit 1
), sai as (
  delete from public.site_settings s
  where exists (select 1 from activa) and s.id <> (select id from activa)
  returning s.*
)
insert into private.correcoes_dados (migracao, tabela, accao, linha)
select '20261104180000', 'site_settings', 'apagada', to_jsonb(sai) from sai;

create unique index if not exists site_settings_uma_so_linha on public.site_settings ((true));

-- 2 e 3. Endereço do site e telefones provisórios das configurações.
insert into private.correcoes_dados (migracao, tabela, accao, linha)
select '20261104180000', 'site_settings', 'alterada',
       jsonb_build_object('id', id, 'site_url', site_url, 'contact_phone', contact_phone, 'whatsapp', whatsapp)
from public.site_settings
where site_url = 'https://livraria-adventista.pages.dev'
   or regexp_replace(coalesce(contact_phone, ''), '\D', '', 'g') in ('244923000000', '244923000001', '244923000002')
   or regexp_replace(coalesce(whatsapp, ''), '\D', '', 'g') in ('244923000000', '244923000001', '244923000002');

update public.site_settings
set site_url = case when site_url = 'https://livraria-adventista.pages.dev'
                    then 'https://livrariaadventista.com' else site_url end,
    contact_phone = case when regexp_replace(coalesce(contact_phone, ''), '\D', '', 'g')
                              in ('244923000000', '244923000001', '244923000002')
                         then '' else contact_phone end,
    whatsapp = case when regexp_replace(coalesce(whatsapp, ''), '\D', '', 'g')
                         in ('244923000000', '244923000001', '244923000002')
                    then '' else whatsapp end
where site_url = 'https://livraria-adventista.pages.dev'
   or regexp_replace(coalesce(contact_phone, ''), '\D', '', 'g') in ('244923000000', '244923000001', '244923000002')
   or regexp_replace(coalesce(whatsapp, ''), '\D', '', 'g') in ('244923000000', '244923000001', '244923000002');

-- 3, 4 e 5. Lojas: telefones provisórios, coordenadas da cidade errada e a gralha.
-- As coordenadas só saem se ainda forem as erradas (Luanda em Catumbela, Benguela no Lubango).
insert into private.correcoes_dados (migracao, tabela, accao, linha)
select '20261104180000', 'physical_stores', 'alterada', to_jsonb(s)
from public.physical_stores s
where regexp_replace(coalesce(phone, ''), '\D', '', 'g') in ('244923000000', '244923000001', '244923000002')
   or regexp_replace(coalesce(whatsapp, ''), '\D', '', 'g') in ('244923000000', '244923000001', '244923000002')
   or (name ilike '%Catumbela%' and latitude between -9.5 and -8.5)
   or (name ilike '%Lubango%' and latitude between -13 and -12)
   or name like 'LIvraria%';

update public.physical_stores
set phone = case when regexp_replace(coalesce(phone, ''), '\D', '', 'g')
                      in ('244923000000', '244923000001', '244923000002') then '' else phone end,
    whatsapp = case when regexp_replace(coalesce(whatsapp, ''), '\D', '', 'g')
                         in ('244923000000', '244923000001', '244923000002') then '' else whatsapp end,
    latitude = case when (name ilike '%Catumbela%' and latitude between -9.5 and -8.5)
                      or (name ilike '%Lubango%' and latitude between -13 and -12) then null else latitude end,
    longitude = case when (name ilike '%Catumbela%' and latitude between -9.5 and -8.5)
                       or (name ilike '%Lubango%' and latitude between -13 and -12) then null else longitude end,
    maps_url = case when (name ilike '%Catumbela%' and latitude between -9.5 and -8.5)
                      or (name ilike '%Lubango%' and latitude between -13 and -12) then '' else maps_url end,
    -- "LIvraria Adventista - Huambo" → "Livraria Adventista — Huambo", como as outras duas.
    name = case when name like 'LIvraria%' then 'Livraria' || replace(substr(name, 9), ' - ', ' — ') else name end
where regexp_replace(coalesce(phone, ''), '\D', '', 'g') in ('244923000000', '244923000001', '244923000002')
   or regexp_replace(coalesce(whatsapp, ''), '\D', '', 'g') in ('244923000000', '244923000001', '244923000002')
   or (name ilike '%Catumbela%' and latitude between -9.5 and -8.5)
   or (name ilike '%Lubango%' and latitude between -13 and -12)
   or name like 'LIvraria%';

-- 6. Métodos de pagamento com o mesmo código: fica o que está ligado, senão o primeiro.
with ordem as (
  select id, row_number() over (partition by code order by enabled desc, created asc, id asc) n
  from public.payment_methods
), sai as (
  delete from public.payment_methods p using ordem o
  where p.id = o.id and o.n > 1
  returning p.*
)
insert into private.correcoes_dados (migracao, tabela, accao, linha)
select '20261104180000', 'payment_methods', 'apagada', to_jsonb(sai) from sai;

create unique index if not exists payment_methods_code_key on public.payment_methods (code);

-- Reverter:
--   drop index public.site_settings_uma_so_linha; drop index public.payment_methods_code_key;
--   insert into public.site_settings select * from jsonb_populate_recordset(null::public.site_settings,
--     (select jsonb_agg(linha) from private.correcoes_dados where migracao = '20261104180000'
--      and tabela = 'site_settings' and accao = 'apagada'));
--   (o mesmo para payment_methods; as linhas 'alteradas' guardam os valores antigos para um update)

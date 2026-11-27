-- Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
-- © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

-- As promoções do KanGest no site (KANGEST ONE, integração total; docs/KANGEST-SINCRONIZACAO.md §20). A regra é a do
-- preço: o KanGest que manda no catálogo manda também nas promoções dos produtos ligados a ele. Mas uma promoção posta
-- no painel do site nunca é substituída, e o KanGest só retira as que ele próprio pôs.
--
-- A promoção do KanGest é uma percentagem entre duas datas (AAAA-MM-DD, as duas incluídas, na hora de Angola). No site
-- passa a preço promocional (`sale_price`), calculado sobre o PVP com IVA do KanGest, com o início às 00:00 do primeiro
-- dia e o fim às 00:00 do dia a seguir ao último. A auditoria dos preços (`stock_books_price_audit`) regista a mudança.

-- 1. De quem é a promoção de um produto: do KanGest (true) ou do painel (false, o que já existia).
alter table public.stock_books add column if not exists kangest_promocao boolean not null default false;
comment on column public.stock_books.kangest_promocao is
  'A promoção (sale_price e as datas) foi posta pelo KanGest que manda no catálogo (kangest_promocoes_do_posto). Uma alteração pelo painel passa-a para o painel.';

-- Uma alteração da promoção que não venha do KanGest (o painel, a API) passa a promoção para o painel: o KanGest deixa
-- de lhe tocar. O KanGest marca-se com a definição local kangest.promocao, só durante a sua alteração.
create or replace function private.stock_books_promocao_do_painel()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.sale_price, new.sale_starts_at, new.sale_ends_at) is distinct from (old.sale_price, old.sale_starts_at, old.sale_ends_at)
     and coalesce(current_setting('kangest.promocao', true), '') <> 'on' then
    new.kangest_promocao := false;
  end if;
  return new;
end;
$$;
revoke execute on function private.stock_books_promocao_do_painel() from public, anon, authenticated;

drop trigger if exists stock_books_promocao_do_painel on public.stock_books;
create trigger stock_books_promocao_do_painel
  before update of sale_price, sale_starts_at, sale_ends_at on public.stock_books
  for each row execute function private.stock_books_promocao_do_painel();

-- 2. As promoções que o posto manda (a Edge Function já as limpou em kangestSinc.ts, `limparPromocoesKanGest`):
--    {"artigo_id": 7, "referencia": "LIV-001", "desconto": 10, "inicio": "2026-12-01", "fim": "2026-12-24",
--     "preco1_iva": 570000}
--    `desconto` 0 (ou a promoção já acabada) retira a promoção que o KanGest tenha posto.
-- A resposta, por artigo: feita, retirada, sem_produto, tem_promocao (o painel tem uma, que fica), recusada ou erro.
create or replace function public.kangest_promocoes_do_posto(p_posto uuid, p_itens jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_posto record;
  i jsonb;
  b record;
  v_ref text;
  v_desc numeric;
  v_ini date;
  v_fim date;
  v_pvp numeric;
  v_preco numeric;
  v_hoje date := (now() at time zone 'Africa/Luanda')::date;
  v_estado text;
  v_erro text;
  v_out jsonb := '[]'::jsonb;
begin
  select id, estado, manda_catalogo into v_posto from public.kangest_postos where id = p_posto;
  if v_posto.id is null or v_posto.estado <> 'activo' then
    raise exception 'Posto desconhecido ou revogado.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_itens) is distinct from 'array' then
    raise exception 'As promoções têm de ser uma lista.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_itens) > 50 then
    raise exception 'No máximo 50 promoções por volta.' using errcode = '22023';
  end if;

  for i in select value from jsonb_array_elements(p_itens) loop
    v_erro := null;
    begin
      if not v_posto.manda_catalogo then
        v_estado := 'recusada';
        v_erro := 'Este KanGest não manda no catálogo do site (painel → Configurações → KanGest → Postos).';
      else
        v_ref := btrim(coalesce(i ->> 'referencia', ''));
        select s.id, s.price, s.sale_price, s.sale_ends_at, s.kangest_promocao into b
          from public.stock_books s where v_ref <> '' and s.kigest_ref = v_ref limit 1 for update;
        if b.id is null then
          v_estado := 'sem_produto';
        else
          v_desc := case when coalesce(i ->> 'desconto', '') ~ '^[0-9]{1,3}(\.[0-9]{1,4})?$' then (i ->> 'desconto')::numeric else 0 end;
          v_ini := case when coalesce(i ->> 'inicio', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then (i ->> 'inicio')::date end;
          v_fim := case when coalesce(i ->> 'fim', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then (i ->> 'fim')::date end;
          v_pvp := case when coalesce(i ->> 'preco1_iva', '') ~ '^[0-9]{1,12}$' then (i ->> 'preco1_iva')::numeric / 100 end;

          if v_desc > 0 and v_desc < 100 and (v_fim is null or v_fim >= v_hoje) then
            if b.sale_price is not null and not b.kangest_promocao and (b.sale_ends_at is null or b.sale_ends_at > now()) then
              v_estado := 'tem_promocao';
              v_erro := 'O produto já tem uma promoção do painel do site; a do KanGest não a substitui.';
            elsif v_ini is not null and v_fim is not null and v_fim < v_ini then
              v_estado := 'recusada';
              v_erro := 'A promoção acaba antes de começar.';
            else
              v_preco := round(coalesce(nullif(v_pvp, 0), b.price::numeric) * (1 - v_desc / 100), 2);
              if v_preco <= 0 or v_preco >= coalesce(b.price, 0) then
                v_estado := 'recusada';
                v_erro := 'O preço da promoção não fica abaixo do preço do site.';
              else
                perform set_config('kangest.promocao', 'on', true);
                update public.stock_books s set
                  sale_price = v_preco,
                  sale_starts_at = case when v_ini is null then null else v_ini::timestamp at time zone 'Africa/Luanda' end,
                  sale_ends_at = case when v_fim is null then null else (v_fim + 1)::timestamp at time zone 'Africa/Luanda' end,
                  kangest_promocao = true
                 where s.id = b.id;
                perform set_config('kangest.promocao', 'off', true);
                v_estado := 'feita';
              end if;
            end if;
          elsif b.kangest_promocao then
            -- sem promoção no KanGest (ou já acabada): sai a que ele pôs
            perform set_config('kangest.promocao', 'on', true);
            update public.stock_books s set sale_price = null, sale_starts_at = null, sale_ends_at = null, kangest_promocao = false
             where s.id = b.id;
            perform set_config('kangest.promocao', 'off', true);
            v_estado := 'retirada';
          else
            v_estado := 'feita';
          end if;
        end if;
      end if;
    exception when others then
      perform set_config('kangest.promocao', 'off', true);
      v_estado := 'erro';
      v_erro := left(sqlerrm, 300);
    end;
    v_out := v_out || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'artigo_id', i -> 'artigo_id', 'estado', v_estado, 'erro', v_erro)));
  end loop;
  return v_out;
end;
$$;
revoke all on function public.kangest_promocoes_do_posto(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.kangest_promocoes_do_posto(uuid, jsonb) to service_role;

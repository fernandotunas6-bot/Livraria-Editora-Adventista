-- Relatórios de vendas: uma gravação já não apaga outra, e a origem dos números importados fica certa
-- (análise crítica de 2026-11-14).
--
-- 1. public.vendas_anos_gravar(ano, linhas) — a gravação dos dois ecrãs (Vendas por loja e Todas as
--    livrarias), com bloqueio optimista. Até aqui os dois faziam `upsert` dos 12 meses: se duas
--    pessoas abrissem a mesma loja e o mesmo ano, a segunda a gravar repunha por cima os meses que
--    a primeira tinha acabado de mudar, sem aviso. Agora cada linha leva o `actualizado` que o ecrã
--    leu ao abrir (`esperado`; nulo = o ano ainda não existe) e só é gravada se ninguém a tiver
--    mudado entretanto; senão a gravação inteira é recusada (40001) e o ecrã pede para recarregar.
--    Todas as linhas de um pedido gravam juntas ou nenhuma grava.
--    Só os campos que a linha traz mudam (`meses`, `observacoes`, `mes_em_curso`, `meta_anual`,
--    `criterio`, `fonte`, `origem`): a grelha das livrarias só manda os meses e o mês em curso.
--    É SECURITY INVOKER: quem grava continua a ser decidido pelas regras da tabela
--    (private.can_edit_reports, migração relatorios_de_todas_as_livrarias). O gatilho
--    vendas_anos_historico continua a escrever o histórico de cada linha.
--
-- 2. A origem das linhas importadas. As vendas do Huambo, do Lubango e de Catumbela entraram por
--    migrações (20261101143448_painel_vendas e 20261114100000_vendas_das_lojas_ate_outubro), a
--    partir do Relatório Síntese, do PowerPoint e dos Excel das lojas, antes de a coluna `origem`
--    existir: ficaram todas «manual», sem autor. Passam a «importacao» as que ainda têm a fonte
--    dessas importações, nunca foram gravadas por ninguém com sessão (`actualizado_por` nulo) e têm
--    algum mês com valor. Sem mexer no `actualizado` (o gatilho vendas_anos_before_save fica
--    desligado durante o update) nem no histórico (a origem não é um campo que ele registe).
--
-- Reverter: drop function public.vendas_anos_gravar(integer, jsonb); os ecrãs voltam ao upsert
-- sozinhos (o adaptador recua quando a função não existe). A origem: update … set origem = 'manual'
-- where origem = 'importacao' and actualizado_por is null.

-- ---------------------------------------------------------------------------------------------
-- 1. Gravar com bloqueio optimista
-- ---------------------------------------------------------------------------------------------
create or replace function public.vendas_anos_gravar(p_ano integer, p_linhas jsonb)
returns table (loja_id text, actualizado timestamptz)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  l jsonb;
  v_loja text;
  v_esperado timestamptz;
  v_n integer;
  v_nome text;
  v_lojas text[] := '{}';
begin
  if not private.can_edit_reports() then
    raise exception 'Sem permissão para gravar os relatórios de vendas.' using errcode = '42501';
  end if;
  if p_ano is null or p_ano < 2000 or p_ano > 2100 then
    raise exception 'Ano inválido.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_linhas) is distinct from 'array' or jsonb_array_length(p_linhas) not between 1 and 50 then
    raise exception 'Linhas inválidas.' using errcode = '22023';
  end if;

  for l in select e from jsonb_array_elements(p_linhas) as t(e) loop
    v_loja := nullif(btrim(coalesce(l ->> 'loja_id', '')), '');
    if v_loja is null or jsonb_typeof(l) <> 'object' then
      raise exception 'Cada linha precisa da loja.' using errcode = '22023';
    end if;
    if v_loja = any (v_lojas) then
      raise exception 'A mesma loja aparece duas vezes no pedido.' using errcode = '22023';
    end if;
    v_lojas := v_lojas || v_loja;
    select s.name into v_nome from public.physical_stores s where s.id = v_loja;
    v_esperado := nullif(l ->> 'esperado', '')::timestamptz;

    if v_esperado is null then
      -- O ecrã não viu este ano: cria-o. Se entretanto alguém o criou, é um conflito.
      begin
        insert into public.vendas_anos (loja_id, ano, meses, observacoes, mes_em_curso, meta_anual, criterio, fonte, origem)
        values (
          v_loja, p_ano,
          coalesce(l -> 'meses', '[null,null,null,null,null,null,null,null,null,null,null,null]'::jsonb),
          coalesce(l -> 'observacoes', '["","","","","","","","","","","",""]'::jsonb),
          (l ->> 'mes_em_curso')::smallint,
          (l ->> 'meta_anual')::numeric,
          coalesce(l ->> 'criterio', 'media'),
          coalesce(l ->> 'fonte', ''),
          coalesce(l ->> 'origem', 'manual')
        );
      exception when unique_violation then
        raise exception 'Alguém criou % de % depois de o abrir. Recarregue para ver os números novos.', coalesce(v_nome, 'esta loja'), p_ano
          using errcode = '40001';
      end;
    else
      update public.vendas_anos v set
        meses        = case when l ? 'meses' then l -> 'meses' else v.meses end,
        observacoes  = case when l ? 'observacoes' then l -> 'observacoes' else v.observacoes end,
        mes_em_curso = case when l ? 'mes_em_curso' then (l ->> 'mes_em_curso')::smallint else v.mes_em_curso end,
        meta_anual   = case when l ? 'meta_anual' then (l ->> 'meta_anual')::numeric else v.meta_anual end,
        criterio     = case when l ? 'criterio' then coalesce(l ->> 'criterio', 'media') else v.criterio end,
        fonte        = case when l ? 'fonte' then coalesce(l ->> 'fonte', '') else v.fonte end,
        origem       = case when l ? 'origem' then coalesce(l ->> 'origem', 'manual') else v.origem end
      where v.loja_id = v_loja and v.ano = p_ano and v.actualizado = v_esperado;
      get diagnostics v_n = row_count;
      if v_n = 0 then
        raise exception 'Os números de % de % mudaram depois de os abrir (outra pessoa gravou, ou o ano foi apagado). Recarregue: as suas alterações não foram gravadas.', coalesce(v_nome, 'esta loja'), p_ano
          using errcode = '40001';
      end if;
    end if;
  end loop;

  return query
    select v.loja_id, v.actualizado from public.vendas_anos v
    where v.ano = p_ano and v.loja_id = any (v_lojas);
end;
$$;
comment on function public.vendas_anos_gravar(integer, jsonb) is
  'Grava os meses (e o resto do ano) de uma ou mais lojas, com bloqueio optimista pelo actualizado lido ao abrir. Erro 40001 quando alguém gravou entretanto.';
revoke all on function public.vendas_anos_gravar(integer, jsonb) from public, anon;
grant execute on function public.vendas_anos_gravar(integer, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- 2. A origem das linhas importadas por migração
-- ---------------------------------------------------------------------------------------------
alter table public.vendas_anos disable trigger vendas_anos_before_save;
update public.vendas_anos v
set origem = 'importacao'
where v.origem = 'manual'
  and v.actualizado_por is null
  and (v.fonte = 'Relatório Síntese 2025/26' or v.fonte like 'Painel de Vendas da Loja %')
  and exists (select 1 from jsonb_array_elements(v.meses) e where jsonb_typeof(e) = 'number');
alter table public.vendas_anos enable trigger vendas_anos_before_save;

-- Vendas das três lojas até Outubro de 2026, tal como vêm nos relatórios que as lojas mandaram.
--
--   Huambo     PowerPoint «Loja Huambo - Painel-Vendas 2026S», quadro geral: Janeiro a Outubro de
--              2025 e de 2026.
--   Lubango    Excel «LOJA DO LUBANGO»: 2025 inteiro e 2026 até Outubro.
--   Catumbela  Excel «LOJA DE CATUMBELA»: 2026 até Outubro (a coluna de 2025 vem em branco).
--
-- Entram no painel Relatórios › Vendas por loja (public.vendas_anos), cada mês na sua loja e no seu
-- ano, como se a administração os tivesse escrito à mão. Os totais conferem com os dos relatórios:
-- Huambo 9 946 309 Kz (2025, Jan–Out) e 37 679 153 Kz (2026); Lubango 7 329 494 Kz e 5 226 742 Kz;
-- Catumbela 4 692 545 Kz.
--
-- No Huambo só muda Outubro de 2026: o painel tinha o valor parcial do Relatório Síntese
-- (1 332 925 Kz) e o PowerPoint traz o do mês fechado (4 908 704 Kz). Os outros meses já tinham estes
-- valores (20261101143448_painel_vendas). O Lubango e Catumbela ganham aqui os seus anos; um ano que a
-- administração lhes tenha entretanto criado no painel recebe só os meses, pelas regras de baixo.
--
-- O que fica como está:
--   - um mês em branco no relatório: Novembro e Dezembro de 2025 do Huambo, que o PowerPoint não
--     mostra, continuam no painel;
--   - um valor que, arredondado ao kwanza, já é o do relatório. O PowerPoint arredonda: Junho de 2025
--     do Huambo (551 909,65 Kz) aparece lá como 551 910 Kz, e reescrevê-lo perdia os cêntimos;
--   - as observações, o mês em curso, a meta, o critério e a fonte de um ano que já existia. A única
--     excepção é a observação de Outubro de 2026 do Huambo, que pedia para confirmar o valor final:
--     passa a dizer de onde ele veio, e só se ainda for o texto que a primeira migração lá pôs.
--
-- Zeros que não são vendas: Novembro e Dezembro de 2026 vêm a 0 no Excel do Lubango porque ainda não
-- aconteceram. Ficam vazios, como os do Huambo — a 0, o painel contava-os como meses fechados sem
-- vendas e a projecção do ano caía para 5 226 742 Kz; vazios, dá 6 272 090 Kz, a «Previsão» do próprio
-- Excel. Já Janeiro e Fevereiro de 2026 de Catumbela ficam a 0: são meses passados (a média do Excel
-- começa em Março), e vazios o painel punha-lhes uma estimativa de vendas.
--
-- As lojas encontram-se como nas migrações das fotografias (20261113143000, 20261113163000): pelo
-- nome ou pela província sem acentos, com a que tem o nome da cidade à frente. Uma loja que não
-- exista fica de fora: esta migração não cria lojas. Correr duas vezes não muda nada.
--
-- Reverter: Outubro de 2026 do Huambo volta a 1332925, com a observação antiga; os anos do Lubango e
-- de Catumbela apagam-se no painel (Administração → Apagar ano).

do $$
declare
  r record;
  v_loja text;
  v_meses jsonb;
  v_mudou boolean;
  i integer;
begin
  for r in
    select * from (values
      ('%Huambo%', 'huambo', 2025,
       '[218675, 189500, 743550, 1053650, 1018225, 551910, 211650, 2904902, 430902, 2623345, null, null]'::jsonb,
       'Painel de Vendas da Loja do Huambo (PowerPoint)'),
      ('%Huambo%', 'huambo', 2026,
       '[2171368, 1976988, 4956455, 3624705, 2917373, 2472331, 4779202, 3232271, 6639756, 4908704, null, null]'::jsonb,
       'Painel de Vendas da Loja do Huambo (PowerPoint)'),
      ('%Lubango%', 'huila', 2025,
       '[522850, 118050, 882750, 482975, 1030825, 453760, 244514, 52650, 827125, 974128, 106750, 1633117]'::jsonb,
       'Painel de Vendas da Loja do Lubango (Excel)'),
      ('%Lubango%', 'huila', 2026,
       '[361593, 158750, 269612, 379850, 708435, 319145, 1099129, 187333, 389550, 1353345, null, null]'::jsonb,
       'Painel de Vendas da Loja do Lubango (Excel)'),
      ('%Catumbela%', 'benguela', 2026,
       '[0, 0, 383770, 601925, 526320, 565050, 577190, 292890, 814484, 930916, null, null]'::jsonb,
       'Painel de Vendas da Loja de Catumbela (Excel)')
    ) as t (nome, provincia, ano, meses, fonte)
  loop
    -- No Huambo, a loja que já tem as vendas (a mesma que a 20261101205332 escolheu).
    select s.id into v_loja
    from public.physical_stores s
    where s.name ilike r.nome or private.plain_text(s.province) = r.provincia
    order by (s.name ilike r.nome) desc,
             exists (select 1 from public.vendas_anos v where v.loja_id = s.id) desc,
             s.active desc,
             s.created
    limit 1;
    continue when v_loja is null;

    select v.meses into v_meses
    from public.vendas_anos v
    where v.loja_id = v_loja and v.ano = r.ano
    for update;

    if not found then
      insert into public.vendas_anos (loja_id, ano, meses, fonte, actualizado_por)
      values (v_loja, r.ano, r.meses, r.fonte, null);
      continue;
    end if;

    v_mudou := false;
    for i in 0..11 loop
      if jsonb_typeof(r.meses -> i) = 'number'
         and (jsonb_typeof(v_meses -> i) is distinct from 'number'
              or round((v_meses ->> i)::numeric) <> (r.meses ->> i)::numeric) then
        v_meses := jsonb_set(v_meses, array[i::text], r.meses -> i);
        v_mudou := true;
      end if;
    end loop;

    if v_mudou then
      update public.vendas_anos
      set meses = v_meses, actualizado = now(), actualizado_por = null
      where loja_id = v_loja and ano = r.ano;
    end if;
  end loop;
end $$;

update public.vendas_anos
set observacoes = jsonb_set(observacoes, '{9}',
      to_jsonb('Valor final, do PowerPoint «Loja Huambo - Painel-Vendas 2026S».'::text))
where ano = 2026
  and observacoes ->> 9 = 'Valor do relatório (parcial). Confirmar o valor final de Outubro.'
  and meses ->> 9 = '4908704';

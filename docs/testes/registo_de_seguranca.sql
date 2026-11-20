-- Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
-- © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

-- Verificação do registo de segurança (migrações `20261107130000_registo_de_seguranca` e
-- `20261107131000_imagens_sem_listagem_publica`).
--
-- Corre no SQL Editor do Supabase (ou num Postgres local com as migrações), depois de as
-- aplicar. NÃO GRAVA NADA: cria contas de teste, mexe nos dados e termina com
-- `raise exception 'RESULTADO …'`, que anula a transacção inteira — contas, avisos, linhas
-- do registo e alterações desaparecem.
--
-- Esperado: todas as linhas "ok". Uma linha "FALHA" diz o que não se comportou como devia.
do $teste$
declare
  v_admin uuid := gen_random_uuid();
  v_admin2 uuid := gen_random_uuid();
  v_cliente uuid := gen_random_uuid();
  v_pm text;
  v_order text;
  v_book text;
  v_n int;
  v_row record;
  r text := '';
  v_alerts int;

  -- Sessão PostgREST simulada: o papel e as claims que o PostgREST poria.
  sessao_admin text := json_build_object('sub', v_admin, 'role', 'authenticated', 'aal', 'aal1')::text;
  sessao_cliente text := json_build_object('sub', v_cliente, 'role', 'authenticated', 'aal', 'aal1')::text;
  sessao_servidor text := json_build_object('role', 'service_role')::text;
begin
  -- Preparação (sem sessão): duas contas de administrador e um cliente.
  insert into auth.users (id, email, aud, role, email_confirmed_at, instance_id)
  values (v_admin, 'teste-admin-' || left(v_admin::text, 8) || '@exemplo.invalid', 'authenticated', 'authenticated', now(), '00000000-0000-0000-0000-000000000000'),
         (v_admin2, 'teste-admin2-' || left(v_admin2::text, 8) || '@exemplo.invalid', 'authenticated', 'authenticated', now(), '00000000-0000-0000-0000-000000000000'),
         (v_cliente, 'teste-cliente-' || left(v_cliente::text, 8) || '@exemplo.invalid', 'authenticated', 'authenticated', now(), '00000000-0000-0000-0000-000000000000');
  update public.profiles set role = 'admin' where id in (v_admin, v_admin2);
  -- Promover as duas contas já ficou registado (sem sessão: "sql").
  select count(*) into v_n from public.security_audit_log
   where table_name = 'profiles' and row_id in (v_admin::text, v_admin2::text) and actor_kind = 'sql';
  r := r || format(E'\n01 promoção a admin registada (sql): %s', case when v_n = 2 then 'ok' else 'FALHA (' || v_n || ')' end);

  select id into v_pm from public.payment_methods order by created limit 1;
  if v_pm is null then
    insert into public.payment_methods (id, name, code, type, enabled, account_info)
    values ('teste-pm', 'Transferência (teste)', 'teste_transfer', 'manual', true, 'IBAN AO06 0000 0000 0000 0000 0000 0')
    returning id into v_pm;
  end if;

  -- (02) Um admin com sessão troca o IBAN: registo com quem, antes/depois, e aviso aos dois admins.
  perform set_config('request.jwt.claims', sessao_admin, true);
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  execute 'set local role authenticated';
  update public.payment_methods set account_info = 'IBAN AO06 9999 9999 9999 9999 9999 9' where id = v_pm;
  execute 'reset role';
  select * into v_row from public.security_audit_log
   where table_name = 'payment_methods' and row_id = v_pm order by id desc limit 1;
  -- O aviso pode ter saído já na criação do método de teste (um aviso por linha a cada 10 min).
  r := r || format(E'\n02 troca de IBAN registada com o autor: %s',
    case when v_row.actor_id = v_admin and v_row.actor_kind = 'conta'
              and v_row.changes ? 'account_info'
              and v_row.changes -> 'account_info' ->> 'para' like '%9999%'
              and exists (select 1 from public.security_audit_log l where l.alerted and l.table_name = 'payment_methods'
                          and l.row_id = v_pm and l.at > now() - interval '10 minutes')
         then 'ok' else 'FALHA ' || coalesce(row_to_json(v_row)::text, 'sem linha') end);
  select count(*) into v_n from public.staff_notifications
   where kind = 'security' and severity = 'critical' and staff_id in (v_admin, v_admin2)
     and created_at >= now() - interval '1 minute';
  r := r || format(E'\n03 aviso crítico aos dois admins (incluindo quem mudou): %s', case when v_n >= 2 then 'ok' else 'FALHA (' || v_n || ')' end);
  v_alerts := v_n;

  -- (04) Segunda troca logo a seguir: fica registada, mas sem segundo aviso.
  execute 'set local role authenticated';
  update public.payment_methods set account_info = 'IBAN AO06 8888 8888 8888 8888 8888 8' where id = v_pm;
  execute 'reset role';
  select count(*) into v_n from public.staff_notifications
   where kind = 'security' and staff_id in (v_admin, v_admin2) and created_at >= now() - interval '1 minute';
  select * into v_row from public.security_audit_log where table_name = 'payment_methods' and row_id = v_pm order by id desc limit 1;
  r := r || format(E'\n04 segunda troca registada sem aviso repetido: %s',
    case when v_n = v_alerts and not v_row.alerted and v_row.changes -> 'account_info' ->> 'para' like '%8888%' then 'ok' else 'FALHA (' || v_n || ' avisos)' end);

  -- (05) O admin lê o registo; o cliente não vê nada; o anónimo nem tem acesso.
  execute 'set local role authenticated';
  select count(*) into v_n from public.security_audit_log;
  execute 'reset role';
  r := r || format(E'\n05 admin lê o registo: %s', case when v_n >= 3 then 'ok' else 'FALHA (' || v_n || ')' end);

  perform set_config('request.jwt.claims', sessao_cliente, true);
  perform set_config('request.jwt.claim.sub', v_cliente::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.security_audit_log;
  execute 'reset role';
  r := r || format(E'\n06 cliente não lê o registo: %s', case when v_n = 0 then 'ok' else 'FALHA (' || v_n || ' linhas)' end);

  begin
    execute 'set local role anon';
    perform 1 from public.security_audit_log limit 1;
    execute 'reset role';
    r := r || E'\n07 anónimo sem acesso ao registo: FALHA (leu)';
  exception when insufficient_privilege then
    execute 'reset role';
    r := r || E'\n07 anónimo sem acesso ao registo: ok';
  end;

  -- (08) O cliente não escreve no registo nem apaga provas.
  execute 'set local role authenticated';
  begin
    insert into public.security_audit_log (actor_kind, table_name, action, summary) values ('conta', 'x', 'update', 'forjado');
    r := r || E'\n08 cliente não escreve no registo: FALHA (escreveu)';
  exception when insufficient_privilege then
    r := r || E'\n08 cliente não escreve no registo: ok';
  end;
  execute 'reset role';

  -- (09) Nem a service role (nem o dono da tabela) altera, apaga ou esvazia o registo.
  begin
    update public.security_audit_log set summary = 'apagado' where table_name = 'payment_methods';
    r := r || E'\n09 registo não se altera: FALHA (alterou)';
  exception when insufficient_privilege then
    r := r || E'\n09 registo não se altera: ok';
  end;
  begin
    delete from public.security_audit_log where table_name = 'payment_methods';
    r := r || E'\n10 registo não se apaga: FALHA (apagou)';
  exception when insufficient_privilege then
    r := r || E'\n10 registo não se apaga: ok';
  end;
  begin
    truncate public.security_audit_log;
    r := r || E'\n11 registo não se esvazia: FALHA (esvaziou)';
  exception when insufficient_privilege then
    r := r || E'\n11 registo não se esvazia: ok';
  end;

  -- (12) Pedido da Edge Function (service role) em nome de um admin: o cabeçalho diz quem.
  select id into v_order from public.orders order by created desc limit 1;
  if v_order is not null then
    perform set_config('request.jwt.claims', sessao_servidor, true);
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('request.headers', json_build_object('x-actor-id', v_admin2)::text, true);
    execute 'set local role service_role';
    update public.orders set payment_status = case when payment_status = 'paid' then 'pending' else 'paid' end where id = v_order;
    execute 'reset role';
    select * into v_row from public.security_audit_log where table_name = 'orders' and row_id = v_order order by id desc limit 1;
    r := r || format(E'\n12 pagamento marcado pela API fica com o autor: %s',
      case when v_row.actor_id = v_admin2 and v_row.actor_kind = 'servidor' and v_row.changes ? 'payment_status' then 'ok'
           else 'FALHA ' || coalesce(row_to_json(v_row)::text, 'sem linha') end);
  else
    r := r || E'\n12 pagamento marcado pela API: (sem encomendas para testar)';
  end if;

  -- (13) Um cliente que manda o cabeçalho para se fazer passar por admin: conta o JWT dele.
  perform set_config('request.jwt.claims', sessao_cliente, true);
  perform set_config('request.jwt.claim.sub', v_cliente::text, true);
  perform set_config('request.headers', json_build_object('x-actor-id', v_admin)::text, true);
  select a.actor_id into v_row from private.audit_actor() a;
  r := r || format(E'\n13 cabeçalho forjado por um cliente é ignorado: %s', case when v_row.actor_id = v_cliente then 'ok' else 'FALHA' end);
  perform set_config('request.headers', '', true);

  -- (14) Configurações: contacto avisa; texto da loja só regista; segredos mascarados.
  if not exists (select 1 from public.site_settings) then
    perform set_config('request.jwt.claims', '', true);
    perform set_config('request.jwt.claim.sub', '', true);
    insert into public.site_settings (id, site_name) values ('teste-cfg', 'Teste');
  end if;
  perform set_config('request.jwt.claims', sessao_admin, true);
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  execute 'set local role authenticated';
  update public.site_settings set whatsapp = '+244 900 000 001', shop_hero_title = 'Teste do registo';
  execute 'reset role';
  select * into v_row from public.security_audit_log where table_name = 'site_settings' order by id desc limit 1;
  r := r || format(E'\n14 WhatsApp da loja mudado: registo e aviso: %s',
    case when v_row.changes ? 'whatsapp' and v_row.changes ? 'shop_hero_title' and v_row.actor_id = v_admin
              and exists (select 1 from public.security_audit_log l where l.alerted and l.table_name = 'site_settings'
                          and l.row_id = v_row.row_id and l.at > now() - interval '10 minutes') then 'ok'
         else 'FALHA ' || coalesce(row_to_json(v_row)::text, 'sem linha') end);
  select private.audit_diff('{"brevo_api_key": ""}'::jsonb, '{"brevo_api_key": "xkeysib-segredo"}'::jsonb, null, '{}', array['brevo_api_key'])::text into v_row;
  r := r || format(E'\n15 chave secreta nunca aparece no registo: %s', case when v_row::text not like '%segredo%' then 'ok' else 'FALHA' end);

  -- (16) Permissões: o cliente promovido a gestor avisa os admins.
  update public.profiles set role = 'manager', permissions = '{"manage_orders": true}'::jsonb where id = v_cliente;
  select * into v_row from public.security_audit_log where table_name = 'profiles' and row_id = v_cliente::text order by id desc limit 1;
  r := r || format(E'\n16 promoção a gestor registada com aviso: %s',
    case when v_row.alerted and v_row.changes ? 'role' then 'ok' else 'FALHA ' || coalesce(row_to_json(v_row)::text, 'sem linha') end);

  -- (17) Segredo definido: só o nome da chave.
  insert into private.site_secrets (key, value) values ('deepseek_api_key', 'valor-que-nao-pode-aparecer')
  on conflict (key) do update set value = excluded.value;
  select * into v_row from public.security_audit_log where table_name = 'site_secrets' and row_id = 'deepseek_api_key' order by id desc limit 1;
  r := r || format(E'\n17 segredo registado sem o valor: %s',
    case when v_row.id is not null and row_to_json(v_row)::text not like '%valor-que-nao%' then 'ok' else 'FALHA' end);

  -- (18) Preço de um livro: registado, sem aviso.
  select id into v_book from public.stock_books order by id limit 1;
  if v_book is not null then
    update public.stock_books set price = coalesce(price, 0) + 1 where id = v_book;
    select * into v_row from public.security_audit_log where table_name = 'stock_books' and row_id = v_book order by id desc limit 1;
    r := r || format(E'\n18 preço alterado fica registado: %s', case when v_row.changes ? 'price' and not v_row.alerted then 'ok' else 'FALHA' end);
  else
    r := r || E'\n18 preço alterado: (sem livros para testar)';
  end if;

  -- (19) A entrada da Edge Function só aceita a service role.
  perform set_config('request.jwt.claims', sessao_admin, true);
  execute 'set local role authenticated';
  begin
    perform public.security_audit_record('profiles', v_cliente::text, 'update', 'forjado', '{}'::jsonb, true);
    r := r || E'\n19 admin pela API não chama security_audit_record: FALHA (chamou)';
  exception when insufficient_privilege then
    r := r || E'\n19 admin pela API não chama security_audit_record: ok';
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', sessao_servidor, true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.headers', json_build_object('x-actor-id', v_admin)::text, true);
  execute 'set local role service_role';
  perform public.security_audit_record('profiles', v_cliente::text, 'update', 'Link de acesso gerado para teste', '{}'::jsonb, false);
  execute 'reset role';
  select * into v_row from public.security_audit_log where summary = 'Link de acesso gerado para teste' order by id desc limit 1;
  r := r || format(E'\n20 Edge Function regista acção com o autor: %s', case when v_row.actor_id = v_admin and v_row.actor_kind = 'servidor' then 'ok' else 'FALHA' end);

  -- (21) Storage: o anónimo deixou de listar o bucket público.
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.headers', '', true);
  execute 'set local role anon';
  select count(*) into v_n from storage.objects where bucket_id = 'media';
  execute 'reset role';
  r := r || format(E'\n21 anónimo não lista o bucket media: %s', case when v_n = 0 then 'ok' else 'FALHA (' || v_n || ')' end);

  raise exception 'RESULTADO (nada foi gravado)%', r;
end
$teste$;

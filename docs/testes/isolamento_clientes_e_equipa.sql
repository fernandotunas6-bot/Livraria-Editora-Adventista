-- Isolamento entre clientes, e as regras das migrações de 2026-11-04 (MFA, segredos,
-- conversas seguras, idempotência do checkout).
--
-- Corre no SQL Editor do Supabase de um PROJECTO DE TESTES com as migrações aplicadas
-- (precisa de pelo menos dois utilizadores em auth.users). Também é seguro em produção:
-- NÃO GRAVA NADA. Tudo corre numa transacção que termina com `raise exception 'RESULTADO …'`,
-- e é isso que a anula. Os dois primeiros utilizadores passam a "cliente" só dentro dela.
--
-- Esperado (o que estiver diferente é uma falha):
--   01 0 · 02 0 · 03 negado · 04 0 · 05 0 · 06 member · 07 negado · 08 0 · 09 0 · 10 negado
--   11 negado · 12 recusado · 13 ok · 14 negado · 15 falso · 16 verdadeiro · 17 negado
--   18 ok · 19 negado · 20 vazio · 21 23505
do $teste$
declare
  a uuid; b uuid; email_b text; enc_b text; conversa_b uuid; segura_b uuid;
  r text := ''; n int; v text; ok boolean;
begin
  select id into a from auth.users order by created_at limit 1;
  select id, email into b, email_b from auth.users where id <> a order by created_at limit 1;
  if a is null or b is null then raise exception 'RESULTADO faltam dois utilizadores em auth.users'; end if;

  -- Preparação (como dono da base de dados): A e B como clientes, dados de B.
  update public.profiles set role = 'member', permissions = null where id in (a, b);
  insert into public.orders (customer_id, customer_email, order_number, items, total, status)
    values (b, email_b, 'TESTE-ISOLAMENTO', '[]'::jsonb, 1, 'pending') returning id into enc_b;
  -- 'order': um dos tipos que a regra `customer_notifications_kind_check` aceita (o 'teste' de
  -- antes passou a ser recusado com a migração 20261107030000 e o ficheiro deixou de correr).
  insert into public.customer_notifications (customer_id, kind, title, body)
    values (b, 'order', 'Teste', 'Notificação de B');
  insert into public.support_threads (customer_id, subject) values (b, 'Conversa de B') returning id into conversa_b;
  insert into public.support_messages (thread_id, sender_id, body, author_kind) values (conversa_b, b, 'Mensagem de B', 'customer');
  insert into public.secure_support_threads (customer_id, mls_group_id) values (b, 'teste-isolamento') returning id into segura_b;

  -- Como o cliente A, com sessão (aal1).
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  execute 'set local role authenticated';

  select count(*) into n from public.orders where id = enc_b;                 r := r || '01 A lê encomenda de B: ' || n || ' | ';
  select count(*) into n from public.customer_notifications where customer_id = b; r := r || '02 A lê notificações de B: ' || n || ' | ';
  begin insert into public.support_messages (thread_id, sender_id, body) values (conversa_b, a, 'intruso');
    r := r || '03 A escreve na conversa de B: PERMITIDO | ';
  exception when others then r := r || '03 A escreve na conversa de B: negado ' || sqlstate || ' | '; end;
  select count(*) into n from public.support_messages where thread_id = conversa_b; r := r || '04 A lê mensagens de B: ' || n || ' | ';
  select count(*) into n from public.profiles where id = b;                   r := r || '05 A lê o perfil de B: ' || n || ' | ';
  update public.profiles set role = 'admin', permissions = '{"manage_orders": true}' where id = a;
  select role into v from public.profiles where id = a;                       r := r || '06 A promove-se: fica ' || v || ' | ';
  begin perform * from public.users_admin_list('all', '', '', 10, 0); r := r || '07 A lista utilizadores: PERMITIDO | ';
  exception when others then r := r || '07 A lista utilizadores: negado ' || sqlstate || ' | '; end;
  update public.orders set status = 'cancelled' where id = enc_b; get diagnostics n = row_count;
  r := r || '08 A cancela encomenda de B: ' || n || ' linhas | ';
  update public.site_settings set site_name = 'invadido'; get diagnostics n = row_count;
  r := r || '09 A muda as configurações: ' || n || ' linhas | ';
  begin perform public.site_secrets_status(); r := r || '10 A vê estado dos segredos: PERMITIDO | ';
  exception when others then r := r || '10 A vê estado dos segredos: negado ' || sqlstate || ' | '; end;
  begin perform public.site_secret_values(); r := r || '11 A lê os segredos: PERMITIDO | ';
  exception when others then r := r || '11 A lê os segredos: negado ' || sqlstate || ' | '; end;

  -- Como o cliente B, na sua conversa segura: só pode fechar.
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin update public.secure_support_threads set mls_group_id = 'outro' where id = segura_b;
    r := r || '12 B muda o grupo da conversa: PERMITIDO | ';
  exception when others then r := r || '12 B muda o grupo da conversa: recusado ' || sqlstate || ' | '; end;
  begin update public.secure_support_threads set status = 'closed' where id = segura_b; get diagnostics n = row_count;
    r := r || '13 B fecha a conversa: ok (' || n || ') | ';
  exception when others then r := r || '13 B fecha a conversa: FALHOU ' || sqlerrm || ' | '; end;
  begin update public.secure_support_threads set status = 'open' where id = segura_b;
    r := r || '14 B reabre a conversa: PERMITIDO | ';
  exception when others then r := r || '14 B reabre a conversa: negado ' || sqlstate || ' | '; end;

  -- MFA: B passa a admin com um factor verificado. A promoção corre SEM sessão: com a sessão de
  -- B ainda definida, o gatilho `protect_profile_privileges` repunha o papel antigo (B não é
  -- admin) e os casos 15, 16 e 18 mediam um cliente em vez de um admin.
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  update public.profiles set role = 'admin' where id = b;
  if not exists (select 1 from public.profiles where id = b and role = 'admin') then
    raise exception 'RESULTADO PREPARAÇÃO FALHOU: B não ficou admin';
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin
    insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret)
      values (gen_random_uuid(), b, 'teste-isolamento', 'totp', 'verified', now(), now(), 'teste');
  exception when others then
    r := r || '15-17 SEM FACTOR DE TESTE (' || sqlerrm || '): ignorar 15 a 17 | ';
  end;
  execute 'set local role authenticated';
  select private.is_admin() into ok;                                          r := r || '15 admin com MFA em aal1 é admin: ' || ok || ' | ';
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  select private.is_admin() into ok;                                          r := r || '16 em aal2 é admin: ' || ok || ' | ';
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin perform * from public.users_admin_list('all', '', '', 10, 0); r := r || '17 em aal1 lista utilizadores: PERMITIDO | ';
  exception when others then r := r || '17 em aal1 lista utilizadores: negado ' || sqlstate || ' | '; end;

  -- Segredos: o admin em aal2 vê o estado, nunca os valores.
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  begin perform public.site_secrets_status(); r := r || '18 admin vê estado dos segredos: ok | ';
  exception when others then r := r || '18 admin vê estado dos segredos: FALHOU ' || sqlerrm || ' | '; end;
  begin perform public.site_secret_values(); r := r || '19 admin lê os valores: PERMITIDO | ';
  exception when others then r := r || '19 admin lê os valores: negado ' || sqlstate || ' | '; end;
  execute 'reset role';
  update public.site_settings set smtp_password = 'segredo-de-teste'
    where id = (select id from public.site_settings order by created asc, id desc limit 1);
  select coalesce(nullif(smtp_password, ''), 'vazio') into v from public.site_settings order by created asc, id desc limit 1;
  r := r || '20 coluna depois de gravar a password: ' || v || ' | ';

  -- Idempotência: a mesma chave não cria duas encomendas.
  begin
    insert into public.orders (customer_email, order_number, items, total, idempotency_key)
      values (email_b, 'TESTE-IDEM-1', '[]'::jsonb, 1, 'chave-de-teste-0000000000');
    insert into public.orders (customer_email, order_number, items, total, idempotency_key)
      values (email_b, 'TESTE-IDEM-2', '[]'::jsonb, 1, 'chave-de-teste-0000000000');
    r := r || '21 chave repetida: PERMITIDO';
  exception when others then r := r || '21 chave repetida: ' || sqlstate; end;

  raise exception 'RESULTADO %', r;
end
$teste$;

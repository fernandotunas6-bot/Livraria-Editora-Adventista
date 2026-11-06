-- Verificação das correcções da revisão de 2026-11-06 que vivem na base de dados:
--   A) `private.has_permission` só aceita o booleano JSON `true`
--      (migração `20261106122000_permissoes_so_booleanos`);
--   B) o bucket público `media` já não aceita SVG
--      (migração `20261106121000_svg_fora_do_bucket_publico`).
--
-- Corre no SQL Editor do Supabase, depois de aplicar as migrações.
-- NÃO GRAVA NADA: termina com `raise exception 'RESULTADO …'`, que anula a transacção
-- inteira — o papel e as permissões do utilizador usado no teste ficam como estavam.
--
-- Esperado: A1 negado, A2 permitido, A3 negado, A4 permitido, B sem SVG.
do $teste$
declare
  u uuid;
  papel_antes text;
  perms_antes jsonb;
  r text := '';
  ok boolean;
  tipos text[];
begin
  -- Um gestor de empréstimo: qualquer conta serve, porque tudo é revertido no fim.
  select id into u from auth.users order by created_at limit 1;
  if u is null then raise exception 'RESULTADO faltam contas para o teste'; end if;
  select role, permissions into papel_antes, perms_antes from public.profiles where id = u;

  -- A sessão diz `aal2` para o teste não depender de a conta ter ou não factor MFA
  -- (private.mfa_satisfied entra em has_permission e não é o que está em causa aqui).
  perform set_config('request.jwt.claims',
    json_build_object('sub', u, 'role', 'authenticated', 'aal', 'aal2')::text, true);

  -- (A) A string "true" não pode valer como permissão -------------------------------------
  -- Era isto que passava antes: `permissions ->> 'manage_users'` devolve 'true' tanto para o
  -- booleano como para a string, e a comparação era com texto.
  update public.profiles set role = 'manager', permissions = '{"manage_users": "true"}'::jsonb where id = u;
  execute 'set local role authenticated';
  select private.has_permission('manage_users') into ok;
  r := r || 'A1 string "true": ' || case when ok then 'PERMITIDO (falha)' else 'negado' end || ' | ';
  execute 'reset role';

  -- O booleano continua a valer, senão a correcção tinha fechado o painel a quem tem direito.
  update public.profiles set permissions = '{"manage_users": true}'::jsonb where id = u;
  execute 'set local role authenticated';
  select private.has_permission('manage_users') into ok;
  r := r || 'A2 booleano true: ' || case when ok then 'permitido' else 'NEGADO (falha)' end || ' | ';
  execute 'reset role';

  -- Chave em falta e valores falsos continuam negados.
  update public.profiles set permissions = '{"manage_orders": true}'::jsonb where id = u;
  execute 'set local role authenticated';
  select private.has_permission('manage_users') into ok;
  r := r || 'A3 chave em falta: ' || case when ok then 'PERMITIDO (falha)' else 'negado' end || ' | ';
  execute 'reset role';

  -- Admin continua a poder tudo.
  update public.profiles set role = 'admin', permissions = null where id = u;
  execute 'set local role authenticated';
  select private.has_permission('manage_users') into ok;
  r := r || 'A4 admin: ' || case when ok then 'permitido' else 'NEGADO (falha)' end || ' | ';
  execute 'reset role';

  -- (B) O bucket público não aceita SVG ---------------------------------------------------
  select allowed_mime_types into tipos from storage.buckets where id = 'media';
  r := r || 'B SVG no bucket: '
         || case when tipos is null then 'SEM LIMITE DE TIPOS (falha)'
                 when 'image/svg+xml' = any (tipos) then 'ACEITE (falha)'
                 else 'recusado' end
         || ' | tipos: ' || coalesce(array_to_string(tipos, ', '), '(todos)');

  -- Repõe o que estava e anula tudo.
  update public.profiles set role = papel_antes, permissions = perms_antes where id = u;
  raise exception 'RESULTADO %', r;
end
$teste$;

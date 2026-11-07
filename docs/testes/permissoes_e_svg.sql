-- Verificação das correcções da revisão de 2026-11-06 que vivem na base de dados:
--   A) `private.has_permission` só aceita o booleano JSON `true`
--      (migração `20261106122000_permissoes_so_booleanos`);
--   B) o bucket público `media` já não aceita SVG
--      (migração `20261106121000_svg_fora_do_bucket_publico`).
--
-- Corre no SQL Editor do Supabase, depois de aplicar as migrações.
-- NÃO GRAVA NADA: termina com `raise exception 'RESULTADO …'`, que anula a transacção
-- inteira — o papel, as permissões e os contadores de códigos ficam como estavam.
--
-- Esperado: A1 negado, A2 permitido, A3 negado, A4 permitido, B recusado.
--
-- Porque é que cada caso PREPARA sem sessão e só depois VERIFICA com sessão
-- ---------------------------------------------------------------------------
-- Há dois triggers em `profiles` — `profiles_codigos_pessoa` e `profiles_protect_privileges` —
-- que repõem o `role` e as `permissions` antigos sempre que `auth.uid()` não é nulo e a
-- pessoa da sessão não é admin. É a protecção contra a escalada de privilégios, e funciona
-- também contra este teste: com a sessão já definida, mal o utilizador do teste passa a
-- gestor, as actualizações seguintes eram revertidas em silêncio e o teste media o papel
-- errado. A primeira versão deste ficheiro fazia isso e dava A2 e A4 como falhas sem haver
-- falha nenhuma (reproduzido num Postgres local com os triggers reais).
--
-- Por isso: cada `update` corre sem sessão (`auth.uid()` nulo, como o service role, que os
-- triggers deixam passar), a seguir confirma-se que ficou gravado, e só então se define a
-- sessão para chamar `has_permission`. Se a preparação não ficar gravada, o teste pára com
-- "PREPARAÇÃO FALHOU" em vez de dar um resultado falso.
do $teste$
declare
  u uuid;
  papel_antes text;
  perms_antes jsonb;
  r text := '';
  ok boolean;
  tipos text[];
  sessao text;
begin
  -- De preferência um admin que já tenha código de funcionário: mudar-lhe o papel não toca
  -- em nenhum contador (`profiles_codigos_pessoa` só numera quem ainda não tem código). Sem
  -- nenhum, serve a conta mais antiga — e tudo é anulado no fim de qualquer modo.
  select p.id into u from public.profiles p
   where p.role = 'admin' and p.staff_code is not null
   order by p.staff_code limit 1;
  if u is null then
    select id into u from auth.users order by created_at limit 1;
  end if;
  if u is null then raise exception 'RESULTADO faltam contas para o teste'; end if;
  select role, permissions into papel_antes, perms_antes from public.profiles where id = u;

  -- A sessão diz `aal2` para o teste não depender de a conta ter ou não factor MFA
  -- (`private.mfa_satisfied` entra em `has_permission` e não é o que está em causa aqui).
  sessao := json_build_object('sub', u, 'role', 'authenticated', 'aal', 'aal2')::text;

  -- (A1) A string "true" não pode valer como permissão ---------------------------------------
  -- Era isto que passava antes: `permissions ->> 'manage_users'` devolve 'true' tanto para o
  -- booleano como para a string, e a comparação era com texto.
  perform set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.sub', '', true);
  update public.profiles set role = 'manager', permissions = '{"manage_users": "true"}'::jsonb where id = u;
  if not exists (select 1 from public.profiles where id = u and role = 'manager'
                 and permissions = '{"manage_users": "true"}'::jsonb) then
    raise exception 'RESULTADO PREPARAÇÃO FALHOU em A1: um trigger repôs o papel ou as permissões';
  end if;
  perform set_config('request.jwt.claims', sessao, true);
  execute 'set local role authenticated';
  select private.has_permission('manage_users') into ok;
  execute 'reset role';
  r := r || 'A1 string "true": ' || case when ok then 'PERMITIDO (falha)' else 'negado' end || ' | ';

  -- (A2) O booleano continua a valer, senão a correcção tinha fechado o painel a quem tem direito.
  perform set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.sub', '', true);
  update public.profiles set permissions = '{"manage_users": true}'::jsonb where id = u;
  if not exists (select 1 from public.profiles where id = u and role = 'manager'
                 and permissions = '{"manage_users": true}'::jsonb) then
    raise exception 'RESULTADO PREPARAÇÃO FALHOU em A2: um trigger repôs as permissões';
  end if;
  perform set_config('request.jwt.claims', sessao, true);
  execute 'set local role authenticated';
  select private.has_permission('manage_users') into ok;
  execute 'reset role';
  r := r || 'A2 booleano true: ' || case when ok then 'permitido' else 'NEGADO (falha)' end || ' | ';

  -- (A3) Chave em falta continua negada.
  perform set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.sub', '', true);
  update public.profiles set permissions = '{"manage_orders": true}'::jsonb where id = u;
  if not exists (select 1 from public.profiles where id = u and role = 'manager'
                 and permissions = '{"manage_orders": true}'::jsonb) then
    raise exception 'RESULTADO PREPARAÇÃO FALHOU em A3: um trigger repôs as permissões';
  end if;
  perform set_config('request.jwt.claims', sessao, true);
  execute 'set local role authenticated';
  select private.has_permission('manage_users') into ok;
  execute 'reset role';
  r := r || 'A3 chave em falta: ' || case when ok then 'PERMITIDO (falha)' else 'negado' end || ' | ';

  -- (A4) Admin continua a poder tudo.
  perform set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.sub', '', true);
  update public.profiles set role = 'admin', permissions = null where id = u;
  if not exists (select 1 from public.profiles where id = u and role = 'admin' and permissions is null) then
    raise exception 'RESULTADO PREPARAÇÃO FALHOU em A4: um trigger repôs o papel';
  end if;
  perform set_config('request.jwt.claims', sessao, true);
  execute 'set local role authenticated';
  select private.has_permission('manage_users') into ok;
  execute 'reset role';
  r := r || 'A4 admin: ' || case when ok then 'permitido' else 'NEGADO (falha)' end || ' | ';

  -- (B) O bucket público não aceita SVG -------------------------------------------------------
  select allowed_mime_types into tipos from storage.buckets where id = 'media';
  r := r || 'B SVG no bucket: '
         || case when tipos is null then 'SEM LIMITE DE TIPOS (falha)'
                 when 'image/svg+xml' = any (tipos) then 'ACEITE (falha)'
                 else 'recusado' end
         || ' | tipos: ' || coalesce(array_to_string(tipos, ', '), '(todos)');

  -- Repõe o que estava (sem sessão, para os triggers não o reverterem) e anula tudo.
  perform set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.sub', '', true);
  update public.profiles set role = papel_antes, permissions = perms_antes where id = u;
  raise exception 'RESULTADO %', r;
end
$teste$;

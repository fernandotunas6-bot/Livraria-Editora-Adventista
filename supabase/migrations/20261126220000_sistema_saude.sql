-- KANGEST ONE, fase E: a saúde do ecossistema (GET /api/v1/system/health).
--
-- A última migração aplicada na base, para o painel e a API dizerem em que versão está a base. A tabela das migrações
-- vive no esquema do Supabase (supabase_migrations), que o PostgREST não mostra; esta função lê-a e devolve só a versão.
-- Numa base sem esse esquema (os testes locais), devolve null. Só o servidor a chama.
create or replace function public.sistema_ultima_migracao()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v text;
begin
  execute 'select max(version)::text from supabase_migrations.schema_migrations' into v;
  return v;
exception when undefined_table or invalid_schema_name then
  return null;
end;
$$;
revoke all on function public.sistema_ultima_migracao() from public, anon, authenticated;
grant execute on function public.sistema_ultima_migracao() to service_role;

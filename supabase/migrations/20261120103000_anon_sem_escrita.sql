-- O papel `anon` (quem visita sem sessão) deixa de ter INSERT, UPDATE e DELETE nas tabelas de public.
--
-- Achado da análise crítica de 2026-11-20. O Supabase dá a `anon` todos os privilégios nas tabelas
-- novas; a migração privilegios_minimos já tirou TRUNCATE, TRIGGER e REFERENCES, mas o `anon` ficou
-- com escrita em 29 tabelas — entre elas site_settings, payment_methods, profiles e orders. Hoje
-- nada disso se usa: não há nenhuma política RLS de escrita para `anon` (as 15 que o incluem são
-- todas de leitura), e tudo o que um visitante grava passa pela Edge Function, com a service role.
-- Só a RLS travava; uma migração futura que a desligasse numa tabela abria-a à internet inteira.
-- Agora são duas barreiras.
--
-- Não muda nada do que o site faz. As funções `security definer` correm como o dono e continuam a
-- poder o que podiam. As tabelas criadas a seguir (pelo mesmo papel, `postgres`) já nascem sem
-- estes privilégios para `anon`.
--
-- Reverter: grant insert, update, delete on all tables in schema public to anon (não recomendado).

revoke insert, update, delete on all tables in schema public from anon;
alter default privileges in schema public revoke insert, update, delete on tables from anon;

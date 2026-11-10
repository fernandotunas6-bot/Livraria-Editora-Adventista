-- Privilégios mínimos para os papéis da API (achado A360-21 da auditoria 360°).
--
-- Por omissão, o Supabase dá a `anon` e `authenticated` todos os privilégios nas tabelas de
-- `public`, incluindo TRUNCATE, TRIGGER e REFERENCES. O PostgREST nunca os usa (só SELECT,
-- INSERT, UPDATE e DELETE, filtrados pelo RLS), e o RLS não cobre o TRUNCATE: com uma fuga que
-- deixasse correr SQL como estes papéis, uma tabela inteira esvaziava-se sem passar por nenhuma
-- política. Medido com as migrações todas: 29 tabelas para `anon` e 34 para `authenticated`.
--
-- Não muda nada do que o site faz. As tabelas criadas a seguir (por migrações corridas pelo
-- mesmo papel, `postgres`) já nascem sem estes privilégios. As funções `security definer` correm
-- como o dono, por isso continuam a poder o que podiam.

revoke truncate, trigger, references on all tables in schema public from anon, authenticated;

alter default privileges in schema public
  revoke truncate, trigger, references on tables from anon, authenticated;

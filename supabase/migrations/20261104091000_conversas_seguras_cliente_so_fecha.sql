-- Conversas seguras (protótipo E2EE): o cliente só pode fechar a sua conversa.
--
-- A política "secure_support_threads: cliente ou admin fecha" deixa o cliente fazer UPDATE
-- à própria linha, e o RLS não olha para as colunas: além de fechar, o cliente podia reabrir
-- uma conversa que a equipa fechou (e voltar a escrever nela, porque a política de envio só
-- exige status = 'open'), trocar o mls_group_id ou religá-la a outro livro ou avaliação.
-- O site nunca faz UPDATE a esta tabela (lib/secureInboxApi.js só insere e lê), por isso
-- isto não muda nada para quem a usa. A 2026-11-04 a tabela tem 0 linhas.
--
-- A service role (Edge Function, auth.uid() nulo) e o admin continuam sem restrições.

create or replace function private.secure_support_threads_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or private.is_admin() then
    return new;
  end if;

  if new.customer_id is distinct from old.customer_id
     or new.book_id is distinct from old.book_id
     or new.review_id is distinct from old.review_id
     or new.mls_group_id is distinct from old.mls_group_id
     or new.created_at is distinct from old.created_at then
    raise exception 'Só é possível fechar a conversa.' using errcode = '42501';
  end if;

  if new.status is distinct from old.status and new.status <> 'closed' then
    raise exception 'Uma conversa fechada só pode ser reaberta pela equipa.' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.secure_support_threads_guard() from public, anon, authenticated;

drop trigger if exists secure_support_threads_guard on public.secure_support_threads;
create trigger secure_support_threads_guard
  before update on public.secure_support_threads
  for each row execute function private.secure_support_threads_guard();

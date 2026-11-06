-- Assistente com memória, passagem para a equipa e pedidos de ajuda numerados.
--
-- O assistente passa a usar as mesmas tabelas do atendimento (support_threads e
-- support_messages), como nos sistemas de atendimento de referência (Intercom, Zendesk): uma
-- conversa começa com o assistente (estado 'bot'), e quando o cliente precisa de uma pessoa
-- a MESMA conversa passa à equipa como pedido de ajuda numerado (#1001, #1002…). A equipa vê
-- tudo o que o cliente e o assistente disseram, um resumo e a encomenda em causa; o cliente
-- não tem de repetir nada.
--
-- Ciclo de vida:
--   bot      o assistente responde; não aparece na fila da equipa (há um filtro para o ver)
--   open     à espera da equipa (passagem pedida, nova mensagem do cliente ou pedido criado
--            pelo formulário)
--   pending  à espera do cliente (a equipa respondeu)
--   closed   resolvido; uma nova mensagem começa outra conversa
--
-- Quem não tem conta conversa com o assistente com um código guardado no browser (só o hash
-- fica aqui). Para abrir um pedido à equipa é preciso conta: é por ela que o cliente recebe a
-- resposta (o envio de emails ainda não está garantido) e é ela que prova a quem pertencem
-- as encomendas. Ao entrar, a conversa do browser passa para a conta.
--
-- Em 2026-11-06 as duas tabelas têm 0 linhas; ainda assim, tudo o que existe é preservado.

-- ---------------------------------------------------------------------------
-- 1. Conversas
-- ---------------------------------------------------------------------------
alter table public.support_threads alter column customer_id drop not null;

alter table public.support_threads
  add column if not exists channel text not null default 'form',
  add column if not exists guest_token_hash text,
  add column if not exists ticket_number bigint,
  add column if not exists category text not null default 'other',
  add column if not exists priority text not null default 'normal',
  add column if not exists ai_summary text,
  add column if not exists page text,
  add column if not exists escalated_at timestamptz,
  add column if not exists first_response_at timestamptz,
  add column if not exists closed_at timestamptz,
  add column if not exists csat_score smallint,
  add column if not exists csat_comment text,
  add column if not exists csat_at timestamptz;

alter table public.support_threads drop constraint if exists support_threads_status_check;
alter table public.support_threads add constraint support_threads_status_check
  check (status in ('bot', 'open', 'pending', 'closed'));
alter table public.support_threads add constraint support_threads_channel_check
  check (channel in ('form', 'assistant'));
alter table public.support_threads add constraint support_threads_bot_only_assistant
  check (status <> 'bot' or channel = 'assistant');
alter table public.support_threads add constraint support_threads_category_check
  check (category in ('order', 'payment', 'delivery', 'return', 'product', 'account', 'other'));
alter table public.support_threads add constraint support_threads_priority_check
  check (priority in ('low', 'normal', 'high', 'urgent'));
alter table public.support_threads add constraint support_threads_owner_check
  check (customer_id is not null or guest_token_hash is not null);
alter table public.support_threads add constraint support_threads_guest_token_hash_check
  check (guest_token_hash is null or guest_token_hash ~ '^[0-9a-f]{64}$');
alter table public.support_threads add constraint support_threads_csat_check
  check (csat_score is null or csat_score between 1 and 5);
alter table public.support_threads add constraint support_threads_csat_comment_check
  check (csat_comment is null or char_length(csat_comment) <= 1000);
alter table public.support_threads add constraint support_threads_ai_summary_check
  check (ai_summary is null or char_length(ai_summary) <= 4000);
alter table public.support_threads add constraint support_threads_page_check
  check (page is null or char_length(page) <= 200);

create sequence if not exists public.support_ticket_number_seq start with 1001;
revoke all on sequence public.support_ticket_number_seq from public, anon, authenticated;

-- Pedidos que já existam (criados pelo formulário) ficam com número e data de abertura.
update public.support_threads
set ticket_number = nextval('public.support_ticket_number_seq'),
    escalated_at = coalesce(escalated_at, created_at)
where ticket_number is null;
update public.support_threads
set closed_at = updated_at
where status = 'closed' and closed_at is null;

create unique index if not exists support_threads_ticket_number_key
  on public.support_threads (ticket_number) where ticket_number is not null;
create index if not exists support_threads_guest_token_idx
  on public.support_threads (guest_token_hash, created_at desc) where guest_token_hash is not null;
create index if not exists support_threads_customer_channel_idx
  on public.support_threads (customer_id, channel, created_at desc) where customer_id is not null;

-- ---------------------------------------------------------------------------
-- 2. Mensagens: quem escreveu, notas internas e avaliação das respostas do assistente
-- ---------------------------------------------------------------------------
alter table public.support_messages alter column sender_id drop not null;

alter table public.support_messages
  add column if not exists author_kind text,
  add column if not exists meta jsonb not null default '{}'::jsonb,
  add column if not exists feedback smallint;

update public.support_messages m
set author_kind = case when m.sender_id = t.customer_id then 'customer' else 'staff' end
from public.support_threads t
where t.id = m.thread_id and m.author_kind is null;

-- Sem valor por omissão de propósito: o gatilho abaixo decide o autor das mensagens escritas
-- pelo site, e a Edge Function indica-o explicitamente. As restrições são verificadas depois
-- dos gatilhos BEFORE, por isso o NOT NULL não impede o gatilho de o preencher.
alter table public.support_messages alter column author_kind set not null;
alter table public.support_messages add constraint support_messages_author_kind_check
  check (author_kind in ('customer', 'staff', 'assistant', 'system', 'note'));
alter table public.support_messages add constraint support_messages_sender_required
  check (author_kind not in ('staff', 'note') or sender_id is not null);
alter table public.support_messages add constraint support_messages_feedback_check
  check (feedback is null or feedback in (-1, 1));
alter table public.support_messages add constraint support_messages_meta_size
  check (pg_column_size(meta) <= 16384);

-- As notas internas nunca chegam ao cliente.
drop policy if exists "support_messages: participante lê" on public.support_messages;
create policy "support_messages: participante lê"
  on public.support_messages for select to authenticated
  using (
    exists (
      select 1 from public.support_threads t
      where t.id = thread_id
        and (
          (select private.has_permission('manage_orders'))
          or (t.customer_id = (select auth.uid()) and author_kind <> 'note')
        )
    )
  );

-- Quem escreve pelo site (cliente ou equipa) não escolhe o autor: decide-o a base de dados.
-- Só a Edge Function (service role, sem auth.uid()) escreve como 'assistant' ou 'system', e
-- só support_add_note escreve notas.
create or replace function private.support_message_author()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer uuid;
  v_staff boolean;
begin
  if auth.uid() is null then
    if new.author_kind is null then
      raise exception 'Indique o autor da mensagem.';
    end if;
    return new;
  end if;

  select t.customer_id into v_customer from public.support_threads t where t.id = new.thread_id;
  v_staff := private.has_permission('manage_orders');
  new.sender_id := auth.uid();
  new.meta := '{}'::jsonb;
  new.feedback := null;

  if new.author_kind = 'note' then
    if not v_staff then
      raise exception 'Só a equipa escreve notas internas.' using errcode = '42501';
    end if;
  elsif v_customer is not null and v_customer = auth.uid() then
    new.author_kind := 'customer';
  elsif v_staff then
    new.author_kind := 'staff';
  else
    raise exception 'Sem permissão para esta conversa.' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.support_message_author() from public, anon, authenticated;
drop trigger if exists support_messages_author on public.support_messages;
create trigger support_messages_author
  before insert on public.support_messages
  for each row execute function private.support_message_author();

-- Estado, números e avisos depois de cada mensagem.
create or replace function private.notify_support_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_thread public.support_threads;
  v_staff record;
  v_label text;
begin
  select * into v_thread from public.support_threads where id = new.thread_id for update;
  if not found then return new; end if;

  -- Nota interna: não mexe na ordem da fila nem no "por ler" do cliente.
  if new.author_kind = 'note' then
    update public.support_threads set updated_at = new.created_at where id = new.thread_id;
    return new;
  end if;

  -- Assistente e avisos do sistema: só a ordem das conversas.
  if new.author_kind in ('assistant', 'system') then
    update public.support_threads
    set last_message_at = new.created_at, last_sender_id = null, updated_at = new.created_at
    where id = new.thread_id;
    return new;
  end if;

  v_label := case when v_thread.ticket_number is not null then '#' || v_thread.ticket_number || ' · ' else '' end
    || v_thread.subject;

  if new.author_kind = 'customer' then
    update public.support_threads
    set last_message_at = new.created_at,
        last_sender_id = new.sender_id,
        updated_at = new.created_at,
        status = case when status in ('bot', 'closed') then status else 'open' end
    where id = new.thread_id;

    -- Enquanto o assistente responde, a equipa não é incomodada.
    if v_thread.status in ('open', 'pending') then
      for v_staff in
        select p.id from public.profiles p
        where (v_thread.assigned_to is not null and p.id = v_thread.assigned_to)
          or (
            v_thread.assigned_to is null
            and (p.role = 'admin' or (p.role = 'manager' and p.permissions ->> 'manage_orders' = 'true'))
          )
      loop
        insert into public.staff_notifications (staff_id, kind, title, body, thread_id, order_id)
        values (v_staff.id, 'support', 'Nova mensagem de cliente', left(v_label, 500), v_thread.id, v_thread.order_id);
      end loop;
    end if;
    return new;
  end if;

  -- Equipa. Responder a uma conversa que estava com o assistente é assumi-la: ganha número,
  -- responsável (quem respondeu, se ainda não havia) e o assistente deixa de responder.
  update public.support_threads
  set last_message_at = new.created_at,
      last_sender_id = new.sender_id,
      updated_at = new.created_at,
      status = case when status in ('bot', 'open') then 'pending' else status end,
      ticket_number = coalesce(ticket_number, nextval('public.support_ticket_number_seq')),
      escalated_at = coalesce(escalated_at, new.created_at),
      first_response_at = coalesce(first_response_at, new.created_at),
      assigned_to = coalesce(assigned_to, new.sender_id)
  where id = new.thread_id
  returning * into v_thread;

  if v_thread.customer_id is not null then
    insert into public.customer_notifications (customer_id, kind, title, body, href, thread_id, order_id)
    values (
      v_thread.customer_id, 'support', 'Resposta da equipa',
      left('#' || v_thread.ticket_number || ' · ' || v_thread.subject, 500),
      '/?atendimento=1', v_thread.id, v_thread.order_id
    );
  end if;
  return new;
end;
$$;

revoke execute on function private.notify_support_message() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Funções do site
-- ---------------------------------------------------------------------------

-- Pedido criado pelo formulário: já nasce como pedido numerado.
create or replace function public.support_create_thread(
  p_subject text,
  p_body text,
  p_order_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_thread_id uuid;
begin
  if auth.uid() is null or private.has_permission('manage_orders') then
    raise exception 'Só clientes autenticados podem iniciar uma conversa.';
  end if;
  if char_length(btrim(coalesce(p_subject, ''))) not between 1 and 160 then
    raise exception 'O assunto deve ter entre 1 e 160 caracteres.';
  end if;
  if char_length(btrim(coalesce(p_body, ''))) not between 1 and 4000 then
    raise exception 'A mensagem deve ter entre 1 e 4000 caracteres.';
  end if;
  if p_order_id is not null and not exists (
    select 1 from public.orders o
    where o.id = p_order_id and o.customer_id = auth.uid()
  ) then
    raise exception 'A encomenda indicada não pertence à sua conta.';
  end if;

  insert into public.support_threads (customer_id, order_id, subject, channel, status, ticket_number, escalated_at,
    category)
  values (auth.uid(), p_order_id, btrim(p_subject), 'form', 'open', nextval('public.support_ticket_number_seq'), now(),
    case when p_order_id is not null then 'order' else 'other' end)
  returning id into v_thread_id;

  insert into public.support_messages (thread_id, sender_id, body)
  values (v_thread_id, auth.uid(), btrim(p_body));
  return v_thread_id;
end;
$$;

-- Estado, responsável, prioridade e categoria, pela equipa.
create or replace function public.support_update_ticket(
  p_thread_id uuid,
  p_status text,
  p_assigned_to uuid,
  p_priority text default null,
  p_category text default null
)
returns public.support_threads
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_thread public.support_threads;
begin
  if auth.uid() is null or not private.has_permission('manage_orders') then
    raise exception 'Sem permissão para esta operação.';
  end if;
  if p_status is null or p_status not in ('open', 'pending', 'closed') then
    raise exception 'Estado da conversa inválido.';
  end if;
  if p_priority is not null and p_priority not in ('low', 'normal', 'high', 'urgent') then
    raise exception 'Prioridade inválida.';
  end if;
  if p_category is not null and p_category not in ('order', 'payment', 'delivery', 'return', 'product', 'account', 'other') then
    raise exception 'Categoria inválida.';
  end if;
  if p_assigned_to is not null and not exists (
    select 1 from public.profiles p
    where p.id = p_assigned_to
      and (
        p.role = 'admin'
        or (p.role = 'manager' and p.permissions ->> 'manage_orders' = 'true')
      )
  ) then
    raise exception 'O responsável seleccionado não pode gerir encomendas.';
  end if;

  update public.support_threads
  set status = p_status,
      assigned_to = p_assigned_to,
      priority = coalesce(p_priority, priority),
      category = coalesce(p_category, category),
      -- Uma conversa do assistente que a equipa abre ou fecha passa a pedido numerado.
      ticket_number = coalesce(ticket_number, nextval('public.support_ticket_number_seq')),
      escalated_at = coalesce(escalated_at, now()),
      closed_at = case when p_status = 'closed' then coalesce(closed_at, now()) else null end,
      updated_at = now()
  where id = p_thread_id
  returning * into v_thread;

  if not found then raise exception 'Conversa não encontrada.'; end if;
  return v_thread;
end;
$$;

-- A função antiga (usada pela versão do site ainda publicada) passa pela nova.
create or replace function public.support_update_thread(
  p_thread_id uuid,
  p_status text,
  p_assigned_to uuid
)
returns public.support_threads
language sql
security definer
set search_path = ''
as $$
  select * from public.support_update_ticket(p_thread_id, p_status, p_assigned_to, null, null);
$$;

-- Nota interna da equipa (o cliente não a vê).
create or replace function public.support_add_note(p_thread_id uuid, p_body text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  if auth.uid() is null or not private.has_permission('manage_orders') then
    raise exception 'Sem permissão para esta operação.';
  end if;
  if char_length(btrim(coalesce(p_body, ''))) not between 1 and 4000 then
    raise exception 'A nota deve ter entre 1 e 4000 caracteres.';
  end if;
  if not exists (select 1 from public.support_threads where id = p_thread_id) then
    raise exception 'Conversa não encontrada.';
  end if;
  insert into public.support_messages (thread_id, sender_id, author_kind, body)
  values (p_thread_id, auth.uid(), 'note', btrim(p_body))
  returning id into v_id;
  return v_id;
end;
$$;

-- Avaliação do atendimento pelo cliente, uma vez, depois de resolvido.
create or replace function public.support_rate(p_thread_id uuid, p_score integer, p_comment text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Sessão obrigatória.'; end if;
  if p_score is null or p_score not between 1 and 5 then
    raise exception 'A avaliação vai de 1 a 5.';
  end if;
  if char_length(coalesce(p_comment, '')) > 1000 then
    raise exception 'O comentário tem no máximo 1000 caracteres.';
  end if;
  update public.support_threads
  set csat_score = p_score,
      csat_comment = nullif(btrim(coalesce(p_comment, '')), ''),
      csat_at = now(),
      updated_at = now()
  where id = p_thread_id
    and customer_id = auth.uid()
    and status = 'closed'
    and ticket_number is not null
    and csat_score is null;
  if not found then raise exception 'Esta conversa não pode ser avaliada.'; end if;
end;
$$;

-- Passagem para a equipa, pedida no chat. Só a Edge Function a chama (service role), depois
-- de confirmar a sessão do cliente; tudo acontece numa transacção.
create or replace function public.assistant_escalate(
  p_thread_id uuid,
  p_customer_id uuid,
  p_subject text,
  p_category text,
  p_priority text,
  p_summary text,
  p_order_id text default null,
  p_details text default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_thread public.support_threads;
  v_number bigint;
  v_staff record;
begin
  select * into v_thread from public.support_threads where id = p_thread_id for update;
  if not found or v_thread.channel <> 'assistant' then
    raise exception 'Conversa não encontrada.';
  end if;
  if p_customer_id is null or v_thread.customer_id is distinct from p_customer_id then
    raise exception 'Esta conversa não pertence à sua conta.';
  end if;
  if v_thread.status <> 'bot' then
    raise exception 'Esta conversa já está com a equipa.';
  end if;
  if char_length(btrim(coalesce(p_subject, ''))) not between 1 and 160 then
    raise exception 'Assunto inválido.';
  end if;
  -- Validado antes de gastar um número da sequência (os números não voltam atrás).
  if p_category is null or p_category not in ('order', 'payment', 'delivery', 'return', 'product', 'account', 'other') then
    raise exception 'Categoria inválida.';
  end if;
  if p_priority is null or p_priority not in ('low', 'normal', 'high', 'urgent') then
    raise exception 'Prioridade inválida.';
  end if;
  if p_order_id is not null and not exists (
    select 1 from public.orders o
    where o.id = p_order_id
      and (
        o.customer_id = p_customer_id
        or lower(o.customer_email) = (select lower(u.email) from auth.users u where u.id = p_customer_id)
      )
  ) then
    raise exception 'A encomenda indicada não pertence à sua conta.';
  end if;

  -- Os detalhes entram como mensagem do cliente ainda com o assistente, por isso não geram
  -- um aviso à parte: o aviso é o do pedido, logo a seguir.
  if char_length(btrim(coalesce(p_details, ''))) > 0 then
    insert into public.support_messages (thread_id, sender_id, author_kind, body)
    values (p_thread_id, p_customer_id, 'customer', left(btrim(p_details), 4000));
  end if;

  v_number := nextval('public.support_ticket_number_seq');
  update public.support_threads
  set status = 'open',
      ticket_number = v_number,
      escalated_at = now(),
      subject = left(btrim(p_subject), 160),
      category = p_category,
      priority = p_priority,
      ai_summary = left(p_summary, 4000),
      order_id = coalesce(p_order_id, order_id),
      updated_at = now()
  where id = p_thread_id;

  insert into public.support_messages (thread_id, sender_id, author_kind, body)
  values (
    p_thread_id, null, 'system',
    'Pedido de ajuda #' || v_number || ' aberto. A nossa equipa vai continuar esta conversa aqui, '
      || 'com tudo o que já escreveu. Recebe um aviso quando respondermos.'
  );

  for v_staff in
    select p.id from public.profiles p
    where p.role = 'admin' or (p.role = 'manager' and p.permissions ->> 'manage_orders' = 'true')
  loop
    insert into public.staff_notifications (staff_id, kind, title, body, thread_id, order_id)
    values (
      v_staff.id, 'support',
      case when p_priority in ('high', 'urgent') then 'Pedido de ajuda urgente #' else 'Novo pedido de ajuda #' end || v_number,
      left(btrim(p_subject), 500), p_thread_id, coalesce(p_order_id, v_thread.order_id)
    );
  end loop;

  return v_number;
end;
$$;

revoke all on function public.support_create_thread(text, text, text) from public, anon;
revoke all on function public.support_update_ticket(uuid, text, uuid, text, text) from public, anon;
revoke all on function public.support_update_thread(uuid, text, uuid) from public, anon;
revoke all on function public.support_add_note(uuid, text) from public, anon;
revoke all on function public.support_rate(uuid, integer, text) from public, anon;
revoke all on function public.assistant_escalate(uuid, uuid, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.support_create_thread(text, text, text) to authenticated;
grant execute on function public.support_update_ticket(uuid, text, uuid, text, text) to authenticated;
grant execute on function public.support_update_thread(uuid, text, uuid) to authenticated;
grant execute on function public.support_add_note(uuid, text) to authenticated;
grant execute on function public.support_rate(uuid, integer, text) to authenticated;
grant execute on function public.assistant_escalate(uuid, uuid, text, text, text, text, text, text) to service_role;
grant usage on sequence public.support_ticket_number_seq to service_role;

-- ---------------------------------------------------------------------------
-- 4. Arrumação diária
-- ---------------------------------------------------------------------------
-- Conversas só com o assistente, paradas há 7 dias, fecham (a seguinte começa do zero, e o
-- histórico fica na conta). As de visitantes sem conta e sem pedido apagam-se ao fim de 90
-- dias: não há a quem as mostrar e guardá-las seria guardar dados sem motivo.
-- Os pedidos à equipa não fecham sozinhos: isso é decisão de quem atende.
create or replace function private.run_support_housekeeping()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.support_threads
  set status = 'closed', closed_at = now(), updated_at = now()
  where status = 'bot' and last_message_at < now() - interval '7 days';

  delete from public.support_threads
  where channel = 'assistant'
    and customer_id is null
    and ticket_number is null
    and last_message_at < now() - interval '90 days';
end;
$$;

revoke all on function private.run_support_housekeeping() from public, anon, authenticated;

do $$
begin
  perform cron.unschedule('arrumacao-atendimento');
exception when others then null;
end
$$;

do $$
begin
  -- 03:41 UTC (04:41 em Luanda), fora das horas de movimento.
  perform cron.schedule('arrumacao-atendimento', '41 3 * * *', 'select private.run_support_housekeeping();');
exception when others then
  raise notice 'Não foi possível agendar a arrumação do atendimento (%).', sqlerrm;
end
$$;

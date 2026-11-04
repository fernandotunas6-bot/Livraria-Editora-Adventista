-- Índices para as 11 chaves estrangeiras que o advisor de desempenho do Supabase apontou
-- sem índice (auditoria de 2026-11-03).
-- Sem eles, apagar ou actualizar uma encomenda, conversa ou perfil obriga o Postgres a
-- percorrer a tabela inteira que a referencia (para verificar o ON DELETE), e as consultas
-- "notificações desta encomenda" ou "conversas atribuídas a mim" fazem o mesmo.
-- Só acrescenta índices: não muda dados nem permissões. Seguro de repetir.
create index if not exists customer_notifications_order_id_idx on public.customer_notifications (order_id);
create index if not exists customer_notifications_thread_id_idx on public.customer_notifications (thread_id);
create index if not exists secure_support_messages_sender_id_idx on public.secure_support_messages (sender_id);
create index if not exists secure_support_threads_book_id_idx on public.secure_support_threads (book_id);
create index if not exists secure_support_threads_review_id_idx on public.secure_support_threads (review_id);
create index if not exists staff_notifications_order_id_idx on public.staff_notifications (order_id);
create index if not exists staff_notifications_thread_id_idx on public.staff_notifications (thread_id);
create index if not exists support_messages_sender_id_idx on public.support_messages (sender_id);
create index if not exists support_threads_assigned_to_idx on public.support_threads (assigned_to);
create index if not exists support_threads_last_sender_id_idx on public.support_threads (last_sender_id);
create index if not exists support_threads_order_id_idx on public.support_threads (order_id);

-- Os avisos à equipa da vigilância e da confirmação do cliente eram recusados: a tabela só
-- aceitava 'new_order' e 'support'.
alter table public.staff_notifications drop constraint if exists staff_notifications_kind_check;
alter table public.staff_notifications add constraint staff_notifications_kind_check
  check (kind = any (array['new_order', 'support', 'order_stuck', 'order_problem', 'order_confirmed']));

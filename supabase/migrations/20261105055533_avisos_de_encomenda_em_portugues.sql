-- Os avisos da conta do cliente mostravam alguns estados com o nome técnico ("preparing",
-- "out_for_delivery", "confirmed"): faltavam na lista. Ficam todos em português, com títulos
-- próprios por passo, e a confirmação/problema do cliente avisa também a própria conta.
create or replace function private.notify_order_activity()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_staff record;
  v_number text;
  v_label text;
  v_title text;
begin
  if tg_op = 'INSERT' then
    v_number := left(coalesce(nullif(new.order_number, ''), new.id), 400);
    if new.customer_id is not null then
      insert into public.customer_notifications (customer_id, kind, title, body, href, order_id)
      values (new.customer_id, 'order', 'Encomenda recebida',
        'A encomenda ' || v_number || ' foi registada. Vamos avisá-lo de cada passo.',
        '/profile?tab=orders', new.id);
    end if;
    for v_staff in
      select p.id from public.profiles p
      where p.role = 'admin' or (p.role = 'manager' and p.permissions ->> 'manage_orders' = 'true')
    loop
      insert into public.staff_notifications (staff_id, kind, title, body, order_id)
      values (v_staff.id, 'new_order', 'Nova encomenda', 'Encomenda ' || v_number || ' recebida.', new.id);
    end loop;
    return new;
  end if;

  if new.customer_id is null then return new; end if;
  v_number := left(coalesce(nullif(new.order_number, ''), new.id), 400);

  if new.status is distinct from old.status and new.status = 'cancelled' then
    insert into public.customer_notifications (customer_id, kind, title, body, href, order_id)
    values (new.customer_id, 'order', 'Encomenda cancelada',
      'A encomenda ' || v_number || ' foi cancelada. Se tiver dúvidas, fale connosco.', '/profile?tab=orders', new.id);
  end if;

  if new.payment_status is distinct from old.payment_status then
    v_label := case new.payment_status
      when 'pending' then 'pendente'
      when 'awaiting_confirmation' then 'a aguardar confirmação'
      when 'paid' then 'confirmado'
      when 'failed' then 'não confirmado'
      when 'refunded' then 'devolvido'
      else coalesce(nullif(new.payment_status, ''), 'pendente') end;
    insert into public.customer_notifications (customer_id, kind, title, body, href, order_id)
    values (new.customer_id, 'payment',
      case when new.payment_status = 'paid' then 'Pagamento confirmado' else 'Pagamento: ' || v_label end,
      'O pagamento da encomenda ' || v_number || ' está agora: ' || v_label || '.',
      '/profile?tab=orders', new.id);
  end if;

  if new.delivery_status is distinct from old.delivery_status and coalesce(new.delivery_status, '') not in ('', 'cancelled') then
    select t.title, t.body into v_title, v_label from (values
      ('received', 'Encomenda recebida', 'foi registada'),
      ('confirmed', 'Encomenda confirmada', 'está confirmada e na fila de preparação'),
      ('preparing', 'A preparar a sua encomenda', 'está a ser separada e embalada'),
      ('processing', 'A preparar a sua encomenda', 'está a ser separada e embalada'),
      ('shipped', case when new.shipping_method = 'pickup' then 'Pronta para levantamento' else 'Encomenda expedida' end,
                  case when new.shipping_method = 'pickup' then 'está pronta para levantar na loja' else 'já saiu da nossa loja' end),
      ('in_transit', 'Encomenda em trânsito', 'está a caminho'),
      ('out_for_delivery', 'Saiu para entrega', 'saiu para entrega e deve chegar hoje'),
      ('delivered', 'Encomenda entregue', 'foi entregue. Obrigado pela sua compra!'),
      ('failed', 'Ocorrência na entrega', 'teve uma ocorrência na entrega. Vamos contactá-lo')
    ) as t(status, title, body)
    where t.status = new.delivery_status;
    insert into public.customer_notifications (customer_id, kind, title, body, href, order_id)
    values (new.customer_id, 'delivery', coalesce(v_title, 'Estado da entrega actualizado'),
      'A encomenda ' || v_number || ' ' || coalesce(v_label, 'mudou de estado: ' || new.delivery_status) || '.',
      '/profile?tab=orders', new.id);
  end if;
  return new;
end;
$function$;

comment on column public.orders.receipt_token is
  'Segredo do link "Recebi tudo bem / Tenho um problema" do email de agradecimento. Quem pode ler a encomenda (o próprio cliente e a equipa, pelas regras RLS) também o lê; para mais ninguém sai.';

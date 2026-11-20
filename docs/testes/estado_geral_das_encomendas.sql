-- Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
-- © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

-- Verificação do estado geral das encomendas (migração 20261107150000_estado_geral_acompanha_a_entrega).
--
-- Corre no SQL Editor do Supabase ou numa base local com as migrações. NÃO GRAVA NADA: cria um
-- cliente, um livro e encomendas de teste, e termina com `raise exception 'RESULTADO …'`,
-- que anula a transacção inteira.
--
-- Esperado: todas as linhas "ok".
do $teste$
declare
  v_cliente uuid := gen_random_uuid();
  v_livro text := 'teste-estado-' || left(gen_random_uuid()::text, 8);
  v_enc text;
  v_enc2 text;
  v_st text;
  v_n int;
  v_stock int;
  r text := '';
  passo record;
begin
  perform set_config('request.jwt.claims', '', true);
  insert into auth.users (id, email, aud, role, email_confirmed_at, instance_id)
  values (v_cliente, 'teste-estado-' || left(v_cliente::text, 8) || '@exemplo.invalid', 'authenticated', 'authenticated', now(), '00000000-0000-0000-0000-000000000000');
  insert into public.stock_books (id, title, price, stock) values (v_livro, 'Livro do teste de estado', 1000, 10);

  insert into public.orders (customer_id, customer_email, order_number, items, total, status, payment_status, delivery_status, payment_method_code, shipping_method)
  values (v_cliente, 'teste@exemplo.invalid', 'TESTE-ESTADO-1',
          jsonb_build_array(jsonb_build_object('book_id', v_livro, 'title', 'Livro', 'price', 1000, 'quantity', 2)),
          2000, 'pending', 'pending', 'received', 'transferencia', 'delivery')
  returning id into v_enc;
  update public.stock_books set stock = stock - 2 where id = v_livro;  -- como o place_order

  select status into v_st from public.orders where id = v_enc;
  r := r || format(E'\n01 encomenda nova fica pendente: %s', case when v_st = 'pending' then 'ok' else 'FALHA (' || v_st || ')' end);

  -- Cada passo e o estado geral esperado.
  for passo in
    select * from (values
      (2, 'payment_status', 'paid', 'confirmed'),
      (3, 'delivery_status', 'preparing', 'confirmed'),
      (4, 'delivery_status', 'shipped', 'shipped'),
      (5, 'delivery_status', 'out_for_delivery', 'shipped'),
      (6, 'delivery_status', 'delivered', 'delivered')
    ) as t(n, campo, valor, esperado)
  loop
    execute format('update public.orders set %I = $1 where id = $2', passo.campo) using passo.valor, v_enc;
    select status into v_st from public.orders where id = v_enc;
    r := r || format(E'\n%s %s=%s → estado %s: %s', lpad(passo.n::text, 2, '0'), passo.campo, passo.valor, passo.esperado,
      case when v_st = passo.esperado then 'ok' else 'FALHA (' || v_st || ')' end);
  end loop;

  -- Avisos ao cliente: o de encomenda recebida, um pelo pagamento e um por passo da entrega;
  -- nenhum a mais por o estado geral acompanhar.
  select string_agg(kind || '=' || n, ' ' order by kind) into v_st
  from (select kind, count(*) n from public.customer_notifications where order_id = v_enc group by kind) x;
  r := r || format(E'\n07 avisos ao cliente sem duplicados (delivery=4 order=1 payment=1): %s',
    case when v_st = 'delivery=4 order=1 payment=1' then 'ok' else 'FALHA (' || coalesce(v_st, '-') || ')' end);

  -- Registo de segurança: o pagamento entra; os passos do estado geral não.
  select count(*) into v_n from public.security_audit_log where table_name = 'orders' and row_id = v_enc and changes ? 'status';
  r := r || format(E'\n08 registo de segurança sem os passos normais do estado: %s', case when v_n = 0 then 'ok' else 'FALHA (' || v_n || ')' end);

  -- Uma "Confirmada" à mão numa encomenda por pagar não volta a "Pendente".
  insert into public.orders (customer_id, customer_email, order_number, items, total, status, payment_status, delivery_status, payment_method_code, shipping_method)
  values (v_cliente, 'teste@exemplo.invalid', 'TESTE-ESTADO-2',
          jsonb_build_array(jsonb_build_object('book_id', v_livro, 'title', 'Livro', 'price', 1000, 'quantity', 1)),
          1000, 'pending', 'pending', 'received', 'balcao', 'pickup')
  returning id into v_enc2;
  update public.stock_books set stock = stock - 1 where id = v_livro;
  update public.orders set status = 'confirmed' where id = v_enc2;
  update public.orders set payment_status = 'awaiting_confirmation' where id = v_enc2;
  select status into v_st from public.orders where id = v_enc2;
  r := r || format(E'\n09 "Confirmada" à mão mantém-se quando o pagamento mexe: %s', case when v_st = 'confirmed' then 'ok' else 'FALHA (' || v_st || ')' end);

  -- Cancelar pela entrega: estado cancelado, stock devolvido uma vez, cliente avisado.
  select stock into v_stock from public.stock_books where id = v_livro;
  update public.orders set delivery_status = 'cancelled' where id = v_enc2;
  select status into v_st from public.orders where id = v_enc2;
  r := r || format(E'\n10 entrega cancelada → estado cancelado: %s', case when v_st = 'cancelled' then 'ok' else 'FALHA (' || v_st || ')' end);
  select stock - v_stock into v_n from public.stock_books where id = v_livro;
  r := r || format(E'\n11 stock devolvido uma vez (+1): %s', case when v_n = 1 then 'ok' else 'FALHA (' || v_n || ')' end);
  select count(*) into v_n from public.customer_notifications where order_id = v_enc2 and title = 'Encomenda cancelada';
  r := r || format(E'\n12 cliente avisado do cancelamento uma vez: %s', case when v_n = 1 then 'ok' else 'FALHA (' || v_n || ')' end);
  select count(*) into v_n from public.security_audit_log where table_name = 'orders' and row_id = v_enc2 and changes ? 'status';
  r := r || format(E'\n13 cancelamento entra no registo de segurança: %s', case when v_n >= 1 then 'ok' else 'FALHA (' || v_n || ')' end);

  -- Cancelada é definitiva: um pagamento que chega depois não a reabre.
  update public.orders set payment_status = 'paid' where id = v_enc2;
  select status into v_st from public.orders where id = v_enc2;
  r := r || format(E'\n14 cancelada continua cancelada com pagamento depois: %s', case when v_st = 'cancelled' then 'ok' else 'FALHA (' || v_st || ')' end);

  raise exception 'RESULTADO (nada foi gravado)%', r;
end
$teste$;

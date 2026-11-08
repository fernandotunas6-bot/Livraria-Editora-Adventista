-- Equipas (staff_teams, staff_team_members) e cinco índices de chaves estrangeiras.
--
-- 1. A leitura das equipas verificava só o papel ("admin" ou "manager") e não a verificação
--    em dois passos que todas as outras regras da equipa pedem (`private.is_staff`): quem
--    tem um factor MFA e entrou só com a palavra-passe (sessão aal1) lia as equipas, os
--    membros e os canais de aviso de cada um. Passa a `private.is_staff()`.
-- 2. A escrita era uma regra FOR ALL, que também conta como leitura: duas regras de leitura
--    na mesma tabela (advisor "multiple_permissive_policies"). Fica partida em inserir,
--    alterar e apagar, com a mesma condição (`manage_users`).
-- 3. Cinco chaves estrangeiras sem índice (advisor "unindexed_foreign_keys"), todas colunas
--    de "quem fez".

do $$
declare
  t text;
begin
  foreach t in array array['staff_teams', 'staff_team_members'] loop
    execute format('drop policy if exists %I on public.%I', t || ': equipa lê', t);
    execute format('drop policy if exists %I on public.%I', t || ': gestão de utilizadores altera', t);
    execute format('drop policy if exists %I on public.%I', t || ': gestão de utilizadores cria', t);
    execute format('drop policy if exists %I on public.%I', t || ': gestão de utilizadores apaga', t);

    execute format('create policy %I on public.%I for select to authenticated using ((select private.is_staff()))',
      t || ': equipa lê', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select private.has_permission(''manage_users'')))',
      t || ': gestão de utilizadores cria', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select private.has_permission(''manage_users''))) with check ((select private.has_permission(''manage_users'')))',
      t || ': gestão de utilizadores altera', t);
    execute format('create policy %I on public.%I for delete to authenticated using ((select private.has_permission(''manage_users'')))',
      t || ': gestão de utilizadores apaga', t);
  end loop;
end
$$;

create index if not exists order_alerts_acknowledged_by_idx on public.order_alerts (acknowledged_by);
create index if not exists orders_acknowledged_by_idx on public.orders (acknowledged_by);
create index if not exists staff_ops_settings_updated_by_idx on public.staff_ops_settings (updated_by);
create index if not exists support_saved_replies_created_by_idx on public.support_saved_replies (created_by);
create index if not exists support_ticket_events_actor_id_idx on public.support_ticket_events (actor_id);

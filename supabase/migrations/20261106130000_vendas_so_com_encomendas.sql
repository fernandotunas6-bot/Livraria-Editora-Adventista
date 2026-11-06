-- Painel "Vendas por loja": a leitura passa a exigir "Gerir Encomendas".
--
-- Lia-se com `private.is_staff()`, ou seja, qualquer gestor com uma permissão qualquer — um
-- gestor só com "Gerir Catálogo" ou só com "Marketing" via a facturação mensal de cada loja,
-- as metas e as notas. As encomendas, de onde vêm os mesmos números, já pediam
-- `manage_orders`. O painel mostra o separador com a mesma regra (`canManageOrders`).
--
-- As escritas continuam só para administradores, como estavam.
-- Reverter: voltar a criar as duas políticas com `(select private.is_staff())`.

drop policy if exists "vendas_anos: staff lê" on public.vendas_anos;
create policy "vendas_anos: encomendas lê" on public.vendas_anos for select to authenticated
  using ((select private.has_permission('manage_orders')));

drop policy if exists "painel_vendas_docs: staff lê" on public.painel_vendas_docs;
create policy "painel_vendas_docs: encomendas lê" on public.painel_vendas_docs for select to authenticated
  using ((select private.has_permission('manage_orders')));

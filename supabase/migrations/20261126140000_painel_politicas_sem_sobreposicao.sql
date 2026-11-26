-- O aviso de desempenho do Supabase «multiple_permissive_policies» em painel_rodape e painel_tv_midia: a política de
-- escrita era «for all» e cobria também a leitura, ao lado da de leitura — o Postgres avaliava as duas em cada
-- leitura. Fica uma política de leitura com as duas condições, e as de escrita (inserir, alterar, apagar) à parte.
-- Quem lê e quem escreve não muda.

do $$
declare
  t text;
  escreve constant text := '((select private.has_permission(''manage_settings'')) or (select private.has_permission(''edit_reports'')))';
  ve constant text := '((select private.painel_ve_tudo()) or cardinality((select private.painel_lojas_proprias())) > 0)';
begin
  foreach t in array array['painel_rodape', 'painel_tv_midia'] loop
    execute format('drop policy if exists %I on public.%I', t || ': configurações ou relatórios', t);
    execute format('drop policy if exists %I on public.%I', t || ': quem vê o painel', t);
    execute format('drop policy if exists %I on public.%I', t || ': quem lê', t);
    execute format('drop policy if exists %I on public.%I', t || ': configurações ou relatórios inserem', t);
    execute format('drop policy if exists %I on public.%I', t || ': configurações ou relatórios alteram', t);
    execute format('drop policy if exists %I on public.%I', t || ': configurações ou relatórios apagam', t);
    execute format('create policy %I on public.%I for select to authenticated using (%s or %s)', t || ': quem lê', t, escreve, ve);
    execute format('create policy %I on public.%I for insert to authenticated with check (%s)', t || ': configurações ou relatórios inserem', t, escreve);
    execute format('create policy %I on public.%I for update to authenticated using (%s) with check (%s)', t || ': configurações ou relatórios alteram', t, escreve, escreve);
    execute format('create policy %I on public.%I for delete to authenticated using (%s)', t || ': configurações ou relatórios apagam', t, escreve);
  end loop;
end $$;

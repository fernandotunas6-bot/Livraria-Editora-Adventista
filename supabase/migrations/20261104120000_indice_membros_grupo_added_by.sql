-- Índice para a chave estrangeira contact_group_members.added_by (→ profiles), que o advisor
-- de desempenho apontou depois da migração dos grupos de contactos (20261103230000).
-- Sem ele, apagar um perfil obriga o Postgres a percorrer a tabela inteira para aplicar o
-- `on delete set null`. Só acrescenta um índice; seguro de repetir.
create index if not exists contact_group_members_added_by_idx
  on public.contact_group_members (added_by);

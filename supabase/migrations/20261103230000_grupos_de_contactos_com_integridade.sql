-- Membros dos grupos de contactos numa tabela própria, em vez de um array jsonb.
--
-- `contact_groups.member_ids` era um `jsonb` com ids de contactos. Três problemas:
--
-- 1. **Sem integridade.** Apagar um contacto deixava o id dentro do array. O envio ia buscar
--    os contactos com `in (member_ids)`, não encontrava esse, e seguia em silêncio: o grupo
--    dizia ter 40 membros e a campanha saía para 37, sem nada a assinalar a diferença.
-- 2. **Sem índice.** Responder a "em que grupos está este contacto?" obrigava a ler todos os
--    grupos e percorrer os arrays em memória.
-- 3. **Escrita por substituição.** Acrescentar um membro reescrevia o array inteiro, por isso
--    duas pessoas a adicionar contactos ao mesmo tempo perdiam o trabalho uma da outra.
--
-- O `member_ids` **continua a existir e a ser actualizado por trigger**, para o painel e a
-- Edge Function publicada não quebrarem enquanto não passarem a ler a tabela nova. A fonte da
-- verdade passa a ser `contact_group_members`.

create table if not exists public.contact_group_members (
  group_id text not null references public.contact_groups(id) on delete cascade,
  contact_id text not null references public.contacts(id) on delete cascade,
  added_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created timestamptz not null default now(),
  primary key (group_id, contact_id)
);

-- A chave primária já indexa `group_id` (é a primeira coluna). Este índice serve o sentido
-- inverso: "em que grupos está este contacto", que é o que a ficha do contacto precisa.
create index if not exists contact_group_members_contact_idx
  on public.contact_group_members (contact_id);

-- Preenchimento a partir dos arrays existentes.
--
-- O `join` com `contacts` é o que limpa os ids órfãos: um id que já não exista não entra. O
-- aviso diz quantos se perderam, para o número não desaparecer sem registo.
--
-- Corre antes de o trigger existir, de propósito: com o trigger criado, cada linha inserida
-- reescrevia o `member_ids` do grupo inteiro.
do $$
declare
  v_inseridos integer := 0;
  v_orfaos integer := 0;
begin
  select count(*) into v_orfaos
  from public.contact_groups g
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(g.member_ids) = 'array' then g.member_ids else '[]'::jsonb end
  ) as e(value)
  where not exists (select 1 from public.contacts c where c.id = e.value #>> '{}');

  insert into public.contact_group_members (group_id, contact_id, added_by)
  select g.id, e.value #>> '{}', null
  from public.contact_groups g
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(g.member_ids) = 'array' then g.member_ids else '[]'::jsonb end
  ) as e(value)
  join public.contacts c on c.id = e.value #>> '{}'
  on conflict do nothing;

  get diagnostics v_inseridos = row_count;
  raise notice 'Membros de grupos migrados: % (ids órfãos descartados: %).', v_inseridos, v_orfaos;
end
$$;

-- `member_ids` mantido em sincronia a partir da tabela.
--
-- `security definer` porque o trigger escreve em `contact_groups` em nome de quem mexeu nos
-- membros. `search_path` vazio e nomes qualificados: é o que impede um schema plantado na
-- sessão de capturar a chamada.
create or replace function private.sync_contact_group_member_ids()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group text := coalesce(new.group_id, old.group_id);
begin
  update public.contact_groups
     set member_ids = coalesce(
           (select jsonb_agg(m.contact_id order by m.created)
              from public.contact_group_members m
             where m.group_id = v_group),
           '[]'::jsonb),
         updated = now()
   where id = v_group;
  return null;
end;
$$;

drop trigger if exists contact_group_members_sync on public.contact_group_members;
create trigger contact_group_members_sync
  after insert or delete on public.contact_group_members
  for each row execute function private.sync_contact_group_member_ids();

-- Sincronização única depois do preenchimento: é o que retira dos arrays os ids órfãos que
-- não entraram na tabela. Sem isto, o painel continuaria a contar membros que não existem.
update public.contact_groups g
   set member_ids = coalesce(
         (select jsonb_agg(m.contact_id order by m.created)
            from public.contact_group_members m
           where m.group_id = g.id),
         '[]'::jsonb)
 where coalesce(g.member_ids, '[]'::jsonb) <> coalesce(
         (select jsonb_agg(m.contact_id order by m.created)
            from public.contact_group_members m
           where m.group_id = g.id),
         '[]'::jsonb);

-- RLS igual à dos grupos: quem pode mexer num grupo pode mexer nos seus membros.
alter table public.contact_group_members enable row level security;

create policy "contact_group_members: crm ou dono lê" on public.contact_group_members
  for select to authenticated using (
    (select private.has_permission('manage_users'))
    or (select private.has_permission('manage_marketing'))
    or exists (select 1 from public.contact_groups g where g.id = group_id and g.owner = (select auth.uid()))
  );
create policy "contact_group_members: crm ou dono cria" on public.contact_group_members
  for insert to authenticated with check (
    (select private.has_permission('manage_users'))
    or (select private.has_permission('manage_marketing'))
    or exists (select 1 from public.contact_groups g where g.id = group_id and g.owner = (select auth.uid()))
  );
create policy "contact_group_members: crm ou dono apaga" on public.contact_group_members
  for delete to authenticated using (
    (select private.has_permission('manage_users'))
    or (select private.has_permission('manage_marketing'))
    or exists (select 1 from public.contact_groups g where g.id = group_id and g.owner = (select auth.uid()))
  );
-- Sem `update`: uma linha destas só faz sentido existir ou não existir.

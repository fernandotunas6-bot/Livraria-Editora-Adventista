-- `private.has_permission` passa a exigir o booleano JSON `true`, como o site já exigia.
--
-- Estava `coalesce(p.permissions ->> p_key, '') = 'true'`. O `->>` devolve texto, e devolve o
-- mesmo `'true'` para duas coisas diferentes: o booleano JSON `true` e a *string* `"true"`.
-- Ou seja, `{"manage_users": "true"}` dava a permissão.
--
-- O lado do site é estrito: `can()` em `supabase/functions/app/permissions.ts` compara com
-- `=== true`, e o comentário lá diz que é de propósito, para que `"false"`, `0` ou `null` não
-- passem por engano. As duas funções declaram ser cópia fiel uma da outra e não eram: o
-- desacordo estava no lado que manda de facto, o RLS, e abria em vez de fechar.
--
-- Não era explorável — só admin e o service role escrevem `permissions`, e `cleanPermissions`
-- na Edge Function força booleanos — mas a invariante vale mais verificada do que prometida:
-- um `permissions` escrito à mão em SQL, ou um dia em que alguém guarde o formulário sem
-- passar pelo `cleanPermissions`, já não dá acesso a mais ninguém.
--
-- `->` devolve jsonb, e a comparação com `'true'::jsonb` só é verdadeira para o booleano.
-- Chave em falta dá `null`, que o `coalesce` de fora resolve para `false`.
--
-- O resto da função fica igual, `private.mfa_satisfied()` incluído (migração
-- `verificacao_dois_passos_equipa`).
--
-- Reverter: voltar a `coalesce(p.permissions ->> p_key, '') = 'true'`.

create or replace function private.has_permission(p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select p.role = 'admin' or (p.role = 'manager' and (p.permissions -> p_key) = 'true'::jsonb)
    from public.profiles p
    where p.id = auth.uid()
  ), false)
     and private.mfa_satisfied();
$$;

comment on function private.has_permission(text) is
  'Admin pode tudo; gestor só as chaves com o booleano JSON true. Exige sessão aal2 quando a conta tem factor MFA verificado.';

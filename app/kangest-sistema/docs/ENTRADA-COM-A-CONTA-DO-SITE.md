# Entrar no KanGest com a conta do site

Cada pessoa da equipa entra no KanGest Livraria com a sua conta do site da livraria: o email, a senha e, se a conta
tem os dois passos, o código da aplicação. É a parte J do plano (decisões do dono de 2026-11-25).

## Quem entra e com que perfil

Decide-se no site, em *Utilizadores → Permissões* ou nos cargos, área *Sistema*:
- **KanGest: caixa** dá o perfil Caixa (o POS);
- **KanGest: gestor** dá o perfil Gestor: vendas, compras, stock e relatórios, sem a administração do programa;
- **o administrador do site** entra como Gestor;
- **o perfil Administrador do KanGest nunca vem do site.** Fica sempre a **conta ADMIN local** de recurso, que entra
  com o nome de acesso e a senha de cá, como antes.

Sem nenhuma das duas permissões, a conta do site não entra («A sua conta do site não tem acesso ao KanGest»). O site
responde pela `public.kangest_eu(p_posto)` (migrações `20261126100000` e `20261126120000`, docs/KANGEST.md §5.4).

- **Os dois passos:** uma conta da equipa sem os dois passos, depois do prazo do site, não tem perfil. A entrada diz
  para os activar: entra-se no painel do site, que os pede, e volta-se a entrar aqui com o código.
- **A loja da ficha:** o KanGest manda à `kangest_eu` o id do seu posto.
  - Com o perfil Caixa, só se entra nos postos da loja da ficha de funcionário («A sua ficha de funcionário é de
    outra loja»).
  - Um Gestor entra em qualquer loja, e quem não tem ficha com loja também.

## Como funciona

No ecrã de entrada, escreve-se o email no campo do utilizador (`src/sinc/entrada.rs` e `services/auth.rs`,
`login_site`).

**Com Internet:**
- O site confirma a senha e, se a conta tem os dois passos, o código. O ecrã pede o código como para as contas
  locais.
- O site diz o perfil. O utilizador local fica criado ou actualizado, ligado à conta do site (`conta_site`, migração
  0065), com o nome, o email e o perfil de lá.
- **Se o perfil mudou no site,** as permissões próprias de cá deixam de valer: nunca ficam permissões a mais.
- A sessão do site fica guardada para a *Loja online*, que já não pede a conta outra vez.

**Sem Internet** (ou sem resposta do site):
- **A cópia local vale 7 dias** desde a última entrada com Internet, com a mesma senha. A senha fica só como resumo,
  como a dos utilizadores locais.
- **Um relógio atrasado** em relação a essa entrada não conta a favor: a cópia deixa de valer.
- **Uma conta que nunca entrou neste KanGest** precisa da Internet na primeira vez.

**O que continua como sempre:**
- o bloqueio por tentativas falhadas, a conta desactivada (o administrador pode desactivá-la só neste KanGest) e a
  confirmação da troca de conta;
- **o PIN do POS**, que cada pessoa define cá.

**O que muda:**
- **A senha é a do site:** *Mudar a senha* recusa, e muda-se no site. A entrada seguinte com Internet actualiza a
  cópia daqui.
- **Se o site tirar o acesso** (as permissões ou o cargo), a entrada seguinte com Internet recusa, e a cópia local
  deixa logo de valer.

Em *Sistema → Utilizadores*, as contas do site aparecem com «Conta do site».

## Testes

- `sinc/entrada.rs`:
  - o perfil (só Gestor ou Caixa, nunca Administrador);
  - a validade da cópia (7 dias, e não com o relógio atrasado);
  - o factor dos dois passos.
- `services/tests.rs` (`entrar_com_a_conta_do_site`), com um site falso:
  - a senha errada;
  - a caixa e o gestor, este com o código;
  - a conta sem acesso;
  - a sessão do site para a Loja online;
  - a mudança de senha recusada;
  - sem Internet, a cópia, a senha errada, a conta que nunca entrou e a cópia vencida;
  - a conta ADMIN local.

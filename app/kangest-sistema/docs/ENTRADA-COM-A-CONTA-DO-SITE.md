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
- A sessão do site fica **só em memória** para a *Loja online* (KANGEST ONE, migração 0069): nunca vai para o disco,
  e ao fechar o programa perde-se. A cada abertura entra-se outra vez.

**Sem Internet** (ou sem resposta do site):
- **A cópia local vale 7 dias** desde a última entrada com Internet, com a mesma senha. A senha fica só como resumo,
  como a dos utilizadores locais.
- **Um relógio atrasado** em relação a essa entrada não conta a favor: a cópia deixa de valer.
- **Uma conta que nunca entrou neste KanGest** precisa da Internet na primeira vez.
- **O modo limitado:** a sessão fica marcada `offline` e a barra mostra «Modo sem Internet». Vende-se e factura-se,
  mas a Loja online, a confirmação de pagamentos e o atendimento precisam da Internet (não há tokens).

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

## Uma só identidade (KANGEST ONE, decisão do dono de 26/11)

Num KanGest **ligado ao site** (o posto emparelhado e activo), todas as pessoas entram com a conta do site:
- **As contas locais que já existem** (sem `conta_site`, não ADMIN) continuam a entrar até à data-limite, com um aviso
  na barra para se ligarem à conta do site. A migração 0070 põe a data a 30 dias; o administrador muda-a em
  *Sistema → Utilizadores* («Contas locais»), e a mudança fica na auditoria (`CONTAS_LOCAIS`).
- **Depois da data,** essas contas só consultam: ficam apenas com «Ver relatórios», e a barra diz porquê. Nada se
  apaga: o histórico dos documentos continua a apontar para elas.
- **Contas locais novas:** só a do ADMIN de recurso. As outras criam-se no painel do site (Utilizadores → Permissões).
- **Ligar a conta:** a pessoa entra com o email da conta do site; o KanGest cria o utilizador ligado (`conta_site`).

Num KanGest **isolado** (sem ligação ao site), nada disto muda.

**O ecrã de entrada** mostra, por baixo do formulário, a ligação ao servidor central (`setup.estado`, `ligacao`):
- «Ligado ao servidor central», com a loja, se a última volta correu bem nos últimos 10 minutos;
- senão, o aviso do modo limitado: com a conta do site vende-se e factura-se, mas a loja online e a confirmação de
  pagamentos esperam pela Internet;
- e sempre a versão do KanGest. Confere-se de 30 em 30 segundos.

**O painel do site vê quem está dentro** de cada KanGest e pode terminar uma sessão; cada entrada do ADMIN de recurso
avisa os administradores (docs/KANGEST-SINCRONIZACAO.md §14).

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
- `services/tests.rs` (`a_regra_das_contas_locais` e `a_identidade_unica_num_kangest_ligado_ao_site`):
  - isolado, a conta local entra sem avisos;
  - ligado, a conta local entra com o aviso até à data e só consulta depois dela;
  - a conta local nova recusada, o ADMIN de recurso aceite e sem restrições.

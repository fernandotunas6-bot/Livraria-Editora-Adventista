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

- **Os dois passos:** desde 27/11 são opcionais também para a equipa (decisão do dono; o site pode voltar a torná-los
  obrigatórios no painel). Quem os activou entra com o código. Só com a obrigação ligada, uma conta da equipa sem
  eles, depois do prazo, não tem perfil, e a entrada diz para os activar no site.
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
  na barra para se ligarem à conta do site. O prazo é de 30 dias a contar da ligação ao site (o primeiro emparelhamento,
  ou outra vez depois de desligar), a menos que o administrador já tenha escolhido uma data mais tarde; muda-se em
  *Sistema → Utilizadores* («Contas locais»), e a mudança fica na auditoria (`CONTAS_LOCAIS`).
- **Depois da data,** essas contas só consultam: ficam apenas com «Ver relatórios», e a barra diz porquê. Nada se
  apaga: o histórico dos documentos continua a apontar para elas.
- **Contas locais novas:** só a do ADMIN de recurso. As outras criam-se no painel do site (Utilizadores → Permissões).
- **Ligar a conta, com o histórico.** Em *Sistema → Utilizadores* («Contas locais»), o administrador escreve o email da
  conta do site de cada pessoa (`utilizadores.ligarContaSite`, migração 0072, `ligar_conta_site`).
  - Na primeira vez que a pessoa entra com esse email, a conta local passa a ser a dela: o mesmo utilizador, com os
    documentos e o histórico, e o perfil vem do site.
  - Sem esse pedido, entrar com o email cria um utilizador novo, ligado à conta do site.
  - A conta ADMIN de recurso não se liga.
  - Cada pedido fica na auditoria (`LIGAR_CONTA_SITE`).
  - Ainda não se manda o convite por email, porque a produção não tem envio de email; a pessoa recebe o aviso por outra
    via.

Num KanGest **isolado** (sem ligação ao site), nada disto muda.

**O ecrã de entrada** mostra, por baixo do formulário, a ligação ao servidor central (`setup.estado`, `ligacao`):
- «Ligado ao servidor central», com a loja, se a última volta correu bem nos últimos 10 minutos;
- senão, o aviso do modo limitado: com a conta do site vende-se e factura-se, mas a loja online e a confirmação de
  pagamentos esperam pela Internet;
- e sempre a versão do KanGest. Confere-se de 30 em 30 segundos.

**O painel do site vê quem está dentro** de cada KanGest e pode terminar uma sessão; cada entrada do ADMIN de recurso
avisa os administradores (docs/KANGEST-SINCRONIZACAO.md §14).

## Entrar com o Google (27/11)

O Google está ligado no Supabase Auth do site. No programa instalado, com o KanGest ligado ao site e com Internet, o
ecrã de entrada tem «Entrar com o Google» (`sinc/entrada.rs`, `google_iniciar` e `google_concluir`).

**Como funciona:**
1. O KanGest gera um verificador do PKCE e um estado, e guarda-os só em memória, por dez minutos. Depois abre no
   navegador do sistema a entrada do Google do Auth do site (`/auth/v1/authorize`, com o desafio S256).
2. Depois do Google, o Auth devolve o código à página `/kangest/entrar/` do site (`app/web/public/kangest/entrar/`), com
   o estado no endereço.
3. Essa página não fala com o site nem guarda nada: passa o estado e o código ao KanGest pela ligação
   `kangest://auth` e limpa o endereço.
4. O KanGest (`ligacoes.rs`, `retorno_google`) avisa o ecrã de entrada («kangest-google»), e este pede a sessão.
5. Só uma entrada começada neste computador, com o mesmo estado e dentro do prazo, troca o código pela sessão
   (`grant_type=pkce`, com o verificador que nunca saiu daqui).

**Depois, é a entrada da conta do site:**
- os dois passos, se a conta os tem (a sessão do Google espera o código só em memória);
- quem é a pessoa (`kangest_eu`) e o perfil;
- a mesma conta local ligada a ela, com os bloqueios de sempre.
- **A cópia local da senha não muda:** sem Internet entra-se com a senha, e quem nunca entrou com ela só entra com a
  Internet.

**Só no programa deste computador.** Um posto ligado pela rede, ou um browser, não recebe a ligação `kangest://`, por isso
o servidor recusa ali a entrada com o Google.

**Se o Google voltar ao início do site em vez de abrir o KanGest,** o Auth não aceitou o retorno. Nesse caso, junta-se
`https://livrariaadventista.ao/kangest/entrar/**` em Supabase → Authentication → URL Configuration → Redirect URLs. O
site já usa o retorno para qualquer página dele, por isso deve estar aceite.

## A entrada nos dois sentidos (27/11)

Pedido do dono: «o login deve funcionar para os dois». Quem tem a sessão de um lado entra no outro sem escrever a
senha outra vez.

### Do site para o KanGest: «Entrar com a sessão do site»

No ecrã de entrada, ao lado do Google, com o KanGest ligado e com Internet (`sinc/entrada.rs`, `site_iniciar`):

1. O KanGest gera o verificador do PKCE e o estado, só em memória, e abre no navegador do sistema
   `/kangest/entrar-com-o-site?e=<estado>&d=<desafio S256>`.
2. A página do site (`KanGestEntrarComOSitePage.jsx`) precisa da sessão do site; sem ela, manda entrar primeiro e
   volta. Mostra com que conta se vai entrar e só segue quando a pessoa carrega em «Entrar no KanGest».
3. O site (`POST /kangest/entrar-com-o-site/codigo`, com a permissão Caixa ou Gestor do KanGest) dá um código de uso
   único preso ao desafio. Na base fica só o resumo SHA-256, por dois minutos (`private.kangest_entradas`, migração
   20261127170000).
4. A página devolve o código ao KanGest pela mesma ligação do Google (`kangest://auth?e=…&code=…`).
5. O KanGest troca o código com o verificador (`POST /kangest/entrar-com-o-site/trocar`):
   - o código gasta-se na primeira tentativa, certa ou errada;
   - o site só responde se o SHA-256 do verificador bater com o desafio. Quem apanhar o código na ligação não o
     consegue usar, porque o verificador nunca saiu do KanGest.
6. O site devolve o resumo de um link de entrada da conta (`admin.generateLink`, sem email). O KanGest troca-o no Auth
   (`/auth/v1/verify`) por uma sessão só sua, em memória.
7. Daí em diante é a entrada da conta do site, como com o Google: os dois passos no KanGest, se a conta os tem;
   `kangest_eu`; e a mesma conta local, sem mudar a cópia local da senha.

### Do KanGest para o site: abrir o painel já com a sessão

Os botões que abrem o painel do site (a encomenda, o produto, os pagamentos, o atendimento) usam `abrirNoSite`
(`src/lib/site.ts`):

1. O KanGest pede ao site, com a sessão da pessoa (`loja.conta.abrir_no_site` →
   `POST /kangest/abrir-no-site`, com a permissão Caixa ou Gestor), um endereço para a página.
2. **Só as páginas permitidas** (`destinoNoSite`, em `supabase/functions/app/kangestEntrada.ts`): o painel, a gestão, o
   perfil, a loja, um produto, o rastreio, as lojas, a comunidade e as novidades. Nunca outro endereço.
3. O site devolve `/kangest/abrir#t=<resumo>&d=<destino>`, com o resumo de um link de entrada da **própria conta**:
   - o fragmento (`#`) não chega a nenhum servidor nem fica nos registos;
   - a página (`KanGestAbrirPage.jsx`) tira-o logo do endereço, troca-o por uma sessão (`verifyOtp`) e segue para o
     destino. Só serve uma vez.
4. **No programa, abre no navegador do KanGest em sessão privada:** a sessão do site não fica guardada no computador da
   loja para a pessoa seguinte.
5. **Sem a sessão do site** (entrou com a senha local, ou está sem Internet), a página abre como antes e o site pede a
   entrada.
6. **A sessão que o navegador recebe é de um só passo:** quem tem os dois passos escreve o código no painel, como em
   qualquer entrada.

## Testes

- `sinc/entrada.rs`:
  - o desafio do PKCE (o exemplo da RFC 7636), o estado e a página de retorno (só em HTTPS);
  - uma entrada com o Google que não começou aqui, com outro estado ou fora do prazo, é recusada sem perguntar ao site;
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
- `ligacoes.rs`: o retorno `kangest://auth` só com um estado válido, e um código com caracteres estranhos não passa.
- `app/web/src/lib/kangestEntrar.test.js`: a página de retorno passa o estado e o código (ou o erro), e recusa um endereço
  sem estado.

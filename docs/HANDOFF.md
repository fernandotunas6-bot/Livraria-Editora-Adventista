# Passagem de trabalho — Livraria Adventista

Estado em 2026-11-10. Ponto de partida para o próximo agente ou pessoa que pegue neste projecto.

## Fotografias das lojas (2026-11-13, ramo `claude/beautiful-maxwell-1q8dks`)

- **Pedido do dono:** as fotografias da loja do Huambo e os contactos dela; as das outras lojas
  vêm a seguir. Resposta à pergunta dos dois números: o mesmo (923 428 459) para chamadas e para
  WhatsApp.
- **As fotografias** ficam no próprio site, em `app/web/public/images/lojas/`, em WebP de 1280 e
  480 px geradas por `python3 scripts/imagens/lojas.py <slug> <foto...>`. Servidas pelo site, e
  não por Storage, entram no CSP (`img-src 'self'`) sem excepções. Das cinco que a loja mandou
  entraram quatro: a quinta repetia o balcão da primeira.
- **Base de dados:** `20261113103000_fotografias_das_lojas`, **por aplicar** (vai no merge).
  Junta `physical_stores.gallery` (jsonb, lista de `{url, caption}`, no máximo 24 e 4 KB) e põe
  as do Huambo, a miniatura e o telefone — que estava vazio desde a limpeza dos números
  provisórios. Só escreve onde o campo está vazio, por isso não desfaz nada que o painel tenha
  entretanto guardado.
- **Site:** a página das lojas mostra as fotografias da loja escolhida (`StoreGallery.jsx`, abre
  em grande com legenda e setas) e a miniatura do cartão passa a pedir a variante de 480 px.
- **Huíla (Lubango), a seguir:** as cinco fotografias que a loja mandou (fachada, equipa,
  prateleiras, livros ao perto, balcão) e o horário que está escrito na porta — segunda a quinta
  8h–17h30, sexta, domingo e feriados 8h–13h. Migração `20261113143000_fotografias_do_lubango`,
  também **por aplicar**. Substitui o horário de omissão do painel («Seg–Sex 9h–18h, Sáb
  9h–13h»), que punha a loja aberta ao sábado; um horário escrito à mão fica como está. Sem
  telefone: a loja ainda não deu nenhum.
- **A galeria passou para o painel** (Lojas → editar → «Fotografias da loja»,
  `components/admin/StoreGalleryField.jsx`): juntar, remover, reordenar e legendar, com a
  fotografia a ir para o Storage (pasta `physical_stores`, permissão «Configurações»). Até 12
  fotografias e legendas de 80 caracteres, por folga sobre a restrição da coluna — o painel
  avisa antes de a base de dados recusar, e não deixa guardar com um envio a meio. A lista das
  lojas ganhou o número de fotografias e o filtro «Sem fotografias».
- **Para a loja seguinte:** já não é preciso migração nenhuma — a equipa carrega as fotografias
  pelo painel. Por código, continua a dar: `python3 scripts/imagens/lojas.py <slug> <foto...>`
  (ficheiros do site, mais leves e sem passar pelo Storage) e uma migração com a `gallery`.

## Análise geral e melhorias (2026-11-10, ramo `claude/clever-carson-ibv73h`)

- **Pedido do dono:** "fazer uma análise em todo o sistema e melhorar onde for necessário".
  Respostas às perguntas: incluir a migração dos privilégios e abrir PR. Achados e correcções em
  [audits/livraria-premium-360.md](audits/livraria-premium-360.md), secção **J** (A360-34 a 41).
- **Antes de mexer**, tudo verde: lint, 1 613 testes, build, `npm audit`, segredos, Playwright
  18/18, os 12 grupos de cenários PGlite. Depois: 1 631 testes, Playwright 19 (+1 só no
  computador), cenários com +8 verificações, `deno check` verde.
- **O mais importante:** um gestor com `manage_users` conseguia entrar na conta de um cliente
  sem conta criando-a ele próprio (A360-34). Agora só um administrador escolhe a palavra-passe.
- **Base de dados:** `20261110120000_privilegios_minimos` e
  `20261110121000_descricoes_sem_avaliacoes`, **por aplicar** (vão no merge, com a Edge
  Function). A segunda tira as avaliações de clientes da CPB (com nomes) de 26 descrições dos
  produtos novos, que estão ocultos.
- **Site:** sessão (perfil perdido numa falha de rede, token caducado em 8 sítios), rastreio,
  carrinho, sucesso, portes; loja no telemóvel com livros no 1.º ecrã; DOMPurify fora do arranque
  (bloco principal −12 KB comprimidos); "reduzir movimento" no framer-motion.
- **Fica para o dono** (sem mudança): os itens 👤 da auditoria (email, gateway, MFA, contactos,
  termos, facturação) e a decisão sobre `/confirm-delivery` numa encomenda a pagar na entrega.
- **Não verificado:** o painel com uma sessão de equipa real e a loja publicada (a rede desta
  sessão não chega ao domínio); a auditoria visual corre no PR.
- **Continuação ("continua"), mesmo ramo:** herói com variantes de 960/1280 px e sem fades no
  primeiro desenho; fontes servidas pela loja; capas na mesma origem; dados da ficha pedidos no
  arranque. LCP da inicial no telemóvel 5,17 → 4,21 s (densidade 1). Medições e o que falta em
  audits/livraria-premium-360.md, secção J. Ao juntar ou trocar um slide em
  `public/images/site`, correr `python3 scripts/imagens/variantes.py`: sem isso o slide novo
  funciona, mas sem `srcset` (o telemóvel desce os 1920 px).
- **2.ª continuação: saúde do site (A360-16).** Erros de JavaScript e Core Web Vitals medidos em
  quem visita (`lib/telemetry.js` → `POST /telemetria` → `private.site_events`), vistos em
  Sistema → Saúde do site. Migração `20261111090000_saude_do_site`, **por aplicar** (vai no merge).
  Política de privacidade actualizada. Com uma ou duas semanas de dados, o p75 do LCP e do INP no
  telemóvel diz o próximo passo do A360-28.

## Auditoria Premium 360° (2026-11-09, ramo `claude/auditoria-premium-360`)

- **Pedido do dono:** auditoria 360° com critérios verificáveis (WCAG 2.2 AA, OWASP ASVS 5.0,
  Core Web Vitals, Baymard) e "melhorar onde puder". Relatório em
  [audits/livraria-premium-360.md](audits/livraria-premium-360.md); resumo em
  [AUDITORIA.md](AUDITORIA.md), secção **9.22**.
- **No PR:** só frontend e scripts de build (sem migrações nem Edge Function). O pós-build passa
  a escrever `shop.html`, `faq.html`… (10 páginas fixas com o seu canonical); JSON-LD na ficha e
  no `index.html`; salto para o conteúdo; carrossel com Parar/Retomar e "reduzir movimento".
- **Fica por fazer, e é do dono:** email (A360-01/02), gateway (A360-03), reconciliação das
  encomendas entregues por pagar (A360-04), MFA (A360-05), contactos da loja (A360-07).
- **Auditoria visual:** `.github/workflows/auditoria-visual.yml` (Playwright + axe-core). Num PR
  constrói e serve o site do PR; à mão (Run workflow) audita a loja publicada. Resultados no ramo
  `auditoria-visual` (substituído a cada execução). Primeira medição: LCP do telemóvel 4,3–6,1 s
  em todas as páginas (A360-28). 1.º passo no PR: carrinho (agora `ShoppingCart.jsx` é um
  invólucro e o checkout está em `ShoppingCartPanel.jsx`), assistente e pagamentos do rodapé só
  ao primeiro gesto ou 6 s depois do load (`hooks/useAfterLoad.js`) — LCP médio −8 a −9 % (duas medições). Seguinte:
  `srcset` no herói, a ficha do livro, o `vendor-motion` e os tipos de letra.
- **Não verificado nesta passagem:** medições de campo (INP), o painel com sessão de equipa e o
  pagamento em sandbox.

## Trajeto da encomenda com GPS dos dois lados (2026-11-08, ramo `claude/vigilant-edison-lp6gpg`)

- **Pedido do dono:** "refinar também o trajeto da encomenda, GPS refinado dos dois lados, de quem
  recebe e de quem envia". Guia em [TRAJETO_GPS.md](TRAJETO_GPS.md); achados 157–160 em
  [AUDITORIA.md](AUDITORIA.md), secção **9.20**.
- **Quem recebe:** no checkout, a localização espera pela leitura mais precisa (até 15 s), diz a
  precisão e afina-se no mapa. No rastreio, "Trajeto da entrega": o ponto de entrega e, a caminho,
  quem a leva (primeiro nome), o caminho, a distância e o tempo estimado, de 15 em 15 s; "Afinar o
  ponto" até ser entregue (o colportor é avisado).
- **Quem entrega:** o colportor (Entregas) e a equipa (Encomendas, nas entregas que não foram para
  um colportor) vêem o ponto do cliente, navegam (Google Maps, Waze) e partilham a posição depois de
  "Saiu para entrega" — de 10 em 10 s quando anda, com o ecrã ligado. A página tem de ficar aberta
  (um site não partilha em segundo plano).
- **Privacidade:** a posição só aparece a caminho e com notícias da última hora; apaga-se 7 dias
  depois (cron `trajetos-limpeza`).
- **Base de dados:** migração `20261108211000_trajeto_gps`, **por aplicar** (vai no merge, com a
  Edge Function: `/track/live`, `/track/destination`, a precisão no `/checkout`). Mapa: Leaflet
  1.9.4 (dependência nova, carregada só com o mapa) e mosaicos do OpenStreetMap. Cenários:
  `scripts/pglite/trajeto.mjs` (39).

## Edições digitais à venda sem envio (2026-11-08, ramo `claude/vigilant-edison-lp6gpg`)

- **Pedido do dono:** a fase seguinte dos livros digitais, "como os outros sistemas fazem": vender a
  edição digital sem pedir entrega nem levantamento, concluída ao pagar. Guia actualizado em
  [LIVROS_DIGITAIS.md](LIVROS_DIGITAIS.md); achados 151–156 em [AUDITORIA.md](AUDITORIA.md),
  secção **9.19**.
- **No painel:** «Edição digital» em cada edição (Versões) ou «Produto digital (PDF)» num produto sem
  edições: sem stock nem envio. O PDF tem de estar publicado em Materiais (PDF), ligado ao produto
  ou à edição. Em Pagamentos, "Disponível para" ganha "Edição digital".
- **Na loja:** uma por conta, com conta obrigatória; "Já é seu" na ficha de quem a tem. Só digitais:
  envio "Edição digital (sem envio)", sem portes, morada nem loja; só os pagamentos antecipados ou do
  gateway. Paga → "Na biblioteca" (entregue sozinha); pagamento anulado → volta a esperar. Com
  impressos, os portes contam só os impressos.
- **Base de dados:** migração `20261108210000_edicoes_digitais`, **por aplicar** (vai no merge, com
  a Edge Function: checkout, emails, vigilância e assistente). Cenários:
  `scripts/pglite/edicoes.mjs` (50).

## Refinar: a Editora e as finanças no Início, e «Pagamentos e caixa» em tempo real (2026-11-08, ramo `claude/gracious-hamilton-kfrbg8`, depois do #48)

- **Pedido do dono:** "continua a refinar", depois do deploy do #48 e da resolução dos PRs
  pendentes. Entraram o #41 (entregas) e o #40 e o #46, cada um com o main junto e testado. O #4 e
  o #3 foram fechados: o primeiro já estava todo no main, e o main já faz o que o segundo trazia.
- **Início:** quem gere a produção ou as finanças passa a ver em **Precisa de atenção**:
  - as etapas atrasadas, as ordens com o prazo passado e as que estão por concluir;
  - os salários de meses fechados por pagar e o que se deve aos fornecedores.

  Os números ficam ao lado da Produção e dos Funcionários, com atalhos para as três secções novas.
  O "Tudo em dia" passa a dizer só as áreas que a pessoa vê. Tabela em PAINEL_ADMIN.md, §4.1.
- **Pagamentos e caixa** em tempo real: a fila dos pagamentos por verificar recebe na hora o que
  o cliente indica (sinais `financas` e `orders`).
- **Telemóvel** (pedido do dono: "no mobile pode estar oculto"): o ícone de tempo real da barra
  do topo fica escondido abaixo de 768 px; o aviso "Sem ligação" continua à vista.
- **De passagem:**
  - o Início passava a largura do ecrã no telemóvel com encomendas de número e nome compridos. A
    grelha não tinha `grid-cols-1` e crescia até ao texto inteiro;
  - a mensagem "migrações por aplicar" de `productionApi.js` ainda dizia os números antigos
    (150000–152000).
- **Testes:**
  - `lib/editoraAttention.test.js` (datas fixas) e `AdminOverview.test.jsx`;
  - vitest: 179 ficheiros, 1481 testes;
  - no browser, contra a pilha local, 19 verificações:
    - o Início da produção e das finanças, os números e o "Ver";
    - uma etapa feita noutro lado que sai sozinha, e um pagamento indicado que aparece na fila sem
      recarregar;
    - o ícone escondido a 390 px e à vista a 768 e a 1440 px, com o "Sem ligação" à vista;
    - o Início sem deslocamento horizontal em todos os tamanhos.

## Produção da Editora, funcionários e saídas de dinheiro (2026-11-08, ramo `claude/gracious-hamilton-kfrbg8`)

- **Pedido do dono**, esclarecido por perguntas:
  - um **módulo de produção** da Editora;
  - nos funcionários, a ficha, os responsáveis por etapa e os salários. Na resposta marcou também
    "Nada por agora", que contradiz as outras escolhas; li as três que fazem sentido;
  - nos pagamentos, os pagamentos a fornecedores e à gráfica, e melhorar os dos clientes.

  Guia completo em [PRODUCAO.md](PRODUCAO.md).
- **Junto ao main depois do #44, do #45, do #47 e do #41:** o ramo tinha um tempo real próprio (tópicos
  `painel:<área>`), que se perdeu de propósito: ficou o do main (`private.realtime_signal`, canal
  `painel`, `useSignal`). As migrações mudaram de número porque `20261108150000` já existia em
  produção (`versoes_da_app`) e seria saltada sem aviso; e o `170000` é do #41.
- **Base de dados:** migrações `20261108190000_funcionarios`, `20261108191000_producao`,
  `20261108192000_saidas` e `20261108193000_sinais_afinados`, **por aplicar** (vão no merge).
  - **Permissões novas:** `manage_production`, `manage_staff` e `manage_finance`, nas três listas:
    `private.permission_keys` (redefinida em `funcionarios`; sem isso `users_admin_update` e os
    cargos apagavam-nas ao gravar), a Edge Function (`permissions.ts`, no mesmo deploy) e o painel.
    Uma migração futura que redefina `private.permission_keys` tem de as manter.
  - **Fichas:** fichas de funcionário com um só código FUN- por pessoa
    (`profiles_codigos_pessoa` passou a usar o código da ficha).
  - **Produção:** fornecedores (FOR-); ordens de produção (PRD-) com etapas por omissão,
    responsáveis e prazos; custos. `production_complete` põe a tiragem no stock uma só vez, com o
    motivo novo "producao" no histórico.
  - **Pagamentos a fornecedores:** só se anulam.
  - **Dinheiro dos funcionários:** salário, IBAN e NIF numa tabela só das finanças; salários por
    mês (`payroll_generate`).
  - **Relatório:** `cash_flow_report`.
  - **Registo de segurança:** guarda cada pagamento e anulação; IBAN e salário mudados avisam os
    administradores.
  - **Tempo real:** sinais `producao`, `funcionarios` e `financas` no canal `painel`, um por
    instrução (`private.painel_realtime_signal`). E um defeito do main corrigido
    (`sinais_afinados`): cada visita a um livro (`increment_book_views`) dava um sinal `catalogo`
    e fazia todos os painéis abertos voltar a pedir o catálogo.
- **Painel:**
  - **Grupo Editora**, secção Produção: Ordens, Etapas e prazos, Fornecedores, Contas e pagamentos.
  - **Grupo Pessoal**, secção Funcionários: Fichas e Salários.
  - **Relatórios → Entradas e saídas.**
  - **Métodos de pagamento:** no topo, a lista do que falta para os clientes pagarem (nome legal e
    NIF no recibo, telefone ou WhatsApp, prazo das encomendas por pagar, métodos sem dados,
    gateway). Em produção faltam os três primeiros: são dados do dono, não de código.
  - **Barra do topo:** «Em tempo real» com o canal do painel ligado, em vez de "Actualizado
    há…". O ícone continua o de actualizar (pedido do dono: "só muda o ícone… aquele círculo a
    girar quando estiver a actualizar") e roda também quando a actualização vem de um sinal. O
    canal liga-se para toda a equipa, não só para quem gere encomendas ou o catálogo.
  - **Defeito do main corrigido no site:** o `useSignal` ficava só com o último sinal de uma
    rajada. Uma encomenda nova manda «catalogo» e «orders» quase juntos, e o stock vendido não se
    via até à consulta de 5 em 5 minutos (o mesmo no perfil do cliente e no atendimento). Agora a
    chamada leva todos os sinais da rajada; teste no browser e uma mutação confirmaram.
  - **De passagem:** os números "0" a laranja nas vistas (a Colportagem também os mostrava), e os
    motivos da colportagem no histórico do stock, que apareciam como "Ajuste manual".
- **Testes:**
  - PGlite `scripts/pglite/producao.mjs`: 96 cenários. Mutações confirmaram que apanha concluir
    duas vezes e o sinal das visitas (sem `sinais_afinados`, dois falham). Os outros continuam
    certos: cargos e níveis 46 (a contagem das chaves passou a 13), pagamentos 91, conta 35,
    entregas 44, versões 39.
  - `npm test`: 167 ficheiros, 1408 testes. Lint, build e o detector de segredos certos.
  - Pilha local completa (Supabase CLI): todas as migrações aplicam do zero, e os sinais saem
    pelo `realtime.send` real.
  - No browser, contra essa pilha: 24 verificações, do fornecedor ao relatório e ao tempo real
    (lista em PRODUCAO.md, "Testes"). Apanharam um defeito a sério: o painel "Concluir" sem botão
    para voltar quando faltavam etapas.
- **Por decidir (dono):**
  - impostos dos salários: o sistema não calcula INSS nem IRT; escrevem-se nos descontos;
  - se os responsáveis sem a permissão da produção marcam as suas etapas;
  - avisos de prazo por email ou push.

## Livros digitais: só abrem pagos, biblioteca e acessos (2026-11-08, ramo `claude/vigilant-edison-lp6gpg`)

- **Pedido do dono:** "cada livro digital só pode ser descarregado se for pago; painel de abrir
  ligado ao pagamento; tudo bem organizado, como os outros sistemas fazem". Guia completo, com o passo
  a passo de venda e a comparação com outras lojas, em [LIVROS_DIGITAIS.md](LIVROS_DIGITAIS.md);
  achados 146–150 em [AUDITORIA.md](AUDITORIA.md), secção **9.18**.
- **Regra:** um PDF pago abre só com a encomenda **paga** (pagamentos confirmados pelo gateway ou por
  quem tem «Confirmar pagamentos») e fecha com o reembolso, o cancelamento ou um bloqueio. Antes
  também abria com a encomenda "entregue" ou com a recepção confirmada pelo cliente, sem pagamento.
  Uma só função decide (`private.can_download`).
- **Cliente:** Perfil → **Biblioteca** (`?tab=biblioteca`; `?tab=pdfs` continua a abrir) com cada
  livro comprado e o estado ligado ao pagamento: disponível (abrir/descarregar), pagamento por
  confirmar, por pagar e pago em parte (com o caminho para pagar), reembolsado, bloqueado. Aviso na
  conta "Livro digital disponível" quando a encomenda fica paga; o email, o WhatsApp e o push de
  "Pagamento confirmado" dizem que o livro está na biblioteca.
- **Equipa:** Catálogo → Materiais (PDF) → **Acessos e pagamentos**: quem comprou, o pagamento e o
  acesso, com filtros e procura; "Confirmar o pagamento" abre a encomenda; bloquear (com motivo) e
  desbloquear, no registo de segurança; cada download fica registado.
- **Base de dados:** migração `20261108160000_livros_digitais`, aplicada em produção com o PR #47.
  Cenários: `scripts/pglite/digitais.mjs` (59).
- **Fase seguinte:** feita a seguir (edições digitais sem envio, acima). Por decidir: limite de
  downloads e marca d'água com o nome do comprador.

## Telemóvel: entrar ao abrir a app, conta identificada e versões (2026-11-08, ramo `claude/vigilant-edison-lp6gpg`)

- **Pedido do dono:** "focar no mobile: auto login quando o aplicativo é aberto, identificar a conta
  registada a preencher, notificações push de actualização de versões". Achados 136–145 em
  [AUDITORIA.md](AUDITORIA.md), secção **9.17**; o funcionamento da entrada em
  [AUTENTICACAO_E_EMAILS.md](AUTENTICACAO_E_EMAILS.md), secção 1 ("No telemóvel…").
- **Entrar ao abrir a app:** a sessão já ficava guardada, mas abrir a app **sem rede** mais de uma
  hora depois tirava a pessoa da conta (achado 136) e, com rede fraca, a conta ficava 8 s a
  "verificar a sessão". Agora a conta aparece logo e só sai quando o servidor recusa a sessão. No
  Chrome/Android, a app pede ao navegador que guarde a palavra-passe e, sem sessão, entra sozinha
  com ela (uma vez por arranque; nunca depois de "Sair" nem de "Terminar em todos os aparelhos").
  Regras em `lib/authSession.js` e `lib/savedCredentials.js`; ligação em `lib/dataClient.js` e
  `hooks/useAuth.jsx`.
- **Conta identificada:** "Bem-vindo de volta, Maria" no `/login` e no modal, com o caminho com que
  entrou da última vez (palavra-passe com o gestor do navegador a preencher, ou a Google já na
  conta certa); "Não é Maria?" esquece-a. Registo com um email que já tem conta passa a "Entrar"
  (antes: "enviámos um link" que nunca chegava).
- **Versões:** cada build escreve `/version.json` (`scripts/app-version.mjs`); a app aberta avisa
  "Nova versão da app disponível — Actualizar" (ao abrir, ao voltar ao ecrã, de 30 em 30 min).
  Painel → Sistema → **Versões da app**: escrever o que mudou, publicar em `/novidades` e, se valer a
  pena, **avisar todos os aparelhos por push** (uma vez por novidade; a Edge Function envia em lotes
  e o agendador `avisos-equipa` continua). No perfil, cada aparelho pode desligar só as novidades.
- **Base de dados:** migração `20261108150000_versoes_da_app`, **por aplicar** (vai no merge, com a
  Edge Function: rotas `/admin/releases/notify` e `/admin/releases/devices`, `app_updates` no
  `/push/subscribe`, novidades no `/cron/staff-dispatch`). Cenários: `scripts/pglite/versoes.mjs` (39).
- **Como se testou:** build de produção num Chromium com perfil de telemóvel (Playwright), Supabase
  simulado na rede (20 verificações, entre elas abrir o perfil sem rede com o token expirado);
  PGlite com as 103 migrações (já com o `main` do PR #44); `npm test` (1386), lint, build, `deno check`.
- **Para o dono:** nada obrigatório. Para anunciar uma versão: painel → Versões da app → "Novas
  novidades" → Publicar → "Avisar todos por push" (precisa do push ligado, como já está). Guardar o
  push para mudanças que interessam aos clientes: cada aviso chega a todos.

## Análise por perfil: visitante, cliente, funcionário e gestor (2026-11-08, ramo `claude/nifty-archimedes-44rw4k`)

- **Pedido do dono:** "análise crítica e de estética em todo o sistema e adicionar o que falta na
  óptica do utilizador e gestor e cliente funcionário". Detalhe e verificação em
  [AUDITORIA.md](AUDITORIA.md), secção **9.16** (achados 118–135).
- **Cliente:** cancela sozinho uma encomenda por pagar que ainda não está em preparação (na conta e
  no rastreio, sem conta) — a mensagem do checkout mandava cancelar e não havia como; a conta mostra
  o estado em palavras simples, com o passo seguinte, barra de progresso e capas, "Comprar de novo",
  o código `CLI-`; descarrega os seus dados e apaga a conta (Lei 22/11; a política de privacidade
  diz agora onde); lista de desejos com "Juntar ao carrinho" e a data certa; "palavra-passe" em vez
  de "Password". Regras em `lib/customerOrders.js`, `supabase/functions/app/customerCancel.ts` e
  `public.order_cancel_by_customer` (as três têm de dizer o mesmo; há teste).
- **Funcionário:** os avisos "Nova encomenda — assumir" fecham-se quando a encomenda fica assumida por
  qualquer caminho (antes, só o botão; encomendas enviadas, entregues e canceladas continuavam a
  pedir "assumir"); barra de avisos compacta (no telemóvel tapava o ecrã); "Encomendas" abre na
  lista, com os relatórios dobrados no fim; cartões com pagamento e forma de entrega; aviso
  "Cancelada pelo cliente".
- **Gestor:** o Início diz como corre o mês, comparado com os mesmos dias do mês anterior, e o que se
  vende mais; relatórios sem "Kz 14 316,667", "Novembro De 2026", "1 pedidos" nem títulos
  sobrepostos no gráfico. Dinheiro sempre "Kz 14 500,00" (`lib/money.js`).
- **Base de dados:** migração `20261108120000_conta_do_cliente`, **por aplicar** (vai no merge, com a
  Edge Function). Cenários: `scripts/pglite/conta.mjs` (35; ver `docs/PAGAMENTOS.md`, "Testes").
- **Como se testou:** réplica local com Postgres 16 real, as migrações todas, um emulador do
  PostgREST, Auth simulado e a Edge Function verdadeira em Deno — a pilha inteira, sem Docker e sem
  tocar em produção (a rede da sessão não chega lá). Os scripts ficaram fora do repositório; a
  descrição está na AUDITORIA 9.16 para quem quiser repetir.
- **Por decidir (dono):** confirmação por email antes de apagar a conta (hoje: escrever o email da
  conta com a sessão aberta); os pontos de email, WhatsApp e telefones das passagens anteriores.

## Pagamentos registados e gateway (2026-11-07, ramo `claude/pagamentos-premium`)

- **Pedido do dono:** "análise crítica dos pagamentos", depois "reorganizar seguindo as normas premium" e "ligar com os relatórios". A regra que ele fixou: **um pagamento só fica confirmado pelo gateway (webhook) ou por um funcionário com a permissão**. Guia completo em [PAGAMENTOS.md](PAGAMENTOS.md).
- **Base de dados** (migrações `20261107200000`–`202000`, aplicadas no merge):
  - `order_payments`, só de acrescentar;
  - o estado do pagamento é calculado e ninguém o escreve à mão;
  - a permissão `confirm_payments`;
  - total e portes em `numeric(14,2)`;
  - o painel só grava o seguimento;
  - o webhook do gateway (`order_payment_gateway`, `payment_gateway_events`);
  - o relatório `payments_report`;
  - a comissão do colportor acertada pela diferença;
  - os tamanhos sem preço próprio a valer o preço do produto.
- **Inclui o PR #23** (registo de segurança, estado geral), de que depende: o registo das acções de pagamento usa `private.audit_write`. O workflow do #23 traz `supabase db push --include-all`, por isso as migrações do #23, mais antigas do que a `20261107180000` já aplicada, entram na mesma.
- **Por fazer, do dono:**
  - escolher o gateway e pôr `PAYMENT_WEBHOOK_SECRET` e `PAYMENT_GATEWAY_PROVIDER` nos segredos da Edge Function;
  - decidir o link de demonstração do Multicaixa (Kursinha);
  - ver a encomenda de 245 000 Kz entregue por pagar;
  - pôr o prazo de cancelamento;
  - preencher o NIF e o nome legal.
- **Testes:** 91 cenários em PGlite, que ficam no repositório desta vez (`scripts/pglite/`; instruções em PAGAMENTOS.md); vitest; `deno check`.

## Política de privacidade (2026-11-07, ramo `claude/quirky-hypatia-wnid2g`)

- **Pedido do dono:** "actualizar a política de privacidade para cobrir a comunidade". O site não tinha nenhuma (nem página, nem link, nem texto no painel), por isso foi **criada** em `/privacidade` (`/privacy` e `/politica-de-privacidade` redireccionam), com uma secção própria para a comunidade.
- **Texto:** em `app/web/src/lib/privacyPolicy.js`, com testes. Descreve o que o sistema faz de facto, levantado do código e das migrações: dados da conta, das encomendas (incluindo documento e assinatura de quem recebe e as coordenadas, se partilhadas), do atendimento e do assistente (o que vai para o Gemini ou o DeepSeek), da comunidade (o que é público, o que nunca é, o que é privado, como apagar) e os fornecedores. Os contactos vêm das Configurações (`contact_email`, `contact_phone`, `contact_address`). **Quem mudar o que se recolhe ou para onde vai, muda este ficheiro e a data.**
- **Links:** no rodapé (fora das colunas configuráveis), no registo, no editor da comunidade ("O que fica visível") e nas regras da comunidade.
- **Para o dono rever, de preferência com um jurista:**
  - a denominação legal e o NIF da empresa, que o sistema não tem (o texto usa o nome do site);
  - a regra para menores de 18 anos;
  - o compromisso de avisar em caso de falha de segurança;
  - os prazos de conservação das encomendas, que remetem para "o que a lei fiscal e comercial exige".
  - A referência legal é a Lei n.º 22/11 (Protecção de Dados Pessoais) e a autoridade de controlo é a APD.
- ~~**Ainda não há** forma de o cliente apagar a conta ou descarregar os seus dados sozinho~~: desde 2026-11-08, em Perfil → Segurança e privacidade (secção acima). Apagar a conta apaga publicações, respostas e gostos da comunidade; as encomendas ficam.

## Comunidade literária premium (2026-11-07, ramo `claude/quirky-hypatia-wnid2g`)

- **Pedido do dono:** "tornar premium, com visual organizado e auditado, para ter uma comunidade literária grande". Escolhas: **temas + tipo** de publicação com filtros e ordenação; **clube do livro do mês**, **notificações** (sino e push), **página de cada publicação** e **perfis de leitor**; visual **editorial da marca + rede social**; moderação **publicar logo**, com a equipa a fixar e a marcar respostas oficiais.
- **Base de dados** (migração `20261107060000_comunidade_premium`, **aplicada no merge**): temas (`community_topics`, 8 iniciais), `topic`/`kind`/`replies_count`/`last_activity_at`/`pinned_at`/`is_official` nas publicações, `profiles.reader_key` (o endereço público do leitor, nunca o `user_id`) e `profiles.community_notify`, `community_book_clubs`, avisos `community` em `customer_notifications` (respostas, resposta oficial, gostos agrupados por 6 h) e funções públicas novas (`community_list`, `community_thread`, `community_list_replies`, `community_reader`, `community_reader_posts`, `community_sidebar`, `community_current_club`). As funções antigas (`community_feed`…) ficam para o site anterior não partir durante o deploy; **retirar numa migração de limpeza** depois.
- **Site:** `/comunidade` em 3 colunas (temas, feed, coluna lateral) com os filtros no endereço (`?tema=&tipo=&ordem=&q=&livro=`); `/comunidade/p/:id` e `/comunidade/leitor/:key`; sino no cabeçalho e separador **Notificações** no perfil.
- **Painel:** Clientes → Comunidade com Denúncias, Publicações (fixar, ocultar), Temas, Clube do livro e Sites bloqueados.
- **Push:** a Edge Function envia os avisos da comunidade só por push (nunca email). Respostas saem logo; gostos esperam 30 min para irem num só push. O agendador `avisos-equipa` passou a acordar a função também para estes.
- **Partilha:** `functions/comunidade/p/[id].js` (Cloudflare Pages Function, na raiz do repositório) escreve título, texto e capa da publicação para o WhatsApp. A configuração é gerada pelo `scripts/seo-catalogo.mjs` em `scripts/gerado/` (fora do git), com os cabeçalhos de segurança do `_headers`; `_routes.json` limita a Function a `/comunidade/p/*`.
- **Por confirmar depois do merge:** (1) no registo do deploy do Cloudflare, "Compiled Worker successfully" e a Function carregada; (2) colar o link de uma publicação no WhatsApp e ver a pré-visualização; (3) um push de resposta num telemóvel com push activo.
- **Política de privacidade:** criada a 2026-11-07 em `/privacidade` (ver a secção seguinte). Pesquisa por `ilike`: chega para milhares de publicações; um índice trigram (`pg_trgm`) fica para quando houver volume.
- Detalhe e verificação em [AUDITORIA.md](AUDITORIA.md), secção **9.13**.

## Comunidade de leitores (2026-11-06, ramo `claude/elegant-noether-ebflws`)

- **Pedido do dono:** discutir livros ou qualquer assunto, com subcomentários, referências a livros e links, "estilo rede social". Escolhas: feed geral, links publicados logo (com denúncia).
- **Feito (Fase 1):** `/comunidade`, separador **Discussão** na ficha, moderação no painel (Clientes → Comunidade), link "Comunidade" no menu. Migração `20261106190000_comunidade`, **ainda não aplicada** (vai no merge), testada em produção numa transacção anulada: resposta a resposta, `javascript:` e credenciais recusados; contadores protegidos; terceira denúncia oculta; anónimo não publica; a vista não tem email nem `user_id`; limite de 10 publicações por hora.
- **Por fazer:** notificações de respostas: não há (decisão por tomar). As Fases 2 e 3 estão feitas (secções seguintes).
- **Links maliciosos e pornográficos bloqueados** (pedido do dono, migração `20261106220000_comunidade_links_seguros`, **ainda não aplicada**): valem para a lista de links, para os endereços escritos no texto e na citação (antes só a lista era verificada, e o texto vira link no site). Três camadas: (1) regras fixas na gravação: sem IP, porta, `xn--`, `.xxx/.porn/.sex/.adult/.zip/.mov`, palavras de conteúdo adulto no nome do site, programas `.exe/.apk…`; (2) lista `community_blocked_domains` com 53 sites adultos, 40 encurtadores e 25 "IP loggers", que a equipa aumenta em Clientes → Comunidade → Sites bloqueados (juntar um site oculta logo as publicações com ele, com a nota "Link bloqueado"); (3) reputação: cada site novo é consultado no filtro de família do Cloudflare (`family.cloudflare-dns.com`, malware e adultos) com `pg_net`, e o agendador `comunidade-links` (cada minuto) lê as respostas e junta à lista os filtrados. Testado no Supabase local, com as respostas do Cloudflare simuladas: a rede desta sessão não chega ao Cloudflare, por isso **confirmar depois do merge** em `private.community_host_checks` que os veredictos ficam `ok`/`blocked` e não `error`. A equipa não consegue voltar a mostrar uma publicação com um site bloqueado.
- **Riscos que ficam com o dono:** links sem moderação prévia fora destas regras (phishing num site novo e limpo, mitigado por denúncia, ocultação e limite); um site legítimo com uma palavra bloqueada no nome (ex.: um sobre "vencer a pornografia" com "porn" no domínio) é recusado; as publicações são públicas com o nome do perfil, e a política de privacidade deve passar a cobrir a comunidade.

## Análise crítica do sistema (2026-11-06, ramo `claude/quirky-hypatia-wnid2g`)

- Detalhe em [AUDITORIA.md](AUDITORIA.md), secção **9.12** (achados 48–65). Feita num Supabase local completo, com a Edge Function em Deno: checkout real, painel com sessão e advisors.
- **Para publicar com o merge:** a Edge Function (achado 52: "Tenho um problema" já não conta como recepção confirmada) e as migrações por aplicar.
- **Corrigido depois (mesmo dia, PR #17):** as vistas públicas passaram a funções (`community_feed`, `community_replies`, `community_post`, `downloads_list`) e os advisors de segurança ficam sem avisos; limite nos downloads; textos e títulos do painel. Testados também a entrega ao domicílio e a transferência com referência.
- **Aceites, com o motivo na auditoria:** vendas e visitas por produto visíveis ao público (61) e `user_id` nas avaliações (62).

## Faixa de aviso no cabeçalho (Fase 3, 2026-11-06, ramo `claude/quirky-hypatia-wnid2g`)

- **Feito:** faixa no topo de todas as páginas da loja (as que usam o `Header`; o painel não), gerida em painel → Sistema → **Faixa de aviso** por quem tem `manage_settings` ou `manage_marketing`. Cada aviso tem texto (até 200 caracteres), tom (**urgente** âmbar, **promoção** verde, **informação** azul-escuro), link opcional com texto, datas de início e fim opcionais, "ligado" e "o visitante pode fechar". O painel mostra o que está no site agora e o estado de cada aviso (no ar, agendado, terminou, desligado), com pré-visualização no formulário.
- **Qual aparece:** um de cada vez: urgente, depois promoção, depois informação; no mesmo tom, o que começou mais tarde. Fechado um, aparece o seguinte. O fecho fica guardado no navegador e volta a mostrar o aviso se o texto ou o link mudarem (mudar só as datas não).
- **Onde fica:** no fluxo da página, por cima do cabeçalho: empurra o conteúdo em vez de tapar o título e sobe ao descer. A barra fina que aparece sobre a imagem de entrada fica logo abaixo (`--notice-offset`, medido pela faixa). Nas páginas com cabeçalho fixo (`pinned`: ficha, perfil, sucesso), a faixa fica por cima e o cabeçalho cola ao topo depois.
- **Regras na base de dados:** migração `20261106210000_faixa_de_aviso`, **ainda não aplicada** (vai no merge). Os visitantes só lêem os avisos ligados e dentro das datas (RLS com `now()`); o link é um caminho do site ou http(s) sem `utilizador@` (`//outro.site`, `/\outro.site` e `javascript:` recusados), as mesmas regras de `lib/siteNotices.js`. Testada no Supabase local: anónimo e cliente não criam, editam nem apagam; o marketing gere; texto limpo; tom, datas e links inválidos recusados. No browser: computador e telemóvel, página com imagem de entrada e com cabeçalho fixo, fechar e recarregar, link interno, teclado, criação pelo painel.
- **Custo:** um pedido ao PostgREST por visita (memória de 5 minutos entre páginas). Quem volta vê a faixa logo, pelo que ficou guardado no navegador (até 24 h); na primeira visita a faixa entra quando a resposta chega e empurra a página uma vez.

## Materiais para descarregar (Fase 2, 2026-11-06, ramo `claude/quirky-hypatia-wnid2g`)

- **Pedido do dono:** PDFs e revistas para descarregar. Escolhas: **gratuitos e pagos**; os gratuitos para **qualquer visitante**, sem conta; numa **página própria** e **na ficha do produto**.
- **Feito:** página `/materiais` (filtros por tipo e por gratuito/com compra, link "Materiais" no menu e no sitemap), caixa "PDFs deste produto" na ficha, separador **PDFs** no perfil (os pagos que a conta já pode descarregar) e painel → Catálogo → **Materiais (PDF)** (carregar o PDF, capa, tipo, edição, gratuito ou pago, produto e variante, publicar, contagem de downloads).
- **Regra dos pagos:** ligados a um produto e, se quiser, a uma variante (ex.: "Edição digital · PDF"). Descarrega quem tem sessão e comprou esse produto numa encomenda não cancelada e já paga, entregue ou confirmada (a regra da compra verificada). **Desde 2026-11-08, só paga** — ver [LIVROS_DIGITAIS.md](LIVROS_DIGITAIS.md). A encomenda é da conta pelo `customer_id`, ou pelo email da conta **só se estiver confirmado**.
- **Segurança:** os PDFs ficam no bucket **privado** `downloads` (só `application/pdf`, até 50 MB). O site chama `start_download` (confirma o acesso, conta) e pede um link temporário de 2 minutos; o Storage só o passa a quem `private.can_download` deixa. A lista pública é a função `downloads_list` (até à migração `leituras_publicas_por_funcoes`, a vista `downloads_public`), sem o caminho do ficheiro; o download tem limite de 30 por hora por conta ou por IP. A tabela só a lê e escreve quem tem `manage_catalog`.
- **Migração `20261106200000_materiais_para_descarregar`, ainda não aplicada** (vai no merge, com as outras). Testada num Supabase local completo (`supabase start`, com API e Storage): o visitante descarrega o gratuito e recebe "Object not found" no pago; o comprador com a encomenda por pagar é recusado e, depois de paga, descarrega; a encomenda cancelada tira o acesso; outra conta e o email por confirmar são recusados; o cliente não envia ficheiros; HTML recusado pelo bucket; rascunhos só para a equipa; o contador não se edita à mão. No browser: download real pelo botão, painel a criar um material com o PDF enviado.
- **Limites que ficam:** vender **só** o PDF faz-se com uma variante "Edição digital" no produto, mas o checkout continua a pedir levantamento ou entrega (não há encomenda só digital). A variante é guardada pelo índice: reordenar as variantes do produto muda qual dá acesso. Um link temporário, enquanto dura (2 min), abre para quem o tiver. Não há email "o seu PDF está pronto".

## Variantes e amostra de leitura (2026-11-06, ramo `claude/elegant-noether-ebflws`)

- **Produtos com tamanhos ou edições** só se compram com um escolhido: o cartão, a vista rápida e os destaques levam à ficha ("Escolher"), e o `place_order` recusa sem variante. Migração `20261106170000_variante_obrigatoria`, **ainda não aplicada**: vai no merge, com o `supabase db push`. Testada numa transacção anulada.
- **A amostra de leitura inventada saiu** (prefácio e capítulo fictícios iguais para todos os produtos). O botão só aparece com páginas reais carregadas no painel → Livro → Amostra, e hoje nenhum produto as tem.
- Detalhes em [AUDITORIA.md](AUDITORIA.md), secção 9.11, e na spec ([SPEC-COMPONENTES.md](SPEC-COMPONENTES.md), secção 8).
- **Botões flutuantes por página** (pedido do dono): o assistente e o "Voltar ao topo" escolhem-se em Configurações → Assistente IA → Botões flutuantes. Por omissão saem da ficha do produto, da encomenda/rastreio e de entrar. Migração `20261106180000_botoes_flutuantes_por_pagina` (colunas `chat_hidden_on` e `scroll_top_hidden_on`), **também no merge**; até lá o site já usa as páginas por omissão e a tabela do painel não aparece.

## Códigos de cliente e de funcionário (2026-11-06)

- **Feito e aplicado** no Supabase (`bggqkjjqbjhbjsckzopj`): `20261106033302_codigos_cliente_funcionario` e `20261106033425_codigo_cliente_tambem_na_equipa`, com o mesmo SQL dos ficheiros em `supabase/migrations/`.
- **Estado dos dados depois da migração:** 3 administradores com `FUN-001`…`FUN-003`; 1 cliente sem conta (`CLI-000001`, com 4 encomendas); todas as encomendas com `customer_code`. Nenhum cliente com conta ainda, por isso o `CLI-` de conta foi testado só em transacção revertida.
- **Teste de ponta a ponta** (transacção revertida): compra sem conta → `CLI-000002`; ao criar conta, o mesmo código; ao passar a gestor, mantém `CLI-` e recebe `FUN-004`; a pesquisa encontra a conta pelo código.
- **Produtos:** revistos, sem alterações. Os 9 tipos têm prefixo e contador, e `normalize_product_code` (SQL) e `normalizeProductCode` (JS) usam a mesma expressão.
- **Interface:** código mostrado na lista e na ficha de Utilizadores; a pesquisa aceita o código. A Edge Function não mudou: a rota `/admin/users` devolve a listagem tal como vem da base de dados.
- **Por fazer (decisão tua):** ~~mostrar ao próprio cliente o seu `CLI-` no perfil da loja~~ (feito a 2026-11-08); e se o funcionário sem login (ex.: vendedor de loja física) deve ter código, o que exige uma tabela própria.

## Análise crítica e correcções do checkout (2026-11-06)

Feito no código (PR #9), **publicado em produção a 2026-11-06** (commit `d8c3e81`, à mão, com os tokens do Cloudflare e do Supabase da sessão):
- Migração `20261106050000_pagamentos_por_envio` aplicada pela API de gestão do Supabase (numa transacção, registada em `schema_migrations` com o mesmo md5 do ficheiro). O `supabase db push` não serve a partir de uma sessão na nuvem: a ligação directa ao Postgres fica pendurada.
- Edge Function `app` v19 (`supabase functions deploy app --use-api --no-verify-jwt`).
- Site com `npm run deploy:site` no projecto `livraria-editora-adventista` (conta `valentinocanguele@gmail.com`); o script confirmou o deploy e as páginas.

O que entrou:
- **Comprar sem conta**, também com entrega. **Pagar depois de encomendar** (transferência, Multicaixa): a referência indica-se na página de sucesso ou no rastreio (`/order/payment-reference`); a equipa recebe `payment_reported`.
- Pagamentos filtrados por envio ("Pagar no Balcão" só no levantamento, editável no painel → Pagamentos), portes 0 válidos, unidades do expresso, canal de venda em lista fechada, assinatura do checkout opcional, `/confirm-delivery` só PNG até 300 KB.
- Ficha: capa inteira e botões logo a seguir ao preço. Checkout: avisos visíveis no telemóvel, campos com rótulo e `autocomplete`, passos com nome, IBAN legível com "Copiar". Cartões não abrem o carrinho a cada livro.
- Cor da marca como token (`marca`, 145 sítios) em vez de `#0ea5c9` escrito à mão. Spec em [SPEC-COMPONENTES.md](SPEC-COMPONENTES.md).
- Migração `20261106050000_pagamentos_por_envio`: aplicada ao mesmo tempo que a Edge Function e o site que a usam (ver acima).

Por decidir ou configurar (dono):
- **Multicaixa Express activo com `923 000 000`**, que parece fictício, e um link de `pay.kursinha.com` por confirmar.
- **`contacto@livrariaadventista.ao` não recebe email** (o `.ao` não tem MX). As instruções novas já não o usam; o rodapé e outras páginas podem usar.
- **SMTP no Auth** (sem ele o registo por email não funciona) e ligar os emails de encomenda (`order_email_enabled`, integração SMTP). **Não** ligar a confirmação automática de email: com a regra RLS por email, quem registasse o email de um cliente veria as encomendas dele.
- Telefone e WhatsApp da loja nas definições (estão vazios).
- MFA nos 3 administradores (nenhum tem).
- **Cancelar encomendas por pagar**: já existe, desligado (Configurações → Regras da loja → dias; 0 = nunca). Escolher o prazo.
- **Assistente com IA**: teto diário de 500 respostas com IA na loja toda e 60 por visitante (Configurações → Assistente). O aviso "serviço de IA externo" já aparece no assistente; confirmar com quem trata da protecção de dados se a Lei 22/11 pede mais (as mensagens podem ir para a Google ou para a DeepSeek, na China).
- Stock por loja: precisa de desenho (que lojas têm que livros, e se as vendas ao balcão passam a descontar stock).

## Dados fidedignos, chat e spec de elementos (2026-11-06)

- **Telefones:** todas as encomendas e perfis estão em `+244 XXX XXX XXX` (migração `20261106034217_perfis_telefones_e_nomes`, mesma regra de `angolaPhone.js`). Um número incompleto não é inventado: fica como está e a ficha assinala-o. Hoje o administrador `admin@livraria.ao` não tem telefone.
- **Nomes:** nenhum perfil tinha nome vazio, por isso a regra "nome a partir da encomenda" não alterou nada agora; fica activa para os próximos.
- **Emails:** verificados. Não há perfis com emails repetidos (com maiúsculas ou espaços), e o email de cada perfil é igual ao da conta de acesso. Nada a corrigir.
- **Ficha do utilizador:** caixa "Dados por confirmar" (sem email, nome ou telefone; telefone incompleto; email da conta por confirmar). Só avisa. Regras em `app/web/src/lib/personDataChecks.js`, com testes.
- **Chat de suporte (equipa):** cada conversa mostra o `CLI-` do cliente e a pesquisa aceita o código. O cliente não vê o código.
- **Spec:** [SPEC-COMPONENTES.md](SPEC-COMPONENTES.md) descreve os elementos pequenos (código, etiqueta, campo, aviso) com as classes reais.

## Onde está o trabalho

- **Repositório:** [fernandotunas6-bot/Livraria-Editora-Adventista](https://github.com/fernandotunas6-bot/Livraria-Editora-Adventista) (privado). O projecto foi migrado a 2026-11-03 de `ValentinoCanguele/livraria_Cunhinga`, com todo o histórico e os ramos. Ver [docs/MIGRACAO-REPOSITORIO.md](MIGRACAO-REPOSITORIO.md) para o que ficou por configurar do lado do GitHub.
- **Ramo:** `claude/youthful-heisenberg-rq5gnw`, 47 commits à frente do `origin/main`.
- **`main`:** a migração do Supabase (o antigo PR #3) está integrada no `main` desde 2026-11-02 (commit `f4d9885`). Atenção: um `main` **local** antigo, da era PocketBase, ainda existe em algumas cópias de trabalho e está 114 commits atrás — usar sempre `origin/main` como referência.
- **Supabase:** projecto "Livraria Adventista", ref `bggqkjjqbjhbjsckzopj`, organização "Colpotor" (plano grátis), região eu-north-1.
- **Cloudflare Pages** — hoje na conta `canguelev@fata.adventist.org`, com dois projectos. **A decisão de 2026-11-03 é mudar tudo para a conta `valentinocanguele@gmail.com`** (a que já tem o `siga-plus`), onde o domínio vai ficar; falta fazer, porque o `wrangler` desta máquina está autenticado na conta `fata` e o `login` é um OAuth no browser. Passos em [MIGRACAO-REPOSITORIO.md](MIGRACAO-REPOSITORIO.md), secção 5.
  - `livraria-editora-adventista` — **o que serve produção**, ramo `main`. Desde 2026-11-07 o endereço oficial é **`livrariaadventista.ao`**; o `www`, o `.com` e o `livraria-editora-adventista-ben.pages.dev` redireccionam para ele ([DOMINIO.md](DOMINIO.md)).
  - `livraria-adventista` — **o antigo**, em https://livraria-adventista.pages.dev. Já não recebe deploys e está desactualizado: a 2026-11-06 os livros apareciam sem capa (a CSP antiga não aceita o domínio novo das capas). Deve redireccionar para `livrariaadventista.com` ou ser desligado — decisão do dono.
  - ~~O domínio `livrariaadventista.ao` não está registado~~ (era assim a 2026-11-03): registado na AngoWeb, zona activa no Cloudflare e oficial desde 2026-11-07.
  - Foi publicado à mão com o Wrangler porque o Actions está bloqueado.
  - Cada ramo tem o seu URL de pré-visualização (`<ramo>.livraria-adventista.pages.dev`, ver `wrangler pages deployment list`). O `main` antigo (PocketBase) está em `main-pocketbase`, e esse e os ramos `cursor/*` não têm backend.
  - Publicar à mão: `npm run deploy:site` (produção) ou `npm run deploy:site -- --preview`. O script recusa publicar se o HEAD não for a ponta do ramo remoto, faz lint, testes e build, publica e confirma que o último deploy de produção é esse commit e que o site responde. Várias sessões publicam no mesmo projecto: nunca publicar um build antigo. As variáveis `VITE_SUPABASE_*` vêm de `app/web/.env`.
  - Para publicar no projecto novo: `CLOUDFLARE_PAGES_PROJECT=livraria-editora-adventista npm run deploy:site`. Com um domínio próprio, acrescentar `SITE_URL=https://livrariaadventista.ao`: além de a verificação final bater no domínio em vez do `.pages.dev`, o script reescreve no build o `canonical`, as etiquetas `og:`/`twitter:`, o `sitemap.xml` e o `robots.txt`, que têm fixo o endereço do projecto que serviu produção primeiro. Sem isso, o site publicado noutro destino diz aos motores de busca e às partilhas que a página "a sério" é a do endereço antigo.
  - Workers, KV, D1 e R2 continuam por usar.

## Bloqueios (só o dono da conta resolve)

1. ~~GitHub Actions bloqueado por facturação.~~ **Resolvido pela migração** (confirmado a 2026-11-03): na conta `fernandotunas6-bot` os workflows arrancam e correm até ao fim. O bloqueio era da conta `ValentinoCanguele` ("The job was not started because your account is locked due to a billing issue", um cartão guardado cuja autorização falhou). O `scripts/deploy-site.sh` continua a ser um gate válido, mas já não é o único.

   > **Consequência a ter em conta.** Com o Actions a funcionar, cada push para o `main` passa a publicar no Cloudflare Pages, e cada push que toque em `supabase/` passa a correr `supabase db push` e a publicar a Edge Function — **automaticamente**. Durante meses isto nunca aconteceu. Ao integrar o PR #1 há migrações por aplicar, e elas vão ser aplicadas sozinhas. Rever o que está em `supabase/migrations/` antes do merge.

2. **Segredos do GitHub Actions** (Settings → Secrets and variables → Actions). Não migram com o código.
   - **Variáveis: criadas a 2026-11-03.** `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `CLOUDFLARE_PAGES_PROJECT` (= `livraria-editora-adventista`) e `SUPABASE_PROJECT_REF` (= `bggqkjjqbjhbjsckzopj`). A chave *publishable* é pública por desenho (vai no bundle do frontend), por isso é variável e não segredo.
   - **Segredos: por criar** — `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`. Os valores não estão em parte alguma desta máquina. Criam-se sem os expor com
     `GH_TOKEN="$(gh auth token --user fernandotunas6-bot)" gh secret set <NOME> --repo fernandotunas6-bot/Livraria-Editora-Adventista`, que pede o valor sem o mostrar. É preciso o token do dono: a `ValentinoCanguele` só tem escrita, e segredos exigem admin.
   - **Os dois do Cloudflare devem esperar pela mudança de conta.** Têm de ser da conta `valentinocanguele@gmail.com`, não da `canguelev@fata.adventist.org` — pôr os da conta antiga faz o deploy publicar no sítio errado.
   - Estado hoje: o `deploy-cloudflare.yml` falha no primeiro passo ("Confirmar segredos e variáveis") a cada push para o `main`. É ruído esperado até os segredos existirem, não um problema novo.
3. **Supabase → Authentication:**
   - Activar o fornecedor Google, com o Client ID e o Secret da Google Cloud. O URI de redireccionamento é `https://bggqkjjqbjhbjsckzopj.supabase.co/auth/v1/callback`.
   - Pôr o domínio do site no Site URL e nos Redirect URLs.
   - A protecção contra palavras-passe vazadas exige o plano Pro; ignorar.

## Backend — revisão e migrações aplicadas (2026-11-05)

- **Aplicadas na base de dados pelo MCP**, com os ficheiros renomeados para as versões
  atribuídas e o SQL igual ao byte (md5 verificado): `20261105045510_campos_encomendas`,
  `20261105045517_capas_das_colecoes` e `20261105045627_limpeza_dados_provisorios`. Antes eram
  `20261104170000`, `20261104170500` e `20261104180000`, ainda por aplicar; ensaiadas primeiro
  num bloco anulado. O `db push` do merge já não as volta a correr.
- **`site_url`** estava em `https://livrariaadventista.ao` (alterado nas 3 linhas a
  2026-11-05 02:09), que ainda não resolve: os links dos emails davam numa página que não
  abre. Corrigido à mão para `https://livrariaadventista.com` antes da limpeza; a limpeza
  passou a tratar também o `.ao`.
- **Três encomendas de teste apagadas** (importadas do PocketBase: `ENC-D9IBRY`,
  `ENC-D8BM5D` e uma sem número, todas `test@test.com`/`t@t.com`). As linhas inteiras estão
  em `private.correcoes_dados` (`migracao = 'manual-2026-11-05-encomendas-teste'`). O stock
  não foi mexido.
- **Migrações conferidas com `schema_migrations`:** todas iguais tirando comentários e
  espaços, excepto a `20261102150000`, que tinha um `grant` nunca aplicado com ela (está na
  `20261102160000`). O ficheiro passou a ser igual ao aplicado.
- **Edge Function:** `/delivery-event` só aceita os 8 estados de entrega e corta os textos;
  `/confirm-delivery` corta nome e documento; `successUrl` do checkout fica só com o caminho;
  o resumo das campanhas usa o `site_url` em vez de `livrariaadventista.ao` fixo. **Ainda não
  publicada** — vai no deploy do merge (não há CLI do Supabase nesta máquina, e a função é
  grande demais para a colar à mão).
- **Avisos do Supabase:** as 16 funções `SECURITY DEFINER` chamáveis com sessão verificam a
  permissão por dentro (falsos positivos); a protecção de palavras-passe vazadas exige o Pro.

## O que já está feito

- **Campanhas de contactos agendadas a sério** (2026-11-03): `pg_cron` de 15 em 15 minutos a
  chamar `/cron/contact-campaigns`. Antes o `next_send_at` era calculado e nada o disparava —
  as campanhas saíam quando alguém carregava num botão. **O agendador não agenda o que não
  entrega:** sem a API do WhatsApp, "enviar" só produz links manuais, por isso o caminho
  automático salta esses canais sem avançar a data, em vez de marcar como enviada uma campanha
  que ninguém recebeu. Falta um segredo no Vault (`contact_campaigns_url`) e falta o painel
  mostrar o estado — **o painel já mostra**: o estado do agendador numa frase (incluindo o caso
  traiçoeiro de estar agendado sem segredos, em que corre e não chama nada), o motivo por
  campanha quando o canal não entrega, e a lista do que foi saltado no último envio. Falta o
  segredo `contact_campaigns_url` no Vault. Detalhe em
  [CONTACTOS-E-CAMPANHAS.md](CONTACTOS-E-CAMPANHAS.md).
- **Membros dos grupos de contactos com integridade referencial** (tabela
  `contact_group_members`): o `member_ids` jsonb deixava ids órfãos ao apagar um contacto, e o
  envio ia buscar 40 membros, encontrava 37 e seguia em silêncio. O `member_ids` continua
  actualizado por trigger para não quebrar os leitores antigos.

- **Migrações alinhadas com a base de dados:**
  - Cada ficheiro em `supabase/migrations/` tem a mesma versão e o mesmo SQL que `supabase_migrations.schema_migrations` no projecto (verificado por md5).
  - Já estão aplicadas: `base_perfis`, `tabelas`, `regras_rls_storage`, `funcoes_privadas`, `painel_vendas`, `lojas_levantamento_whatsapp`, `notification_logs`, `admins_pre_autorizados` (20261101163522), `modulo_utilizadores` (20261101164811) e `desejos_avaliacoes` (20261101165942).
- **Edge Function `app`** (`supabase/functions/app/index.ts`):
  - A versão no repositório é **mais recente** do que a publicada. Tem as rotas `/admin/users*`, `requirePermission()` e não guarda no registo os emails com links de acesso.
  - É publicada pelo `deploy-supabase.yml` depois do merge. A função publicada continua a funcionar com as migrações novas, porque usa a service role.
- **Registo de comunicações:** o painel Integrações → Logs lê `notification_logs`, onde a Edge Function grava os envios reais. Os registos simulados no Firestore foram removidos.
- **Painel de Vendas da Loja do Huambo** (pacote `painel-vendas-huambo`):
  - É o separador Relatórios › Vendas Huambo do Painel Admin (`/admin?tab=vendas-huambo`); os links antigos `/painel-vendas(.html)` vão para lá.
  - O HTML, o CSS e o script do pacote estão em `app/web/src/painel-vendas/` quase sem alterações e correm num Shadow DOM (`components/admin/VendasHuamboTab.jsx`), para manter o design original sem misturar com o Tailwind. Segue o tema claro/escuro do sistema.
  - Dados em `vendas_anos` e `painel_vendas_docs` (migração `painel_vendas`): gestores e administradores lêem, só administradores gravam (RLS). A senha local do pacote foi substituída pela sessão de administrador.
- **Lista de desejos e avaliações no Supabase** (tabelas `wishlists` e `book_reviews`, migração `desejos_avaliacoes`):
  - Estavam no Firestore, que deixou de reconhecer a sessão quando o login passou para o Supabase; quem tinha sessão não conseguia guardar nada.
  - Sem sessão, a lista de desejos fica no browser e passa para a conta ao iniciar sessão.
  - O nome, a foto e a "compra verificada" de cada avaliação são definidos por um trigger na base de dados.
  - Os dados antigos no Firestore não foram copiados.
- **Firestore desligado:** removidos o separador "Contactos (CRM)" antigo (lia utilizadores do Firestore), a "Coleção da Comunidade" e a cópia de arquivo do Google Workspace (guardava Gmail, Drive, etc. no Firestore). `firestore.rules` fecha tudo. O Firebase fica só para o login das ferramentas do Google Workspace.
- **Login Google pelo Supabase Auth**, em vez do Firebase:
  - O carrinho já não copia encomendas para o Firestore.
  - "Encomendas" no perfil lê só do Supabase.
  - O Firebase fica só para as ferramentas do Google Workspace.
- **Administradores:**
  - `valentinocanguele@gmail.com` e `admin@livraria.ao` são admin.
  - A tabela `private.admin_emails` (só na base de dados, fora da API) pré-autoriza emails: o perfil passa a admin quando a conta fica confirmada.
  - Há 1 email na lista, que ainda não tem conta.
  - **Não pôr emails desta lista no repositório.** É privado, mas o histórico do git é permanente.
- **Permissões reais:**
  - `private.has_permission(key)`: admin pode tudo; gestor só as chaves activas em `profiles.permissions`; cliente nenhuma.
  - Encomendas, catálogo, pagamentos e configurações exigem a permissão certa nas políticas RLS.
  - A mesma lógica está em `can()` e `requirePermission()` na Edge Function e em `app/web/src/lib/permissions.js`.
- **Módulo "Utilizadores e Clientes":**
  - Ficheiros: `app/web/src/components/admin/users/`, `app/web/src/lib/usersApi.js`, a função SQL `public.admin_users_list` (só service role) e as rotas `/admin/users` (listar), `/admin/users/orders`, `/create`, `/update`, `/status`, `/access-link` e `/delete`.
  - Regras: gestores com `manage_users` gerem clientes; equipa, papéis e permissões só admin; ninguém se apaga nem se suspende a si próprio; fica sempre pelo menos um administrador activo.
- **CI:**
  - `ci.yml` corre lint, **testes**, build e `deno check` em cada PR para o `main`.
  - Os deploys confirmam os segredos antes de começar.
  - O deploy do Cloudflare cria o projecto Pages se não existir.
  - O passo `Testes` esteve quebrado num checkout limpo até 2026-11-03 — ver a secção seguinte.

## O passo `Testes` do `ci.yml` falhava num checkout limpo — corrigido

Encontrado a 2026-11-03 ao verificar a ponta do ramo, e corrigido no mesmo dia.

**O que estava mal.** O passo corria `npm test` sem `VITE_SUPABASE_URL` nem
`VITE_SUPABASE_PUBLISHABLE_KEY`. O `app/web/.env` é gitignored, logo num checkout do GitHub (ou
em qualquer worktree novo) não existe. Quatro ficheiros de teste importam módulos que criam o
cliente Supabase **no momento do import** e falhavam a carregar antes de correr um único teste:

```
Error: supabaseUrl is required.
 ❯ src/lib/supabaseClient.js:14:37
FAIL src/lib/apiCompat.test.js · src/hooks/useReviews.test.js
     src/hooks/useProductFilters.test.js · src/lib/secureInboxApi.test.js
```

**Porque passou tanto tempo escondido.** O Actions nunca arrancou — a conta antiga estava
bloqueada por facturação — e localmente o `.env` existe sempre. E o relatório engana: diz "232
testes a passar", porque um ficheiro que falha a carregar não conta testes nenhuns. **Olhar para
a linha `Test Files`, não só para `Tests`.**

**A correcção** está no `test.env` do `app/web/vitest.config.js`, com valores fixos
(`http://supabase.invalid`). Não no `ci.yml`, e não no `supabaseClient.js`:

- Dar as variáveis ao `ci.yml` resolvia só o CI, e **continuaria quebrado** até alguém criar as
  *repository variables* no repositório novo — que ainda não existem.
- No `vitest.config.js` o `npm test` dá o mesmo resultado em qualquer máquina, sem configuração
  nem segredos, e nenhum teste toca a rede. É código de teste, não de produção.

Nenhum teste dependia dos valores reais (verificado: o `imageUrl.test.js` usa o URL do Supabase
como texto literal de entrada, e o `imageUrl.js` não lê o ambiente).

**Verificado nos dois ambientes**, no commit da correcção:

| | Ficheiros | Testes |
|---|---|---|
| worktree sem `.env` e sem variáveis (a condição do CI) | **17 passam** | **250 passam** |
| árvore local com `.env` | **17 passam** | **250 passam** |

Antes da correcção, na condição do CI: 4 ficheiros falhavam, 13 passavam, 232 testes.

**E confirmado no Actions a sério**, assim que a conta nova o destrancou. O passo `Testes`
falhou em cinco execuções seguidas (`b5851fc`, `43b84d0`, `38df5ad`, `4c6548c`, `ae06816`) e o
primeiro verde é no commit da correcção, `2c9a89d`. O `deno check` da Edge Function também
passa no Actions — o que nesta máquina não dá para verificar, por falta de Deno.

**Duas sessões corrigiram o mesmo defeito ao mesmo tempo.** Logo depois do `2c9a89d`, outra
sessão acrescentou um segundo bloco `env` no `vitest.config.js` com o mesmo propósito
(`6de14ad`, "testes sem .env"), o que quebrou o **lint** e fez o passo `Testes` ser saltado;
foi removido em `b515730`. A configuração que sobreviveu é a do `2c9a89d`, com um só bloco
`env`. Antes de corrigir algo que já está documentado como conhecido, vale fazer
`git fetch && git log origin/<ramo>` — pode já estar feito.

## Análise crítica e correcções (2026-11-01, segunda passagem)

Detalhe em `docs/AUDITORIA.md`, secção 9.1. Em resumo:

- **O gate de qualidade passou a existir.** O ESLint tinha `no-undef` e `no-unused-vars` em
  `off` e corria com `--quiet`. Estão a erro, e há 14 testes (`npm test`, vitest + jsdom)
  ligados ao `ci.yml` e ao `scripts/deploy-site.sh`. Ao ligá-lo apareceram três bugs reais —
  entre eles o `autoCode` do `BookFormModal`, que **rebentava o formulário de livro novo**.
  Não voltar a desligar estas regras: era por aqui que passavam os erros que só apareciam no
  browser.
- **Sanitização de HTML** com lista branca explícita no DOMPurify, testada contra os bypasses
  do sanitizador antigo.
- **`/track` já não devolve a imagem da assinatura** (só `delivery_signature_present`).
- **O `/admin` já não descarrega todas as encomendas com `select *`**: usa `ORDER_LIST_FIELDS`
  e lê a assinatura só da encomenda cujo recibo se emite.
- **Carregamento inicial de 580 para 331 KB gzip.** O `manualChunks` à mão era a causa;
  ficou só `vendor-react`. O Firebase é import dinâmico e perdeu o SDK do Firestore.
- **Edge Function publicada** (a CLI desta máquina está autenticada, ao contrário do que a
  primeira passagem concluiu). `/admin/users` e `/contacts/*` voltaram a responder.

Terceira leva, também publicada e verificada: service worker com a navegação em rede
primeiro (acabou o risco de página em branco depois de publicar), `app/web/public/_headers`
com os cabeçalhos de segurança, `robots.txt`/`sitemap.xml`/`og:`, e a permissão verificada
antes da consulta nas rotas `/admin/users/*` (davam 404 vs 403 e diziam que ids existiam).

**Resolvido (2026-11-02):** a migração `limites_pedidos` (limite de pedidos partilhado, em vez de em memória por isolate) foi aplicada pelo MCP e o ficheiro passou a `20261102013223_limites_pedidos.sql`, com o mesmo SQL (md5 igual ao de `schema_migrations`). Testado: com limite 2, o terceiro pedido é recusado, e `anon` não pode chamar `check_rate_limit`. A Edge Function passa a usar o limite partilhado quando a versão nova for publicada.

## Galeria de imagens aplicada (2026-11-02)

A galeria tem 41 imagens em 6 tipos, mas só 3 tipos tinham onde ser escolhidos, e o banner
da loja nunca chegava a aparecer.

- **Banner da loja aplicado.** `loja-banner.webp` era publicado com o site mas o fundo da
  loja ficava em gradiente: a coluna `shop_bg_mode` estava nula e a Edge Function caía em
  `"gradient"`. Passa a ser a predefinição (`DEFAULT_SHOP_BG`), com as predefinições do
  frontend a condizer. Verificado em produção: a API devolve `shop_bg_mode: image` e o
  banner aparece em `/shop`, com o texto e os indicadores legíveis por cima do véu.
  Continua a poder ser mudado em Configurações → Fundo da loja.
- **Tipo `capa`** ligado à "Capa do Livro" e à capa promocional dos slides.
- **Página Sobre editável** (migração `20261102050825_imagens_sobre`, já aplicada): as duas
  imagens estavam escritas no código. Agora vêm das definições, com as do site como
  predefinição, e aparecem em Configurações com a galeria.
  O `SettingsTab` só mostra e grava esses campos quando as colunas existem
  (`'about_top_image_url' in r`): enviá-los sem a migração faria o PostgREST recusar o
  registo inteiro e partir o gravar das Configurações. Manter essa verificação ao
  acrescentar campos novos.
- **Limite de pedidos partilhado confirmado a funcionar**: 22 pedidos seguidos ao `/track`
  dão 20× 404 e 2× 400, ou seja corta exactamente no `trackRate` configurado, sem nenhum
  500.

Por escolher (são decisões de imagem, não de código): quais das opções da galeria ficam nos
slides, nos banners e nas capas das colecções. As capas das 4 colecções ainda apontam para
fotos genéricas do Unsplash.

## Cabeçalho, equipa e rodapé (2026-11-02)

- **"Sobre" no cabeçalho**, no menu principal (link simples, como o "Início") e no menu do
  telemóvel. Confirmado no site publicado.
- **Secção "A Nossa Equipa"** na página Sobre, por baixo da história: fotografia redonda,
  nome e função, 2–4 por linha. **Sem ninguém na lista a secção não aparece**, e é esse o
  estado actual — os nomes, funções e fotografias são dados de pessoas reais e não foram
  inventados. Preenche-se em **Configurações → Marca → "Equipa na página Sobre"**
  (acrescentar, remover, subir, descer; fotografia por URL ou envio). Migração
  `20261102052614_equipa_sobre`, já aplicada (coluna `about_team` confirmada por
  `GET /rest/v1/site_settings?select=about_team` = 200).
  A rota pública `/settings` limita o que devolve: 40 pessoas, 120 caracteres por campo, e
  fotografia só se for http(s) ou caminho do próprio site.
- **Rodapé** com três colunas revistas, só com caminhos que existem: apoio (rastreio,
  envios, FAQ, contacto, lojas), comprar (catálogo, coleções, levantamento, pagamento na
  entrega, sobre) e conta (entrar, encomendas, lista de desejos, dados, segurança).
- **Rodapé com funções, não só links** (bloco entre as colunas e as lojas):
  - *Rastrear encomenda* ali mesmo — número e email, e o `/track` abre já preenchido
    (via `location.state`, como vindo do checkout). Testado no site publicado: leva a
    `/track` com o número no campo.
  - *Como compra e recebe* — limiar de portes grátis lido das Configurações, levantamento
    em loja quando alguma loja o tem activo, assinatura na recepção, e WhatsApp directo
    quando há número.
  - *Pagamentos aceites* — os métodos activos, pela mesma rota pública do checkout, para
    não ser uma lista à mão que fica velha. Atenção: `getPaymentMethods()` devolve
    `{ methods }`, não um array.
- **O perfil aceita o separador no URL** (`/profile?tab=wishlist`), como o painel já fazia.
  É o que permite aos atalhos do rodapé abrirem já na secção certa.

### Capas das colecções — aplicado (2026-11-05)

`supabase/migrations/20261105045517_capas_das_colecoes.sql` trocou as capas das quatro
colecções (fotos genéricas do Unsplash) pelas imagens feitas com as capas reais do catálogo.
Continuam a poder ser mudadas em Admin → Colecções → Capa → aba Galeria.

## Checkout no telemóvel (2026-11-02)

Medido no site publicado, num ecrã de 375×812 (viewport útil 886 px):

| | Antes | Depois |
|---|---|---|
| Rodapé do carrinho | 485 px | 303 px |
| Janela do formulário | 288 px | 469 px |
| Conteúdo do formulário | 2094 px | 2094 px |

O cliente preenchia morada, pagamento e assinatura por uma frincha de 288 px.

- O detalhe do rodapé (avisos, selos, progresso de portes, subtotal e selector de envio)
  passa a ficar atrás de uma barra **"Ver resumo e portes"**, que já mostra o total. O Total
  e os botões ficam sempre à vista. Confirmado que abre e fecha: fechado 469 px, aberto
  276 px com o subtotal e os portes visíveis — nada ficou inacessível.
- **No computador (`sm:`) está tudo aberto, exactamente como antes.** As alterações são de
  disposição e área tocável; não houve mudanças de cor, tipo de letra ou forma dos cartões.
- **Pagamentos:** o cartão inteiro passa a seleccionar o método (antes só o texto e o botão
  de rádio respondiam ao toque — confirmado a tocar fora do texto, o método muda). A
  referência e o QR deixam de ser indentados em ecrã estreito.
- O tipo do método deixou de aparecer cru (`p2p`, `offline`, `transfer`): mostra **"paga
  antes do envio"** ou **"paga na entrega"**, pela mesma regra que o servidor usa para
  exigir referência.

### ~~Dado por preencher, visível ao cliente~~ — resolvido a 2026-11-03

O IBAN real (titular Livraria e Editora Adventista) foi gravado em Pagamentos → Transferência Bancária. O texto abaixo fica como histórico.

A "Transferência Bancária" mostra no checkout `IBAN: AO06 0000 0000 0000 0000 0000 0` —
o valor de exemplo, todo a zeros. Quem escolher transferência vê um IBAN falso. Corrigir em
**Admin → Pagamentos**. (Verifiquei que não é corte de layout: o texto cabe e é mesmo este o
valor guardado.)

## Catálogo: páginas e cartões mais limpos (2026-11-02)

- **Páginas a sério.** O catálogo não paginava: o "Carregar mais" acumulava
  24 → 48 → 72 → 102 livros na mesma página. Passa a páginas de `shop_per_page`: no
  computador os números com "…" à volta da actual; no telemóvel só "Página 2 de 5" entre as
  setas (uma fila de números não cabe). Mudar de página volta ao topo da lista; filtrar ou
  ordenar volta à primeira. O contador diz "A mostrar 25–48 de 102".
- **Ícones em vez de autocolantes.** O mesmo cartão dizia o stock **quatro** vezes: marca
  cor-de-rosa a pulsar na imagem, faixa do admin ("ÚLTIMAS UNIDADES"), etiqueta ao lado do
  preço ("Baixo Estoque · 3 un.") e ainda "Últimas 3". Agora: uma marca redonda por estado
  na imagem (estrela = destaque, triângulo = poucas unidades), com `title` e texto para
  leitores de ecrã; a faixa do admin só aparece se acrescentar alguma coisa (não é mostrada
  quando é só "Destaque", que repete a estrela, nem quando há aviso de stock); e o número de
  unidades aparece uma só vez, junto ao preço ("Restam 3").
- **Cartão deixou de transbordar.** Medido: cartão de 160 px com 209 px de conteúdo — os
  dois botões lado a lado não cabiam e o preço partia em duas linhas. Em ecrã estreito fica
  só "Comprar" (tocar no cartão já abre o livro); a partir de `sm:` continuam os dois. A
  linha do preço pode quebrar. Confirmado em produção: nenhum dos cartões transborda.

Cores, tipos de letra e forma dos cartões ficaram como estavam.

## Checkout por método de entrega (2026-11-02)

Até aqui os dois métodos exigiam o mesmo, e quem ia buscar à loja assinava um comprovativo
de entrega de uma entrega que não existe.

| | Levantamento na loja | Entrega ao domicílio |
|---|---|---|
| Conta | não precisa | **obrigatória** |
| Nome e telefone | obrigatórios | obrigatórios |
| Email | opcional (recibo) | obrigatório |
| Morada | não pede | obrigatória |
| Assinatura | **não pede** | obrigatória |
| GPS | — | opcional, botão "Usar a minha localização" |

Verificado em produção, sem sessão:

- entrega sem email → `Email obrigatório para entrega ao domicílio.`
- levantamento sem email, morada nem assinatura → passa a validação
- levantamento sem nome → `Nome obrigatório.`
- na interface: ao escolher levantamento desaparecem a assinatura e a morada, o email fica
  marcado como opcional e o botão de confirmar desbloqueia; na entrega sem sessão o aviso
  aparece e o botão fica bloqueado.

A regra está nos dois lados: o cliente explica, o servidor decide.

**GPS:** as colunas `delivery_gps_lat/lng` existiam desde o início e **nunca eram
escritas**. Passam a ser preenchidas quando o comprador partilha a localização (mesmo padrão
da página das lojas). Em Angola a morada é muitas vezes uma referência, e o estafeta ficava
sem o ponto exacto.

### Funções subentendidas e repetidas (por limpar)

Encontradas a confirmar o ponto acima. Não foram mexidas — mexer no esquema das encomendas
é arriscado e merece uma decisão:

- ~~**Três campos para o método de pagamento**~~ — **tratado a 2026-11-03.** Todos os ecrãs,
  emails e o recibo do WhatsApp lêem por `orderPaymentLabel`/`orderPaymentCode`
  (`orderUtils.js`) e `paymentLabel` (`orderFields.ts`); antes, o recibo mostrava o nome e a
  exportação o código. O checkout deixa de gravar `payment_method` e grava sempre um nome.
  `supabase/migrations/20261105045510_campos_encomendas.sql` (preenche as antigas) foi aplicada
  a 2026-11-05. Falta apagar `payment_method`.
- **`order_type` é derivado de `sale_channel`** (`whatsapp_order` ⇔ `whatsapp`): dois campos
  para a mesma verdade, que podem divergir.
- **`payment_category`:** coluna morta (vazia em todas as encomendas). O painel deixou de a
  pedir; falta apagá-la (ver o README de `docs/migracoes-pendentes`).
- **`delivery_recipient_id`:** o `/confirm-delivery` guarda o número do documento de quem
  recebe, e **nada o lê**. É recolher um documento de identificação sem uso — ou passa a
  aparecer no painel, ou deixa de ser pedido.
- ~~**Morada em dobro**~~ — **tratado a 2026-11-03.** Leitura por `orderDeliveryAddress`,
  `orderPickupStore` e `orderLocality` (e `deliveryAddressLine`/`pickupStoreName` na
  função). O painel mostrava a loja dos levantamentos duas vezes ("Levantamento: X, X"). O
  checkout deixa de gravar `address`; `city` continua, porque o trigger `orders_before_update`
  o usava como local do seguimento — a migração `20261105045510_campos_encomendas` (aplicada a
  2026-11-05) mudou isso.

## Regras para continuar

- **Migrações novas:** aplicar com a ferramenta `apply_migration` do Supabase. Depois ler a versão atribuída em `supabase_migrations.schema_migrations` e guardar o ficheiro com esse nome e **exactamente** o mesmo SQL. Se as versões não coincidirem, `supabase db push` no CI falha.
- **Testes na base de dados:** usar um bloco `do $$ … raise exception 'RESULTADO …' $$` para que tudo seja anulado no fim. Usar emails `@exemplo.invalid`.
- **Verificar antes de enviar:**
  - `npm run lint`
  - `npm run build`
  - `deno check --node-modules-dir=auto index.ts`. Correr numa cópia do ficheiro fora do repositório: dentro do repositório, o Deno carrega as dependências do site e pode ficar sem memória.
- **Edge Function grande (76 KB):** não a publicar colando o código à mão. Usar o workflow ou `npx supabase functions deploy app --project-ref bggqkjjqbjhbjsckzopj --no-verify-jwt`, com um token.
- **Commits** em português, no ramo acima. Não abrir PRs novos; o #3 está aberto.

## Próximos passos sugeridos

1. Depois de a conta GitHub ser desbloqueada, confirmar que o `ci.yml` fica verde no PR #3 e corrigir o que falhar.
2. Depois do merge, confirmar os dois deploys e testar no site:
   - login Google;
   - módulo de utilizadores (criar, editar, suspender, apagar, link de acesso);
   - um gestor com permissões parciais.
3. Limpezas pendentes:
   - a Edge Function `migrar-dados` (já só responde 410) é apagada pelo `deploy-supabase.yml` no primeiro deploy depois do merge, com autorização do dono;
   - ~~testar as regras de `wishlists` e `book_reviews`~~: testado. Cada cliente só vê e altera os seus desejos e avaliações; os visitantes lêem avaliações mas não escrevem; o nome vem do perfil (não do cliente) e "compra verificada" só é dada a quem comprou o livro;
   - publicar `firestore.rules` no Firebase, se alguma vez lá foram publicadas regras abertas.
4. ~~Políticas de CRM com `is_staff()`~~: feito na migração `20261101170640_permissoes_crm_integracoes` (CRM com `manage_users`/`manage_marketing`; integrações e registo de comunicações só admin; ler `site_settings` exige `manage_settings`). O Storage passou a exigir a permissão da pasta (`private.can_write_media`, migração `20261101172336_permissoes_storage`).

## Limpeza de 2026-11-01

- Removidos do repositório o backend PocketBase (`app/pocketbase`, incluindo 5 cópias de bases de dados de teste), `pb_import` (as 102 capas já estão no Storage) e o script de migração. Continuam no histórico do git.
- `package.json` da raiz: sem scripts nem dependências do PocketBase; `firebase` passou para `app/web/package.json`; `workspaces` fixo em `app/web`.
- `vite.config.js`: sem o proxy `/api/pb` nem o chunk do PocketBase.
- README, `docs/ARQUITETURA.md` e `docs/LANCAMENTO.md` reescritos para Supabase + Cloudflare.
- **Segurança:** o README publicava `admin@livraria.ao` / `admin123456`, e essa palavra-passe funcionava numa conta `admin` real. A palavra-passe foi trocada por uma aleatória (não guardada) e a conta nunca tinha sido usada. As credenciais saíram da documentação, mas continuam no histórico do `main`, por isso não podem voltar a ser usadas.

## Edge Function `app` — revisão de segurança (2026-11-01)

Ainda não publicada; vai no deploy depois do merge.

- `/whatsapp/receipt`:
  - exige o email da encomenda;
  - envia só para o telefone registado na encomenda;
  - o texto é montado no servidor (antes aceitava texto e telefone vindos do browser, o que permitia enviar mensagens pelo número oficial da loja);
  - no máximo 3 recibos por encomenda e por minuto.
- `/track` e `/confirm-delivery`: limite de pedidos por IP; a assinatura fica limitada a cerca de 600 KB.
- `/contacts/*`: exige `manage_users` ou `manage_marketing`. `/admin/email/test` e `/admin/whatsapp/test`: exigem `manage_settings`. `requireStaff` foi removida.
- `/settings`, `/messaging/status`, `/push/config` e `/integrations` só devolvem dados públicos (verificado).
- `/checkout`:
  - o método de pagamento tem de estar activo em `payment_methods`, e a encomenda guarda `payment_method_name`;
  - o número de encomenda passa a `ENC-` + hora + 3 caracteres aleatórios;
  - o envio fica limitado a `delivery`/`express`/`pickup`, e todos os textos têm tamanho máximo.
- `/push/subscribe`: limite de pedidos, endpoint `https` obrigatório e chaves validadas.
- Dados: `payment_methods` tem 3 linhas `unitel_money` repetidas (todas desactivadas). Limpar no painel antes de as activar.

## Integridade e regras configuráveis (2026-11-01)

- Migração `20261101175250_integridade_dados`:
  - stock, preços, totais e portes não podem ser negativos;
  - `book_code` é único quando preenchido;
  - o email do perfil acompanha o da conta (`private.sync_profile_email`).
- Migração `20261101175332_regras_loja`: novos campos em `site_settings`, editáveis em **Configurações → Regras da loja**:
  - `order_number_prefix`;
  - `checkout_notes_max`;
  - `checkout_rate_per_minute`;
  - `track_rate_per_minute`;
  - `receipt_per_order_per_minute`.

  Cada campo tem um limite seguro na base de dados, no painel e na Edge Function (`storeRules`).
- Métodos de pagamento no checkout: só os activos em Pagamentos. Se não houver nenhum activo, aceita "entrega".
- Stock em 2026-11-01: 84 dos 102 livros com 1 a 4 unidades e 12 esgotados.
- Migração `20261101180003_stock_precos_totais`:
  - limite de stock baixo (`low_stock_threshold`) e prefixo de código (`book_code_prefix`) configuráveis em Regras da loja;
  - códigos de livro sequenciais (`private.book_code_seq`: o próximo é LIV-101);
  - `stock_movements`, com o histórico de cada mudança de stock (inicial, venda com o nº da encomenda, cancelamento, ajuste com o autor). Só leitura para `manage_catalog`; aparece em Livro → Métricas;
  - o total da encomenda é recalculado quando mudam os artigos ou os portes;
  - o cancelamento repõe o stock e desconta `sales_count`;
  - `customer_email` fica sempre em minúsculas.
- O site usa só as marcas `stock_low` e `stock_alert` da base de dados (antes misturava "< 5" e "<= 5"). O botão "Marcar resolvido", que não resolvia nada, passou a "Repor stock" e abre o livro.

## Livros, imagens e encomendas — correcções (2026-11-01, sessão local)

- **Guardar livro voltou a funcionar:** o formulário enviava `compras`, `lido`, `baixados` e `vendidos`, que não existem em `stock_books`. A aba Métricas mostra agora `sales_count` e `views_count`. Ao mexer em formulários, valida que todas as chaves existem: `GET /rest/v1/<tabela>?select=<chaves>&limit=1` tem de devolver 200.
- **Upload de imagens do computador:** em livros, slider e configurações a imagem perdia-se ao guardar (ficava um `blob:` que era limpo). O `ImageField` tem agora `uploadFolder`, que envia logo para `media/<pasta>/uploads/` e devolve o URL público. Guardar fica bloqueado enquanto há envios (`isUploadPending` em `lib/mediaUpload.js`).
- **Encomendas:** cancelar devolvia o stock em dobro (frontend + trigger). Agora só o trigger `orders_before_update` o faz.
- **Visualizações:** a página do livro chama `/catalog/view` (uma vez por sessão); antes nunca era chamada.
- **Livros:** duplicar, pesquisa e filtros, destaque num clique, descrição com editor rico, páginas de amostra como lista de imagens, preço maior que zero obrigatório, aviso antes de eliminar um livro que já aparece em encomendas.
- **Integrações:** o formulário SMTP de `app_integrations` foi trocado por um aviso, porque o servidor usa `site_settings.smtp_*`.
- **Pendente (precisa da base de dados):**
  - livros ocultos: coluna `active`, RLS pública só para os activos, e o checkout tem de recusar livros ocultos;
  - promoções: `sale_price` com datas, e `place_order` tem de cobrar o preço efectivo;
  - confirmar que o utilizador "Rodrigues" é `admin`;
  - publicar a Edge Function. Na produção, `/admin/users` ainda responde "Rota não encontrada".
  - O plano detalhado está em `docs/PROMPT_REFINAMENTO.md`.

## Painel de vendas por loja (2026-11-01, sessão local)

- O separador "Vendas por loja" (antes "Vendas Huambo") calcula em cêntimos, exporta em Excel, PDF, PNG, vídeo, CSV e JSON, e lê as vendas registadas no sistema (encomendas) por loja e por mês. A introdução manual continua igual.
- **Por aplicar, em `docs/migracoes-pendentes/` (ver o README de lá):**
  1. passar a loja de Talatona para o Huambo (pedido do dono);
  2. a migração `painel_vendas_por_loja`.
- O painel funciona antes e depois da migração.

## Coleções, slider, pagamentos e integrações (2026-11-01)

- **Pagamentos** (`PaymentsTab.jsx`):
  - subir/descer (a ordem é a do checkout) e activar ou desactivar na própria linha;
  - eliminar pede confirmação e propõe desactivar quando há encomendas com o método ou é do sistema (`entrega`, `transferencia`); estes códigos não podem ser renomeados;
  - código normalizado e sem repetidos; avisos quando nenhum método está activo ou há códigos repetidos.
  - **Pendente (decisão do dono):** há 3 linhas `unitel_money` repetidas, inactivas e sem encomendas. Não foram apagadas; depois de as limpar, convém criar um índice único em `payment_methods.code`.
- **Coleções** (`CollectionsTab.jsx`):
  - eliminar tira os livros da coleção (antes ficavam a apontar para uma coleção que já não existia) e propõe "Ocultar";
  - ordem, visível/oculta e destaque num clique;
  - adicionar livros com pesquisa; endereço sem repetidos; contadores de SEO.
- **Slider** (`SlidesTab.jsx`, migração `20261101180619_slides_agendamento`):
  - `starts_at` e `ends_at`; a leitura pública só devolve slides activos dentro do período (quem tem `manage_catalog` vê todos), e `getHeroSlides` também filtra pelas datas;
  - ordem, activar, tornar principal (só um de cada vez), duplicar e estado "No ar / Agendado / Terminado";
  - aviso quando o preço do slide difere do preço do livro, que é o cobrado no checkout. Quando houver promoções nos livros, o slide pode passar a usar o preço efectivo.
  - Testado na base de dados (transacção anulada): o visitante só vê o slide no ar; um período inválido é recusado.
- **Integrações** (`AppsTab.jsx`): ficam só o Google Drive e o WhatsApp Business, os únicos que o servidor lê. Os interruptores sem efeito (OAuth, Maps, Contactos, Newsletter, PWA, Rastreio, SMTP) passam a uma lista com o separador onde cada um se configura. As linhas antigas em `app_integrations` continuam na base de dados, sem uso.
- **Lojas:** revistas; já tinham pesquisa, filtros, ordem e confirmação ao eliminar.
- **Contactos e campanhas** (`ContactsManager.jsx` e `/contacts/*` na Edge Function):
  - abrir o separador corria as campanhas pendentes e enviava mensagens; agora só correm com o botão "Enviar pendentes (N)", com confirmação;
  - "Não contactar" (etiqueta `nao-contactar`): fica fora dos envios manuais, das campanhas e do WhatsApp rápido, no painel e no servidor;
  - `/contacts/notify`: no máximo 300 contactos, mensagem obrigatória, canal válido e textos limitados;
  - sem a API do WhatsApp, o envio fica como "Link manual" em vez de "Enviado".
  - Pendente: a Edge Function publicada ainda é a antiga. Até ao deploy, o painel já filtra os "não contactar", mas o servidor ainda marca como "Enviado" os envios que só têm link.
- **Página pública das lojas:** revista; sem alterações.
- **Conta do cliente:**
  - Login: o registo com confirmação de email já não aparece como erro; "Continuar com Google" só aparece com `google_oauth_enabled`; o login deixa de depender do `/health` da Edge Function; o exemplo do email já não é o de um administrador.
  - Perfil: o novo email só vale depois de confirmado (até lá, ficam o email e as encomendas actuais); "Google Workspace" só para a equipa; "CRM Contactos" com `manage_marketing`/`manage_users`; foto até 2 MB.
  - Seguimento: passos próprios para levantamento na loja e aviso nas encomendas canceladas. `/track` devolve `shipping_method` e `pickup_store`, o que só tem efeito depois do deploy da Edge Function.
  - Avaliações: editar a própria avaliação e confirmar antes de eliminar.

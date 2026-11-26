# Spec: KANGEST ONE

O que o KanGest Desktop e o site da Livraria Editora Adventista são como plataforma única. Para cada requisito diz-se
o que está feito, onde, e como se prova.

- **Estado:** em 2026-11-26.
- **O plano aprovado:** está no `~/.claude/plans`, e o essencial está aqui.

**Regra:** quando uma peça mudar, muda aqui e no código, no mesmo commit, como em [SPEC-COMPONENTES.md](SPEC-COMPONENTES.md).

## 1. O pedido

O dono pediu, a 26/11, um só ecossistema: o KanGest Desktop (Tauri 2) e o site (React + Supabase).
- **A mesma identidade** em todos os lados.
- **Os mesmos dados oficiais,** num servidor central.
- **Comunicação só por APIs seguras.**
- **Entrada obrigatória** em cada abertura do desktop.
- **Um único livro de stock.**
- **Sincronização e modo offline.**
- **Monitorização.**
- **14 testes de aceitação** com prova verificável.

Restrições de segurança, palavra por palavra:

> Nunca incluir `service_role`, chaves secretas ou credenciais administrativas no código React, no JavaScript compilado
> ou no instalador Tauri.
>
> Não efectuar alterações destrutivas na produção sem autorização.
>
> Quando uma integração exigir credenciais externas, identifica a variável de ambiente necessária, explica onde deve ser
> configurada e nunca inventes credenciais.
>
> Não utilizar uma chave estática embutida no desktop como mecanismo de autenticação.
>
> Usar armazenamento de sessão apenas em memória no desktop, sem persistir refresh tokens.

## 2. As decisões do dono (26/11)

1. **A API:** o KanGest Core API é a Edge Function `app` do Supabase, sem um Worker da Cloudflare à frente.
2. **A entrada:** faz-se em cada abertura do desktop. Os tokens ficam só em memória. Sem Internet há um modo limitado: vende-se e factura-se, mas a loja online e a confirmação de pagamentos ficam para quando houver ligação.
3. **O stock:** um livro oficial de movimentos no Postgres central.
4. **As contas:** todas são contas do site. As contas locais passam a só leitura, e fica apenas o ADMIN de recurso, auditado.
5. **A ordem:** A → F → B → C → D → E.
6. **A API v1:** com as 17 famílias de rotas, em 3 PRs.
7. **O estilo (fase G):** unifica-se tudo menos as cores da marca. O KanGest mantém o verde-azulado e o site o petróleo e o ouro.

## 3. O mapa

| Peça | Onde | Doc |
|---|---|---|
| Dados | um só projecto Supabase (`bggqkjjqbjhbjsckzopj`): Postgres com RLS, migrações em `supabase/migrations` | [ARQUITETURA.md](ARQUITETURA.md) |
| Core API | Edge Function `app`: as rotas antigas e a API v1 (`/api/v1/*`), cada rota com o acesso declarado (`access.ts`) | [api/README.md](api/README.md), [api/openapi.json](api/openapi.json) |
| Identidade | Supabase Auth com os dois passos para a equipa; no KanGest, a conta do site (`sinc/entrada.rs`, `services/auth.rs`) | [ENTRADA-COM-A-CONTA-DO-SITE](../app/kangest-sistema/docs/ENTRADA-COM-A-CONTA-DO-SITE.md) |
| Sincronização | cada KanGest é um posto Ed25519, com uma volta assinada e cifrada (`/kangest/sinc`) | [KANGEST-SINCRONIZACAO.md](KANGEST-SINCRONIZACAO.md) |
| Livro de stock | `public.stock_movimentos`: o KanGest (`sinc/livro.rs`) e as encomendas do site | §15 de KANGEST-SINCRONIZACAO |
| Saúde | `GET /api/v1/system/health`, o cartão «Ecossistema» no painel, o «Servidor central» e o painel inicial no KanGest | §16 de KANGEST-SINCRONIZACAO |
| Ambientes | desenvolvimento (PGlite, vitest, Rust), staging e produção | [AMBIENTES.md](AMBIENTES.md) |
| Sistema de desenho | `packages/marca/tokens.css`, partilhado | [SPEC-COMPONENTES.md](SPEC-COMPONENTES.md) §«Estados partilhados» |

## 4. O estado, fase a fase

| Fase | O que faz | PR | Em produção |
|---|---|---|---|
| A1 | a sessão do site no KanGest só em memória: não há tabela `sessoes_site`, e nenhum token vai para o disco | #151 | KanGest 1.4.9 (por publicar) |
| A2 | uma só identidade: num KanGest ligado, as contas locais têm data-limite (30 dias a contar da ligação ao site) e depois só lêem; contas locais novas, só o ADMIN; o modo sem Internet | #152, #167 | KanGest 1.4.9 |
| A3 | as sessões abertas no painel do site, com «Terminar»; o ADMIN de recurso entra no registo de segurança com aviso; o ecrã de entrada mostra a ligação | #153 | sim (20261126180000); o KanGest na 1.4.9 |
| F | o staging antes da produção no `deploy-supabase.yml` (passa à frente sem staging) | #154 | sim; o staging é do dono |
| B1 | o livro de stock em sombra: as aberturas por época e os movimentos do KanGest (só dos artigos que o livro segue) | #155, #167 | sim (20261126190000); o KanGest na 1.4.9 |
| B2 | as encomendas do site no livro: reserva no checkout, libertação no cancelamento ou na FR do posto; o resumo do painel conta só as encomendas em curso | #156, #167 | sim (20261126200000); 20261126230000 com o #167 |
| B3 | o stock à venda passa a sair do livro | — | **por fazer:** espera pelo staging |
| C1–C3 | a API v1 com as 17 famílias, o contrato OpenAPI, o `Idempotency-Key` e as leituras pelo RLS | #157, #158, #160 | sim (20261126210000) |
| D | o artigo no site a partir da ficha do artigo, nunca a 0 Kz | #159 | KanGest 1.4.9 |
| E | a saúde do ecossistema: a API, o painel e o `redact()` | #161 | sim (20261126220000) |
| E2 | a versão mínima do KanGest (`KANGEST_MIN_VERSION`) e o cartão «Servidor central» | #162 | KanGest 1.4.9; o segredo é do dono |
| G1 | os tokens partilhados com o contraste AA conferido | #163 | sim (o site) e KanGest 1.4.9 |
| G2 | o ecossistema no painel inicial do KanGest | #164 | KanGest 1.4.9 |
| Teste 13 | nenhuma credencial privilegiada no site nem no ecrã do KanGest compilados (o CI) | #165 | sim (CI) |
| Aceitação | `scripts/aceitacao/kangest-one.mjs` contra um ambiente | #166 | corrido contra a produção: 7 de 7 |

## 5. Os 14 testes de aceitação e a prova de cada um

| # | Cenário | Prova (corre no CI) |
|---|---|---|
| 1–3 | entrar, fechar, abrir e ter de entrar outra vez; nenhum token no disco | Rust: `loja_online_conta_do_site` (sem a tabela `sessoes_site` e nenhum token na base), `entrar_com_a_conta_do_site` e `a_identidade_unica_num_kangest_ligado_ao_site` |
| 4–5 | o produto e o preço do KanGest no site | Rust: `sinc_catalogo_stock_e_artigos` e `o_artigo_no_site_pela_ficha`; PGlite: `kangest.mjs` e `kangest-artigos.mjs` |
| 6 | a encomenda do site no KanGest | Rust: `loja_online_copia_local` e `sinc_encomendas_pela_api_interna`; PGlite: `kangest.mjs` |
| 7 | a venda no KanGest chega ao site | Rust: `livro_de_stock_para_o_site`; PGlite: `stock-livro.mjs` e `stock-livro-site.mjs` |
| 8 | o pagamento confirmado chega ao financeiro | PGlite: `pagamentos.mjs` e `kangest-central.mjs` (`kangest_movimentos`) |
| 9 | a devolução no inventário | Rust: `notas_de_credito_limitadas_a_origem` e `livro_de_stock_para_o_site` (o tipo `devolucao`); PGlite: `stock-livro.mjs` |
| 10 | sem autorização não acede | vitest: `access.test.ts` e `apiV1.test.ts` (a porta de cada rota); PGlite: `como('authenticated', …)` em cada cenário; a aceitação: 401 e 403 sem sessão |
| 11–12 | offline sem perda, e a recuperação | Rust: `sincronizacao_com_a_livraria` (a fila e a idempotência) e `livro_de_stock_para_o_site` (o site sem o livro: tudo espera) |
| 13 | nenhuma credencial privilegiada no cliente | CI: `verificar-segredos.mjs --pasta dist/app/web` e `--pasta dist` (o KanGest); vitest: `verificar-segredos.test.mjs` |
| 14 | tudo fica auditável | Rust: `auditoria_com_antes_depois_e_selo` e `integridade_da_cadeia_e_proteccao`; PGlite: `kangest-sessoes.mjs` (o registo de segurança) e `seguranca.mjs` |

**Contra um ambiente vivo:** `node scripts/aceitacao/kangest-one.mjs <endereço>`. Com `KANGEST_ONE_TOKEN`, confere também a saúde e o livro de stock.

## 6. Como as restrições de segurança se cumprem

| Restrição | Como |
|---|---|
| a `service_role` nunca vai para o cliente | só existe nos segredos da Edge Function; o CI falha se o site ou o ecrã do KanGest compilados a levarem (teste 13); na API v1, as leituras do catálogo, do stock, das encomendas, das vendas, das facturas e dos relatórios vão pela sessão de quem pede (`dbDaPessoa`) e pelo RLS; `users` e `customers` usam a função e a porta das rotas do painel (`admin_users_list`, `manage_users`), como `/admin/users` |
| nada destrutivo na produção sem autorização | as migrações destas fases só acrescentam (tabelas, funções, gatilhos que nunca impedem uma encomenda); um backup cifrado antes de cada migração (`deploy-supabase.yml`); o livro de stock não se altera nem se apaga |
| as credenciais externas | cada variável está identificada em §7 e em [AMBIENTES.md](AMBIENTES.md); nenhuma é inventada |
| nenhuma chave estática como autenticação no desktop | o posto autentica-se com uma chave Ed25519 própria, gerada no emparelhamento e revogável no painel; as pessoas, com a conta do site |
| a sessão só em memória no desktop | `sinc/pessoa.rs` (um mapa em memória por base); a migração 0069 apagou `sessoes_site`; teste 1–3 |

## 7. Variáveis e segredos

| Onde | Nome | Para quê | Estado |
|---|---|---|---|
| Edge Function | `KANGEST_SINC_CHAVES`, `KANGEST_DADOS_CHAVE` | a sincronização dos postos | gerados por `scripts/kangest/chaves-sinc.mjs`; se faltarem, o painel avisa (Configurações → KanGest → Postos) |
| Edge Function | `KANGEST_MIN_VERSION` | a versão mínima do KanGest (fase E) | **do dono, opcional** |
| GitHub, ambiente `staging` | `STAGING_SUPABASE_URL`, `STAGING_DB_PASSWORD` (e, opcionais, `STAGING_SUPABASE_ACCESS_TOKEN` e `STAGING_SUPABASE_ANON_KEY`) | o staging antes da produção (fase F) | **do dono** |
| quem corre a aceitação | `KANGEST_ONE_TOKEN` | a sessão de uma conta da equipa, para as verificações com sessão | só na hora |

## 8. O que falta (verificado no código a 26/11, depois da 1.4.9)

| # | Fase | O que falta | Depende de |
|---|---|---|---|
| 1 | A | ✅ (#169) **O modo sem Internet a dizer porquê.** A sessão fica marcada `offline` e a barra avisa. Mas a Loja online, o atendimento e as alterações às encomendas respondem «Entre com a sua conta do site…», sem dizer que é por estar sem Internet | — |
| 2 | A/G | ✅ (#169) **O estado da sincronização na barra de cima** (ligado, sem ligação, por enviar). Hoje só está no painel inicial e no Centro de Integrações | — |
| 3 | B | ✅ (#169) **O alerta de «stock negativo»:** o livro de um posto que fica abaixo de zero tem de aparecer no painel para acerto, e nunca ser uma perda silenciosa | — |
| 4 | E | ✅ (#170) **O «Servidor central» do KanGest com a saúde do site** (`/api/v1/system/health`), com a conta do site da pessoa. Hoje mostra o estado do lado do KanGest | — |
| 5 | A | **«Ligar a uma conta do site»** no ecrã Utilizadores: o convite por email e, à primeira entrada com essa conta, a conta local fica ligada (com o histórico) | — |
| 6 | B3 | **O stock à venda a sair do livro:** `stock_por_loja`, a reserva só com disponibilidade (`FOR UPDATE`) e as novidades com o stock do livro | o staging |
| 7 | G | **Os componentes de todos os dias com a mesma linguagem nos dois lados,** e as capturas antes e depois | a revisão do dono |
| 8 | A | **O Google Login no KanGest** | o Google ligado no Supabase Auth |
| 9 | F | **A aceitação contra o staging** (com token) | o staging |

# Painel de administração — especificação

O painel (`/admin`) tem **uma estrutura e duas disposições**. A estrutura é igual nas duas; muda só
a navegação. Cada pessoa da equipa escolhe a sua, no menu da conta (canto superior direito).

| Disposição | Navegação | Para quem |
|---|---|---|
| **Separadores no topo** (a de omissão) | Linha dos grupos e, por baixo, as secções do grupo aberto | Quem prefere o painel de sempre, com a largura toda para as tabelas |
| **Barra lateral** | Todas as secções à esquerda, por grupos; recolhe aos ícones | Quem salta muito entre secções |

A escolha é **por conta** e fica sincronizada:
- neste aparelho (`localStorage`, chave `livraria:painel:disposicao:<id da conta>`) — no computador
  partilhado da loja, cada pessoa fica com a sua;
- na conta (metadados do utilizador, campo `painel_disposicao`) — num aparelho onde a pessoa ainda
  não escolheu, o painel abre com a disposição escolhida noutro;
- entre separadores — com o painel aberto em dois separadores, mudar num muda no outro.

Sem armazenamento (navegação privada bloqueada), vale a de omissão.

## 1. Regiões

```
Separadores no topo                         Barra lateral
┌──────────────────────────────────────┐    ┌────────┬─────────────────────────────┐
│ Barra do topo                        │    │ Barra  │ Barra do topo               │
├──────────────────────────────────────┤    │ lateral├─────────────────────────────┤
│ Grupos                               │    │        │ Alertas da equipa           │
├──────────────────────────────────────┤    │ grupos │─────────────────────────────│
│ Secções do grupo                     │    │   e    │ Cabeçalho da secção         │
├──────────────────────────────────────┤    │secções │                             │
│ Alertas da equipa                    │    │        │ Conteúdo                    │
├──────────────────────────────────────┤    │        │                             │
│ Cabeçalho da secção                  │    │ Ver a  │                             │
│ Conteúdo                             │    │ loja   │                             │
└──────────────────────────────────────┘    └────────┴─────────────────────────────┘
```

### 1.1 Barra do topo — `components/admin/shell/AdminTopBar.jsx`
- Altura 56 px (`h-14`), colada ao topo (`sticky`, `z-40`), fundo translúcido com desfoque.
- Da esquerda para a direita:
  1. Botão do menu: só na barra lateral (abre/recolhe) e no telemóvel (abre a gaveta).
  2. Emblema e "Painel": nos separadores e no telemóvel (na barra lateral estão no topo da barra).
  3. **Onde se está**: `Grupo › Secção` (o grupo a partir dos 768 px).
  4. **Sincronização**: "Actualizado há 2 min" (o texto a partir dos 1280 px; antes só o ícone),
     que roda enquanto actualiza; carregar actualiza já. Sem rede: "Sem ligação" (âmbar).
  5. **Procurar** (Ctrl+K / ⌘K): campo de 256 px a partir dos 640 px; abaixo, só a lupa.
  6. **Ver a loja**: abre `/` noutro separador (a partir dos 640 px; sempre no menu da conta).
  7. **Conta**: avatar (e nome a partir dos 1024 px). Menu: nome, email e papel, **Disposição do
     painel**, O meu perfil, Ver a loja, Terminar sessão, e os atalhos de teclado.

### 1.2 Navegação — separadores — `AdminTabsNav.jsx`
- **Grupos** (sublinhado na cor da marca no activo, 44 px de altura): Início, Catálogo, Vendas,
  Relatórios, Clientes, Igreja, Sistema. Cada grupo mostra a **soma** dos números das suas secções.
- Carregar num grupo abre **a secção onde se estava nesse grupo da última vez** (ou a primeira).
- **Secções do grupo**: pílulas de 36 px com ícone, nome e número; a activa a cheio.
- No telemóvel só aparece a linha das secções do grupo (desliza na horizontal, colada por baixo da
  barra do topo); os grupos estão na gaveta.

### 1.3 Navegação — barra lateral — `AdminSidebarNav.jsx` (sobre `components/ui/sidebar.jsx`)
- Largura 16 rem; recolhida, 3 rem (só ícones, com o nome em dica e o número como um ponto).
- Abre/recolhe com o botão do topo, **Ctrl+B / ⌘B** ou a margem direita da barra.
- Começa **aberta a partir dos 1024 px** e **recolhida abaixo**; depois vale o que a pessoa escolheu
  (chave `livraria:painel:barra-aberta:<id>`).
- Topo: emblema, "Painel", "Livraria Adventista" (leva ao Início). Fim: "Ver a loja", com espaço
  por baixo para o botão do atendimento (canto inferior esquerdo).
- A secção aberta fica sempre à vista na lista.

### 1.4 Telemóvel (< 768 px) — as duas disposições
- A navegação completa é a **gaveta** (abre do botão do menu, fecha ao escolher uma secção, com
  Escape ou tocando fora).
- Alertas da equipa com o texto em 3 linhas no máximo.

### 1.5 Alertas da equipa — `components/admin/StaffAlertBar.jsx`
Largura inteira, por baixo da navegação, para quem gere encomendas: activar som e notificações,
encomendas novas, alertas urgentes e de segurança. Deslocam-se com a página (não tapam a barra do
topo). "Ver" leva ao Acompanhamento ou ao Atendimento.

### 1.6 Cabeçalho da secção — `AdminSectionHeader.jsx`
Igual em todas as secções: **grupo** (12 px, maiúsculas), **título** (`h1`, 28 px, Fraunces),
**descrição** (14 px, até 48 rem) e, à direita, as **acções** da secção (ex.: "Adicionar produto").
Os textos vêm do registo (§3). Os separadores internos não repetem o título; mostram só o seu
estado e os seus botões (ex.: "3 no ar agora", "Actualizar", "Nova loja").

### 1.7 Sincronização dos dados — `hooks/useAutoRefresh.js`
Encomendas, produtos e stock actualizam-se sozinhos, sem recarregar a página: **de minuto a minuto
com o painel à vista**, **ao voltar ao separador** (se passaram mais de 15 s) e **quando a rede
volta**. Um pedido de cada vez; sem rede não tenta. Só a primeira carga mostra a espera: as
seguintes (incluindo depois de gravar) trocam os dados por baixo, sem a lista piscar. Os números da
navegação, o Início e o título do separador do navegador acompanham.

O **título do separador do navegador** diz a secção e, para quem gere encomendas, quantas pedem
acção: `(7) Encomendas · Painel`.

### 1.8 Filtros no endereço
Os filtros das listas ficam no endereço da página — recarregar, voltar atrás ou mandar a ligação a
um colega abre a lista como estava. Valores desconhecidos valem "todos".

| Lista | Parâmetros |
|---|---|
| Encomendas | `estado` (pending, confirmed, shipped, delivered, cancelled), `pagamento` (awaiting_confirmation, paid…), `encomenda` (texto procurado) |
| Produtos | `filtro` (featured, low_stock, no_cover, no_description, hidden, promo), `tipo` (livro, biblia…), `produto` (texto procurado) |

Exemplo: `/admin?tab=orders&estado=pending&encomenda=LA-1234`. Nas Encomendas, os estados são
botões com o número de cada um, e "Limpar filtros" aparece quando há algum.

### 1.9 Conteúdo
Largura máxima 1440 px, margens de 16 / 24 / 32 px (telemóvel / tablet / computador), 64 px livres
no fim. Ao mudar de secção, a página volta ao topo e o foco passa para o título da secção.

## 2. Tamanhos de ecrã

| Largura | Separadores | Barra lateral |
|---|---|---|
| < 768 px | gaveta + linha das secções do grupo | gaveta |
| 768–1023 px | grupos + secções | barra recolhida aos ícones por omissão; aberta, ocupa 16 rem |
| ≥ 1024 px | grupos + secções | barra aberta |

## 3. Secções — `app/web/src/lib/adminSections.js`

O registo central é a única lista de secções: as duas disposições, a gaveta e a procura leem
todas daqui. O identificador vai no endereço (`/admin?tab=<id>`) — **não mudar os existentes**: há
ligações para eles nos alertas, nos emails e noutras páginas.

| Grupo | Secção (`id`) | Quem vê |
|---|---|---|
| — | Início (`inicio`) | toda a equipa com acesso ao painel |
| Catálogo | Produtos (`books`), Coleções (`collections`), Slider (`slides`), Materiais (`downloads`) | `manage_catalog` |
| Vendas | Encomendas (`orders`), Acompanhamento (`acompanhamento`) | `manage_orders` |
| | Equipas e alertas (`equipas`) | `manage_users` ou `manage_orders` |
| | Métodos de pagamento (`payments`) | `manage_payments` |
| | Lojas (`stores`) | `manage_settings` |
| Relatórios | Vendas por loja (`vendas-huambo`) | `manage_orders` |
| | Pagamentos e caixa (`pagamentos-caixa`) | `manage_orders` ou `confirm_payments` |
| Clientes | Utilizadores (`users`) | `manage_users` |
| | Contactos e campanhas (`contacts`) | `manage_marketing` |
| | Atendimento (`support`) | `manage_orders` |
| | Comunidade (`community`) | `manage_catalog` |
| Igreja | Colportagem (`colportagem`) | `manage_colporteurs` |
| | Registo da Igreja (`igreja`) | `manage_church_registry` ou `manage_colporteurs` |
| Sistema | Configurações (`settings`) | `manage_settings` |
| | Faixa de aviso (`notices`) | `manage_settings` ou `manage_marketing` |
| | Integrações (`apps`), Registo de segurança (`seguranca`) | administrador |

O administrador vê tudo. Os grupos sem nenhuma secção visível não aparecem. Um endereço com uma
secção a que a pessoa não tem acesso abre o Início. **As permissões no painel são só arrumação: o
que protege os dados são as regras da base de dados (RLS) e da Edge Function.**

### 3.1 Números ao lado das secções
Só o que **pede acção**, nunca totais:

| Secção | Número | Cor |
|---|---|---|
| Encomendas | por confirmar (`status = pending`) | marca |
| Produtos | com stock baixo ou esgotados | âmbar |
| Pagamentos e caixa | pagamentos que o cliente indicou e falta verificar | âmbar |

## 4. Início — `components/admin/AdminOverview.jsx`
Para quem entra: saudação e data; **Precisa de atenção** (§4.1); **indicadores** (Por confirmar, Pagamentos a verificar, Por
enviar, Vendas dos últimos 30 dias), cada um leva à lista já filtrada; **Últimas encomendas** (6,
cada uma abre a encomenda na lista); **Stock** (os 5 mais urgentes, com "Repor"); **Atalhos**
(Adicionar produto, Produtos, Atendimento, Faixa de aviso, Ver a loja). Cada bloco só aparece a
quem tem a permissão correspondente.

### 4.1 Precisa de atenção — `lib/adminAttention.js`
Situações que pioram se ninguém fizer nada, por ordem de urgência, cada uma com "Ver" (a lista já
filtrada). Só as que a pessoa pode tratar. Sem nenhuma: "Tudo em dia".

| Situação | Quando | Gravidade |
|---|---|---|
| Encomendas por confirmar | há mais de 24 h | a tratar; **urgente** a partir de 48 h |
| Pagamentos indicados pelo cliente por verificar | há mais de 48 h | a tratar |
| Confirmadas ainda por enviar (entregas) | há mais de 3 dias | a tratar |
| Produtos em destaque esgotados | visíveis na loja | a tratar |
| Promoções a acabar | nas próximas 48 h | sugestão |
| Produtos sem capa / sem descrição | visíveis na loja | sugestão |

Os prazos estão em `ATTENTION_RULES`.

## 5. Procurar (Ctrl+K / ⌘K) — `AdminCommandPalette.jsx`, `lib/adminSearch.js`
- Abre com Ctrl+K / ⌘K em qualquer secção, ou no campo do topo; fecha com Escape.
- Vazia, começa pelas **secções recentes** (as últimas 5 abertas, por pessoa, neste aparelho).
- Encontra secções pelo nome, título, descrição, grupo e **sinónimos** ("iban" → Métodos de
  pagamento, "faturação" → Vendas por loja, "senha" → Utilizadores…), sem acentos nem maiúsculas.
- **Reconhece o que se escreveu** e põe a acção certa à frente:

| Escreve-se | Acção |
|---|---|
| código de produto (`LIV-063`, `liv63`) | **Editar o produto** (abre o formulário) |
| número de encomenda (`LA-1234`) | Abrir a encomenda na lista |
| email | Encomendas desse cliente |
| telefone (com ou sem +244) | Encomendas desse telefone |
| outro texto | "Encomendas com «…»" e "Produtos com «…»" |

## 6. Atalhos de teclado

| Atalho | Faz |
|---|---|
| Ctrl+K / ⌘K | Procurar no painel |
| Ctrl+B / ⌘B | Mostrar ou esconder a barra lateral (no telemóvel, a gaveta) |
| Escape | Fecha a procura, a gaveta e os menus |
| Tab no início da página | "Saltar para o conteúdo" |

## 7. Acessibilidade
- Navegação em `nav` com nome ("Grupos do painel", "Secções de …", "Secções do painel",
  "Localização"); a secção aberta tem `aria-current="page"`.
- Um só `h1` por secção, que recebe o foco ao mudar de secção.
- Os números têm texto para leitores de ecrã ("4 por tratar", "2 com alerta").
- Alvos de toque de 40–44 px no telemóvel (gaveta, grupos, botões do topo); contraste AA
  (verificado com axe).

## 8. Acrescentar uma secção
1. Em `lib/adminSections.js`: a entrada em `ADMIN_SECTIONS` (nome, título, descrição, ícone,
   `allowed`) e o `id` no grupo certo de `ADMIN_GROUPS`.
2. Em `pages/AdminPage.jsx`: `<AdminSection active={activeTab} value="<id>">…</AdminSection>`
   (componente com `lazy`, dentro de `<Suspense fallback={spinner}>`).
3. O componente da secção **não** desenha título nem descrição; começa pelas suas acções.
4. Os testes em `lib/adminSections.test.js` confirmam que a secção tem tudo e aparece uma só vez.

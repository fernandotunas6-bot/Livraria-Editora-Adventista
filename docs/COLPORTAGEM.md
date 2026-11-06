# Colportagem e registo da Igreja

Guia para quem gere o painel. Em **Painel → Igreja → Registo da Igreja**.

## 1. Registo da Igreja

A colportagem assenta nesta estrutura. Cada colportor pertence a uma igreja, cada igreja a um distrito e cada distrito a um campo e a uma província.

```
Campo (União / Associação / Missão)
  └─ Distrito pastoral ── província e município (sede)
       ├─ Pastor titular (um de cada vez) e associados
       └─ Igrejas ── município
```

- **Províncias e municípios** são os do RGPH-2024, as mesmas tabelas das moradas de entrega.
  - O município de uma igreja ou de um distrito tem de pertencer à província escolhida; a base de dados recusa o contrário.
- **Distritos com o mesmo nome** podem existir em províncias diferentes: há "Distrito Centro" no Huambo e no Cuito.
- **Pastores:**
  - Cada pastor tem cargo, campo, província, telefone e "local de serviço". O local de serviço serve para quem não está num distrito, como o ISPAB, a Livraria ou a Missão.
  - O distrito de cada pastor atribui-se em **Distritos → ⇄ (transferir)**. A atribuição anterior fica no histórico (botão do relógio na lista de pastores), com as datas.
  - As **notas de avaliação** que vinham no `pastores.json` **não são importadas**.
- **Fundir:** quando o mesmo distrito ou o mesmo pastor aparece duas vezes, use ⑂ no que fica. As igrejas, as atribuições e os delegados passam para esse, e o outro é apagado. Uma fusão não se desfaz.
- **Desactivar em vez de apagar:** um distrito com igrejas não se pode apagar. Desactivado, sai das listas, mas o histórico mantém-se.
- **Excel:** cada lista exporta o que está filtrado.

### Importar os ficheiros

1. Abra o separador **Importar** e escolha o `churches.json` e/ou o `pastores.json`.
2. Confirme o **campo por omissão** (por exemplo, "Missão Centro"). É usado pelos distritos e pastores que não indicam outro.
3. Reveja a pré-visualização. Os **avisos** dizem o que precisa de confirmação:
   - pastores distritais com "Huambo" no lugar do distrito: ficam sem distrito, e atribui-se depois;
   - telefones repetidos;
   - números em sequência (924700000…), que parecem preenchidos à mão.
4. Reveja os **"Parecidos"**: nomes que talvez sejam o mesmo distrito ou a mesma pessoa, como "Calenga" e "Calenga e Lepi", ou "Feka" e "Feca". Não se juntam sozinhos. Depois de importar, use **Fundir**, ou corrija o delegado na igreja.
5. Carregue em **Importar**. O que já existe não é duplicado, por isso pode importar-se outra vez sem perigo.

Os dois ficheiros têm telefones e avaliações e **não vão para o repositório** (estão no `.gitignore`).

### Quem pode

| Permissão (Utilizadores → gestor) | Pode |
|---|---|
| **Registo da Igreja** | Ver e alterar campos, distritos, igrejas e pastores; importar |
| **Colportagem** | Ver o registo, sem alterar (precisa das igrejas para os colportores) |
| Administrador | Tudo |

Os clientes e os visitantes não vêem nada disto. Os telefones dos pastores só aparecem a quem tem uma destas permissões.

## 2. Colportores

Em **Painel → Igreja → Colportagem**.

### O link de candidatura

`livrariaadventista.com/colportor/candidatura` (também `/ser-colportor`).

- É **diferente do registo de clientes**: quem o abre candidata-se a colportor e **não precisa de conta**.
- O separador **Links** tem o link geral e um link por igreja (`?igreja=001`), que abre o formulário com a igreja já escolhida. Serve para os pastores partilharem por WhatsApp.
- O formulário pede:
  - nome e telefone (WhatsApp); o email é opcional;
  - província → município → igreja;
  - o pastor ou ancião que recomenda (a lista mostra os do distrito da igreja);
  - como quer trabalhar (Aspirante, Estudante ou Tempo parcial) e as horas por semana;
  - a escola, se for estudante;
  - a motivação;
  - o consentimento para o tratamento dos dados.
- Um telefone só pode ter uma candidatura ou ficha em aberto.
- Em **Definições** pode fechar as candidaturas e pôr uma nota no topo do formulário.

### Da candidatura ao colportor

1. **Candidaturas:** abra a ficha.
   - Confirme a recomendação com o pastor e marque "Recomendação confirmada".
   - Use **Pôr em análise**, **Aprovar** ou **Recusar** (recusar pede o motivo).
2. **Aprovar** dá o **código de colportor `CPT-0001`**, `CPT-0002`… O código nasce só na aprovação, por isso as candidaturas recusadas não gastam números, e **nunca muda**. Na aprovação, o colportor fica com a categoria que pediu.
3. **Convite:** na ficha, **Gerar convite** → **Enviar por WhatsApp**.
   - O colportor abre o link, entra (por exemplo com o Google) e a conta fica ligada ao código.
   - O convite é de uso único e vale 14 dias (configurável). Gerar outro invalida o anterior.
4. **Área do colportor** (`/colportor`): o código, a categoria, a igreja e as percentagens em vigor para ele, e o histórico.

Os estados possíveis são candidatura, em análise, activo, suspenso, inactivo e recusado. Suspender e desactivar pedem o motivo. Tudo fica no **histórico** da ficha: quem, quando e porquê.

Um colportor **não** ganha acesso ao painel: é um cliente com uma ficha de colportor ligada.

### Categorias

As categorias seguem a Working Policy da Igreja (FP 70):

| Categoria | Quando |
|---|---|
| Aspirante | Novo, com cartão de identificação |
| Estudante | Plano de bolsa: trabalha nas férias para pagar os estudos |
| Tempo parcial | Não cumpre as horas de tempo inteiro |
| Licenciado | Cumpriu os requisitos do campo |
| Credenciado | 12 meses ou mais e os requisitos do campo |

A categoria muda-se na ficha, com motivo. A reclassificação anual (fase 3) vai sugerir as mudanças a partir das horas dos relatórios, com os requisitos em **Definições**. A decisão é sempre da equipa.

### Percentagens

Em **Percentagens**:

- **Matriz categoria × modo de venda.** Os modos são consignação, compra com desconto e venda no site.
  - Clique numa célula para definir a percentagem e a data a partir da qual vale.
  - A negrito está o que tem regra própria; o resto herda da linha "Todas as categorias" ou da percentagem base.
- **Por tipo de produto:** por exemplo, as Bíblias com outra percentagem.
- **Percentagem própria de um colportor** (na ficha dele): ganha sempre às regras. Pode ser só para um modo ou um tipo de produto.
- **Ordem de decisão:** percentagem própria → regra mais específica (categoria pesa mais do que tipo de produto, e este mais do que modo de venda) → percentagem base.
- **Mudar não reescreve o passado.** A regra antiga fica até à véspera da nova data, e cada venda guarda a percentagem com que foi feita.
- **Simular:** escolha um colportor, um produto, um modo e uma data. "Confirmar na base de dados" pergunta à base de dados, que é quem decide de facto.

Enquanto não houver percentagens, todos ficam com 0% e o painel avisa.

## Técnico

- Migração `supabase/migrations/20261106200000_registo_igreja.sql`:
  - tabelas `church_fields`, `church_districts`, `churches`, `pastors` e `pastor_assignments`, com RLS;
  - funções `church_assign_pastor`, `church_end_assignment`, `church_merge_districts`, `church_merge_pastors` e `church_registry_import`;
  - permissões `manage_church_registry` e `manage_colporteurs` em `users_admin_update`.
- A importação é preparada no browser (`app/web/src/lib/churchImport.js`, com testes) e gravada numa só transacção pela função da base de dados.
- Os testes SQL correram em PGlite: RLS por permissão, geografia coerente, transferência, fusões e importação idempotente.
- Migração `20261106201000_colportores.sql`:
  - tabelas `colporteurs`, `colporteur_events`, `colporteur_invites` (só o hash do token), `colporteur_commission_rules`, `colporteur_commission_overrides` e `colporteur_settings`;
  - código `CPT-` (4 dígitos) no mesmo contador dos outros códigos, e `normalize_person_code` aceita `cpt7`.
  - Estado, categoria, código e conta só mudam pelas funções `colporteur_set_status`, `colporteur_set_category`, `colporteur_claim_invite` e `colporteur_unlink_account`. Um trigger recusa o resto.
- A candidatura entra por `POST /colportores/candidatura` na Edge Function: limite de 3 por minuto por IP, campo isco e validação de novo em `colporteur_apply` (só service role). A lista pública de igrejas (`church_directory`) não tem contactos.
- A percentagem decide-se em `private.colporteur_pct`, com uma cópia em `app/web/src/lib/colporteurCommission.js` para o painel. Os casos de `colporteurCommission.cases.json` correm contra as duas, no vitest e no PGlite.

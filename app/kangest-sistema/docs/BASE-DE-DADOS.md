# Base de dados

O KanGest guarda tudo num ficheiro SQLite cifrado com o SQLCipher (`kigest.db`, na pasta de dados: ver
[INSTALACAO.md](INSTALACAO.md) e [SEGURANCA.md](SEGURANCA.md) §5). Para o abrir num editor de SQLite, use a cópia
exportada (em claro), não o ficheiro em uso. Num
conjunto de postos em rede, só o servidor tem a base; os postos falam com ele ([REDE.md](REDE.md)).

## Como está configurada

| | |
|---|---|
| Registo | WAL (leituras não esperam pelas escritas), `synchronous = NORMAL` |
| Integridade | chaves estrangeiras ligadas em todas as ligações; documentos assinados protegidos por gatilhos na própria base |
| Escritas | transacções `BEGIN IMMEDIATE` (`db::transacao`): uma segunda gravação espera pela primeira (`busy_timeout` de 10 s) em vez de falhar com «database is locked» |
| Segredos | cifrados (chave mestra fora da base, `kangest.chave`): ver [SEGURANCA.md](SEGURANCA.md) |
| Cópias | automáticas, externas e cifradas, verificadas com `PRAGMA integrity_check`: ver [COPIAS.md](COPIAS.md) |
| Ligações e cache | adaptadas ao computador (`src/recursos.rs`): o dobro dos núcleos em ligações (entre 4 e 12) e 1/64 da memória em cache (entre 16 e 256 MB no total). Com a base cifrada, uma página na cache não se decifra outra vez |
| Temporários | as ordenações grandes em memória com 3 GB ou mais (no Windows, o antivírus examina cada ficheiro temporário) |
| WAL | volta a 64 MB depois de cada checkpoint (`journal_size_limit`), em vez de ficar com o tamanho do maior pico |
| Estatísticas | **nenhuma**: não se corre `ANALYZE` nem `PRAGMA optimize` (ver em baixo, «Índices e desempenho») |

Em **Sobre o KanGest → Este computador** vê-se o que o programa encontrou (núcleos, memória, espaço livre no disco dos
dados) e como configurou a base. Com pouco espaço para a próxima cópia, a linha fica a vermelho.

## Migrações

As alterações ao esquema estão em `src-tauri/migrations/` (`0001_…sql`, `0002_…sql`, …) e aplicam-se sozinhas ao abrir
a base, por ordem; o SQLite guarda as aplicadas em `_sqlx_migrations`.

- Uma migração já publicada **nunca se altera**: as correcções vão numa migração nova.
- Antes de actualizar, o KanGest faz uma cópia da base, verificada (`copias/kangest-antes-de-<versão>.db`), ao
  descarregar e outra vez ao instalar. A rotação das cópias automáticas não a apaga: guardam-se as das últimas 5
  actualizações.
- **Também quando o instalador novo se pôs à mão**, sem passar pela actualização do programa: no arranque, se há
  migrações por aplicar numa base com dados, a cópia `kangest-antes-de-<versão>.db` faz-se antes de as aplicar, com o
  estado desse momento (`db::copia_antes_de_migrar`).
- **Uma migração que falha** desfaz-se (cada uma corre numa transacção) e a base **volta à cópia de antes**: a que
  falhou fica ao lado (`kigest.db.migracao-falhou-<data>`, com o WAL dela) para o suporte, e a versão anterior do
  KanGest abre outra vez a base sem perder nada (`db::voltar_a_copia`). Cada troca de nome desfaz-se se a seguinte
  falhar: a pasta nunca fica sem a base.
- **O arranque que falha diz porquê.** Uma migração que não passa, o cofre do sistema que não dá a chave ou uma pasta de
  dados que não se cria abrem uma janela do sistema com a explicação e o sítio dos dados (`nativo::falha_no_arranque`),
  e fica uma linha em `arranque.log`, na pasta dos dados. Antes, o programa fechava sem dizer nada.
- O que precisa do programa e não só de SQL (preencher um valor novo, recalcular, recifrar) vai nos **ajustes de dados**
  (em baixo), não numa migração.
- Uma cópia feita por uma versão mais recente (com migrações que esta não conhece) não se restaura: a base deixaria de
  abrir. Confere-se migração a migração, pelo número e pelo `checksum` (`db::migracoes_estranhas`), porque um KanGest
  oficial mais recente do que esta edição pode ter uma `0053` com outro conteúdo. O mesmo vale ao trazer os dados do
  oficial ([COPIAS.md](COPIAS.md)).

## Índices e desempenho

Os índices das tabelas que crescem com o uso (documentos, linhas, pagamentos, movimentos de stock e de tesouraria)
foram escolhidos medindo as consultas numa base com **150 000 documentos** (~3 anos de uma loja), com o plano de cada
consulta (`EXPLAIN QUERY PLAN`). A migração `0028_indices.sql` explica cada um. Resultados (chamadas reais do programa):

| Chamada | Antes | Depois |
|---|---|---|
| Estado do caixa (POS, a cada venda) | 200 ms | 1,3 ms |
| Painel | 511 ms | 69 ms |
| Contas correntes: pendentes | 207 ms | 5 ms |
| Documentos de um cliente | 115 ms | 1,3 ms |
| Saldos das contas da tesouraria | 400 ms | 139 ms |
| Vendas por dia / artigo / família (ano) | 97 / 139 / 135 ms | 46 / 92 / 83 ms |
| Total das 24 chamadas medidas | ~3 000 ms | ~1 400 ms |

Regras que saíram desta medição, para as consultas novas:

- **Filtros opcionais montados à medida** (`sqlx::QueryBuilder`), não `(? IS NULL OR coluna = ?)`: com esta forma o
  SQLite não sabe, ao preparar, que filtro vem preenchido e não usa os índices (era o que fazia a lista de documentos).
- **Um período de vendas** filtra por `tipo_codigo` e `data_emissao`: o índice `(tipo_codigo, data_emissao)` lê só o
  período. Sem ele, o SQLite escolhia o índice da numeração e lia todas as vendas desde sempre.
- **Documentos por pagar** com `estado = 'N' AND valor_pendente > 0` escritos assim na consulta: é o que permite usar o
  índice parcial dos pendentes.
- **Somas por grupo numa só passagem** (`GROUP BY` e `LEFT JOIN`), não uma subconsulta por linha (os saldos das contas
  liam todos os movimentos uma vez por conta).
- Uma junção a partir do conjunto pequeno (os documentos de uma sessão), não a partir da tabela grande (todos os
  pagamentos).

### Segunda medição (migração 0066)

Uma segunda volta, com 150 000 documentos, 450 000 linhas, 450 000 movimentos de stock, 200 000 linhas de auditoria,
20 000 clientes e 15 000 artigos. As consultas saíram do próprio código (as 1009 literais) e o plano de cada uma foi
pedido ao SQLite. Assinalaram-se as que liam uma tabela grande inteira, e mediram-se as do dia-a-dia:

| Consulta | Antes | Depois |
|---|---|---|
| Sugestão de encomendas (reposição) | 17,6 s | 0,6 s |
| Documentos do Consumidor final (quase todas as vendas) | 1,9 s | 22 ms |
| Lista de clientes (saldo e crédito de cada um) | 1,3 s | 94 ms |
| Auditoria de um período longo | 1,2 s | 25 ms |
| Licença: primeiro e último documento emitidos aqui | 265 ms | 4,5 ms |
| Gravar um cliente (o NIF já existe?) | toda a tabela | índice |

Mais quatro regras:

- **`CROSS JOIN` para fixar a ordem** quando o SQLite escolhe mal. Na reposição, preferia percorrer as linhas todas pela
  ordem do artigo e ir buscar o documento de cada uma; partindo dos tipos e da data, lê só o período.
- **Ordenar pela coluna do índice do filtro** (`ORDER BY data_hora DESC, id DESC` com o filtro pela data): sai já
  ordenado e pára no `LIMIT`. Com `ORDER BY id`, o SQLite lia o período todo e ordenava-o.
- **Nada de funções sobre a coluna do filtro** (`substr(data_hora, 1, 10) BETWEEN …`): com `data_hora >= ? AND
  data_hora < date(?, '+1 day')` usa-se o índice.
- **Sem `ANALYZE`.** Com as estatísticas do planeador, a lista de documentos que abre por omissão passava de 6 ms para
  0,9 s (3,7 s a frio), e a pesquisa por número de 26 para 211 ms: o SQLite passava a escolher outra ordem. O teste
  `db::testes_cifra::os_planos_das_consultas_do_dia_a_dia` confirma os planos destas consultas no motor do programa e
  que não há estatísticas.

### Medir de novo

```bash
cd src-tauri && cargo test --lib servidor_demo -- --ignored --nocapture      # base de demonstração em /tmp/kigest-auditoria
python3 scripts/base-volume.py /tmp/kigest-auditoria/kigest.db /tmp/volume.db 150000
KANGEST_BASE=/tmp/volume.db cargo test --release --lib volume_tempos -- --ignored --nocapture
```

`volume_tempos` (em `src-tauri/src/services/tests.rs`) mede 24 chamadas: painel, listas de documentos, relatórios de
vendas, síntese, tesouraria, contas correntes, clientes, stock e caixa.

## Verificações

- **Cadeia de assinaturas dos documentos**: Configurações → Certificação AGT → «Verificar agora».
- **Cada cópia de segurança** é verificada logo depois de criada (`PRAGMA integrity_check`) e, ao restaurar, também as
  migrações (o número e o conteúdo de cada uma).
- Recálculo de stock (Gestão de Stock → Recálculo) compara as existências com os movimentos.

### Depois de cada actualização

O KanGest guarda na configuração a versão do último arranque (`sistema.versao_arranque`). No arranque, depois das
migrações, compara-a com a sua (`services/verificacao.rs`, `registar_arranque`, chamado em `lib.rs`): se mudou, fica
marcada uma verificação por fazer (`verificacao.pendente`, com a versão de antes e a nova). Uma base nova, ainda sem
empresa, só fica com a versão. Uma base de antes da 1.4.5 (sem a chave) conta como actualizada.

Uns 45 segundos depois de o programa abrir, a verificação corre **em segundo plano e sem sessão**, só no computador que
guarda a base. Nunca pára o arranque nem as vendas:

| Verificação | O que confere | Com problemas |
|---|---|---|
| Ficheiro da base | `PRAGMA quick_check` | grave |
| Ligações entre tabelas | `PRAGMA foreign_key_check` (registos ligados a um que não existe) | grave |
| Cadeia de assinaturas da AGT | a mesma do «Verificar integridade» (`integridade::verificar_cadeia`): assinaturas, numeração, totais e os 9 gatilhos da 0018 | grave |
| Registo de auditoria | a cadeia dos selos (`auditoria::verificar`) | grave |
| Stock | as existências e os lotes face aos movimentos (`catalogo::stock_diferencas`, só leitura) | aviso |
| Caixa | caixas abertos há mais de um dia, mais de um caixa aberto no mesmo posto, documentos ligados a um caixa que não existe | aviso |

O resultado fica na tabela `verificacoes_base` (migração 0060; guardam-se as últimas 50) e na auditoria
(`VERIFICACAO_BASE`). Com problemas, avisa no computador. **Só avisa**: nunca bloqueia a emissão, nunca corrige o stock
e nunca restaura nada sozinho. Em **Sobre o KanGest → Verificação da base** vê-se o resultado de cada verificação, com o
ecrã onde se corrige; «Verificar agora» corre-a à mão (permissão «Configurações»); e a verificação sozinha desliga-se
(chave `verificacao.depois_de_actualizar`, ligada por omissão). Com problemas graves e a cópia de antes da actualização
no disco, o ecrã oferece restaurá-la pelo restauro de sempre (fica marcado para o arranque seguinte; a base actual é
guardada antes). Restaurar essa cópia na versão nova volta a correr as migrações desta versão: se o problema vier
delas, fale primeiro com o suporte.

## Ajustes de dados

As migrações mudam o esquema e o que se faz em SQL. O que precisa do programa (preencher um valor novo, recalcular,
recifrar) vai em `src-tauri/src/ajustes.rs`, numa lista por ordem (`AJUSTES`), e corre no arranque, logo depois das
migrações (`lib.rs`):

- cada ajuste corre **uma vez**, na sua transacção (`db::transacao`): o ajuste, a linha na tabela `ajustes_dados`
  (migração 0060: nome, versão, aplicado_em, resultado, erro, tentativas) e a linha na auditoria (`AJUSTE_DADOS`)
  entram juntos ou não entra nada;
- antes do primeiro ajuste por fazer tira-se uma cópia de segurança (numa base com empresa);
- um ajuste que falhe desfaz-se, fica com o erro e o número de tentativas (e `AJUSTE_DADOS_FALHOU` na auditoria) e volta
  a tentar-se no arranque seguinte, ou com «Tentar outra vez» em Sobre o KanGest. **Não impede o programa de abrir.** Os
  que vêm depois dele esperam por ele;
- Sobre o KanGest → Verificação da base mostra a lista: aplicado (quando e o que fez), falhou (o erro) ou por aplicar.
  Um ajuste que a base conhece e esta versão não (a base passou por uma versão mais recente) aparece como «de outra
  versão».

Para acrescentar um ajuste: vai para o fim da lista, com um nome que nunca muda (`<versão>-<o-que-faz>`); tem de servir
a uma base nova e a uma antiga; e **nunca mexe em documentos assinados** (os gatilhos da 0018 recusam, e a AGT não se
desliga).

| Ajuste | Versão | O que faz |
|---|---|---|
| `1.4.5-verificacao-depois-de-actualizar` | 1.4.5 | Escreve ligada a opção nova «Verificar sozinho depois de cada actualização», se ninguém a escolheu. |

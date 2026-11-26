# Cópias de segurança

Em **Configurações → Sistema** (permissão *Cópia de segurança*).

## Quando se fazem

| Momento | Notas |
|---|---|
| Ao abrir o programa | Se a última cópia é de outro dia ou mais antiga do que a frequência escolhida |
| De N em N horas, com o programa aberto | Por omissão de 4 em 4 horas (1, 2, 4, 8, 12 ou 24, ou só ao abrir) |
| No fecho de caixa | Sempre |
| Antes de uma actualização, de uma importação ou de um restauro | Sempre. A de antes da actualização faz-se ao descarregar e outra vez ao instalar |
| Antes dos ajustes de dados de uma versão nova | No arranque, se houver ajustes por aplicar ([BASE-DE-DADOS.md](BASE-DE-DADOS.md#ajustes-de-dados)) |
| «Fazer cópia agora» | Manual |

As cópias fazem-se na máquina que guarda a base de dados (modo *Sozinho* ou *Servidor*). Um posto em rede não faz cópias:
os dados estão no servidor.

Cada cópia é feita com o programa em uso (`VACUUM INTO`) e **verificada** logo a seguir (`PRAGMA integrity_check` e as
tabelas do KanGest). Guardam-se as últimas N (por omissão 30) em `copias/`, na pasta de dados. Como a base, vão
**cifradas** com a chave deste computador: restauram-se aqui ([SEGURANCA.md](SEGURANCA.md) §5).

**Com o disco quase cheio:** antes de cada cópia confere-se o espaço livre (o tamanho da base, mais um décimo, mais 200 MB
de folga para o sistema). Sem espaço, saem primeiro as cópias automáticas mais antigas, só as precisas, e ficam sempre as
3 mais recentes e as de antes das actualizações. Se nem assim chegar, a cópia não se faz e aparece um aviso do sistema
(«Disco quase cheio») com o que falta, em vez de o disco encher a meio da cópia. A cópia sai sempre para um ficheiro ao
lado (`.a-fazer`) e só ganha o nome dela depois de verificada: uma cópia que falhe nunca fica como a mais recente. As
provisórias que sobrem de um fecho inesperado apagam-se na cópia seguinte.

As cópias de antes de cada actualização (`copias/kangest-antes-de-<versão>.db`, com a marca `.verificada`) ficam fora
dessa conta: a rotação das automáticas nunca as apaga, e guardam-se as das últimas 5 actualizações. É a que Sobre o
KanGest → Verificação da base oferece restaurar quando a verificação depois da actualização encontra problemas graves
([BASE-DE-DADOS.md](BASE-DE-DADOS.md#depois-de-cada-actualização)).

## Fora deste computador

Indique uma **pasta externa**: uma pen (`E:\Copias KanGest`), um disco de rede (`\\SERVIDOR\Copias`) ou a pasta do OneDrive
ou do Google Drive (que a sincroniza para a nuvem). Cada cópia é gravada também lá, com o NIF da empresa no nome.
Estas cópias são **portáteis**: abrem noutro computador (é para isso que servem), por isso vão em claro, a menos que
defina a senha abaixo.

- Se a pen não estiver ligada, a cópia local faz-se na mesma e o ecrã mostra o erro da pasta externa.
- **Cifrar as cópias da pasta externa** (opcional): ficam em `.kgc`, cifradas com AES-256-GCM e uma senha (PBKDF2). Protege
  os dados se a pen se perder. **Sem a senha, a cópia não se restaura noutro computador** — guarde-a num sítio seguro.

## Restaurar

- **Configurações → Sistema → Cópias guardadas → Restaurar** (ou indique o caminho de um ficheiro `.db`/`.kgc`).
- A cópia é verificada; a base actual é guardada em `copias/kangest-antes-do-restauro-…db`; o KanGest reinicia e troca a
  base antes de a abrir. As versões mais antigas da base são actualizadas pelas migrações ao abrir.
- Uma cópia feita por uma **versão mais recente** do KanGest é recusada («Actualize este KanGest antes de a restaurar»):
  tem migrações que esta versão não conhece e, depois da troca, a base deixaria de abrir e o programa não arrancava. A
  conferência é migração a migração, pelo número e pelo conteúdo (o `checksum` de `_sqlx_migrations`): apanha também
  uma cópia de um KanGest oficial mais recente do que esta edição, com uma `0053` que não é a desta (o número mais alto
  sozinho não chegava).
- **Computador novo:** no ecrã de configuração inicial há «Já tem uma cópia de segurança do KanGest?» para restaurar em vez
  de configurar do zero. Use uma **cópia externa** ou a **cópia exportada** («Fazer cópia»): as cópias de `copias/` e a
  própria base estão cifradas com a chave do computador antigo e não abrem noutro. No Windows, copiar a pasta de dados
  para o computador novo não chega (a chave fica no cofre do computador antigo).
- Os segredos guardados na instalação (chave do contribuinte da FE, senhas) estão cifrados com a chave mestra do
  computador onde foram gravados: noutro computador é preciso introduzi-los de novo (ver
  [CERTIFICACAO-AGT.md](CERTIFICACAO-AGT.md)).
- O restauro faz-se na máquina que guarda a base de dados; num posto em rede não está disponível.

## Trazer os dados do KanGest oficial

Quando o KanGest oficial está instalado no mesmo computador, o KanGest Livraria traz os dados dele sem passar por uma
cópia à mão (`src-tauri/src/services/oficial.rs`).

- **Onde se oferece:**
  - **no primeiro arranque**, enquanto a edição não tem empresa: o ecrã inicial pergunta «Encontrei o KanGest oficial
    neste computador: trazer os dados?», com o botão ao lado de «configurar do zero»;
  - **em Configurações → Sistema → Dados do KanGest oficial** (permissões *Cópia de segurança* e *Configurações*),
    para uma edição já configurada mas ainda **sem dados**. Antes guarda-se a base actual em
    `copias/kangest-antes-da-importacao-….db`.
- **Como se encontra:** a pasta de dados do oficial é a irmã da desta edição, com o identificador dele
  (`ao.kigest.app`, ao lado de `ao.livrariaadventista.kangest`), com a base `kigest.db`. A chave mestra dele vem do
  `kangest.chave` dele: os 32 bytes ou, com `cofre1:<id>`, o cofre do sistema com o serviço `ao.kigest.app`. A chave da
  base faz-se da mesma forma no oficial 1.4.4 e na edição ([SEGURANCA.md](SEGURANCA.md) §5).
- **Nada se cria nem se grava na pasta do oficial nem no cofre dele.** Copia-se o `kigest.db` (e o `-wal` e o `-shm`,
  se existirem: com o oficial aberto, o mais recente está no WAL) para `importar-oficial/`, dentro da pasta desta
  edição; se o oficial gravar a meio da cópia, repete-se. A cópia abre com a chave do oficial e exporta-se
  (`sqlcipher_export`) com a chave desta edição, conferida tabela a tabela (as contagens) e aberta outra vez só com a
  chave nova. A pasta temporária apaga-se no fim, com ou sem erro.
- **Recusa-se** um oficial mais recente do que esta edição (migrações que ela não tem, ou com outro conteúdo), um
  oficial ainda por configurar, uma chave que não se lê (o cofre recusou, ou outro utilizador do sistema) e, em
  Configurações, uma edição que já tem dados: não se substituem nem se juntam. Em todos os casos fica o caminho à
  mão: a cópia exportada do oficial e o restauro (acima).
- **Os segredos vêm também:** os valores `kgs1:` (senha e chaves da Facturação Electrónica, senha do email, chave de
  desenvolvimento da AGT, segredo da verificação em dois passos, segredos dos avisos automáticos, e os que estão dentro
  de uma configuração em JSON, como a senha da importação do KIGEST) decifram-se com a chave mestra do oficial e
  voltam a cifrar-se com a desta edição, na cópia. Os que não abrem (já vinham de outro computador) ficam como estavam
  e voltam a pedir-se.
- **Dos ficheiros locais do oficial vem só o n.º do posto** (`posto.json`), gravado no arranque da troca. A rede
  (`rede.json`), a Internet (`internet.json`) e a pasta dos documentos ficam as desta edição: com o oficial ainda
  aberto, um servidor de rede na mesma porta chocava com ele.
- **A troca é a de sempre:** fica marcada (`restaurar.json` e `copias/restauro-pendente.db`) e faz-se no arranque
  seguinte, antes de a base abrir. Fica a linha **IMPORTAR_OFICIAL** na auditoria (selada com as outras), com a origem,
  quem pediu, as tabelas e linhas conferidas, os segredos passados e o posto.
- **Depois, o KanGest oficial não pode continuar a emitir.** As facturas dele e as desta edição seguiam nas mesmas
  séries, com duas cadeias de assinaturas da AGT a divergir (e a Facturação Electrónica enviaria os mesmos números
  duas vezes). O ecrã avisa antes e depois: feche-o e deixe-o só para consulta, ou desinstale-o.
- No macOS, se o oficial guardou a chave no Porta-chaves, o sistema pode pedir autorização para a ler. Se recusar, fica
  o caminho à mão.

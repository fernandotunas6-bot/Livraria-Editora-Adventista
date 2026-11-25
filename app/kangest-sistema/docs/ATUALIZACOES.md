# Publicar actualizações do KanGest

O KanGest verifica actualizações em **Sistema → Sobre o KanGest → Actualizações**. A origem é um endereço (`https://…`)
ou uma pasta partilhada na rede (`\\SERVIDOR\KanGest`). **Vazia, usa-se a origem oficial da edição,
`https://livrariaadventista.ao/kangest/actualizacoes`.** Cada posto actualiza-se a si próprio.

## O que o programa faz sozinho, e o que fica à mão

- **Procura as versões novas sozinho** (`services/atualizacao.rs`, `iniciar`): no computador que guarda a base (o
  servidor da loja ou o computador único), dois minutos depois de abrir e depois de 6 em 6 horas. Quando há versão nova
  para o sistema, avisa no computador (uma vez por versão) e Sobre o KanGest mostra-a. Sem Internet, tenta na volta
  seguinte. Desliga-se no mesmo cartão («Procurar sozinho as versões novas»); o «Verificar atualização» fica sempre.
  Os postos em rede procuram à mão.
- **Descarregar e instalar são sempre à mão**, por quem tem a permissão «Actualizações».
- **A cópia de antes da actualização** (`copias/kangest-antes-de-<versão>.db`) faz-se ao descarregar e outra vez ao
  instalar (com o que se vendeu entretanto), verificada como as automáticas (`PRAGMA integrity_check` e a marca
  `.verificada`). Sem ela, o instalador não abre. A rotação das cópias automáticas não lhe toca: guardam-se as das
  últimas 5 actualizações ([COPIAS.md](COPIAS.md)).
- **Depois de instalada**, o primeiro arranque da versão nova nota a mudança de versão e verifica a base em segundo
  plano (o ficheiro, as ligações entre tabelas, a cadeia da AGT, a auditoria, o stock e o caixa). Só avisa: com
  problemas graves, oferece restaurar à mão a cópia de antes ([BASE-DE-DADOS.md](BASE-DE-DADOS.md#verificações)).
- **Os ajustes de dados** que a versão nova traga correm uma vez no arranque, ficam registados e aparecem em Sobre o
  KanGest ([BASE-DE-DADOS.md](BASE-DE-DADOS.md#ajustes-de-dados)).

## 1. Gerar os instaladores

```bash
npm run tauri build      # Windows: …/bundle/nsis/KanGest_0.2.0_x64-setup.exe · macOS: …/bundle/dmg/KanGest_0.2.0_aarch64.dmg
```

## 2. (Recomendado) Assinar os pacotes

Gere uma vez o par de chaves e guarde a chave privada fora do repositório:

```bash
npx tauri signer generate -w ~/.kigest/actualizacoes.key
npx tauri signer sign -f ~/.kigest/actualizacoes.key KanGest_0.2.0_x64-setup.exe   # cria KanGest_0.2.0_x64-setup.exe.sig
```

Na compilação oficial, a **chave pública vem dentro do programa** (variável `KANGEST_CHAVE_ACTUALIZACOES` do repositório,
ver [CERTIFICACAO-AGT.md](CERTIFICACAO-AGT.md)): a assinatura passa a ser obrigatória e a chave não se pode trocar no
ecrã, por isso uma origem adulterada não consegue instalar nada. Nas compilações de desenvolvimento, pode-se colar a
chave pública em cada instalação (campo «Chave pública de assinatura»).

O SHA-256 conferido no descarregamento fica ao lado do pacote e volta a conferir-se antes de abrir o instalador: um
ficheiro trocado entretanto não se instala.

## 3. Manifesto `kangest-atualizacao.json`

**Na edição, o manifesto é gerado pelo GitHub Actions** (`.github/workflows/kangest-livraria.yml` na raiz do
repositório da livraria, «publicar no site», só a partir do `main`): assina o instalador com a chave das actualizações
da edição, escreve `kangest-atualizacao.json` com as notas de `docs/versoes/v<versão>.md`, guarda tudo numa Release
`kangest-livraria-v…` e publica o site outra vez. O deploy do site copia o instalador e o manifesto para
**`https://livrariaadventista.ao/kangest/actualizacoes/`**, que é a origem oficial (`ORIGEM_OFICIAL`): já vem no
programa, não é preciso escrevê-la. As origens do KanGest oficial (as releases do GitHub dele e o
`kangest.pages.dev`), se vierem numa configuração antiga, lêem-se como a da edição: as versões do oficial nunca se
instalam por cima da edição.

Para uma pasta partilhada, copie para lá os instaladores com os `.sig` e gere o manifesto com
`python3 scripts/manifesto-atualizacao.py <pasta> <versão> [docs/versoes/v<versão>.md]`, ou escreva-o à mão,
na mesma pasta (ou endereço) dos instaladores:

```json
{
  "versao": "0.2.0",
  "data": "2026-12-01",
  "notas": "Facturação electrónica da AGT; correcções nos relatórios.",
  "pacotes": {
    "windows-x86_64": { "ficheiro": "KanGest_0.2.0_x64-setup.exe", "sha256": "…", "assinatura": "<conteúdo do .sig>" },
    "macos-aarch64":  { "ficheiro": "KanGest_0.2.0_aarch64.dmg",  "sha256": "…", "assinatura": "<conteúdo do .sig>" },
    "macos-x86_64":   { "ficheiro": "KanGest_0.2.0_x64.dmg",      "sha256": "…", "assinatura": "<conteúdo do .sig>" }
  }
}
```

O SHA-256 obtém-se com `shasum -a 256 <ficheiro>` (macOS) ou `certutil -hashfile <ficheiro> SHA256` (Windows). O pacote é sempre conferido pelo SHA-256; a assinatura é obrigatória quando a instalação tem chave pública configurada.

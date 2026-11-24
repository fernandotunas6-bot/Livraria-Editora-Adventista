# Navegador integrado (KanGest Livraria)

**Livraria → Internet.** É a fase 5 do estudo ([docs/ECOSSISTEMA.md](../../../docs/ECOSSISTEMA.md), na raiz da livraria).
Abre sites da Internet em separadores, cada um numa janela própria. O painel da livraria
(`livrariaadventista.ao/admin`) abre com o login e o MFA de sempre. Só existe no programa instalado; no modo web
(browser), a página diz para usar o próprio browser.

## O que tem

- **Barra de endereço e pesquisa.** Um endereço abre com ou sem `https://`; o resto vai para uma pesquisa no
  DuckDuckGo.
- **Separadores abertos:** mostrar, fechar e guardar nos favoritos. As janelas que um site abre (`window.open`, por
  exemplo um pagamento ou um login) são outros separadores, com as mesmas regras.
- **Favoritos.** Começa com a loja, o painel da livraria e o Painel de Gestão.
- **Histórico:** as últimas 500 páginas, e a página mostra as 100 mais recentes. Pode limpar-se.
- **Transferências:** para a pasta Transferências do utilizador, sem apagar um ficheiro com o mesmo nome
  («x (2).pdf»).
- **Sessão privada:** não guarda cookies, sessões nem histórico.

Os favoritos, o histórico e a lista das transferências ficam em `navegador.json`, na pasta de dados **desta máquina**,
e não na base da empresa: num posto em rede, cada computador tem os seus. Os cookies e as sessões dos sites ficam em
`navegador/perfil`, longe dos do programa.

## Porque é seguro

Um site aberto no navegador não chega ao programa, aos ficheiros nem às chaves. São quatro camadas
(`src-tauri/src/navegador.rs`):

1. **Sem permissões do Tauri.** Os separadores são janelas `web-<n>`. Nenhuma capability (`capabilities/*.json`) as
   inclui, nem por nome nem por endereço (`remote`). Um teste (`capabilities_sem_os_separadores`) falha se alguém
   juntar uma capability com `*` ou `web-*`, ou um ficheiro novo sem o rever.
2. **Os comandos recusam os separadores.** `rpc`, `navegador`, `imprimir` e `reiniciar` conferem a janela de onde vem
   o pedido (`janela_do_programa`). A sessão do KanGest é do programa e não da janela, por isso isto vale mesmo que um
   separador chegue a carregar uma página do próprio programa.
3. **Só a Internet.** Cada navegação, cada janela nova e cada transferência passam por `endereco_permitido`. Só deixa
   `https:` e `http:` para fora, e recusa:
   - o próprio programa: `tauri:`, `ipc:`, `asset:`, `*.localhost`;
   - os ficheiros: `file:`;
   - `javascript:` e `data:`;
   - a rede da loja: IP privados, `127.0.0.1`, `.local` e nomes sem domínio, onde estão a API do KanGest, as
     impressoras e o router;
   - os endereços com utilizador e senha.
4. **Dados à parte.** Os cookies dos sites ficam na pasta do perfil do navegador, e a sessão privada não grava nada.

## Limites

- É o WebView do sistema: o WebView2 (Edge) no Windows e o WebKit no macOS. Não é um Chrome completo; um site raro
  que só funcione num browser específico pode não abrir bem.
- Cada separador é uma janela do sistema. Separadores numa só janela pedem uma função do Tauri que ainda é
  experimental (`unstable`).
- No macOS, a pasta própria dos cookies (`data_directory`) não se aplica: o WebKit guarda-os no armazém de sempre,
  separados por site.
- Os endereços da rede da loja não abrem aqui; para esses, use o browser do computador.

## Testes

`cargo test` corre, em `navegador.rs`:
- os endereços permitidos e recusados;
- a barra de endereço;
- as janelas que não usam o programa;
- as capabilities sem os separadores;
- os nomes das transferências;
- o histórico sem repetidos;
- o ficheiro do navegador.

O comportamento das janelas (abrir, transferir, `window.open`) só se vê no programa instalado.

# App iOS

Estado em 2026-11-16. Pedido do dono: "o aplicativo iOS do sistema todo, que pegue o website em vez
de escrever tudo do zero".

## A ideia: o site dentro de uma casca nativa

O app **não é um segundo sistema**. É uma casca [Capacitor](https://capacitorjs.com) (`app/ios`) que
abre o site publicado, **https://livrariaadventista.ao**, num WKWebView. Por isso:

- tudo o que se publica no site (loja, conta, biblioteca, rastreio, comunidade, colportagem, painel,
  relatórios) aparece no app **no mesmo momento**, sem enviar nada à Apple;
- só a parte nativa (este documento) passa pela revisão da Apple, e muda pouco;
- o mesmo projecto dá, mais tarde, um app Android quase de graça.

O app acrescenta só o que o site não consegue no iPhone. É isso que o separa de "um site embrulhado",
que a Apple recusa (regra 4.2):

| No app | Como | Onde |
|--------|------|------|
| Notificações do iPhone | APNs, pelos mesmos avisos do site | `supabase/functions/app/apns.ts`, `lib/pushNotifications.js` |
| Entrar com a Google | Folha de login do sistema (a Google recusa o WKWebView) | `WebAuthPlugin.swift`, `lib/nativeAuth.js` |
| «Continuar com a Apple» | Folha nativa da Apple | `AppleSignInPlugin.swift`, `lib/nativeAuth.js` |
| Ecrã sem rede | Página do próprio app, volta sozinha | `app/ios/www/offline.html` |
| Ligações que abrem no app | Ligações universais do `.ao` | `NativeAppBridge.jsx`, `scripts/apple-app-site-association.mjs` |
| Palavras-passe do Safari | `webcredentials` do `.ao` | o mesmo ficheiro |
| Partilhar | Folha de partilha nativa | `lib/nativeShare.js` |
| PDFs da biblioteca | Folha do Safari por cima do app (guarda em Ficheiros ou Livros) | `DigitalLibrary.jsx` |
| Barra de estado | Clara na loja, escura no painel branco | `NativeAppBridge.jsx` |
| Deslizar para voltar | Do bordo esquerdo, como no Safari | `MainViewController.swift` |
| Puxar para actualizar | Recarrega; com alterações por gravar avisa e não perde nada; numa janela aberta não faz nada | `MainViewController.swift`, `NativeAppBridge.jsx` |
| Arranque sem clarão branco | O logotipo fica até o site pintar (no máximo 10 s) | `capacitor.config.json`, `main.jsx` |
| Vibração leve | Ao juntar ao carrinho | `useCart.jsx` |
| Número no ícone | Os avisos por ler da conta; com o app fechado, vem em cada notificação | `AparelhoPlugin.swift`, `apns.ts` |

## O que muda no site quando está no app

O site sabe que está no app por `window.Capacitor` (`app/web/src/lib/nativeApp.js`). Fora do app
nada disto acontece e nenhum código do app é descarregado.

- **«Instalar a app» desaparece** (o aviso e o botão do menu): já está instalada.
- **Edições digitais não se compram no app.** A Apple obriga a vender conteúdo digital com as compras
  dela, que ficam com 15 a 30 % (regra 3.1.1). Decisão do dono: no app só se vendem os impressos.
  O livro com edição digital mostra só o impresso; o que só existe em PDF diz «Não está à venda na
  app»; o carrinho recusa-as e tira as que vêm da conta (postas no site). **Não há ligação nem
  indicação para comprar no site**: a Apple também o proíbe. Quem já comprou no site lê na
  biblioteca do app, como sempre (`lib/digitalEditions.js: podeComprarDigital`).
- **Login**: «Continuar com a Apple» aparece por cima de «Continuar com Google». Fechar a folha de
  login é cancelar, sem mensagem de erro. A pessoa fica na página onde estava, já com a conta.
- **Notificações**: o perfil liga e desliga as do iPhone; a permissão é a do iOS. O aparelho fica
  associado a quem tem sessão e muda a cada entrada e saída de conta.
- **Painel (Google Workspace)**: o login do Google Workspace do painel abre numa janela que o
  WKWebView não mostra. Essas ferramentas usam-se no site, no computador.

## O que fica de fora do app (por agora)

- O trajecto do colportor com o ecrã desligado (GPS em segundo plano) precisa de um plugin nativo
  próprio. No app funciona como no site: com a página aberta.
- Os links de email do Supabase (confirmar conta, nova palavra-passe) passam primeiro pelo Supabase
  e acabam no Safari, não no app. A conta fica confirmada na mesma.

## Como se compila sem Mac

Tudo pelo GitHub Actions (`.github/workflows/ios.yml`), num Mac do GitHub:

- **Em cada PR** que mexa em `app/ios`: build para o simulador, sem assinatura. Prova que o projecto
  compila, mesmo antes de haver segredos.
- **Actions → App iOS → Run workflow** (ou uma etiqueta `ios-v1.0.0`): arquivo assinado e envio para o
  **TestFlight**. A versão vem de `app/ios/package.json`; o número do build é o da corrida.

A assinatura é a da nuvem da Apple: a chave da App Store Connect deixa o Xcode criar o certificado
e o perfil sozinho. Não há certificados nem perfis no repositório.

## Passo a passo do dono (uma vez)

### 1. Apple Developer (developer.apple.com → Certificates, Identifiers & Profiles)

1. **Identifiers → +** → App IDs → App. Bundle ID **explícito**: `ao.livrariaadventista.app`.
   Capacidades: **Push Notifications**, **Sign In with Apple**, **Associated Domains**.
2. Anotar o **Team ID** (canto de cima à direita, 10 letras e algarismos).
3. **Keys → +** → nome "APNs Livraria", marcar **Apple Push Notifications service (APNs)** →
   Continue → Download. Guarda-se o ficheiro `AuthKey_XXXXXXXXXX.p8` (só se descarrega uma vez) e
   anota-se o **Key ID**. Esta chave é para o Supabase (passo 4).

### 2. App Store Connect (appstoreconnect.apple.com)

1. **Apps → +** → Nova app: iOS, nome «Livraria Adventista», idioma Português (Portugal), bundle ID
   `ao.livrariaadventista.app`, SKU `livraria-adventista-ios`.
2. **Users and Access → Integrations → App Store Connect API → +**: nome "GitHub Actions", acesso
   **Admin** (a assinatura na nuvem pede-o). Download do `.p8` (outro ficheiro, diferente do da
   APNs), e anotar o **Key ID** e o **Issuer ID** (no topo da página).

### 3. GitHub (Settings → Secrets and variables → Actions)

| Nome | Tipo | Valor |
|------|------|-------|
| `APPLE_TEAM_ID` | **Variable** | O Team ID do passo 1 |
| `APP_STORE_CONNECT_KEY_ID` | Secret | Key ID da chave da App Store Connect |
| `APP_STORE_CONNECT_ISSUER_ID` | Secret | Issuer ID |
| `APP_STORE_CONNECT_KEY_P8` | Secret | O `.p8` da App Store Connect em base64: `base64 -i AuthKey_XXXX.p8` |

Com a `APPLE_TEAM_ID` posta, o próximo deploy do site publica
`https://livrariaadventista.ao/.well-known/apple-app-site-association` (as ligações e as
palavras-passe do site passam a servir no app). Sem ela o site funciona igual.

### 4. Supabase

1. **Edge Functions → Secrets** (as notificações do iPhone):
   - `APNS_KEY_ID` — o Key ID da chave APNs (passo 1.3);
   - `APNS_TEAM_ID` — o Team ID;
   - `APNS_PRIVATE_KEY` — o conteúdo inteiro do `AuthKey_XXXX.p8` da APNs, com as linhas
     `-----BEGIN…` e `-----END…`;
   - opcional: `APNS_ENV=sandbox` só para testar com um build de debug feito no Xcode (o TestFlight
     e a App Store usam produção, o valor por omissão).

   O interruptor **Configurações → Email, push e chat → push** do painel continua a ser o geral: com
   ele desligado não sai push nenhum, nem para os navegadores nem para o iPhone.
2. **Authentication → Sign In / Providers → Apple**: ligar; em **Client IDs** pôr
   `ao.livrariaadventista.app`. Para o login nativo do app não é preciso o "Secret Key".
3. **Authentication → URL Configuration → Redirect URLs**: juntar `ao.livrariaadventista.app://**`
   (já está em `supabase/auth/config.json`; `scripts/configurar-auth.sh` aplica-o).

### 5. Primeiro build

GitHub → **Actions → App iOS → Run workflow**. Ao fim de 10 a 30 minutos o build aparece em App Store
Connect → TestFlight. Junta-se quem testa (Internal Testing) e instala-se pela app TestFlight.

### 6. Enviar para a App Store

A ficha está no repositório e envia-se sozinha:

- **Textos** (`app/ios/fastlane/metadata/pt-PT/`): nome, subtítulo, descrição, palavras-chave, texto
  promocional, novidades da versão, endereços de suporte, do site e da política de privacidade;
  categorias Compras e Livros; as notas para a revisão em `review_information/notes.txt` (explicam
  as compras só de impressos, o login e a localização em segundo plano dos colportores).
  `scripts/ficha-app-store.test.mjs` confere os limites da Apple em cada PR.
- **Capturas de ecrã** (`scripts/capturas-app-store.mjs`): o site publicado como o app o mostra, no
  iPhone 6,9" (1320 × 2868) e no iPad 13" (2064 × 2752), sete páginas: início, loja, um livro,
  colecções, comunidade, rastreio e lojas.
- **Actions → «App iOS — ficha da App Store» → Run workflow**: sem marcar nada, só tira as capturas
  (ficam nos artefactos da corrida, para ver); com «Enviar para a App Store Connect», envia as
  capturas e os textos para a versão em preparação. **Não submete**: depois de rever, carrega-se em
  «Adicionar para revisão» na App Store Connect.

O que só se faz na App Store Connect:

- **App Privacy**: as mesmas respostas do manifesto do app (`app/ios/ios/App/App/PrivacyInfo.xcprivacy`):
  nome, email, telefone, morada, localização precisa, ID do utilizador e do aparelho, histórico de
  compras, interacção com os produtos, fotografias, áudio (só a equipa), apoio ao cliente, conteúdo
  da comunidade, falhas e desempenho. Tudo ligado à conta, **nada para rastreio nem publicidade**;
- a **conta de demonstração** (email e palavra-passe) em «Sign-in required»: não vai para o
  repositório;
- «Apagar a conta» já existe em Perfil → Privacidade (regra 5.1.1).

## Testar no iPhone (TestFlight)

1. Abrir o app; modo de avião → ecrã «Sem ligação» → desligar o modo de avião → volta sozinho.
2. Entrar com a Google e com a Apple; sair; entrar com email e palavra-passe.
3. Perfil → «Activar notificações» → aceitar; no painel, Versões da app → avisar as novidades; ou
   fazer uma encomenda e mudar-lhe o estado. Tocar na notificação abre a página dela.
4. Num email de rastreio, tocar no link: abre no app, na página do rastreio.
5. Biblioteca → abrir um PDF; partilhar uma publicação da comunidade e um livro.
6. Uma edição digital não aparece para compra; o impresso compra-se até ao fim.

## Mudar a casca

- **Os plugins chegam ao site embrulhados** (`semThen` em `lib/nativeApp.js`). O plugin do Capacitor
  é um Proxy que responde a `then`; devolvido por uma função `async`, o `await` ficava pendurado
  para sempre. Plugin novo: carregar sempre por `plugin()` ou `pluginDoApp()` desse ficheiro
  (`nativeApp.capacitor.test.js` prova-o com o Capacitor verdadeiro).

- **Plugins npm** (`app/ios/package.json`): depois de juntar um, `npm install` na raiz e
  `cd app/ios && npx cap sync ios`; o `Package.swift` do `CapApp-SPM` actualiza-se sozinho.
- **Código Swift próprio** (`app/ios/ios/App/App/`): os plugins locais registam-se em
  `MainViewController.swift` e entram no `project.pbxproj`.
- **Uma versão nova na App Store** só é precisa quando muda a casca. Sobe-se `version` em
  `app/ios/package.json` e corre-se o workflow.
- O `public/` e o `capacitor.config.json` dentro do projecto Xcode (`app/ios/ios/App/App/`) são
  cópias que o `cap sync` faz de `app/ios/www/` e de `app/ios/capacitor.config.json`, e estão no
  `.gitignore`: muda-se o original e corre-se o `cap sync`.

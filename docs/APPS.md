# Apps iOS e Android

Estado em 2026-11-16. Pedido do dono: "o aplicativo iOS do sistema todo, que pegue o website em vez
de escrever tudo do zero"; depois, o mesmo para o Android.

## A ideia: o site dentro de uma casca nativa

Os apps **não são um segundo sistema**. São uma casca [Capacitor](https://capacitorjs.com)
(`app/mobile`, com `ios/` e `android/`) que abre o site publicado, **https://livrariaadventista.ao**,
num WebView (WKWebView no iPhone, o do Chrome no Android). Por isso:

- tudo o que se publica no site (loja, conta, biblioteca, rastreio, comunidade, colportagem, painel,
  relatórios) aparece nos apps **no mesmo momento**, sem enviar nada à Apple nem à Google;
- só a parte nativa (este documento) passa pela revisão das lojas, e muda pouco.

## iPhone e iPad

O app acrescenta só o que o site não consegue no iPhone. É isso que o separa de "um site embrulhado",
que a Apple recusa (regra 4.2):

| No app | Como | Onde |
|--------|------|------|
| Notificações do iPhone | APNs, pelos mesmos avisos do site | `supabase/functions/app/apns.ts`, `lib/pushNotifications.js` |
| Entrar com a Google | Folha de login do sistema (a Google recusa o WKWebView) | `WebAuthPlugin.swift`, `lib/nativeAuth.js` |
| «Continuar com a Apple» | Folha nativa da Apple | `AppleSignInPlugin.swift`, `lib/nativeAuth.js` |
| Ecrã sem rede | Página do próprio app, volta sozinha | `app/mobile/www/offline.html` |
| Ligações que abrem no app | Ligações universais do `.ao` | `NativeAppBridge.jsx`, `scripts/ligacoes-app.mjs` |
| Palavras-passe do Safari | `webcredentials` do `.ao` | o mesmo ficheiro |
| Partilhar | Folha de partilha nativa | `lib/nativeShare.js` |
| PDFs da biblioteca | Folha do Safari por cima do app (guarda em Ficheiros ou Livros) | `DigitalLibrary.jsx` |
| Barra de estado | Clara na loja, escura no painel branco | `NativeAppBridge.jsx` |
| Deslizar para voltar | Do bordo esquerdo, como no Safari | `MainViewController.swift` |
| Puxar para actualizar | Recarrega; com alterações por gravar avisa e não perde nada; numa janela aberta não faz nada | `MainViewController.swift`, `NativeAppBridge.jsx` |
| Arranque sem clarão branco | O logotipo fica até o site pintar (no máximo 10 s) | `capacitor.config.json`, `main.jsx` |
| Vibração leve | Ao juntar ao carrinho | `useCart.jsx` |
| Número no ícone | Os avisos por ler da conta; com o app fechado, vem em cada notificação | `AparelhoPlugin.swift`, `apns.ts` |
| Trajeto com o ecrã apagado | Quem entrega partilha a posição em segundo plano até à entrega | `TrajetoPlugin.swift`, `lib/trajetoNativo.js` ([TRAJETO_GPS.md](TRAJETO_GPS.md)) |

## Android

O mesmo site, com o que o Android pede (`app/mobile/android`):

| No app | Como | Onde |
|--------|------|------|
| Notificações | Firebase Cloud Messaging, pelos mesmos avisos do site; canal «Avisos da livraria» | `supabase/functions/app/fcm.ts`, `lib/pushNotifications.js` |
| Entrar com a Google | Separador do Chrome, que volta ao app (a Google recusa o WebView) | `lib/nativeAuth.js`, `AndroidManifest.xml` |
| Ecrã sem rede, partilhar, vibração, PDFs | Os mesmos do iPhone (plugins do Capacitor) | `app/mobile/www/offline.html`, `lib/nativeApp.js` |
| Ligações que abrem no app | App Links do `.ao` (verificados) | `AndroidManifest.xml`, `scripts/ligacoes-app.mjs` |
| Palavras-passe do Chrome | `get_login_creds` no assetlinks.json | o mesmo ficheiro |
| Voltar | O botão do sistema volta à página anterior; na primeira, sai | o Capacitor |
| Margens do ecrã | O site fica entre a barra de estado e a de navegação (`env(safe-area-inset-*)`) | `capacitor.config.json` (SystemBars) |
| Ícone e arranque | O logotipo, com ícone adaptativo | `android/app/src/main/res` |

Sem o `google-services.json` no build, o app funciona mas não pede notificações: o plugin
`Aparelho` (`AparelhoPlugin.java`) diz ao site se o Firebase veio, porque pedir o registo sem ele
derrubava o app.

## O que muda no site quando está no app

O site sabe que está no app por `window.Capacitor` (`app/web/src/lib/nativeApp.js`). Fora do app
nada disto acontece e nenhum código do app é descarregado.

- **«Instalar a app» desaparece** (o aviso e o botão do menu): já está instalada.
- **Edições digitais não se compram nos apps.** A Apple (regra 3.1.1) e a Google (Play Billing)
  obrigam a vender conteúdo digital com as compras delas, que ficam com 15 a 30 %. Decisão do dono:
  nos apps só se vendem os impressos.
  O livro com edição digital mostra só o impresso; o que só existe em PDF diz «Não está à venda na
  app»; o carrinho recusa-as e tira as que vêm da conta (postas no site). **Não há ligação nem
  indicação para comprar no site**: as duas lojas também o proíbem. Quem já comprou no site lê na
  biblioteca do app, como sempre (`lib/digitalEditions.js: podeComprarDigital`).
- **Login**: no iPhone, «Continuar com a Apple» aparece por cima de «Continuar com Google». Fechar a
  folha (ou o separador) de login é cancelar, sem mensagem de erro. A pessoa fica na página onde
  estava, já com a conta.
- **Notificações**: o perfil liga e desliga as do telemóvel; a permissão é a do sistema. O aparelho
  fica associado a quem tem sessão e muda a cada entrada e saída de conta.
- **Painel (Google Workspace)**: o login do Google Workspace do painel abre numa janela que o
  WKWebView não mostra. Essas ferramentas usam-se no site, no computador.

## O que fica de fora (por agora)

- **Android**: o trajeto de quem entrega com o ecrã apagado (no iPhone já existe; no Android
  precisa de um serviço em primeiro plano próprio), o puxar para actualizar e o número no ícone
  (o Android mostra o das notificações por ler). O microfone da narração dos vídeos dos relatórios
  usa-se no site.

- Os links de email do Supabase (confirmar conta, nova palavra-passe) passam primeiro pelo Supabase
  e acabam no Safari, não no app. A conta fica confirmada na mesma.

## Como se compila sem Mac nem Android Studio

### Android

Tudo pelo GitHub Actions (`.github/workflows/android.yml`):

- **Em cada PR** que mexa em `app/mobile`: APK de debug e AAB de release sem assinatura, para
  verificar que compila. O APK fica nos artefactos da corrida (`livraria-adventista-android-debug`)
  e pode instalar-se num telemóvel: ver «Experimentar no Android sem a Play Store».
- **Actions → App Android → Run workflow** (ou uma etiqueta `android-v1.0.0`): o AAB assinado com a
  chave de envio, nos artefactos da corrida; com a conta de serviço da Play Console, vai também para
  os **testes internos** como rascunho. A versão vem de `app/mobile/package.json`; o número, da corrida.
  Sai também o **APK assinado**, publicado numa Release do GitHub: é o que a página `/app` do site dá
  a descarregar (ver «A página /app»).

### iPhone

Tudo pelo GitHub Actions (`.github/workflows/ios.yml`), num Mac do GitHub:

- **Em cada PR** que mexa em `app/mobile`: build para o simulador, sem assinatura. Prova que o projecto
  compila, mesmo antes de haver segredos.
- **Actions → App iOS → Run workflow** (ou uma etiqueta `ios-v1.0.0`): arquivo assinado e envio para o
  **TestFlight**. A versão vem de `app/mobile/package.json`; o número do build é o da corrida.

A assinatura é a da nuvem da Apple: a chave da App Store Connect deixa o Xcode criar o certificado
e o perfil sozinho. Não há certificados nem perfis no repositório.

## Passo a passo do dono no iPhone (uma vez)

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

- **Textos** (`app/mobile/fastlane/metadata/ios/pt-PT/`): nome, subtítulo, descrição, palavras-chave, texto
  promocional, novidades da versão, endereços de suporte, do site e da política de privacidade;
  categorias Compras e Livros; as notas para a revisão em `ios/review_information/notes.txt` (explicam
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

- **App Privacy**: as mesmas respostas do manifesto do app (`app/mobile/ios/App/App/PrivacyInfo.xcprivacy`):
  nome, email, telefone, morada, localização precisa, ID do utilizador e do aparelho, histórico de
  compras, interacção com os produtos, fotografias, áudio (só a equipa), apoio ao cliente, conteúdo
  da comunidade, falhas e desempenho. Tudo ligado à conta, **nada para rastreio nem publicidade**;
- a **conta de demonstração** (email e palavra-passe) em «Sign-in required»: não vai para o
  repositório;
- «Apagar a conta» já existe em Perfil → Privacidade (regra 5.1.1).

## Passo a passo do dono no Android (uma vez)

1. **Chave de envio** (num computador com Java):
   `keytool -genkeypair -v -keystore envio.jks -alias livraria -keyalg RSA -keysize 2048 -validity 10000`.
   Guardar o ficheiro e as palavras-passe num sítio seguro: sem eles não se envia mais nenhuma versão.
2. **GitHub → Secrets**: `ANDROID_KEYSTORE_BASE64` (`base64 -w0 envio.jks`), `ANDROID_KEYSTORE_PASSWORD`,
   `ANDROID_KEY_ALIAS` (`livraria`), `ANDROID_KEY_PASSWORD`.
3. **Play Console** (play.google.com/console, conta de programador: 25 USD uma vez): criar a app
   «Livraria Adventista», pacote `ao.livrariaadventista.app`, gratuita, com a **Assinatura de apps do
   Google Play**. Correr o workflow «App Android» e **carregar à mão o primeiro AAB** (artefacto da
   corrida) em Testes → Testes internos.
4. **Firebase** (console.firebase.google.com, o projecto que a loja já usa): Adicionar app → Android,
   pacote `ao.livrariaadventista.app`. Descarregar o `google-services.json` → segredo
   `GOOGLE_SERVICES_JSON` no GitHub (o conteúdo inteiro). Definições do projecto → Contas de serviço →
   Gerar nova chave privada → o JSON vai para o segredo `FCM_SERVICE_ACCOUNT` das **Edge Functions do
   Supabase** (não do GitHub).
5. **Ligações do site no app**: Play Console → Integridade da app → Assinatura de apps: copiar as duas
   impressões **SHA-256** (a da chave de assinatura da app e a da chave de envio) → variável
   `ANDROID_CERT_SHA256` no GitHub, separadas por vírgulas. O próximo deploy do site publica
   `/.well-known/assetlinks.json`.
6. **Envio automático** (opcional): Google Cloud → conta de serviço com acesso à Play Console
   (Utilizadores e permissões → convidar o email da conta, com «Lançar para faixas de teste») → a
   chave JSON no segredo `PLAY_SERVICE_ACCOUNT_JSON` do GitHub.
7. **Ficha da Play Store**: os textos estão em `app/mobile/fastlane/metadata/android/pt-PT/` e as
   capturas de ecrã do telemóvel saem do mesmo workflow das da Apple («App iOS — ficha da App Store»,
   pasta `android/` do artefacto). Na Play Console: **Segurança dos dados** com as mesmas respostas
   do manifesto de privacidade do iPhone, classificação de conteúdo, público-alvo, e a declaração de
   que a app não vende conteúdo digital.

## A página /app: descarregar os apps a partir do site

`https://livrariaadventista.ao/app` («Descarregar a app», também no rodapé e no menu do telemóvel) é
o painel de download: um cartão para Android e outro para iPhone e iPad, o do telemóvel de quem
visita primeiro e em destaque; no computador, um código QR para abrir a página no telemóvel.

Para onde vai cada botão escolhe-se no painel, em **Configurações → PWA / telemóvel → Apps para
descarregar** (`site_settings.app_android_url` e `app_ios_url`; só ligações `https://`):

| Campo | O que pôr | O botão |
|---|---|---|
| Android | o APK servido pelo site: `https://livrariaadventista.ao/downloads/livraria-adventista.apk` | boneco do Android, «Descarregar para Android», com os passos para instalar |
| Android (mais tarde) | a página da Google Play | logótipo da Google Play, «Disponível no Google Play» |
| iPhone | o convite público do TestFlight (`https://testflight.apple.com/join/…`) | logótipo da Apple, «Experimentar no TestFlight» |
| iPhone (mais tarde) | a página da App Store (`https://apps.apple.com/…`) | logótipo da Apple, «Descarregar na App Store» |

O ícone de cada botão é o do sítio para onde ele leva (`components/StoreIcons.jsx`): o logótipo da
Google Play só aparece quando a ligação é mesmo da Google Play, não no APK descarregado do site.

- **Sem ligação**, o cartão diz que a app está a chegar e oferece a app web (PWA), que já se instalava.
- **Com ligação para o telemóvel de quem visita**, o «Instalar a app» do menu passa a «Descarregar a
  app» e leva a esta página.
- **Dentro dos apps** a página só diz «Já está a usar a app», e a ligação para ela não aparece: não
  há nada para descarregar, e a Apple não deixa falar das outras lojas (regra 2.3.10).
- **O iPhone não tem ficheiro para descarregar**: a Apple só deixa instalar pela App Store ou pelo
  TestFlight, e os dois precisam da conta Apple Developer (passo a passo acima). O convite público
  do TestFlight cria-se na App Store Connect → TestFlight → Testes externos → Ligação pública, depois
  de a Apple aprovar o primeiro build para testes externos.
- **O APK do site e a Google Play não se misturam**: o APK é assinado com a chave de envio e a app
  da Play Store com a chave da Google. Quem instalou o APK tem de o desinstalar antes de instalar
  pela Play Store. Quando a app estiver na Play Store, trocar a ligação do Android pela da loja.
- O APK só se publica com os segredos da chave de envio no GitHub (passo 2 do Android, acima). Cada
  corrida do workflow publica uma Release nova e lança o deploy do site, que copia o APK da Release
  mais recente para `/downloads/livraria-adventista.apk` (deploy-cloudflare.yml). O repositório é
  privado: o endereço da Release (`…/releases/latest/download/…`) só abre com sessão no GitHub, por
  isso a página `/app` usa o do site, que não muda de versão para versão.

## Experimentar no Android sem a Play Store

Não precisa de conta na Play Console, de chave de envio nem do Firebase:

1. No GitHub: **Actions → App Android** → a corrida mais recente do PR → **Artifacts** →
   `livraria-adventista-android-debug` (um `.zip` com o `app-debug.apk`; fica 14 dias).
2. Passar o `app-debug.apk` para o telemóvel e abri-lo; o Android pede para autorizar a instalação
   de apps desta origem (Definições → Apps → Acesso especial → Instalar apps desconhecidas).
3. O app abre o site publicado. O que é do site (login, edições digitais fora de venda, ligações)
   só se vê depois de o código do site com os apps estar publicado.

Este APK é só para experimentar: não recebe notificações (não leva o Firebase), está assinado com
uma chave de debug que muda de corrida para corrida (para instalar outro por cima, desinstalar
primeiro) e não serve para a Play Store. As ligações do site também não abrem nele (App Links).

## Testar no Android (testes internos)

1. Instalar pela ligação dos testes internos; modo de avião → ecrã «Sem ligação» → volta sozinho.
2. Entrar com a Google (abre o Chrome e volta ao app) e com email e palavra-passe.
3. Perfil → «Activar notificações» → aceitar; mudar o estado de uma encomenda: chega o aviso, e tocar
   nele abre a página.
4. Tocar num link de rastreio de um email: abre no app (depois do passo 5 acima).
5. Uma edição digital não aparece para compra; o impresso compra-se até ao fim.

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

- **Plugins npm** (`app/mobile/package.json`): depois de juntar um, `npm install` na raiz e
  `cd app/mobile && npx cap sync`; o `Package.swift` do `CapApp-SPM` (iPhone) e o Gradle (Android)
  actualizam-se sozinhos.
- **Código Swift próprio** (`app/mobile/ios/App/App/`): os plugins locais registam-se em
  `MainViewController.swift` e entram no `project.pbxproj`.
- **Uma versão nova na App Store** só é precisa quando muda a casca. Sobe-se `version` em
  `app/mobile/package.json` e corre-se o workflow.
- O `public/` e o `capacitor.config.json` dentro do projecto Xcode (`app/mobile/ios/App/App/`) são
  cópias que o `cap sync` faz de `app/mobile/www/` e de `app/mobile/capacitor.config.json`, e estão no
  `.gitignore`: muda-se o original e corre-se o `cap sync`.

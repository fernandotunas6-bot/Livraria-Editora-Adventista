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
| Puxar para actualizar | Como no iPhone: recarrega, ou avisa que há alterações por gravar; numa janela aberta ou numa lista que já desceu, puxar é só deslizar (o site diz ao app antes de cada gesto) | `MainActivity.java`, `AparelhoPlugin.java`, `NativeAppBridge.jsx` |
| Margens do ecrã | O site fica entre a barra de estado e a de navegação (`env(safe-area-inset-*)`) | `capacitor.config.json` (SystemBars) |
| Trajeto com o ecrã apagado | Quem entrega partilha a posição em segundo plano até à entrega, com a notificação «A partilhar a localização» | `TrajetoService.java`, `TrajetoPlugin.java`, `lib/trajetoNativo.js` ([TRAJETO_GPS.md](TRAJETO_GPS.md)) |
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

- **Android**: o número no ícone (o Android mostra o das notificações por ler). O microfone da
  narração dos vídeos dos relatórios usa-se no site.

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

### 0. Conta de programador da Apple

- **Apple Developer Program** (developer.apple.com/programs, 99 USD por ano). Inscrita como
  **organização** (a «Livraria e Editora Adventista»), a loja aparece como vendedora com esse nome,
  mas a Apple pede o número **D-U-N-S** da empresa (gratuito, pedido em developer.apple.com/support/D-U-N-S,
  demora uns dias) e que quem inscreve possa assinar pela empresa. Inscrita em nome de uma pessoa,
  é o nome dela que aparece na App Store.
- Na App Store Connect, **Business → Agreements**: aceitar o acordo das apps gratuitas (sem ele não
  se publica nada).

### 1. Apple Developer (developer.apple.com → Certificates, Identifiers & Profiles)

1. **Identifiers → +** → App IDs → App. Bundle ID **explícito**: `ao.livrariaadventista.app`.
   Capacidades: **Push Notifications**, **Sign In with Apple**, **Associated Domains**.
2. Anotar o **Team ID** (canto de cima à direita, 10 letras e algarismos).
3. **Keys → +** → nome "APNs Livraria", marcar **Apple Push Notifications service (APNs)** →
   Continue → Download. Guarda-se o ficheiro `AuthKey_XXXXXXXXXX.p8` (só se descarrega uma vez) e
   anota-se o **Key ID**. Esta chave é para o Supabase (passo 4).
4. **Services → Sign in with Apple for Email Communication → Configure**: registar o domínio e o
   endereço de onde a loja envia os emails (os do provedor escolhido no painel, em Configurações →
   Email, push e chat). Quem entra com a Apple e esconde o email recebe um endereço
   `@privaterelay.appleid.com`; sem este registo, a Apple deita fora os emails das encomendas e da
   conta que lhe chegam. O domínio tem de ter o SPF certo para esse provedor.

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
  repositório. São precisas **duas**, porque as notas para a revisão falam das duas:
  - uma de cliente, com pelo menos uma encomenda, um livro na biblioteca e acesso à comunidade;
  - uma de **colportor** com uma entrega «Saiu para entrega» em Área do colportor → Entregas → Para
    entregar, para a Apple experimentar a localização em segundo plano (sem isto recusa pela regra
    2.5.4). Escreve-se a segunda na caixa das notas, a seguir às notas do repositório;
- o **contacto** para a revisão (nome, telefone, email), em App Review Information;
- **Age Rating** (classificação etária): conteúdo gerado pelos utilizadores **sim** (a comunidade);
  acesso livre à web **não** (o app só mostra o site da loja; as ligações de fora abrem no Safari);
  publicidade **não**; compras dentro da app **não**; o resto **não** ou **nenhum**;
- **Pricing and Availability**: gratuita, e os países onde aparece (Angola, e os outros que se
  quiser);
- **Content Rights**: o app mostra capas e excertos dos livros que a loja vende, com o direito de o
  fazer;
- a **exportação com cifra** fica respondida pelo `ITSAppUsesNonExemptEncryption = false` do
  Info.plist (só HTTPS): o TestFlight não pergunta;
- «Apagar a conta» já existe em Perfil → Segurança e privacidade → Os seus dados (regra 5.1.1);
- **Comunidade** (regra 1.2): denunciar, a publicação oculta à terceira denúncia, **bloquear** uma
  pessoa (menu «⋯» → «Bloquear»; lista em Perfil → Segurança e privacidade) e os termos com tolerância zero.
  Está explicado nas notas para a revisão.

Antes de carregar em «Adicionar para revisão», confirmar:

1. o deploy do site depois de pôr a `APPLE_TEAM_ID` (passo 3) publicou
   `https://livrariaadventista.ao/.well-known/apple-app-site-association`. As notas para a revisão
   dizem que os links e as palavras-passe do site abrem no app, e a Apple experimenta;
2. as duas contas de demonstração entram no app do TestFlight e mostram o que as notas dizem;
3. uma notificação chega a um iPhone com o app do TestFlight (sem `APNS_ENV=sandbox` no Supabase);
4. «Continuar com a Apple» entra, e uma encomenda de teste manda o email para o endereço da Apple;
5. o site publicado já tem o bloqueio da comunidade e a política de privacidade nova (o app mostra
   o site: o que não estiver publicado, a Apple não vê).

## Passo a passo do dono no Android (uma vez)

0. **Tipo de conta na Play Console** (25 USD uma vez). Uma conta **pessoal** criada depois de
   Novembro de 2023 só publica na produção depois de um **teste fechado com pelo menos 12 pessoas
   durante 14 dias seguidos** (Testes → Teste fechado; elas instalam pela ligação de convite). Uma
   conta de **organização** não tem essa espera, mas pede o número **D-U-N-S** da empresa (o mesmo da
   Apple). A Google também verifica a identidade de quem a abre.
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
7. **Ficha da Play Store** (Crescimento → Presença na loja → Ficha principal):
   - textos em `app/mobile/fastlane/metadata/android/pt-PT/` (título, descrição breve e completa);
   - o **ícone de 512 × 512** e o **gráfico de destaque de 1024 × 500** em
     `app/mobile/fastlane/metadata/android/pt-PT/images/` (`icon.png`, `featureGraphic.png`; o teste
     da ficha confere os tamanhos);
   - as **capturas do telemóvel** (pelo menos 2) saem do mesmo workflow das da Apple («App iOS —
     ficha da App Store», pasta `android/` do artefacto);
   - categoria **Compras**, email de contacto e a política de privacidade
     `https://livrariaadventista.ao/privacidade`.
   Em Política e programas → **Conteúdo da app**:
   - **Acesso à app**: as duas contas de demonstração (cliente e colportor), como na Apple, e o
     caminho do colportor (Área do colportor → Entregas → Para entregar);
   - **Anúncios**: não tem;
   - **Segurança dos dados**: as mesmas respostas do manifesto de privacidade do iPhone (nome, email,
     telefone, morada, localização precisa, IDs da conta e do aparelho, compras, interacções,
     fotografias, áudio da equipa, mensagens de apoio, conteúdo da comunidade, falhas e desempenho);
     tudo cifrado em trânsito, nada partilhado para publicidade, e **pode pedir-se que os dados sejam
     apagados**;
   - **Eliminação da conta**: a ligação `https://livrariaadventista.ao/privacidade#direitos`, que
     explica como se apaga dentro da app (Perfil → Segurança e privacidade) e pelos contactos, sem conta;
   - **Classificação de conteúdo** (questionário IARC): categoria «Referência, notícias ou educação»
     ou «Compras»; os utilizadores **podem interagir e partilhar conteúdo** (a comunidade), há
     moderação, denúncia e bloqueio; sem violência, sexo, linguagem ou jogo;
   - **Público-alvo**: 13 anos ou mais (por causa da comunidade); a app não é dirigida a crianças;
   - **Pagamentos**: só artigos físicos; as edições digitais não se vendem na app (a política de
     pagamentos da Google obriga a usar o Play Billing para conteúdo digital).
8. **Serviço de localização em primeiro plano** (Play Console → Política e programas → Conteúdo da
   app → **Permissões de serviço em primeiro plano**): declarar **Localização**. Descrição: «Quem
   entrega uma encomenda toca em "Partilhar a minha localização" e o telemóvel continua a mandar a
   posição ao cliente com o ecrã apagado, até à entrega; a notificação "A partilhar a localização"
   fica na barra enquanto dura.» A Google pede um vídeo curto do caminho: abrir uma encomenda «Saiu
   para entrega», tocar em Partilhar, apagar o ecrã, e ver o mapa do cliente a mexer. Não é preciso
   a localização em segundo plano (`ACCESS_BACKGROUND_LOCATION`): a partilha começa sempre com o app
   à frente.

## A página /app: descarregar os apps a partir do site

`https://livrariaadventista.ao/app` («Descarregar a app», também no rodapé e no menu do telemóvel) é
o painel de download: um cartão para Android e outro para iPhone e iPad, o do telemóvel de quem
visita primeiro e em destaque; no computador, um código QR para abrir a página no telemóvel.

Para onde vai cada botão escolhe-se no painel, em **Configurações → PWA / telemóvel → Apps para
descarregar** (`site_settings.app_android_url` e `app_ios_url`; só ligações `https://`):

| Campo | O que pôr | O botão |
|---|---|---|
| Android | o APK publicado pelo workflow: `https://github.com/fernandotunas6-bot/Livraria-Editora-Adventista/releases/latest/download/livraria-adventista.apk` | boneco do Android, «Descarregar para Android», com os passos para instalar |
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
- O APK só se publica com os segredos da chave de envio no GitHub (passo 2 do Android, acima). A
  ligação `…/releases/latest/download/livraria-adventista.apk` não muda de versão para versão: cada
  corrida do workflow publica uma Release nova e a ligação passa a dar a mais recente.

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
6. No topo de uma página, puxar para baixo recarrega; com o carrinho aberto, puxar só desliza a lista.
7. Com uma conta de quem entrega: numa encomenda «Saiu para entrega», «Partilhar a minha
   localização» → aceitar a localização exacta → aparece a notificação «A partilhar a localização».
   Apagar o ecrã uns minutos e ver, no rastreio do cliente, a posição a mudar; «Parar de partilhar»
   tira a notificação.

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

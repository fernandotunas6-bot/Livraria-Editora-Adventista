import React, { useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import qrcode from 'qrcode-generator';
import { Bell, CheckCircle2, Download, Link2, LogIn } from 'lucide-react';
import Header from '@/components/Header.jsx';
import Footer from '@/components/Footer.jsx';
import ShoppingCart from '@/components/ShoppingCart.jsx';
import PageBannerSlider from '@/components/PageBannerSlider';
import { BotaoInstalarApp } from '@/components/InstalarApp';
import { AndroidIcon, AppleIcon, GooglePlayIcon } from '@/components/StoreIcons';
import { Button } from '@/components/ui/button';
import { useInstalarApp } from '@/hooks/useInstalarApp';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import { aparelhoDe, appsParaDescarregar } from '@/lib/appDownload';
import { pageTitle } from '@/lib/brand';
import { CANONICAL_ORIGIN } from '@/lib/canonicalHost';
import { eAppNativa } from '@/lib/nativeApp';
import { cn } from '@/lib/utils';

/** O endereço desta página, para o código QR e para partilhar. */
export const ENDERECO_DA_PAGINA = `${CANONICAL_ORIGIN}/app`;

function Passo({ n, children }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary" aria-hidden="true">{n}</span>
      <span className="min-w-0 pt-0.5 text-sm leading-relaxed">{children}</span>
    </li>
  );
}

/** O código QR de um endereço, desenhado em SVG (um só caminho, sem HTML de fora). */
export function CodigoQr({ texto, className }) {
  const { lado, caminho } = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(String(texto || ''));
    qr.make();
    const n = qr.getModuleCount();
    let d = '';
    for (let l = 0; l < n; l++) {
      for (let c = 0; c < n; c++) if (qr.isDark(l, c)) d += `M${c} ${l}h1v1h-1z`;
    }
    return { lado: n, caminho: d };
  }, [texto]);
  return (
    <svg
      viewBox={`-2 -2 ${lado + 4} ${lado + 4}`} role="img" aria-label="Código QR desta página"
      className={cn('rounded-lg bg-white', className)} shapeRendering="crispEdges"
    >
      <path d={caminho} fill="#0f172a" />
    </svg>
  );
}

/**
 * O ícone de cada botão é o do sítio para onde ele leva: a App Store e o TestFlight são da Apple,
 * a Google Play tem o triângulo dela, e o APK descarregado do site leva o boneco do Android — o
 * logótipo da Google Play num ficheiro que não vem da loja dizia o que não é verdade.
 */
const ICONE_DA_LIGACAO = { appstore: AppleIcon, testflight: AppleIcon, play: GooglePlayIcon, apk: AndroidIcon };

/** O botão de descarregar, com o aspecto dos das lojas: o ícone e o texto em duas linhas, a preto. */
function BotaoDaLoja({ app, plataforma }) {
  const Icone = ICONE_DA_LIGACAO[app.tipo] || Download;
  const [cima, baixo] = app.linhas;
  // Uma ligação com as classes dela, e não o `Button` do site: esse fixa a altura (h-9) e o
  // tamanho dos ícones (16 px), e aqui o ícone é grande e o texto tem duas linhas.
  return (
    <a
      href={app.url} rel="noopener" data-descarregar={plataforma} data-loja={app.tipo}
      className="control-press flex min-h-14 w-full items-center justify-center gap-3 rounded-xl bg-black px-5 py-2.5 text-white shadow-sm transition-colors hover:bg-black/85 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 dark:bg-white dark:text-black dark:hover:bg-white/85"
    >
      <Icone className="h-8 w-8 shrink-0" />
      <span className="flex flex-col items-start text-left leading-tight">
        <span className="text-[11px] opacity-80">{cima}</span>
        <span className="text-lg font-semibold">{baixo}</span>
      </span>
    </a>
  );
}

/**
 * O cartão de um telemóvel. Com ligação (das Configurações do painel), o botão leva à loja de apps
 * ou descarrega o APK; sem ela, diz que a app está a chegar e oferece a app web (PWA), que já se
 * instalava. `appWeb`: 'aqui' (este telemóvel instala-a agora: mostra o botão), 'la' (instala-se
 * no outro telemóvel) ou '' (a loja não a tem ligada, ou já está instalada: não se promete nada).
 */
function CartaoDoTelemovel({ plataforma, app, oMeu, appWeb = '' }) {
  const android = plataforma === 'android';
  const Icone = android ? AndroidIcon : AppleIcon;
  const nome = android ? 'Android' : 'iPhone e iPad';
  return (
    <section
      className={cn('flex flex-col gap-4 rounded-2xl border bg-card p-5 sm:p-6', oMeu && 'border-primary ring-1 ring-primary/40')}
      data-app={plataforma} data-o-meu={oMeu ? '' : undefined} aria-labelledby={`app-${plataforma}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icone className="h-6 w-6" /></span>
          <div>
            <h2 id={`app-${plataforma}`} className="text-lg font-semibold leading-tight">{nome}</h2>
            <p className="text-xs text-muted-foreground">{android ? 'Telemóveis Samsung, Xiaomi, Tecno, Infinix, Huawei…' : 'Da Apple'}</p>
          </div>
        </div>
        {oMeu && <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">O seu telemóvel</span>}
      </div>

      {app ? (
        <>
          <BotaoDaLoja app={app} plataforma={plataforma} />
          {app.tipo === 'apk' && (
            <div>
              <p className="mb-2 text-sm font-medium">Como instalar</p>
              <ol className="space-y-2.5">
                <Passo n={1}>Toque em <b>«{app.botao}»</b> e espere o ficheiro chegar.</Passo>
                <Passo n={2}>Abra o ficheiro. O Android pede para <b>autorizar a instalação</b> a partir do navegador: aceite e volte atrás.</Passo>
                <Passo n={3}>Toque em <b>«Instalar»</b>. A app fica no ecrã do telemóvel.</Passo>
              </ol>
              <p className="mt-3 text-xs text-muted-foreground">
                Para actualizar, volte a esta página e descarregue outra vez: a versão nova instala-se por cima, sem perder nada.
              </p>
            </div>
          )}
          {app.tipo === 'testflight' && (
            <p className="text-xs text-muted-foreground">
              A app está em testes: abre no <b>TestFlight</b>, a app gratuita da Apple para experimentar apps antes de chegarem à App Store.
            </p>
          )}
        </>
      ) : (
        <div className="space-y-3" data-a-chegar={plataforma}>
          <p className="text-sm text-muted-foreground">
            {android ? 'A app para Android está a chegar.' : 'A app para iPhone e iPad está a chegar à App Store.'}
            {appWeb && ' Entretanto, a loja instala-se no telemóvel a partir do navegador e fica no ecrã como uma app.'}
          </p>
          {appWeb === 'aqui' && <BotaoInstalarApp semApp className="btn-primary w-full py-6 text-base" />}
          {appWeb === 'la' && (
            <p className="text-xs text-muted-foreground">Abra esta página no {android ? 'telemóvel Android' : 'iPhone ou iPad'} para instalar.</p>
          )}
        </div>
      )}
    </section>
  );
}

const VANTAGENS = [
  [Bell, 'Avisos das encomendas', 'Sabe logo quando a encomenda é confirmada, sai para entrega e chega.'],
  [LogIn, 'Entra com um toque', 'A sessão fica guardada no telemóvel; no iPhone, também com a conta Apple.'],
  [Link2, 'As ligações abrem na app', 'O rastreio do email e as publicações partilhadas abrem directamente na app.'],
];

/**
 * O painel de download: um cartão por telemóvel, o de quem visita primeiro e em destaque. No
 * computador, um código QR para abrir a página no telemóvel. Dentro dos apps (`noApp`) não há
 * nada para descarregar, e não se fala das outras lojas de apps (regra 2.3.10 da Apple).
 */
export function PainelDeDownload({ settings, aparelho = 'outro', noApp = false }) {
  const apps = appsParaDescarregar(settings);
  // A app web: com a instalação ligada na loja, instala-se no telemóvel de quem visita se o
  // navegador deixar (e ainda não estiver instalada); nos outros cartões diz-se onde.
  const { visivel: instalavelAqui } = useInstalarApp();
  const appWebLigada = settings?.pwa_enabled !== false;
  const appWebDe = (p) => {
    if (!appWebLigada) return '';
    if (aparelho !== p) return 'la';
    return instalavelAqui ? 'aqui' : '';
  };
  if (noApp) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border bg-card p-6 text-center" data-ja-na-app>
        <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-emerald-600" aria-hidden="true" />
        <h2 className="text-lg font-semibold">Já está a usar a app</h2>
        <p className="mt-1 text-sm text-muted-foreground">Não precisa de descarregar mais nada: a app actualiza-se sozinha.</p>
        <Button asChild className="btn-primary mt-5"><Link to="/shop">Ir para a loja</Link></Button>
      </div>
    );
  }
  const ordem = aparelho === 'ios' ? ['ios', 'android'] : ['android', 'ios'];
  return (
    <div className="space-y-10">
      <div className="grid gap-5 md:grid-cols-2">
        {ordem.map((p) => <CartaoDoTelemovel key={p} plataforma={p} app={apps[p]} oMeu={aparelho === p} appWeb={appWebDe(p)} />)}
      </div>

      {aparelho === 'outro' && (
        <section className="flex flex-col items-center gap-4 rounded-2xl border bg-card p-5 text-center sm:flex-row sm:p-6 sm:text-left" data-qr aria-labelledby="app-qr">
          <CodigoQr texto={ENDERECO_DA_PAGINA} className="h-36 w-36 shrink-0 border" />
          <div>
            <h2 id="app-qr" className="text-lg font-semibold">Está no computador?</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Aponte a câmara do telemóvel a este código para abrir a página lá, ou escreva no navegador do telemóvel:
            </p>
            <p className="mt-2 font-mono text-sm font-semibold">{ENDERECO_DA_PAGINA.replace('https://', '')}</p>
          </div>
        </section>
      )}

      <section aria-labelledby="app-vantagens">
        <h2 id="app-vantagens" className="mb-4 text-xl font-semibold">O que a app traz</h2>
        <ul className="grid gap-4 sm:grid-cols-3">
          {VANTAGENS.map(([Icone, titulo, texto]) => (
            <li key={titulo} className="rounded-xl border bg-card p-4">
              <Icone className="mb-2 h-5 w-5 text-primary" aria-hidden="true" />
              <p className="text-sm font-semibold">{titulo}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{texto}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/** /app: descarregar a app para Android e para iPhone (as ligações vêm das Configurações do painel). */
export default function AppDownloadPage() {
  const [isCartOpen, setIsCartOpen] = useState(false);
  const { settings } = useSiteSettings();
  const [noApp] = useState(() => eAppNativa());
  const [aparelho] = useState(() => (
    typeof navigator === 'undefined' ? 'outro' : aparelhoDe(navigator.userAgent || '', navigator.maxTouchPoints || 0)
  ));

  return (
    <>
      <Helmet>
        <title>{pageTitle('Descarregar a app')}</title>
        <meta name="description" content="A app da Livraria Adventista para Android e para iPhone: avisos das encomendas, a sua conta e a loja toda no telemóvel." />
      </Helmet>

      <Header onCartOpen={() => setIsCartOpen(true)} />
      <ShoppingCart isCartOpen={isCartOpen} setIsCartOpen={setIsCartOpen} />

      <PageBannerSlider>
        <h1 className="mb-3 text-3xl font-bold leading-tight sm:text-4xl/10 md:text-5xl/none">Descarregar a app</h1>
        <p className="text-base text-white/85 sm:text-lg">A livraria no seu telemóvel, com os avisos das suas encomendas</p>
      </PageBannerSlider>

      <main className="section-spacing bg-background">
        <div className="container-custom max-w-4xl">
          <PainelDeDownload settings={settings} aparelho={aparelho} noApp={noApp} />
        </div>
      </main>

      <Footer />
    </>
  );
}

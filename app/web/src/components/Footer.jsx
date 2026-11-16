import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Facebook, Instagram, Youtube, Mail, MapPin, ExternalLink, CheckCircle2, PackageSearch, Truck, CreditCard, Store, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import { subscribeNewsletter } from '@/api/EcommerceApi';
import { getPhysicalStores, getPaymentMethods } from '@/api/PlatformApi';
import BrandLogo from '@/components/BrandLogo';
import { BRAND } from '@/lib/brand';
import { safeLinkUrl } from '@/lib/safeLink';
import { fotoDaLoja, lojaSrcSet, mapsUrl } from '@/lib/stores';
import SafeLink from '@/components/SafeLink.jsx';
import { motion, AnimatePresence } from 'framer-motion';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAfterLoad } from '@/hooks/useAfterLoad';
import FooterCompact from '@/components/FooterCompact.jsx';
import { eAppNativa } from '@/lib/nativeApp';

// Dentro dos apps não há nada para descarregar: a ligação para a página /app não aparece.
const NO_APP = eAppNativa();

// Só caminhos que existem no App.jsx. O separador do perfil vai no URL (/profile?tab=…),
// como no painel, para estes atalhos abrirem já na secção certa.
const DEFAULT_FOOTER_COLUMNS = [
  {
    title: 'Apoio ao Cliente',
    links: [
      { label: 'Rastrear encomenda', url: '/track', internal: true },
      { label: 'Envios e devoluções', url: '/shipping-returns', internal: true },
      { label: 'Perguntas frequentes', url: '/faq', internal: true },
      { label: 'Falar connosco', url: '/contact', internal: true },
      { label: 'Lojas físicas e horários', url: '/lojas', internal: true },
      { label: 'Descarregar a app', url: '/app', internal: true },
    ],
  },
  {
    title: 'Comprar',
    links: [
      { label: 'Todos os livros', url: '/shop', internal: true },
      { label: 'Coleções', url: '/colecoes', internal: true },
      { label: 'Levantamento na loja', url: '/lojas', internal: true },
      { label: 'Pagamento na entrega', url: '/shipping-returns', internal: true },
      { label: 'Sobre nós', url: '/about', internal: true },
      { label: 'Ser colportor', url: '/colportor/candidatura', internal: true },
    ],
  },
  {
    title: 'A minha conta',
    links: [
      { label: 'Entrar ou criar conta', url: '/login', internal: true },
      { label: 'As minhas encomendas', url: '/profile?tab=orders', internal: true },
      { label: 'Lista de desejos', url: '/profile?tab=wishlist', internal: true },
      { label: 'Dados e notificações', url: '/profile?tab=settings', internal: true },
      { label: 'Palavra-passe e segurança', url: '/profile?tab=security', internal: true },
    ],
  },
];

const ESTILO_LINK = 'block py-1.5 text-sm text-background/70 hover:text-[#22d3ee] transition-colors';

/**
 * Uma ligação de uma coluna do rodapé. O endereço vem de `site_settings.footer_columns`,
 * JSON escrito no painel: ver `components/SafeLink.jsx` para o que isso implica.
 *
 * A etiqueta `internal` do JSON é ignorada de propósito — quem decide é o próprio endereço.
 * Um `https://…` marcado como interno ia para o `<Link>` do Router como se fosse um caminho
 * desta aplicação.
 */
function FooterLink({ link }) {
  return (
    <SafeLink
      to={link?.url}
      className={ESTILO_LINK}
      fallbackClassName="block py-1.5 text-sm text-background/40"
    >
      {String(link?.label ?? '')}
    </SafeLink>
  );
}

/**
 * Mapa de uma loja no rodapé, só depois de alguém o pedir.
 *
 * O rodapé está em quase todas as páginas, e isto era um `iframe` do Google Maps por loja,
 * montado sempre: três lojas com coordenadas eram três molduras do Google em cada página
 * vista, cada uma com os seus pedidos e os seus cookies, para um mapa que fica no fim da
 * página e quase ninguém desce até ele. Além do peso, punha a Google a saber de cada visita a
 * cada página da loja, sem a pessoa pedir mapa nenhum.
 *
 * Agora há um botão. Quem quiser o mapa carrega, e o endereço da loja e o link para o Google
 * Maps continuam ali, em texto, para quem só quer saber onde é.
 */
function StoreMap({ store, embedKey, open, onOpen }) {
  if (!open) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-background/20 bg-background/10 px-2.5 py-1.5 text-xs text-background/80 transition-colors hover:bg-background/20"
      >
        <MapPin className="h-3 w-3" aria-hidden="true" /> Mostrar o mapa
      </button>
    );
  }
  return (
    <div className="mt-2 aspect-video overflow-hidden rounded-lg border border-background/10">
      <iframe
        title={`Mapa ${store.name}`}
        src={`https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(embedKey)}&q=${encodeURIComponent(`${store.latitude},${store.longitude}`)}&zoom=15`}
        className="h-full w-full border-0"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />
    </div>
  );
}

const Footer = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [stores, setStores] = useState([]);
  const [payments, setPayments] = useState([]);
  const [trackNumber, setTrackNumber] = useState('');
  const [trackEmail, setTrackEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  // Qual dos mapas das lojas está aberto. Um de cada vez (ver StoreMap).
  const [mapaAberto, setMapaAberto] = useState(null);
  const { toast } = useToast();
  const { settings } = useSiteSettings();

  // Sem a pontuação final: a frase leva "." a seguir, e uma frase escrita no painel já com ponto
  // final saía "transforma.. Literatura cristã".
  const tagline = String(settings.footer_tagline || settings.tagline || BRAND.tagline).trim().replace(/[.!?…]+$/, '');
  const copyright = settings.footer_copyright || `© ${new Date().getFullYear()} ${settings.site_name || BRAND.name}. Todos os direitos reservados.`;
  const columns = Array.isArray(settings.footer_columns) && settings.footer_columns.length > 0
    ? settings.footer_columns
    : DEFAULT_FOOTER_COLUMNS;
  const showStores = settings.show_stores_in_footer !== false;

  useEffect(() => {
    if (showStores) {
      getPhysicalStores().then(setStores).catch(() => {});
    }
  }, [showStores]);

  // Os métodos de pagamento que o admin tem activos — os mesmos que o checkout aceita. Pedidos
  // ao primeiro gesto ou uns segundos depois do load: o rodapé está no fim, e este pedido
  // competia com a página.
  const afterLoad = useAfterLoad();
  useEffect(() => {
    if (!afterLoad) return;
    getPaymentMethods().then((d) => setPayments(d?.methods || [])).catch(() => {});
  }, [afterLoad]);

  // Rastreio rápido: a página /track recebe o número e o email já preenchidos.
  const handleTrackSubmit = (e) => {
    e.preventDefault();
    const num = trackNumber.trim();
    if (!num) return;
    navigate('/track', { state: { orderNumber: num, email: trackEmail.trim() } });
  };

  const freeFrom = Number(settings.shipping_free_threshold) || 0;
  const hasPickup = stores.some((s) => s.pickup_enabled !== false);
  const whatsappDigits = (settings.whatsapp || settings.contact_phone || '').replace(/\D/g, '');

  const handleNewsletterSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    try {
      await subscribeNewsletter(email.trim());
      setSubscribed(true);
      toast({
        title: 'Subscrição realizada!',
        description: 'Vai receber as nossas novidades neste email.',
      });
      setEmail('');
    } catch (err) {
      toast({ variant: 'destructive', title: 'Erro', description: err.message || 'Não foi possível subscrever.' });
    } finally {
      setSubmitting(false);
    }
  };

  const storesByProvince = stores.reduce((acc, s) => {
    const prov = s.province || 'Outras';
    if (!acc[prov]) acc[prov] = [];
    acc[prov].push(s);
    return acc;
  }, {});

  return (
    // Fundo sólido sempre: por baixo do rodapé não há nada para desfocar, e o "vidro" sobre o
    // fundo claro deixava-o cinzento, com o texto abaixo do contraste mínimo (3,4:1).
    // Com o aviso «Instalar App» à vista, o fim do rodapé ganha a altura dele (PwaInstallBanner,
    // canto direito): no fim da página tapava a «Política de privacidade» e os «Termos e condições».
    <footer
      className="bg-foreground text-background"
      style={{ paddingBottom: 'calc(var(--aviso-instalar, 0px) + var(--aviso-instalar-direita, 0px))' }}
    >
      <div className="container-custom section-spacing">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-12 mb-12">
          <div className="lg:col-span-4">
            <BrandLogo linkTo="/" variant="light" />
            <p className="text-background/70 text-sm mb-6">
              {tagline}. Literatura cristã, educação e inspiração para toda a família.
            </p>
            <div className="flex gap-4">
              {safeLinkUrl(settings.facebook) && (
                <a href={safeLinkUrl(settings.facebook)} target="_blank" rel="noopener noreferrer" aria-label="Página de Facebook da livraria" className="text-background/60 hover:text-[#22d3ee] transition-colors">
                  <Facebook className="h-5 w-5" />
                </a>
              )}
              {safeLinkUrl(settings.instagram) && (
                <a href={safeLinkUrl(settings.instagram)} target="_blank" rel="noopener noreferrer" aria-label="Instagram da livraria" className="text-background/60 hover:text-[#22d3ee] transition-colors">
                  <Instagram className="h-5 w-5" />
                </a>
              )}
              {safeLinkUrl(settings.youtube) && (
                <a href={safeLinkUrl(settings.youtube)} target="_blank" rel="noopener noreferrer" aria-label="Canal do YouTube da livraria" className="text-background/60 hover:text-[#22d3ee] transition-colors">
                  <Youtube className="h-5 w-5" />
                </a>
              )}
            </div>
            {(settings.contact_email || settings.contact_phone || settings.whatsapp) && (
              <div className="text-sm text-background/60 mt-4 space-y-1">
                {settings.contact_email && <p>{settings.contact_email}</p>}
                {settings.contact_phone && <p>{settings.contact_phone}</p>}
                {settings.whatsapp && settings.whatsapp !== settings.contact_phone && <p>{settings.whatsapp}</p>}
              </div>
            )}
          </div>

          {columns.map((col) => (
            <div key={col.title} className="lg:col-span-2">
              <h4 className="text-lg font-semibold mb-4 text-background">{col.title}</h4>
              <ul className="space-y-1">
                {(col.links || []).filter((link) => !(NO_APP && link?.url === '/app')).map((link) => (
                  <li key={link.label}><FooterLink link={link} /></li>
                ))}
              </ul>
            </div>
          ))}

          <div className="lg:col-span-4">
            <div className="relative rounded-2xl bg-white/5 border border-white/10 p-6 shadow-xl backdrop-blur-md overflow-hidden">
              <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-marca/20 rounded-full blur-xl pointer-events-none" />
              
              <AnimatePresence mode="wait">
                {!subscribed ? (
                  <motion.div
                    key="form"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="space-y-4"
                  >
                    <div>
                      <h4 className="text-lg font-extrabold text-background flex items-center gap-2">
                        Newsletter
                      </h4>
                      <p className="text-xs text-background/70 mt-1">
                        Receba por email os lançamentos e as novidades da livraria.
                      </p>
                    </div>

                    <form onSubmit={handleNewsletterSubmit} className="space-y-3">
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-background/70" />
                        <Input
                          type="email"
                          aria-label="Email para receber novidades"
                          autoComplete="email"
                          placeholder="Digite o seu melhor email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          required
                          className="bg-background/5 border-background/10 text-background placeholder:text-background/70 pl-10 focus-visible:ring-marca focus-visible:border-marca h-11 rounded-xl"
                        />
                      </div>
                      <Button 
                        type="submit" 
                        className="w-full bg-primary hover:bg-[#0891b2] text-white font-bold h-11 rounded-xl shadow-[0_4px_14px_rgba(14,165,201,0.3)] hover:shadow-[0_6px_20px_rgba(14,165,201,0.4)] transition-all flex items-center justify-center cursor-pointer" 
                        disabled={submitting}
                      >
                        <Mail className="h-4 w-4 mr-2" />
                        {submitting ? 'A processar...' : 'Subscrever Agora'}
                      </Button>
                    </form>

                    <p className="text-[11px] text-background/75 text-center">
                      🔒 Respeitamos a sua privacidade. Cancele com um clique.
                    </p>
                  </motion.div>
                ) : (
                  <motion.div
                    key="success"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="text-center py-6 space-y-4"
                  >
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 mb-2 border border-emerald-500/30">
                      <CheckCircle2 className="h-6 w-6" />
                    </div>
                    <div>
                      <h4 className="text-lg font-bold text-background">Inscrição Confirmada!</h4>
                      <p className="text-xs text-background/70 mt-2 leading-relaxed">
                        Obrigado. Vai receber as nossas novidades neste email, e pode deixar de as receber quando quiser.
                      </p>
                    </div>
                    <Button 
                      variant="outline" 
                      onClick={() => setSubscribed(false)} 
                      className="text-xs h-8 border-white/20 text-background hover:bg-white/10 rounded-lg"
                    >
                      Inscrever outro email
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* Serviços: o que a loja faz mesmo, com os valores reais das Configurações, das
            lojas e dos métodos de pagamento activos. */}
        <div className="grid gap-8 lg:grid-cols-12 mb-12 border-t border-background/20 pt-10">
          <div className="lg:col-span-5">
            <h4 className="text-lg font-semibold mb-2 text-background flex items-center gap-2">
              <PackageSearch className="h-4 w-4 text-[#22d3ee]" aria-hidden="true" />
              Rastrear a sua encomenda
            </h4>
            <p className="text-sm text-background/60 mb-4">
              Indique o número da encomenda e o email usado na compra.
            </p>
            <form onSubmit={handleTrackSubmit} className="flex flex-col sm:flex-row gap-2">
              <Input
                value={trackNumber}
                onChange={(e) => setTrackNumber(e.target.value)}
                placeholder="Nº da encomenda"
                aria-label="Número da encomenda"
                className="bg-background/10 border-background/20 text-background placeholder:text-background/70"
              />
              <Input
                type="email"
                value={trackEmail}
                onChange={(e) => setTrackEmail(e.target.value)}
                placeholder="Email da compra"
                aria-label="Email usado na compra"
                className="bg-background/10 border-background/20 text-background placeholder:text-background/70"
              />
              <Button type="submit" className="btn-primary shrink-0" disabled={!trackNumber.trim()}>
                Seguir
              </Button>
            </form>
          </div>

          <div className="lg:col-span-4">
            <h4 className="text-lg font-semibold mb-4 text-background">Como compra e recebe</h4>
            <ul className="space-y-3 text-sm text-background/70">
              <li className="flex gap-3">
                <Truck className="h-4 w-4 mt-0.5 text-[#22d3ee] shrink-0" aria-hidden="true" />
                <span>
                  Entrega em todo o país
                  {freeFrom > 0 && <> · portes grátis acima de {freeFrom.toLocaleString('pt-AO')} Kz</>}
                </span>
              </li>
              {hasPickup && (
                <li className="flex gap-3">
                  <Store className="h-4 w-4 mt-0.5 text-[#22d3ee] shrink-0" aria-hidden="true" />
                  <span>Levantamento nas lojas, sem portes</span>
                </li>
              )}
              <li className="flex gap-3">
                <CheckCircle2 className="h-4 w-4 mt-0.5 text-[#22d3ee] shrink-0" aria-hidden="true" />
                <span>Confirmação de recepção com assinatura digital</span>
              </li>
              {whatsappDigits && (
                <li className="flex gap-3">
                  <MessageCircle className="h-4 w-4 mt-0.5 text-[#22d3ee] shrink-0" aria-hidden="true" />
                  <a
                    href={`https://wa.me/${whatsappDigits}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="-my-1.5 inline-block py-1.5 hover:text-[#22d3ee] transition-colors"
                  >
                    Falar por WhatsApp
                  </a>
                </li>
              )}
            </ul>
          </div>

          {payments.length > 0 && (
            <div className="lg:col-span-3">
              <h4 className="text-lg font-semibold mb-4 text-background flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-[#22d3ee]" aria-hidden="true" />
                Pagamentos aceites
              </h4>
              <ul className="flex flex-wrap gap-2">
                {payments.map((m) => (
                  <li
                    key={m.id || m.code}
                    className="rounded-md border border-background/20 bg-background/10 px-2.5 py-1 text-xs text-background/80"
                  >
                    {m.name}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {showStores && stores.length > 0 && (
          <div className="mb-12 border-t border-background/20 pt-10">
            <h4 className="font-semibold text-lg mb-6 text-background flex items-center gap-2">
              <MapPin className="h-5 w-5 text-[#22d3ee]" />
              As Nossas Lojas
              <Link to="/lojas" className="-my-1.5 ml-auto inline-block py-1.5 text-xs font-normal text-[#22d3ee] hover:underline">Ver todas com mapa</Link>
            </h4>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {Object.entries(storesByProvince).map(([province, list]) => (
                <div key={province}>
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#22d3ee] mb-3">{province}</p>
                  <div className="space-y-4">
                    {list.map((store) => (
                      <div key={store.id} className="rounded-xl overflow-hidden bg-background/5 border border-background/10">
                        {fotoDaLoja(store) && (
                          // O rodapé está em todas as páginas: sem `lazy` estas fotografias eram
                          // descarregadas em cada visita, mesmo por quem nunca chega ao fundo.
                          // E a caixa tem 112 px de altura — o `srcset` manda vir a variante de
                          // 480 px em vez dos 1280 do original.
                          <img
                            src={fotoDaLoja(store)}
                            srcSet={lojaSrcSet(fotoDaLoja(store)) || undefined}
                            sizes="(min-width: 1024px) 320px, (min-width: 640px) 45vw, 90vw"
                            alt={store.name}
                            loading="lazy"
                            decoding="async"
                            className="w-full h-28 object-cover"
                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                          />
                        )}
                        <div className="p-3">
                          <p className="font-medium text-sm">{store.name}</p>
                          <p className="text-xs text-background/60 mt-1">{store.address}</p>
                          {store.hours && <p className="text-xs text-background/70 mt-1">{store.hours}</p>}
                          {/* Todas as lojas têm «Ver no mapa»: sem `maps_url`, vai pelas coordenadas
                              ou pela morada (mapsUrl). Antes só aparecia nas que tinham o link
                              escrito, e os cartões ficavam com alturas diferentes. */}
                          {mapsUrl(store) && (
                            <a
                              href={mapsUrl(store)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="-mb-1.5 inline-flex items-center gap-1 py-1.5 text-xs text-[#22d3ee] hover:underline mt-0.5"
                            >
                              <ExternalLink className="h-3 w-3" /> Ver no mapa
                            </a>
                          )}
                          {settings.google_maps_embed_key && store.latitude && store.longitude && (
                            <StoreMap
                              store={store}
                              embedKey={settings.google_maps_embed_key}
                              open={mapaAberto === store.id}
                              onOpen={() => setMapaAberto(store.id)}
                            />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col items-center gap-2 border-t border-background/20 pt-8 text-center sm:flex-row sm:justify-center sm:gap-4">
          <p className="text-sm text-background/70">{copyright}</p>
          {/* Fora das colunas, que o painel pode mudar: as páginas legais ficam sempre ligadas. */}
          <Link to="/privacidade" className="text-sm text-background/70 underline underline-offset-2 hover:text-[#22d3ee]">Política de privacidade</Link>
          <Link to="/termos" className="text-sm text-background/70 underline underline-offset-2 hover:text-[#22d3ee]">Termos e condições</Link>
        </div>
      </div>
    </footer>
  );
};

/**
 * Rodapé de todas as páginas: no telemóvel a versão curta (o essencial que a barra de baixo
 * não tem: rastrear, lojas, contactos, devoluções, privacidade), no computador o completo.
 *
 * Antes só a página inicial, a loja, as categorias e as colecções trocavam de rodapé; nas
 * outras dezasseis o telemóvel recebia o completo — newsletter, três colunas, lojas com mapas
 * — dois a três ecrãs de rolagem no fim de cada página. Um só, no telemóvel, e o completo nem
 * chega a montar (não pede as lojas nem os métodos de pagamento).
 */
function SiteFooter() {
  return useIsMobile() ? <FooterCompact /> : <Footer />;
}

export default SiteFooter;

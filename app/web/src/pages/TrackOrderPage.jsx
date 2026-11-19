import React, { useState, useEffect, useRef } from 'react';
import FacturaKanGest from '@/components/FacturaKanGest';
import PayLaterBox from '@/components/PayLaterBox';
import { formatCurrency } from '@/api/EcommerceApi';
import { Helmet } from 'react-helmet';
import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Search, Package, MapPin, Truck, CheckCircle2, Circle, Loader2, Phone, Users, Calendar, User, XCircle, Library,
} from 'lucide-react';
import CancelOrderDialog from '@/components/account/CancelOrderDialog';
import { customerOrderStage } from '@/lib/customerOrders';
import { trackOrder } from '@/api/PlatformApi';
import { pageTitle } from '@/lib/brand';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import { useAuth } from '@/hooks/useAuth';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import ShoppingCart from '@/components/ShoppingCart';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import DeliveryConfirmPanel from '@/components/DeliveryConfirmPanel';
import ColporteurReviewPanel from '@/components/ColporteurReviewPanel';
import LiveTracking from '@/components/delivery/LiveTracking';
import PageBannerSlider from '@/components/PageBannerSlider';
import { getDeliveryStatusLabel, orderDeliveryAddress } from '@/lib/orderUtils';
import { displayAngolaPhone } from '@/lib/angolaPhone';

const STEPS = ['received', 'confirmed', 'preparing', 'shipped', 'in_transit', 'out_for_delivery', 'delivered'];

// Levantamento na loja: os estados de transporte contam todos como "pronta para levantar".
const PICKUP_STEPS = ['received', 'confirmed', 'preparing', 'ready', 'delivered'];
const PICKUP_LABELS = { ready: 'Pronta para levantar', delivered: 'Levantada' };
// "Recebida" é a palavra da equipa (a loja recebeu a encomenda); para quem compra soava a "já a
// recebi". O primeiro passo diz o mesmo que a conta do cliente (lib/customerOrders.js).
const CUSTOMER_LABELS = { received: 'Registada' };
const toPickupStep = (status) => (['shipped', 'in_transit', 'out_for_delivery'].includes(status) ? 'ready' : status);
// Edição digital (migração edicoes_digitais): sem envio. Paga, está na biblioteca.
const DIGITAL_STEPS = ['received', 'paid', 'delivered'];
const DIGITAL_LABELS = { paid: 'Pagamento confirmado', delivered: 'Na biblioteca' };
const toDigitalStep = (order) => (order?.delivery_status === 'delivered' ? 'delivered'
  : ['awaiting_confirmation', 'partially_paid'].includes(order?.payment_status) ? 'paid' : 'received');

export default function TrackOrderPage() {
  const { settings } = useSiteSettings();
  const { user, isAuthed } = useAuth();
  const location = useLocation();
  // Também por ligação: /track?encomenda=LA-… (de um email, de uma mensagem). Só o número vai no
  // endereço — o email nunca, que os endereços ficam em históricos e se partilham.
  const linkedNumber = new URLSearchParams(location.search).get('encomenda') || '';
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [orderNumber, setOrderNumber] = useState(location.state?.orderNumber || linkedNumber);
  const [email, setEmail] = useState(location.state?.email || user?.email || '');
  const [loading, setLoading] = useState(false);
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');
  const [cancelling, setCancelling] = useState('');

  // O email com que a encomenda à vista foi encontrada. Os painéis da encomenda (pagar, trajeto,
  // confirmar a recepção, cancelar) usam este e não o campo: mudar o campo depois de procurar não
  // pode mandar o pedido de uma encomenda com o email de outra.
  const [trackedEmail, setTrackedEmail] = useState('');
  // Cada pesquisa tem um número: a resposta de uma pesquisa antiga (a automática, ao abrir a
  // página) não substitui a de uma mais recente nem desliga o "a procurar" dela.
  const searchSeq = useRef(0);

  // O que vem da navegação (rodapé, "Acompanhar") preenche os campos só quando chega. Antes o
  // efeito dependia do próprio `email` e repunha o valor de `location.state` a cada tecla: quem
  // tinha escrito mal o email no rodapé não o conseguia corrigir aqui.
  useEffect(() => {
    if (location.state?.orderNumber) setOrderNumber(location.state.orderNumber);
    if (location.state?.email) setEmail(location.state.email);
  }, [location.state]);

  // O email da conta só entra com o campo vazio (a sessão chega depois do primeiro desenho), e
  // nunca por cima do que a pessoa escreveu ou apagou.
  const accountEmailUsed = useRef(false);
  useEffect(() => {
    if (!user?.email || accountEmailUsed.current) return;
    accountEmailUsed.current = true;
    setEmail((prev) => prev || user.email);
  }, [user?.email]);

  const runTrack = async (num, em, { clear = false } = {}) => {
    const seq = ++searchSeq.current;
    setLoading(true);
    setError('');
    if (clear) setOrder(null);
    try {
      const data = await trackOrder(num, em);
      if (seq !== searchSeq.current) return;
      setOrder(data);
      setTrackedEmail(em);
    } catch (err) {
      if (seq === searchSeq.current) setError(err.message);
    } finally {
      if (seq === searchSeq.current) setLoading(false);
    }
  };

  useEffect(() => {
    const num = (location.state?.orderNumber || linkedNumber).trim();
    const em = (location.state?.email || user?.email || '').trim();
    if (!num || !em) return undefined;
    runTrack(num, em);
    // Ao sair da página, nenhuma resposta pendente escreve no estado.
    return () => { searchSeq.current += 1; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTrack = (e) => {
    e.preventDefault();
    runTrack(orderNumber.trim(), email.trim(), { clear: true });
  };

  // Depois de cancelar, a encomenda volta a ser lida (estado, histórico e o botão).
  const refresh = async () => {
    try {
      setOrder(await trackOrder(order.order_number, trackedEmail));
    } catch {
      // Fica o que estava; o aviso de sucesso já saiu.
    }
  };

  const isPickup = order?.shipping_method === 'pickup';
  const isDigital = order?.shipping_method === 'digital';
  const isCancelled = order?.status === 'cancelled' || order?.delivery_status === 'cancelled';
  // Entrega ao domicílio ainda por fazer: o mapa com o ponto de entrega e quem a leva.
  const hasDeliveryMap = !!order && ['delivery', 'express'].includes(order.shipping_method) && !isCancelled
    && order.delivery_status !== 'delivered';
  const steps = isDigital ? DIGITAL_STEPS : isPickup ? PICKUP_STEPS : STEPS;
  const currentStepIdx = !order ? -1
    : isDigital
      // A pagar ou por confirmar: o primeiro passo está feito e o pagamento é o que está a andar.
      ? Math.max(0, steps.indexOf(toDigitalStep(order)) - (toDigitalStep(order) === 'paid' ? 1 : 0))
      : steps.indexOf(isPickup ? toPickupStep(order.delivery_status) : order.delivery_status);
  const stepLabel = (step) => (isDigital && DIGITAL_LABELS[step]) || (isPickup && PICKUP_LABELS[step]) || CUSTOMER_LABELS[step] || getDeliveryStatusLabel(step);
  const timeline = order?.timeline || [];

  return (
    <>
      <Helmet><title>{pageTitle('Rastrear Encomenda')}</title></Helmet>
      <Header onCartOpen={() => setIsCartOpen(true)} />
      <ShoppingCart isCartOpen={isCartOpen} setIsCartOpen={setIsCartOpen} />

      <PageBannerSlider>
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 mb-4">
          <Truck className="h-7 w-7" />
        </div>
        <h1 className="mb-2 text-2xl font-bold leading-tight sm:text-3xl/9 md:text-4xl/10">Rastrear Encomenda</h1>
        <p className="text-sm text-white/85 sm:text-base">Acompanhe a entrega ao domicílio em tempo real</p>
      </PageBannerSlider>

      <main className="min-h-screen bg-muted/20 py-10">
        <div className="container-custom max-w-2xl">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
            {isAuthed && user?.email && (
              <p className="text-xs text-center text-muted-foreground mb-4 flex items-center justify-center gap-1">
                <User className="h-3.5 w-3.5" />
                Sessão iniciada como <strong>{user.email}</strong>
                {' · '}
                <Link to="/profile?tab=orders" className="text-primary hover:underline">Ver todas as encomendas</Link>
              </p>
            )}

            <form onSubmit={handleTrack} className="bg-card border rounded-2xl p-6 mb-8 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="rastreio-numero">Número da Encomenda</Label>
                <Input
                  id="rastreio-numero"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  value={orderNumber}
                  onChange={(e) => setOrderNumber(e.target.value.toUpperCase())}
                  placeholder={`${settings?.order_number_prefix || 'ENC-'}XXXXXXXXX`}
                  required
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rastreio-email">Email usado na compra</Label>
                <Input id="rastreio-email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <Button type="submit" className="w-full btn-primary py-6" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Search className="h-4 w-4 mr-2" />}
                Rastrear
              </Button>
              {error && <p className="text-sm text-destructive text-center">{error}</p>}
            </form>

            {order && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                {/* Falta pagar (transferência, Multicaixa): é o passo que o cliente tem por fazer. */}
                {order.payment_upfront && !['paid', 'refunded'].includes(order.payment_status) && order.status !== 'cancelled' && (
                  <PayLaterBox
                    orderNumber={order.order_number}
                    email={trackedEmail}
                    total={order.total}
                    methodName={order.payment_method_name}
                    accountInfo={order.payment_account_info}
                    instructions={order.payment_instructions}
                    paymentLink={order.payment_link}
                    referenceAlreadySent={order.payment_reference_present || order.payment_status === 'awaiting_confirmation'}
                    automatic={!!order.payment_automatic}
                    outstandingAmount={order.outstanding ?? null}
                    reportedReference={order.reported_reference || ''}
                    rejectedReference={order.rejected_reference || ''}
                    rejectedReason={order.rejected_reason || ''}
                  />
                )}
                {/* A factura do KanGest e o QR da AGT, quando a encomenda já foi facturada (docs/KANGEST.md). */}
                <FacturaKanGest factura={order.factura} notaCredito={order.nota_credito} />
                <div className="bg-card border rounded-2xl p-6">
                  <div className="flex flex-wrap justify-between items-start gap-3 mb-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Encomenda</p>
                      <p className="text-xl font-bold font-mono text-primary">{order.order_number}</p>
                      {order.customer_name && (
                        <p className="text-sm text-muted-foreground mt-1">{order.customer_name}</p>
                      )}
                    </div>
                    {(() => {
                      // O ponto em que está, em palavras de quem compra (lib/customerOrders.js): as
                      // etiquetas da equipa diziam "Pendente" e "Recebida" a quem ainda não recebeu nada.
                      const stage = customerOrderStage(order, { upfront: !!order.payment_upfront });
                      return (
                        <div className="text-right">
                          <span className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${stage.className}`}>{stage.label}</span>
                          <p className="mt-1.5 max-w-60 text-xs text-muted-foreground">{stage.hint}</p>
                        </div>
                      );
                    })()}
                  </div>

                  <div className="grid sm:grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-muted-foreground">Total</span>
                      <p className="font-bold">{formatCurrency(Number(order.total || 0) * 100)}</p>
                    </div>
                    {order.estimated_delivery && (
                      <div>
                        <span className="text-muted-foreground flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> Entrega prevista</span>
                        <p className="font-medium">
                          {new Date(order.estimated_delivery).toLocaleDateString('pt-AO', { weekday: 'short', day: 'numeric', month: 'long' })}
                        </p>
                      </div>
                    )}
                    {order.phone && (
                      <div>
                        <span className="text-muted-foreground flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> Contacto</span>
                        <p className="font-medium">{displayAngolaPhone(order.phone)}</p>
                      </div>
                    )}
                    {(order.delivery_relative_name || order.delivery_relative_phone) && (
                      <div>
                        <span className="text-muted-foreground flex items-center gap-1"><Users className="h-3.5 w-3.5" /> Contacto próximo</span>
                        <p className="font-medium">
                          {order.delivery_relative_name || '—'}
                          {order.delivery_relative_phone && (
                            <span className="block text-xs text-muted-foreground">{displayAngolaPhone(order.delivery_relative_phone)}</span>
                          )}
                        </p>
                      </div>
                    )}
                    {order.tracking_number && (
                      <div className="sm:col-span-2">
                        <span className="text-muted-foreground">Número de seguimento</span>
                        <p className="font-mono">{order.tracking_number}{order.carrier ? ` · ${order.carrier}` : ''}</p>
                      </div>
                    )}
                    {isDigital ? (
                      <div className="sm:col-span-2 flex items-start gap-2 text-muted-foreground" data-rastreio="digital">
                        <Library className="h-4 w-4 shrink-0 mt-0.5 text-primary" aria-hidden="true" />
                        <p>
                          Edição digital, sem envio: abre na biblioteca da sua conta quando o pagamento for confirmado.{' '}
                          <Link to="/profile?tab=biblioteca" className="font-medium text-primary hover:underline">Abrir a biblioteca</Link>
                        </p>
                      </div>
                    ) : (
                    <div className="sm:col-span-2 flex items-start gap-2 text-muted-foreground">
                      <MapPin className="h-4 w-4 shrink-0 mt-0.5" />
                      <div>
                        <p>{orderDeliveryAddress(order)}</p>
                        {order.delivery_province && (
                          <p className="text-xs mt-1">
                            {[order.delivery_locality, order.delivery_municipality, order.delivery_province].filter(Boolean).join(' · ')}
                          </p>
                        )}
                        {order.delivery_reference && (
                          <p className="text-xs text-primary">Ref: {order.delivery_reference}</p>
                        )}
                      </div>
                    </div>
                    )}
                  </div>
                </div>

                {/* Trajeto com GPS (migração trajeto_gps): o ponto de entrega e quem a leva, ao vivo. */}
                {hasDeliveryMap && (
                  <LiveTracking
                    order={order}
                    orderNumber={order.order_number}
                    email={trackedEmail}
                    onSaved={(saved) => setOrder((prev) => ({ ...prev, delivery_gps: { lat: saved.lat, lng: saved.lng, accuracy: saved.accuracy, updated_at: saved.updated_at } }))}
                  />
                )}

                <div className="bg-card border rounded-2xl p-6">
                  <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
                    <Package className="h-5 w-5 text-primary" /> {isDigital ? 'Estado da edição digital' : isPickup ? 'Estado do levantamento' : 'Estado da entrega'}
                  </h3>
                  {isPickup && order.pickup_store && (
                    <p className="text-sm text-muted-foreground -mt-4 mb-5">Levantamento em <strong className="text-foreground">{order.pickup_store}</strong></p>
                  )}
                  {isCancelled ? (
                    <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                      Esta encomenda foi cancelada e não há nada a pagar. Se tiver dúvidas, contacte a loja.
                    </div>
                  ) : (
                  <div className="relative">
                    {steps.map((step, idx) => {
                      const done = idx <= currentStepIdx;
                      const active = idx === currentStepIdx;
                      return (
                        <div key={step} className="flex gap-4 pb-6 last:pb-0">
                          <div className="flex flex-col items-center">
                            <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${done ? 'bg-primary text-white' : 'bg-muted border-2 border-border'}`}>
                              {done ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4 text-muted-foreground" />}
                            </div>
                            {idx < steps.length - 1 && (
                              <div className={`w-0.5 flex-1 min-h-[24px] ${idx < currentStepIdx ? 'bg-primary' : 'bg-border'}`} />
                            )}
                          </div>
                          <div className={`pt-1 ${active ? 'font-semibold text-primary' : done ? 'text-foreground' : 'text-muted-foreground'}`}>
                            {stepLabel(step)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  )}
                </div>

                {timeline.length > 0 && (
                  <div className="bg-card border rounded-2xl p-6">
                    <h3 className="text-lg font-semibold mb-4">Histórico</h3>
                    <div className="space-y-4">
                      {[...timeline].reverse().map((ev, i) => (
                        <div key={i} className="flex gap-3 text-sm">
                          <div className="text-xs text-muted-foreground whitespace-nowrap pt-0.5">
                            {new Date(ev.at).toLocaleString('pt-AO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </div>
                          <div>
                            <p className="font-medium">{ev.title}</p>
                            {ev.description && <p className="text-muted-foreground text-xs">{ev.description}</p>}
                            {ev.location && <p className="text-xs text-primary">{ev.location}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* "Recebi tudo bem" é da entrega: a edição digital não tem. */}
                {!isDigital && (
                <DeliveryConfirmPanel
                  orderNumber={order.order_number}
                  email={trackedEmail}
                  order={order}
                  onConfirmed={(updated) => setOrder((prev) => ({ ...prev, ...updated }))}
                />
                )}

                {/* Avaliar o colportor (quem entregou, ou o do código): só com sessão e a encomenda entregue. */}
                {isAuthed && !isDigital && (order.delivery_status === 'delivered' || order.delivery_confirmed_at) && (
                  <ColporteurReviewPanel orderNumber={order.order_number} />
                )}

                {order.can_cancel && (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-4">
                    <p className="text-sm text-muted-foreground">
                      Ainda não está paga nem em preparação: pode cancelá-la, e os livros voltam à loja.
                    </p>
                    <Button type="button" variant="outline" className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setCancelling(order.order_number)}>
                      <XCircle className="mr-2 h-4 w-4" aria-hidden="true" /> Cancelar a encomenda
                    </Button>
                  </div>
                )}
                <CancelOrderDialog orderNumber={cancelling} email={trackedEmail} onClose={() => setCancelling('')} onCancelled={refresh} />

                <p className="text-center text-sm text-muted-foreground">
                  Dúvidas? <Link to="/contact" className="text-primary hover:underline">Contacte-nos</Link>
                  {settings.contact_phone && ` · ${displayAngolaPhone(settings.contact_phone)}`}
                </p>
              </motion.div>
            )}
          </motion.div>
        </div>
      </main>
      <Footer />
    </>
  );
}

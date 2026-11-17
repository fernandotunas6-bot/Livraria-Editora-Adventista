import React, { useState, useEffect, useRef } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CheckCircle, ArrowRight, Package, PackageSearch, User, MessageCircle, Download, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Header from '@/components/Header.jsx';
import Footer from '@/components/Footer.jsx';
import ShoppingCart from '@/components/ShoppingCart.jsx';
import { pageTitle } from '@/lib/brand';
import { useAuth } from '@/hooks/useAuth';
import { useAuthDialog } from '@/hooks/useAuthDialog';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import { useIntegrations } from '@/hooks/useIntegrations';
import { useToast } from '@/hooks/use-toast';
import { loadLastOrder, downloadReceipt, sendReceiptViaWhatsApp, receiptBrand } from '@/lib/receipt';
import { showLocalNotification, subscribeToPush, isPushSupported, pushDisponivel } from '@/lib/pushNotifications';
import { isPaidUpfront } from '@/lib/paymentMethods';
import PayLaterBox from '@/components/PayLaterBox';
import { kwanza } from '@/lib/money';

const SuccessPage = () => {
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [receiptChoice, setReceiptChoice] = useState(null);
  const [params] = useSearchParams();
  const { isAuthed, ready } = useAuth();
  const { openAuth } = useAuthDialog();
  const { settings } = useSiteSettings();
  const { integrations } = useIntegrations();
  const { toast } = useToast();
  const waApiActive = !!(integrations?.whatsapp_business?.enabled && integrations?.whatsapp_business?.config?.configured);

  const orderId = params.get('orderId');
  const orderNumber = params.get('orderNumber');
  const total = params.get('total');
  const orderType = params.get('type') || 'purchase';

  const [orderData, setOrderData] = useState(null);

  const isWhatsApp = orderType === 'whatsapp';
  const hasOrder = !!(orderId || orderNumber);

  useEffect(() => {
    const saved = loadLastOrder();
    if (saved && (!orderId || saved.orderId === orderId)) {
      setOrderData(saved);
    } else if (orderId || orderNumber) {
      setOrderData({
        orderId,
        orderNumber,
        total: total ? Number(total) : 0,
        orderType,
      });
    }
  }, [orderId, orderNumber, total, orderType]);

  // Paga antes do envio (transferência, Multicaixa) e ainda por pagar: a encomenda está
  // registada, não "confirmada" — dizê-lo antes do pagamento era prometer o que não está feito.
  const awaitsPayment = !isWhatsApp && isPaidUpfront(orderData?.paymentType);
  // O aviso no telemóvel sai uma vez por encomenda, e só depois de se saber se falta pagar. Antes
  // saía no primeiro desenho (sem os dados, "confirmada 🎉" mesmo numa transferência por pagar),
  // outra vez quando os dados chegavam e a cada recarga da página.
  const notifiedRef = useRef(false);
  const pushTriedRef = useRef(false);
  // null: ainda não se sabe; false: não houve aviso local (sem permissão) e vale a pena o push.
  const [localShown, setLocalShown] = useState(null);
  useEffect(() => {
    if (!hasOrder || isWhatsApp || !orderData) return;
    const key = `livraria-order-notified:${orderId || orderNumber}`;
    if (!notifiedRef.current) {
      notifiedRef.current = true;
      let already = false;
      try {
        already = sessionStorage.getItem(key) === '1';
        sessionStorage.setItem(key, '1');
      } catch {
        // sem sessionStorage: avisa nesta visita, como antes
      }
      if (already) { setLocalShown(true); return; }
      const known = !!orderData.paymentType;
      showLocalNotification({
        title: awaitsPayment ? 'Encomenda registada — falta o pagamento' : known ? 'Encomenda confirmada! 🎉' : 'Encomenda registada',
        body: orderNumber ? `Pedido ${orderNumber} registado com sucesso.` : 'A sua compra foi registada.',
        url: '/profile',
      }).then((shown) => setLocalShown(!!shown)).catch(() => setLocalShown(false));
    }
  }, [hasOrder, isWhatsApp, orderData, orderId, orderNumber, awaitsPayment]);

  // Sem notificações locais, oferece-se o push uma vez, quando as definições chegam.
  useEffect(() => {
    if (!hasOrder || isWhatsApp || localShown !== false || pushTriedRef.current) return;
    if (!pushDisponivel(settings) || !isPushSupported()) return;
    pushTriedRef.current = true;
    subscribeToPush(settings.vapid_public_key).catch(() => {});
  }, [hasOrder, isWhatsApp, localShown, settings]);

  // Transferência e Multicaixa: paga-se agora, depois de encomendar. Até lá a compra não está
  // "confirmada": está registada e com o stock reservado.
  const payLater = !isWhatsApp && isPaidUpfront(orderData?.paymentType);
  // Aberta sem encomenda (link guardado, botão "voltar"), a página dizia "Compra Confirmada! Obrigado
  // pela sua compra" a quem não tinha comprado nada.
  const title = !hasOrder ? 'Nenhuma encomenda para mostrar'
    : isWhatsApp ? 'Pedido WhatsApp Registado!' : payLater ? 'Encomenda Registada!' : 'Compra Confirmada!';
  const subtitle = !hasOrder
    ? 'Esta página aparece depois de uma compra. Se já comprou, encontre a encomenda em Rastrear encomenda, com o número e o email da compra.'
    : payLater
    ? 'Os livros estão reservados para si. Falta o pagamento: veja abaixo como pagar e onde indicar a referência.'
    : isWhatsApp
    ? (waApiActive
      ? 'O seu pedido foi registado e a confirmação foi enviada automaticamente para o seu WhatsApp.'
      : 'O seu pedido foi registado no sistema. Continue a conversa no WhatsApp para confirmar pagamento e entrega.')
    : (waApiActive
      ? 'Obrigado pela sua compra. Receberá confirmação no WhatsApp e por email (se configurado).'
      : 'Obrigado pela sua compra. A nossa equipa irá processar o pedido em breve.');

  const handleReceiptWhatsApp = async () => {
    if (!orderData) return;
    setReceiptChoice('whatsapp');
    try {
      const result = await sendReceiptViaWhatsApp(orderData, orderData.phone || settings.whatsapp);
      if (result?.mode === 'api') {
        toast({ title: 'Recibo enviado', description: 'Verifique o seu WhatsApp.' });
      }
    } catch (err) {
      toast({ variant: 'destructive', title: 'Erro', description: err.message });
    }
  };

  const handleReceiptDownload = () => {
    if (!orderData) return;
    setReceiptChoice('download');
    downloadReceipt(orderData, receiptBrand(settings));
  };

  const nextSteps = isWhatsApp
    ? [
        { step: 1, title: 'WhatsApp', desc: 'A equipa confirma disponibilidade e forma de pagamento no chat.' },
        { step: 2, title: 'Pagamento', desc: 'Efectue o pagamento conforme indicado (Multicaixa, transferência, etc.).' },
        { step: 3, title: 'Entrega', desc: 'Após confirmação, coordenamos a entrega na sua morada.' },
      ]
    : [
        { step: 1, title: 'Confirmação', desc: 'Verificamos a compra e o stock em 1-2 dias úteis.' },
        { step: 2, title: 'Preparação', desc: 'Os livros são embalados com cuidado para envio.' },
        { step: 3, title: 'Entrega', desc: 'Receberá contacto para coordenar a entrega na sua morada.' },
      ];

  return (
    <>
      <Helmet>
        <title>{pageTitle(!hasOrder ? 'Encomenda' : isWhatsApp ? 'Pedido WhatsApp' : 'Compra Confirmada')}</title>
        <meta name="description" content={subtitle} />
      </Helmet>

      <Header pinned onCartOpen={() => setIsCartOpen(true)} />
      <ShoppingCart isCartOpen={isCartOpen} setIsCartOpen={setIsCartOpen} />

      <main className="section-spacing bg-background min-h-[60vh] flex items-center">
        <div className="container-custom">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="max-w-2xl mx-auto text-center">
            <div className={`inline-flex items-center justify-center w-20 h-20 rounded-full mb-6 ${isWhatsApp ? 'bg-green-500/10' : 'bg-marca/10'}`}>
              {!hasOrder ? (
                <Package className="h-10 w-10 text-primary" aria-hidden="true" />
              ) : isWhatsApp ? (
                <MessageCircle className="h-10 w-10 text-green-600" />
              ) : (
                <CheckCircle className="h-10 w-10 text-primary" />
              )}
            </div>

            {hasOrder && (
              <span className={`inline-block text-xs font-semibold uppercase tracking-wider px-3 py-1 rounded-full mb-4 ${isWhatsApp ? 'bg-green-500/10 text-green-700' : 'bg-marca/10 text-primary'}`}>
                {isWhatsApp ? 'Encomenda via WhatsApp' : 'Compra Online'}
              </span>
            )}

            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4 text-balance">{title}</h1>
            <p className="text-muted-foreground text-lg mb-8">{subtitle}</p>

            {hasOrder && (
              <div className="bg-card border border-border rounded-xl p-6 mb-6 text-left space-y-3">
                <h2 className="font-semibold text-lg flex items-center gap-2">
                  <Package className="h-5 w-5 text-primary" />
                  {isWhatsApp ? 'Detalhes do Pedido' : 'Detalhes da Compra'}
                </h2>
                {orderNumber && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Número</span>
                    <code className="font-mono font-semibold text-primary">{orderNumber}</code>
                  </div>
                )}
                {total && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total</span>
                    <span className="font-bold">{kwanza(total)}</span>
                  </div>
                )}
              </div>
            )}

            {hasOrder && payLater && (
              <div className="mb-6">
                <PayLaterBox
                  orderNumber={orderNumber || orderData.orderNumber}
                  email={orderData.email || ''}
                  phone={orderData.phone || ''}
                  total={orderData.total || total}
                  methodName={orderData.paymentMethod || ''}
                  accountInfo={orderData.paymentAccountInfo || ''}
                  instructions={orderData.paymentInstructions || ''}
                  paymentLink={orderData.paymentLink || ''}
                  referenceAlreadySent={!!orderData.paymentReference}
                  automatic={!!orderData.paymentAutomatic}
                />
              </div>
            )}

            {hasOrder && !payLater && /^https:\/\//.test(orderData?.paymentLink || '') && (
              <div className="bg-card border border-marca/40 rounded-xl p-6 mb-6 text-left space-y-3">
                <h2 className="font-semibold text-lg">Pagamento</h2>
                <p className="text-sm text-muted-foreground">
                  {orderData.paymentReference
                    ? `Indicou a referência ${orderData.paymentReference}. Se ainda não concluiu o pagamento, use o botão abaixo.`
                    : 'Conclua o pagamento pelo link abaixo. A encomenda é confirmada quando o pagamento for verificado.'}
                </p>
                <Button asChild size="lg" className="btn-primary w-full sm:w-auto">
                  <a href={orderData.paymentLink} target="_blank" rel="noopener noreferrer">
                    Pagar agora{orderData.paymentMethod ? ` com ${orderData.paymentMethod}` : ''}
                  </a>
                </Button>
              </div>
            )}

            {hasOrder && orderData && (
              <div className="bg-card border border-border rounded-xl p-6 mb-8 text-left">
                <h2 className="font-semibold text-lg flex items-center gap-2 mb-2">
                  <Receipt className="h-5 w-5 text-primary" /> Como deseja receber o recibo?
                </h2>
                <p className="text-sm text-muted-foreground mb-4">Escolha uma opção para guardar o comprovativo da sua {isWhatsApp ? 'encomenda' : 'compra'}.</p>
                <div className="grid sm:grid-cols-2 gap-3">
                  <Button
                    variant={receiptChoice === 'whatsapp' ? 'default' : 'outline'}
                    className={`py-6 h-auto sm:h-auto whitespace-normal flex-col gap-2 ${receiptChoice === 'whatsapp' ? 'btn-primary' : 'border-green-500/40 text-green-700 hover:bg-green-50'}`}
                    onClick={handleReceiptWhatsApp}
                  >
                    <MessageCircle className="h-6 w-6" />
                    <span className="font-semibold">Receber por WhatsApp</span>
                    <span className="text-xs font-normal">Envia o recibo para o seu chat</span>
                  </Button>
                  <Button
                    variant={receiptChoice === 'download' ? 'default' : 'outline'}
                    className={`py-6 h-auto sm:h-auto whitespace-normal flex-col gap-2 ${receiptChoice === 'download' ? 'btn-primary' : ''}`}
                    onClick={handleReceiptDownload}
                  >
                    <Download className="h-6 w-6" />
                    <span className="font-semibold">Descarregar Recibo</span>
                    <span className="text-xs font-normal">Ficheiro HTML para imprimir ou guardar</span>
                  </Button>
                </div>
                {receiptChoice && (
                  <p className="text-xs text-green-600 mt-3 text-center">
                    {receiptChoice === 'whatsapp'
                      ? (waApiActive ? '✓ Recibo enviado para o seu WhatsApp' : '✓ WhatsApp aberto com o recibo')
                      : '✓ Recibo descarregado'}
                  </p>
                )}
              </div>
            )}

            {/* O melhor momento para sugerir conta: a pessoa acabou de comprar e quer saber da
                encomenda. As encomendas ficam ligadas ao email, por isso a conta criada com o
                email da compra mostra-a logo no perfil. */}
            {ready && !isAuthed && hasOrder && !isWhatsApp && (
              <div className="bg-primary/5 border border-primary/30 rounded-xl p-6 mb-6 text-left flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex-1">
                  <h2 className="text-lg font-semibold mb-1">Acompanhe esta encomenda na sua conta</h2>
                  <p className="text-sm text-muted-foreground">
                    Crie conta com {orderData?.email ? <strong>{orderData.email}</strong> : 'o email da compra'} e veja o estado da entrega
                    sempre que quiser. Demora segundos.
                  </p>
                </div>
                <Button
                  type="button"
                  className="btn-primary shrink-0"
                  onClick={() => openAuth({ reason: 'order', mode: 'signup', defaultEmail: orderData?.email || '', defaultName: orderData?.customerName || '' })}
                >
                  <User className="mr-2 h-4 w-4" aria-hidden="true" /> Criar conta
                </Button>
              </div>
            )}

            {!hasOrder && (
              <div className="mb-8">
                <Button asChild size="lg" className="btn-primary">
                  <Link to="/track">Rastrear encomenda</Link>
                </Button>
              </div>
            )}

            {hasOrder && (
            <div className="bg-card border border-border rounded-xl p-8 mb-8 text-left">
              <h2 className="text-xl font-semibold mb-4">Próximos passos</h2>
              <div className="space-y-4">
                {nextSteps.map(({ step, title: stepTitle, desc }) => (
                  <div key={step} className="flex gap-4">
                    <div className="shrink-0 w-8 h-8 rounded-full bg-marca/10 flex items-center justify-center text-primary font-semibold text-sm">{step}</div>
                    <div>
                      <h3 className="text-base font-semibold mb-1">{stepTitle}</h3>
                      <p className="text-sm text-muted-foreground">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            )}

            {/* O botão é o próprio link (`asChild`): um botão dentro de um link não é HTML
                válido e os leitores de ecrã anunciavam duas coisas para um só toque. */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button asChild size="lg" className="btn-primary w-full sm:w-auto">
                <Link to="/shop">
                  Continuar a Comprar
                  <ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" />
                </Link>
              </Button>
              {isAuthed ? (
                <Button asChild size="lg" variant="outline" className="w-full sm:w-auto border-marca text-primary">
                  <Link to="/profile?tab=orders">
                    <User className="mr-2 h-5 w-5" aria-hidden="true" /> Ver {isWhatsApp ? 'Pedidos' : 'Compras'}
                  </Link>
                </Button>
              ) : hasOrder && (orderNumber || orderData?.orderNumber) ? (
                // Sem conta, acompanhar a encomenda já aberta (número e email desta compra),
                // em vez de ter de os copiar para o rastreio.
                <Button asChild size="lg" variant="outline" className="w-full sm:w-auto border-marca text-primary">
                  <Link to="/track" state={{ orderNumber: orderNumber || orderData.orderNumber, email: orderData?.email || '' }}>
                    <PackageSearch className="mr-2 h-5 w-5" aria-hidden="true" /> Acompanhar a encomenda
                  </Link>
                </Button>
              ) : (
                <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
                  <Link to="/contact">Contactar Apoio</Link>
                </Button>
              )}
            </div>
          </motion.div>
        </div>
      </main>

      <Footer />
    </>
  );
};

export default SuccessPage;

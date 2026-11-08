import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShoppingCart as ShoppingCartIcon, X, Loader2, ChevronLeft, Truck, CreditCard, MapPin, Shield, Lock, MessageCircle, ChevronDown, ChevronUp, PenLine, Copy,
} from 'lucide-react';
import { useCart } from '@/hooks/useCart';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { initializeCheckout } from '@/api/EcommerceApi';
import { nextCheckoutAttempt } from '@/lib/checkoutIdempotency';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useAuthDialog } from '@/hooks/useAuthDialog';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import { useIntegrations } from '@/hooks/useIntegrations';
import { getPaymentMethods, getPhysicalStores } from '@/api/PlatformApi';
import { formatCurrency } from '@/api/EcommerceApi';
import { openWhatsAppOrder } from '@/lib/whatsapp';
import { calcShippingCents, SHIPPING_METHODS, getShippingLabel, shippingRules } from '@/lib/shipping';
import { cartItemTitle, cartVariantLabel } from '@/lib/productTypes';
import { isPaidUpfront, paymentMethodsFor, paymentMoment } from '@/lib/paymentMethods';
import { saveLastOrder } from '@/lib/receipt';
import AngolaAddressSelector, { validateAngolaAddress, angolaAddressToPayload } from '@/components/AngolaAddressSelector';
import SignaturePad from '@/components/SignaturePad';
import PhoneInput from '@/components/PhoneInput';
import { normalizeAngolaPhone, isValidAngolaPhone } from '@/lib/angolaPhone';
import { FloatingScrollTop } from '@/components/ui/FloatingScrollTop';
import { MOTION } from '@/lib/motion';
import { OPEN_CART_EVENT } from '@/lib/mobileNav';
import { getReferral, normalizeColporteurCode } from '@/lib/colporteurReferral';

const ShoppingCart = ({ isCartOpen, setIsCartOpen }) => {
  const { toast } = useToast();
  const { user, updateProfile } = useAuth();
  // Entrar ou criar conta num modal, por cima do carrinho: a pessoa não perde o passo nem o que escreveu.
  const { openAuth } = useAuthDialog();
  // O carrinho é um painel sobre a página, não tem endereço próprio: quem sai daqui para
  // entrar volta à página onde estava, com o carrinho intacto (fica no armazenamento local).
  const { settings } = useSiteSettings();
  const { integrations } = useIntegrations();
  const waApiActive = !!(integrations?.whatsapp_business?.enabled && integrations?.whatsapp_business?.config?.configured);
  const { cartItems, removeFromCart, updateQuantity, getCartTotalCents, clearCart, refreshCart } = useCart();

  const [paymentMethods, setPaymentMethods] = useState([]);
  const [physicalStores, setPhysicalStores] = useState([]);
  const [shippingOpen, setShippingOpen] = useState(false);
  const cartScrollRef = useRef(null);

  const [step, setStep] = useState('cart');
  // Telemóvel: o rodapé do carrinho ocupava 485 px dos 886 do ecrã, deixando 288 px para um
  // formulário de 2094 px. O detalhe (portes, subtotal, dados, avisos) passa a ficar atrás
  // de um resumo recolhível; no computador (sm:) continua tudo aberto, como estava.
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const signatureRef = useRef(null);
  // Tentativa de checkout em curso: { fingerprint, key }. Fica entre carregamentos do botão
  // e só é limpa quando a encomenda é confirmada.
  const checkoutAttemptRef = useRef(null);
  // Coordenadas da morada, como a página de lojas faz. As colunas delivery_gps_lat/lng
  // existiam desde o início e nunca eram escritas: o estafeta ficava só com a referência.
  const [gps, setGps] = useState(null);
  const [locating, setLocating] = useState(false);
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    city: 'Luanda',
    paymentMethod: 'entrega',
    paymentReference: '',
    notes: '',
    shippingMethod: 'delivery',
    pickupStore: '',
    // Vem do link do colportor (?c=CPT-0007), guardado 30 dias; o cliente também o pode escrever.
    colporteurCode: getReferral(),
  });
  const [deliveryAddress, setDeliveryAddress] = useState({
    provinceId: '',
    provinceName: 'Luanda',
    municipalityId: '',
    municipalityName: '',
    localityId: '',
    localityName: '',
    localityCustom: '',
    street: '',
    reference: '',
    phone: '',
    relativeName: '',
    relativePhone: '',
  });

  // A barra inferior do telemóvel é global e o carrinho é de cada página: ela pede, e o
  // carrinho montado abre-se (e diz que respondeu).
  useEffect(() => {
    const abrir = (e) => {
      if (e.detail) e.detail.handled = true;
      setIsCartOpen(true);
    };
    window.addEventListener(OPEN_CART_EVENT, abrir);
    return () => window.removeEventListener(OPEN_CART_EVENT, abrir);
  }, [setIsCartOpen]);

  // Escape fecha o carrinho. É o que se espera de um painel que tapa a página inteira, e
  // sem isso quem navega pelo teclado só sai dele depois de percorrer tudo o que tem dentro.
  useEffect(() => {
    if (!isCartOpen) return undefined;
    const aoTeclar = (e) => { if (e.key === 'Escape') setIsCartOpen(false); };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [isCartOpen, setIsCartOpen]);

  useEffect(() => {
    if (!isCartOpen) return;

    // O carrinho monta antes de o código do link (?c=CPT-…) ser guardado na primeira visita:
    // lê-se outra vez ao abrir, sem apagar o que o cliente já escreveu.
    const referral = getReferral();
    setForm((f) => (f.colporteurCode || !referral ? f : { ...f, colporteurCode: referral }));

    getPaymentMethods().then((res) => {
      const methods = res.methods || [];
      setPaymentMethods(methods);
      // Só se escolhe o primeiro método quando o que está escolhido não existe na lista que
      // acabou de chegar — e lê-se o valor actual aqui dentro, em vez de o efeito depender
      // dele. Com a dependência, o efeito corria outra vez a cada escolha do cliente, e cada
      // volta eram dois pedidos ao servidor (métodos e lojas) sem nada de novo para trazer.
      // Devolver o mesmo objecto quando não há nada a mudar evita um render inútil.
      setForm((f) => (methods.length > 0 && !methods.some((m) => m.code === f.paymentMethod)
        ? { ...f, paymentMethod: methods[0].code }
        : f));
    }).catch(() => setPaymentMethods([]));

    // Só as lojas que aceitam levantamento aparecem no checkout.
    getPhysicalStores().then((list) => setPhysicalStores(list.filter((st) => st.pickup_enabled))).catch(() => setPhysicalStores([]));
  }, [isCartOpen]);

  const subtotalCents = getCartTotalCents();
  const FREE_SHIPPING_THRESHOLD = shippingRules(settings).freeThresholdCents;
  const freeShippingRemaining = Math.max(0, FREE_SHIPPING_THRESHOLD - subtotalCents);
  const freeShippingProgress = FREE_SHIPPING_THRESHOLD > 0
    ? Math.min(100, (subtotalCents / FREE_SHIPPING_THRESHOLD) * 100)
    : 100;
  const maintenanceMode = !!settings.maintenance_mode;

  useEffect(() => {
    if (user) {
      setForm((f) => ({
        ...f,
        name: f.name || user.name || '',
        email: f.email || user.email || '',
        phone: f.phone || user.phone || '',
      }));
      setDeliveryAddress((d) => ({
        ...d,
        phone: d.phone || user.phone || '',
      }));
    }
  }, [user]);

  useEffect(() => {
    if (!isCartOpen) { setStep('cart'); setSummaryOpen(false); }
  }, [isCartOpen]);

  // Ao abrir o carrinho, confirma preços, promoções, stock e visibilidade com a base de dados.
  useEffect(() => {
    if (!isCartOpen) return;
    refreshCart().then((changes) => {
      if (changes.length) {
        toast({ title: 'O carrinho foi actualizado', description: changes.slice(0, 3).join(' ') + (changes.length > 3 ? ` (+${changes.length - 3})` : '') });
      }
    }).catch(() => {});
    // Só quando o carrinho abre.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCartOpen]);

  const shippingCents = calcShippingCents(form.shippingMethod, subtotalCents, settings);

  // Só os métodos que servem para o envio escolhido ("Pagar no Balcão" só no levantamento).
  // Se o escolhido deixar de servir, passa ao primeiro que serve.
  const availableMethods = useMemo(
    () => paymentMethodsFor(paymentMethods, form.shippingMethod),
    [paymentMethods, form.shippingMethod],
  );
  useEffect(() => {
    if (availableMethods.length && !availableMethods.some((m) => m.code === form.paymentMethod)) {
      setForm((f) => ({ ...f, paymentMethod: availableMethods[0].code, paymentReference: '' }));
    }
  }, [availableMethods, form.paymentMethod]);

  const copyText = async (text, what) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: `${what} copiado` });
    } catch {
      toast({ variant: 'destructive', title: 'Não foi possível copiar', description: 'Seleccione o texto e copie à mão.' });
    }
  };
  const totalCents = subtotalCents + shippingCents;
  const itemCount = cartItems.reduce((s, i) => s + i.quantity, 0);

  const orderItemsForReceipt = cartItems.map((item) => ({
    title: cartItemTitle(item),
    quantity: item.quantity,
    price: (item.variant.sale_price_in_cents ?? item.variant.price_in_cents) / 100,
  }));

  const locate = () => {
    if (!navigator.geolocation) {
      toast({ variant: 'destructive', title: 'Localização indisponível', description: 'Este dispositivo não permite partilhar a localização.' });
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setGps({ lat: coords.latitude, lng: coords.longitude });
        setLocating(false);
        toast({ title: 'Localização guardada', description: 'O estafeta recebe o ponto exacto além da morada.' });
      },
      () => {
        setLocating(false);
        toast({ variant: 'destructive', title: 'Não foi possível obter a localização', description: 'Autorize o acesso à localização no browser, ou continue só com a morada.' });
      },
      { timeout: 10000 },
    );
  };

  const handleCheckout = useCallback(async (viaWhatsApp = false) => {
    if (maintenanceMode) {
      toast({ variant: 'destructive', title: 'Loja em manutenção', description: 'As compras estão temporariamente indisponíveis. Tente mais tarde ou contacte-nos.' });
      return;
    }
    const needsAddress = form.shippingMethod !== 'pickup';
    const effectivePhone = normalizeAngolaPhone(
      needsAddress ? (deliveryAddress.phone || form.phone) : form.phone
    );

    // Levantamento na loja: basta saber quem vem buscar e como lhe ligar.
    // Entrega ao domicílio: email e morada. Não exige conta: o cliente acompanha a encomenda com
    // o número e o email (Rastrear encomenda), e o registo por email depende do SMTP do Auth.
    if (!form.name.trim() || !effectivePhone || (needsAddress && !form.email.trim())) {
      toast({ variant: 'destructive', title: 'Preencha todos os campos obrigatórios' });
      return;
    }
    if (!isValidAngolaPhone(effectivePhone)) {
      toast({ variant: 'destructive', title: 'Telefone inválido', description: 'Use o formato +244 9XX XXX XXX.' });
      return;
    }
    if (needsAddress) {
      const addrErr = validateAngolaAddress(deliveryAddress, { requireDelivery: true });
      if (addrErr) {
        toast({ variant: 'destructive', title: 'Morada incompleta', description: addrErr });
        return;
      }
    }
    if (form.shippingMethod === 'pickup' && physicalStores.length > 0 && !form.pickupStore) {
      toast({ variant: 'destructive', title: 'Seleccione a loja de levantamento' });
      return;
    }

    // Transferência e Multicaixa: paga-se depois de encomendar, com o número da encomenda; a
    // referência indica-se na página seguinte (ou no rastreio). Já não se pede aqui.

    // Assinatura opcional: quem recebe assina na entrega. Se o cliente assinar, vai no recibo.
    const checkoutSignature = needsAddress ? (signatureRef.current?.getDataURL() || '') : '';

    // Trancar antes da ida à rede, não depois. O `refreshCart` aqui abaixo é um pedido ao
    // servidor; enquanto corria, o `checkingOut` ainda era falso, por isso os dois botões de
    // submissão ficavam activos e sem sinal nenhum de espera. Quem carrega e não vê nada
    // acontecer carrega outra vez — e cada carregada era um `handleCheckout` novo a caminho do
    // `initializeCheckout`, ou seja, duas encomendas. A saída antecipada abaixo cai no mesmo
    // `finally`, que repõe o estado.
    setCheckingOut(true);
    try {
      // Última confirmação: se preço, stock ou disponibilidade mudaram, o cliente revê antes de pagar.
      const cartChanges = await refreshCart().catch(() => []);
      if (cartChanges.length) {
        toast({
          variant: 'destructive',
          title: 'O carrinho mudou — reveja antes de confirmar',
          description: cartChanges.slice(0, 3).join(' '),
        });
        return;
      }

      const items = cartItems.map((item) => ({
        variant_id: item.variant.id,
        quantity: item.quantity,
      }));

      const addressPayload = form.shippingMethod === 'pickup'
        ? { address: `Levantamento: ${form.pickupStore || 'Loja física'}`, city: form.pickupStore || 'Loja física' }
        : angolaAddressToPayload(deliveryAddress);

      const checkoutPayload = {
        items,
        successUrl: `${window.location.origin}/success`,
        customerEmail: form.email.trim(),
        customerName: form.name.trim(),
        phone: effectivePhone,
        ...addressPayload,
        paymentMethodCode: form.paymentMethod,
        paymentReference: form.paymentReference,
        notes: form.notes.trim(),
        shippingCost: shippingCents / 100,
        saleChannel: viaWhatsApp ? 'whatsapp' : 'web_purchase',
        shippingMethod: form.shippingMethod,
        pickupStore: form.pickupStore,
        checkoutSignature,
        ...(gps && form.shippingMethod !== 'pickup' ? { deliveryGpsLat: gps.lat, deliveryGpsLng: gps.lng } : {}),
        ...(normalizeColporteurCode(form.colporteurCode) ? { colporteurCode: normalizeColporteurCode(form.colporteurCode) } : {}),
      };
      // Se a tentativa anterior falhou com este mesmo pedido (tipicamente a rede caiu depois de o
      // servidor gravar), a chave repete-se e o servidor devolve essa encomenda em vez de outra.
      checkoutAttemptRef.current = nextCheckoutAttempt(checkoutAttemptRef.current, checkoutPayload);
      const { orderId, total, orderNumber, order_type, whatsapp_sent, payment_status } = await initializeCheckout({
        ...checkoutPayload,
        idempotencyKey: checkoutAttemptRef.current.key,
      });
      checkoutAttemptRef.current = null;

      const isWhatsApp = viaWhatsApp || order_type === 'whatsapp_order';
      const waPhone = settings.whatsapp || settings.contact_phone;
      const paymentMethodInfo = paymentMethods.find((m) => m.code === form.paymentMethod);
      const paymentLabel = paymentMethodInfo?.name || form.paymentMethod;

      saveLastOrder({
        orderId,
        orderNumber,
        // Para a página de sucesso explicar como pagar e receber a referência depois.
        paymentType: paymentMethodInfo?.type || '',
        paymentAccountInfo: paymentMethodInfo?.account_info || '',
        paymentInstructions: paymentMethodInfo?.instructions || '',
        paymentLink: paymentMethodInfo?.payment_link || '',
        paymentAutomatic: !!paymentMethodInfo?.automatic,
        // O documento só se chama "Recibo" quando o pagamento está confirmado (lib/receipt.js).
        paymentStatus: payment_status || 'pending',
        paymentReference: (form.paymentReference || '').trim(),
        total,
        subtotal: subtotalCents / 100,
        shippingCost: shippingCents / 100,
        customerName: form.name.trim(),
        signerName: form.name.trim(),
        email: form.email.trim(),
        phone: effectivePhone,
        address: addressPayload.address,
        city: addressPayload.city,
        deliveryAddress: form.shippingMethod !== 'pickup' ? deliveryAddress : null,
        deliveryRelativeName: addressPayload.deliveryRelativeName || '',
        deliveryRelativePhone: addressPayload.deliveryRelativePhone || '',
        shippingMethod: form.shippingMethod,
        shippingLabel: getShippingLabel(form.shippingMethod),
        pickupStore: form.pickupStore,
        paymentMethod: paymentLabel,
        orderType: isWhatsApp ? 'whatsapp' : 'purchase',
        items: orderItemsForReceipt,
        createdAt: new Date().toISOString(),
        signatureSignedAt: new Date().toISOString(),
        checkoutSignature,
      });

      if (isWhatsApp && waPhone && !waApiActive && !whatsapp_sent) {
        openWhatsAppOrder(waPhone, {
          cartItems,
          form: { ...form, paymentMethod: paymentLabel },
          totalFormatted: formatCurrency(total * 100),
          orderNumber,
        });
      }

      clearCart();
      if (user?.id && effectivePhone) {
        try {
          await updateProfile({ phone: effectivePhone });
        } catch { /* ignore */ }
      }
      setIsCartOpen(false);
      const params = new URLSearchParams({
        orderId,
        total: String(total),
        type: isWhatsApp ? 'whatsapp' : 'purchase',
        ...(orderNumber && { orderNumber }),
      });
      window.location.href = `/success?${params.toString()}`;
    } catch (error) {
      toast({
        title: viaWhatsApp ? 'Erro no pedido WhatsApp' : 'Não foi possível finalizar a compra',
        description: error.message || 'Não foi possível finalizar.',
        variant: 'destructive',
      });
    } finally {
      setCheckingOut(false);
    }
  }, [cartItems, clearCart, refreshCart, deliveryAddress, form, gps, maintenanceMode, orderItemsForReceipt, paymentMethods, physicalStores.length, settings, shippingCents, subtotalCents, setIsCartOpen, toast, updateProfile, user, waApiActive]);

  const maxQty = (item) => (item.variant.manage_inventory ? item.variant.inventory_quantity : 99);

  return (
    <AnimatePresence>
      {isCartOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-foreground/60 z-50"
          onClick={() => setIsCartOpen(false)}
        >
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={MOTION.spring}
            className="absolute right-0 top-0 h-full w-full max-w-md bg-card text-card-foreground shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-carrinho"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-border">
              <div className="flex items-center gap-2">
                {step === 'checkout' && (
                  <Button variant="ghost" size="icon" onClick={() => setStep('cart')} className="h-11 w-11 sm:h-8 sm:w-8">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                )}
                <div>
                  <h2 id="titulo-carrinho" className="text-xl font-bold">
                    {step === 'cart' ? 'Carrinho' : 'Finalizar Compra'}
                  </h2>
                  {itemCount > 0 && (
                    <p className="text-xs text-muted-foreground">{itemCount} {itemCount === 1 ? 'item' : 'itens'}</p>
                  )}
                </div>
              </div>
              <Button onClick={() => setIsCartOpen(false)} variant="ghost" size="icon">
                <X />
              </Button>
            </div>

            {/* Steps indicator */}
            {cartItems.length > 0 && (
              <ol className="flex gap-2 px-5 py-2.5 border-b border-border bg-muted/30 text-[11px] font-medium" aria-label="Passos da compra">
                {[['cart', '1. Carrinho'], ['checkout', '2. Dados e pagamento']].map(([id, label]) => (
                  <li key={id} className="flex-1 space-y-1" aria-current={step === id ? 'step' : undefined}>
                    <span className={step === id ? 'text-primary' : 'text-muted-foreground'}>{label}</span>
                    <span className={`block h-1 rounded-full ${step === id ? 'bg-primary' : id === 'cart' ? 'bg-primary/40' : 'bg-muted'}`} />
                  </li>
                ))}
              </ol>
            )}

            <div className="flex-grow overflow-y-auto relative" ref={cartScrollRef}>
              {step === 'cart' && (
                <div className="p-5 space-y-4">
                  {cartItems.length === 0 ? (
                    <div className="text-center text-muted-foreground py-16 flex flex-col items-center">
                      <ShoppingCartIcon size={48} className="mb-4 opacity-40" />
                      <p className="mb-4">O carrinho está vazio.</p>
                      <Button variant="outline" onClick={() => { setIsCartOpen(false); }} asChild>
                        <Link to="/shop">Explorar o catálogo</Link>
                      </Button>
                    </div>
                  ) : (
                    cartItems.map((item) => (
                      <div key={item.variant.id} className="flex gap-3 bg-muted/30 border border-border p-3 rounded-xl">
                        <img
                          src={item.product.image}
                          alt={item.product.title}
                          className="w-16 h-20 object-cover rounded-lg shrink-0 bg-muted"
                          onError={(e) => { e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="64" height="80" fill="%23e5e7eb"%3E%3Crect width="100%25" height="100%25"/%3E%3C/svg%3E'; }}
                        />
                        <div className="flex-grow min-w-0">
                          <h3 className="font-semibold text-sm line-clamp-2">{item.product.title}</h3>
                          {/* A variante (tamanho, edição): M e L do mesmo uniforme eram duas linhas iguais. */}
                          {cartVariantLabel(item.variant) && (
                            <p className="text-xs font-medium text-foreground/80">{cartVariantLabel(item.variant)}</p>
                          )}
                          <p className="text-xs text-muted-foreground">{item.product.subtitle}</p>
                          <p className="text-sm text-primary font-bold mt-1">
                            {item.variant.sale_price_formatted || item.variant.price_formatted}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-2 shrink-0">
                          <div className="flex items-center border border-border rounded-lg bg-background">
                            <Button
                              onClick={() => updateQuantity(item.variant.id, item.quantity - 1)}
                              size="sm" variant="ghost" className="h-11 w-11 sm:h-7 sm:w-7 p-0"
                              disabled={item.quantity <= 1}
                            >−</Button>
                            <span className="w-7 text-center text-sm">{item.quantity}</span>
                            <Button
                              onClick={() => updateQuantity(item.variant.id, item.quantity + 1)}
                              size="sm" variant="ghost" className="h-11 w-11 sm:h-7 sm:w-7 p-0"
                              disabled={item.quantity >= maxQty(item)}
                            >+</Button>
                          </div>
                          <Button onClick={() => removeFromCart(item.variant.id)} size="sm" variant="ghost" className="text-destructive text-xs h-9 sm:h-6 px-2 sm:px-1">
                            Remover
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {step === 'checkout' && (
                <div className="p-5 space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-primary">
                      <Truck className="h-4 w-4" /> Método de Entrega
                    </div>
                    <RadioGroup
                      value={form.shippingMethod}
                      onValueChange={(v) => setForm({ ...form, shippingMethod: v, pickupStore: v === 'pickup' ? form.pickupStore : '' })}
                    >
                      {Object.values(SHIPPING_METHODS).map((opt) => {
                        const cost = calcShippingCents(opt.id, subtotalCents, settings);
                        const Icon = opt.icon;
                        return (
                          <div
                            key={opt.id}
                            className={`flex items-start space-x-2 p-3 rounded-lg border cursor-pointer transition-colors ${form.shippingMethod === opt.id ? 'border-marca bg-marca/5' : 'hover:bg-muted/50'}`}
                            onClick={() => setForm({ ...form, shippingMethod: opt.id })}
                          >
                            <RadioGroupItem value={opt.id} id={`ship-${opt.id}`} className="mt-1" />
                            <Label htmlFor={`ship-${opt.id}`} className="cursor-pointer flex-1">
                              <span className="font-medium flex items-center gap-1.5">
                                <Icon className="h-4 w-4 text-primary" /> {opt.label}
                              </span>
                              <span className="block text-xs text-muted-foreground">{opt.description}</span>
                              <span className={`block text-xs font-semibold mt-0.5 ${cost === 0 ? 'text-green-600' : 'text-primary'}`}>
                                {cost === 0 ? 'Grátis' : formatCurrency(cost)}
                              </span>
                            </Label>
                          </div>
                        );
                      })}
                    </RadioGroup>
                    {form.shippingMethod === 'pickup' && physicalStores.length > 0 && (
                      <div className="space-y-2 ml-1">
                        <Label>Loja de levantamento *</Label>
                        <RadioGroup value={form.pickupStore} onValueChange={(v) => setForm({ ...form, pickupStore: v })}>
                          {physicalStores.map((store) => (
                            <div key={store.id} className="flex items-center space-x-2 p-2 rounded-lg border text-sm">
                              <RadioGroupItem value={store.name} id={`store-${store.id}`} />
                              <Label htmlFor={`store-${store.id}`} className="cursor-pointer flex-1">
                                <span className="font-medium">{store.name}</span>
                                {store.address && <span className="block text-xs text-muted-foreground">{store.address}</span>}
                              </Label>
                            </div>
                          ))}
                        </RadioGroup>
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-primary">
                      <MapPin className="h-4 w-4" /> {form.shippingMethod === 'pickup' ? 'Dados de Contacto' : 'Dados de Entrega'}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="checkout-nome">Nome completo *</Label>
                      <Input id="checkout-nome" autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="O seu nome" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="checkout-email">
                        Email {form.shippingMethod === 'pickup'
                          ? <span className="text-muted-foreground font-normal">(opcional — para receber o recibo)</span>
                          : <>* <span className="text-muted-foreground font-normal">(para acompanhar a encomenda)</span></>}
                      </Label>
                      <Input id="checkout-email" type="email" autoComplete="email" inputMode="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="email@exemplo.com" />
                    </div>
                    {form.shippingMethod === 'pickup' && (
                      <div className="space-y-2">
                        <Label htmlFor="checkout-telefone">Telefone *</Label>
                        <PhoneInput id="checkout-telefone" value={form.phone} onChange={(phone) => setForm({ ...form, phone })} />
                      </div>
                    )}
                    {form.shippingMethod !== 'pickup' && (
                      <>
                        <AngolaAddressSelector value={deliveryAddress} onChange={setDeliveryAddress} />
                        {/* O ponto no mapa, como na página das lojas. A morada em Angola é
                            muitas vezes uma referência; isto dá ao estafeta o sítio exacto. */}
                        <div className="rounded-lg border border-border p-3 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs text-muted-foreground">
                              {gps ? 'Localização guardada para o estafeta' : 'Ajuda o estafeta a encontrar a morada'}
                            </span>
                            <Button type="button" size="sm" variant={gps ? 'secondary' : 'outline'} onClick={locate} disabled={locating}>
                              {locating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MapPin className="h-3.5 w-3.5" />}
                              <span className="ml-1.5 text-xs">{gps ? 'Actualizar' : 'Usar a minha localização'}</span>
                            </Button>
                          </div>
                          {gps && (
                            <p className="text-[11px] text-muted-foreground font-mono">
                              {gps.lat.toFixed(5)}, {gps.lng.toFixed(5)}
                            </p>
                          )}
                        </div>
                      </>
                    )}
                  </div>

                  <div className="space-y-3 pt-2">
                    <div className="flex items-center gap-2 text-sm font-medium text-primary">
                      <CreditCard className="h-4 w-4" /> Método de Pagamento
                    </div>
                    <RadioGroup value={form.paymentMethod} onValueChange={(v) => setForm({ ...form, paymentMethod: v, paymentReference: '' })}>
                      {availableMethods.length > 0 ? availableMethods.map((m) => (
                        <div key={m.code} className="space-y-2">
                          {/* O cartão todo selecciona: num telemóvel, só o texto ser tocável obriga
                              a acertar no sítio certo. */}
                          <div
                            role="presentation"
                            onClick={() => setForm({ ...form, paymentMethod: m.code, paymentReference: '' })}
                            className={`flex items-start gap-2 p-3 rounded-lg border transition-colors cursor-pointer ${form.paymentMethod === m.code ? 'border-[var(--brand-primary)] bg-[rgb(var(--brand-primary-rgb)/0.05)]' : 'hover:bg-muted/50'}`}
                          >
                            <RadioGroupItem value={m.code} id={`pagamento-${m.code}`} className="mt-1" />
                            <Label htmlFor={`pagamento-${m.code}`} className="cursor-pointer flex-1">
                              <span className="font-medium flex items-center gap-2 flex-wrap">
                                {m.icon && <span>{m.icon}</span>}
                                {m.name}
                                {/* "p2p"/"offline" é jargão nosso; o cliente precisa é de saber quando paga. */}
                                <span className="text-[10px] text-muted-foreground font-normal">{paymentMoment(m, form.shippingMethod)}</span>
                              </span>
                              {m.account_info && (
                                // Fonte normal (Inter), não monoespaçada: nesta o "O" de AO06 e o zero eram iguais.
                                <span className="block text-xs text-foreground/80 tabular-nums tracking-wide mt-0.5 break-words">{m.account_info}</span>
                              )}
                              {form.paymentMethod === m.code && m.instructions && (
                                <p className="text-xs text-muted-foreground mt-2 p-2 rounded-md bg-muted/50 whitespace-pre-wrap">{m.instructions}</p>
                              )}
                            </Label>
                          </div>
                          {form.paymentMethod === m.code && isPaidUpfront(m.type) && (
                            <div className="ml-0 sm:ml-6 space-y-2">
                              {m.account_info && (
                                <Button type="button" size="sm" variant="outline" className="h-9" onClick={() => copyText(m.account_info, 'Dados de pagamento')}>
                                  <Copy className="h-3.5 w-3.5 mr-1.5" /> Copiar dados de pagamento
                                </Button>
                              )}
                              <p className="text-xs text-muted-foreground">
                                Paga <strong>depois</strong> de confirmar: na página seguinte mostramos o número da encomenda para usar como referência,
                                {m.payment_link ? ' o link de pagamento' : ''}{m.automatic ? '. A confirmação do pagamento é automática.' : ' e onde indicar o comprovativo.'} O stock fica reservado para si.
                              </p>
                              {m.qr_url && <img src={m.qr_url} alt={`QR de pagamento ${m.name}`} className="h-32 w-32 rounded-lg border" />}
                              {/* Com gateway, quem confirma é o webhook: não se pede a referência. */}
                              {!m.automatic && (
                                <>
                                  <Label htmlFor="checkout-referencia" className="text-xs font-normal text-muted-foreground">Já pagou? Referência do pagamento (opcional)</Label>
                                  <Input id="checkout-referencia" autoComplete="off" placeholder="Referência ou n.º do comprovativo" value={form.paymentReference} onChange={(e) => setForm({ ...form, paymentReference: e.target.value })} />
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      )) : (
                        // Sem lista (falhou a carregar ou não há métodos activos): só o pagamento na
                        // entrega, que o servidor aceita quando não há métodos configurados.
                        <div className="flex items-center space-x-2 p-3 rounded-lg border"><RadioGroupItem value="entrega" id="pagamento-entrega" /><Label htmlFor="pagamento-entrega">Pagamento na entrega</Label></div>
                      )}
                    </RadioGroup>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="checkout-notas">Notas (opcional)</Label>
                    <Textarea id="checkout-notas" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Instruções de entrega..." />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="checkout-colportor">Código do colportor (opcional)</Label>
                    <Input id="checkout-colportor" autoComplete="off" value={form.colporteurCode} onChange={(e) => setForm({ ...form, colporteurCode: e.target.value })} placeholder="CPT-0000" maxLength={12} />
                    {form.colporteurCode && !normalizeColporteurCode(form.colporteurCode) && (
                      <p className="text-xs text-destructive">O código tem a forma CPT-0000.</p>
                    )}
                  </div>

                  {form.shippingMethod !== 'pickup' && (
                  <div className="space-y-3 pt-2 border-t border-border">
                    <div className="flex items-center gap-2 text-sm font-medium text-primary">
                      <PenLine className="h-4 w-4" /> Assinatura <span className="text-muted-foreground font-normal">(opcional)</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Não é obrigatória: quem receber a encomenda assina na entrega. Se assinar aqui, a assinatura fica no recibo em preto e branco.
                    </p>
                    <SignaturePad
                      ref={signatureRef}
                      label="Assinatura do comprador"
                      hint="Desenhe a assinatura do seu Bilhete de Identidade, com o dedo ou o rato, se quiser."
                    />
                  </div>
                  )}
                </div>
              )}
              <FloatingScrollTop
                mode="container"
                containerRef={cartScrollRef}
                threshold={180}
                positionClass="absolute bottom-4 right-4 z-10"
              />
            </div>

            {cartItems.length > 0 && (
              <div className="p-4 sm:p-5 border-t border-border bg-muted/20 space-y-3">
                {/* Avisos fora do resumo recolhível: no telemóvel o resumo vem fechado, e o aviso
                    ficava escondido — o cliente via o botão e não sabia o que lhe faltava. */}
                {maintenanceMode && (
                  <div className="text-xs p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200">
                    A loja está em manutenção — o checkout online está temporariamente desactivado.
                  </div>
                )}
                {!user && step === 'checkout' && (
                  <p className="text-xs text-muted-foreground">
                    Não precisa de conta: acompanhe a encomenda com o número e o email em <strong>Rastrear encomenda</strong>.{' '}
                    <button type="button" className="text-primary font-medium hover:underline" onClick={() => openAuth({ mode: 'login', defaultEmail: form.email, defaultName: form.name })}>
                      Entrar
                    </button>{' '}guarda os seus dados para a próxima.
                  </p>
                )}
                {/* Telemóvel: barra que abre/fecha o detalhe. No computador não aparece. */}
                <button
                  type="button"
                  onClick={() => setSummaryOpen((o) => !o)}
                  aria-expanded={summaryOpen}
                  className="sm:hidden w-full flex items-center justify-between rounded-lg px-3 py-2 -mx-1 bg-background border border-border text-sm"
                >
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Truck className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                    {summaryOpen ? 'Esconder resumo' : 'Ver resumo e portes'}
                  </span>
                  <span className="flex items-center gap-1.5 font-semibold">
                    {formatCurrency(totalCents)}
                    {summaryOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </span>
                </button>

                <div className={`${summaryOpen ? 'block' : 'hidden'} sm:block space-y-3`}>
                <div className="flex gap-3 text-[10px] text-muted-foreground justify-center pb-1">
                  <span className="flex items-center gap-1"><Shield className="h-3 w-3 text-green-600" /> Compra segura</span>
                  <span className="flex items-center gap-1"><Lock className="h-3 w-3 text-green-600" /> Dados protegidos</span>
                  <span className="flex items-center gap-1"><Truck className="h-3 w-3 text-primary" /> Entrega nacional</span>
                </div>
                <div className="space-y-1.5 text-sm">
                  {form.shippingMethod === 'delivery' && freeShippingRemaining > 0 && subtotalCents > 0 && (
                    <div className="rounded-lg border border-marca/20 bg-marca/5 p-2.5 mb-2">
                      <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                        <span>Envio grátis</span>
                        <span>Faltam {formatCurrency(freeShippingRemaining)}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${freeShippingProgress}%` }} />
                      </div>
                    </div>
                  )}
                  {form.shippingMethod === 'delivery' && shippingCents === 0 && subtotalCents >= FREE_SHIPPING_THRESHOLD && (
                    <p className="text-xs text-green-600 font-medium mb-1">Envio grátis aplicado neste pedido</p>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>{formatCurrency(subtotalCents)}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShippingOpen((o) => !o)}
                    className="w-full flex justify-between items-center rounded-lg px-2 py-1.5 -mx-2 hover:bg-muted/60 transition-colors text-left"
                  >
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Truck className="h-3.5 w-3.5 text-primary" />
                      {getShippingLabel(form.shippingMethod)}
                      {shippingOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </span>
                    <span className={shippingCents === 0 ? 'text-green-600 font-medium' : ''}>
                      {shippingCents === 0 ? 'Grátis' : formatCurrency(shippingCents)}
                    </span>
                  </button>
                  {shippingOpen && (
                    <div className="rounded-lg border border-border bg-background p-2 space-y-1">
                      {Object.values(SHIPPING_METHODS).map((opt) => {
                        const cost = calcShippingCents(opt.id, subtotalCents, settings);
                        const Icon = opt.icon;
                        const selected = form.shippingMethod === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => setForm({ ...form, shippingMethod: opt.id })}
                            className={`w-full flex items-center justify-between p-2 rounded-md text-xs transition-colors ${selected ? 'bg-marca/10 border border-marca/30' : 'hover:bg-muted/50'}`}
                          >
                            <span className="flex items-center gap-1.5 font-medium">
                              <Icon className="h-3.5 w-3.5" /> {opt.label}
                            </span>
                            <span className={cost === 0 ? 'text-green-600' : ''}>{cost === 0 ? 'Grátis' : formatCurrency(cost)}</span>
                          </button>
                        );
                      })}
                      {form.shippingMethod === 'delivery' && shippingCents > 0 && (
                        <p className="text-[10px] text-muted-foreground px-2 pt-1">
                          Envio grátis acima de {formatCurrency(FREE_SHIPPING_THRESHOLD)}
                        </p>
                      )}
                      {step === 'cart' && (
                        <p className="text-[10px] text-primary px-2">Continue para checkout para seleccionar loja de levantamento</p>
                      )}
                    </div>
                  )}
                </div>
                </div>

                {/* Total sempre à vista: no telemóvel é a única linha de valores fora do resumo. */}
                <div className="flex justify-between font-bold text-base pt-1 border-t border-border">
                  <span>Total</span>
                  <span className="text-primary">{formatCurrency(totalCents)}</span>
                </div>

                {step === 'cart' ? (
                  <Button className="w-full btn-primary py-6 text-base" onClick={() => setStep('checkout')} disabled={maintenanceMode}>
                    {maintenanceMode ? 'Compras indisponíveis' : 'Continuar para finalizar a compra'}
                  </Button>
                ) : (
                  <>
                    {/* Resumo de quem e para onde, só com o que o cliente já escreveu: antes mostrava
                        "— ·" e "Luanda, Angola" a quem ainda não tinha preenchido nada. */}
                    {(form.name.trim() || form.email.trim() || (form.shippingMethod === 'pickup' ? form.pickupStore : deliveryAddress.street.trim())) && (
                      <div className="text-xs text-muted-foreground bg-muted/40 rounded-lg p-2 space-y-0.5">
                        <p className="truncate sm:whitespace-normal">
                          {form.name.trim() && <strong>{form.name.trim()}</strong>}
                          {form.name.trim() && form.email.trim() ? ' · ' : ''}
                          {form.email.trim()}
                        </p>
                        <p className="truncate sm:whitespace-normal">{form.shippingMethod === 'pickup'
                          ? (form.pickupStore ? `Levantamento: ${form.pickupStore}` : 'Levantamento na loja')
                          : (deliveryAddress.street.trim() ? angolaAddressToPayload(deliveryAddress).deliveryAddressFull : 'Entrega ao domicílio')}
                        </p>
                      </div>
                    )}
                    <Button className="w-full btn-primary py-6 text-base" onClick={() => handleCheckout(false)} disabled={checkingOut || maintenanceMode}>
                      {checkingOut && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Confirmar Compra · {formatCurrency(totalCents)}
                    </Button>
                    {(settings.whatsapp || settings.contact_phone) && (
                      <Button
                        variant="outline"
                        className="w-full py-5 border-green-500/50 text-green-700 hover:bg-green-50"
                        onClick={() => handleCheckout(true)}
                        disabled={checkingOut || maintenanceMode}
                      >
                        <MessageCircle className="mr-2 h-4 w-4" />
                        {waApiActive ? 'Confirmar e receber no WhatsApp' : 'Finalizar via WhatsApp'}
                      </Button>
                    )}
                    <p className="hidden sm:block text-[10px] text-center text-muted-foreground">
                      <strong>Compra online</strong> — pagamento e entrega pela loja.{' '}
                      {waApiActive ? (
                        <><strong>WhatsApp</strong> — confirmação automática enviada para o seu número.</>
                      ) : (
                        <><strong>WhatsApp</strong> — pedido registado e conversa directa com a equipa.</>
                      )}
                    </p>
                  </>
                )}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ShoppingCart;

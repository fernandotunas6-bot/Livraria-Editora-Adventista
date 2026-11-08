import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShoppingCart as ShoppingCartIcon, X, Loader2, ChevronLeft, Truck, CreditCard, MapPin, Shield, Lock, MessageCircle, ChevronDown, ChevronUp, PenLine, Copy,
  Library,
} from 'lucide-react';
import { useCart } from '@/hooks/useCart';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
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
import { calcShippingCents, DIGITAL_SHIPPING, SHIPPING_METHODS, getShippingLabel, shippingRules } from '@/lib/shipping';
import { isDigitalCartItem, titleList } from '@/lib/digitalEditions';
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
import { checkoutMemoryKey, checkoutMemoryOff, readCheckoutMemory, saveCheckoutMemory, setCheckoutMemoryEnabled } from '@/lib/checkoutMemory';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Ordem em que se procura o primeiro erro, para o mostrar (de cima para baixo no formulário).
const ERROR_ORDER = ['pickupStore', 'name', 'email', 'phone', 'address'];
const ERROR_TARGET = {
  pickupStore: 'checkout-loja',
  name: 'checkout-nome',
  email: 'checkout-email',
  phone: 'checkout-telefone',
  address: 'checkout-morada',
};

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
  const { cartItems, removeFromCart, updateQuantity, getCartTotalCents, clearCart, refreshCart, cartDigital } = useCart();

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
  // Erros por campo, ditos junto de cada um (antes só um aviso genérico, sem dizer qual).
  const [errors, setErrors] = useState({});
  const clearError = (key) => setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
  const fieldError = (key) => (errors[key]
    ? { 'aria-invalid': true, 'aria-describedby': `${ERROR_TARGET[key]}-erro` }
    : {});

  // Os dados da última compra neste aparelho (lib/checkoutMemory.js): voltam preenchidos e
  // guardam-se à medida que se escrevem. Por conta; ao sair da conta, o formulário esvazia.
  const memoryKey = checkoutMemoryKey(user?.id);
  const [remember, setRemember] = useState(() => !checkoutMemoryOff());
  const memoryKeyRef = useRef('');
  useEffect(() => {
    const previous = memoryKeyRef.current;
    if (previous === memoryKey) return;
    memoryKeyRef.current = memoryKey;
    const leftAccount = previous && !previous.endsWith(':convidado') && memoryKey.endsWith(':convidado');
    if (leftAccount) {
      setForm((f) => ({ ...f, name: '', email: '', phone: '', pickupStore: '' }));
      setDeliveryAddress((d) => ({ ...d, street: '', reference: '', phone: '', relativeName: '', relativePhone: '', localityCustom: '' }));
    }
    const mem = readCheckoutMemory(memoryKey);
    if (!mem) return;
    setForm((f) => ({
      ...f,
      name: f.name || mem.form.name,
      email: f.email || mem.form.email,
      phone: f.phone || mem.form.phone,
      shippingMethod: SHIPPING_METHODS[mem.form.shippingMethod] ? mem.form.shippingMethod : f.shippingMethod,
      pickupStore: f.pickupStore || mem.form.pickupStore,
    }));
    // A morada só se a pessoa ainda não começou a escrever outra.
    setDeliveryAddress((d) => (d.street.trim() || d.reference.trim() || d.municipalityName
      ? d
      : { ...d, ...Object.fromEntries(Object.entries(mem.address).filter(([, v]) => v)) }));
  }, [memoryKey]);

  useEffect(() => {
    if (!remember) return undefined;
    const timer = setTimeout(() => saveCheckoutMemory(memoryKey, { form, address: deliveryAddress }), 500);
    return () => clearTimeout(timer);
  }, [form, deliveryAddress, memoryKey, remember]);

  const toggleRemember = (on) => {
    setRemember(on);
    setCheckoutMemoryEnabled(on);
    if (on) saveCheckoutMemory(memoryKey, { form, address: deliveryAddress });
  };

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

  // No telemóvel, com o carrinho aberto a página de trás fica quieta: o dedo que deslizava até
  // ao fim da lista passava a deslocar a loja por baixo do véu. No computador não se prende
  // (a barra de deslocamento desaparecia e a página saltava para o lado).
  useEffect(() => {
    if (!isCartOpen || !window.matchMedia?.('(max-width: 767px)').matches) return undefined;
    const body = document.body;
    const prev = body.style.overflow;
    body.style.overflow = 'hidden';
    return () => { body.style.overflow = prev; };
  }, [isCartOpen]);

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
  // Edições digitais (lib/digitalEditions.js, migração edicoes_digitais). Só digitais: o envio é
  // 'digital' — sem morada, sem loja, sem portes. Com impressos, o envio é o deles e os portes
  // (e os portes grátis) contam só os impressos. Qualquer edição digital precisa de conta: é na
  // conta que o livro abre.
  const digitalOnly = !!cartDigital?.all;
  const shipping = digitalOnly ? 'digital' : form.shippingMethod;
  const physicalCents = cartDigital ? cartDigital.physicalCents : subtotalCents;
  const needsLogin = !!cartDigital?.any && !user;
  const digitalTitles = titleList(cartDigital?.titles || []);
  const FREE_SHIPPING_THRESHOLD = shippingRules(settings).freeThresholdCents;
  const freeShippingRemaining = Math.max(0, FREE_SHIPPING_THRESHOLD - physicalCents);
  const freeShippingProgress = FREE_SHIPPING_THRESHOLD > 0
    ? Math.min(100, (physicalCents / FREE_SHIPPING_THRESHOLD) * 100)
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

  const shippingCents = calcShippingCents(shipping, physicalCents, settings);

  // Só os métodos que servem para o envio escolhido ("Pagar no Balcão" só no levantamento; a
  // edição digital só com o que se paga antes). Se o escolhido deixar de servir, passa ao primeiro.
  const availableMethods = useMemo(
    () => paymentMethodsFor(paymentMethods, shipping),
    [paymentMethods, shipping],
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
    ...(isDigitalCartItem(item) ? { digital: true } : {}),
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
    // A edição digital fica na conta: sem sessão, entra primeiro (o carrinho fica como está).
    if (needsLogin) {
      openAuth({ mode: 'login', reason: 'digital', defaultEmail: form.email, defaultName: form.name });
      return;
    }
    const needsAddress = shipping !== 'pickup' && shipping !== 'digital';
    const typedPhone = normalizeAngolaPhone(
      needsAddress ? (deliveryAddress.phone || form.phone) : form.phone
    );
    // Só o indicativo (+244), que o campo traz escrito, não é um telefone: na edição digital o
    // telefone é opcional, e o "+244" sozinho passava por um número mal escrito.
    const effectivePhone = typedPhone.replace(/\D/g, '').replace(/^244/, '') ? typedPhone : '';

    // Levantamento na loja: basta saber quem vem buscar e como lhe ligar.
    // Entrega ao domicílio: email e morada. Não exige conta: o cliente acompanha a encomenda com
    // o número e o email (Rastrear encomenda), e o registo por email depende do SMTP do Auth.
    //
    // Cada falta fica dita junto do campo, e o formulário desce até à primeira: num telemóvel,
    // "Preencha todos os campos obrigatórios" num aviso deixava a pessoa à procura de qual.
    // Edição digital: o nome e o email (o recibo e o aviso do pagamento); o telefone é opcional.
    const found = {};
    if (shipping === 'pickup' && physicalStores.length > 0 && !form.pickupStore) found.pickupStore = 'Escolha a loja onde vai levantar.';
    if (!form.name.trim()) found.name = 'Escreva o seu nome.';
    if (needsAddress && !form.email.trim()) found.email = 'O email serve para acompanhar a encomenda.';
    else if (digitalOnly && !form.email.trim()) found.email = 'O recibo e o aviso do pagamento vão para este email.';
    else if (form.email.trim() && !EMAIL_RE.test(form.email.trim())) found.email = 'Este email parece incompleto.';
    if (needsAddress) {
      const addrErr = validateAngolaAddress(deliveryAddress, { requireDelivery: true });
      if (addrErr) found.address = addrErr;
    } else if (digitalOnly) {
      if (effectivePhone && !isValidAngolaPhone(effectivePhone)) found.phone = 'Use o formato +244 9XX XXX XXX, ou deixe em branco.';
    } else if (!effectivePhone) {
      found.phone = 'Indique um telefone para o avisarmos.';
    } else if (!isValidAngolaPhone(effectivePhone)) {
      found.phone = 'Use o formato +244 9XX XXX XXX.';
    }
    const first = ERROR_ORDER.find((k) => found[k]);
    if (first) {
      setErrors(found);
      const target = document.getElementById(ERROR_TARGET[first]);
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (target?.matches?.('input, textarea, button')) target.focus({ preventScroll: true });
      // Sem aviso flutuante: a mensagem está junto do campo (e é anunciada), e o aviso tapava
      // o total e o botão de confirmar no fundo do painel.
      return;
    }
    setErrors({});

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

      const addressPayload = shipping === 'digital' ? {}
        : shipping === 'pickup'
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
        shippingMethod: shipping,
        pickupStore: shipping === 'pickup' ? form.pickupStore : '',
        checkoutSignature,
        ...(gps && needsAddress ? { deliveryGpsLat: gps.lat, deliveryGpsLng: gps.lng } : {}),
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
        address: addressPayload.address || '',
        city: addressPayload.city || '',
        deliveryAddress: needsAddress ? deliveryAddress : null,
        deliveryRelativeName: addressPayload.deliveryRelativeName || '',
        deliveryRelativePhone: addressPayload.deliveryRelativePhone || '',
        shippingMethod: shipping,
        shippingLabel: getShippingLabel(shipping),
        pickupStore: shipping === 'pickup' ? form.pickupStore : '',
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
  }, [cartItems, clearCart, refreshCart, deliveryAddress, digitalOnly, form, gps, maintenanceMode, needsLogin, openAuth, orderItemsForReceipt, paymentMethods, physicalStores.length, settings, shipping, shippingCents, subtotalCents, setIsCartOpen, toast, updateProfile, user, waApiActive]);

  const maxQty = (item) => (isDigitalCartItem(item) ? 1 : item.variant.manage_inventory ? item.variant.inventory_quantity : 99);
  // Edição digital sem forma de pagar pelo site (só há pagamento na entrega ou no balcão).
  const noDigitalPayment = digitalOnly && availableMethods.length === 0;

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
            {/* Cabeçalho. No telemóvel com a app instalada, o painel começa no topo do ecrã:
                a área segura de cima afasta o título e o fechar da barra de estado. */}
            <div
              className="flex items-center justify-between p-5 border-b border-border"
              style={{ paddingTop: 'calc(1.25rem + env(safe-area-inset-top, 0px))' }}
            >
              <div className="flex items-center gap-2">
                {step === 'checkout' && (
                  <Button variant="ghost" size="icon" onClick={() => setStep('cart')} className="h-11 w-11 sm:h-8 sm:w-8" aria-label="Voltar ao carrinho">
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
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
              <Button onClick={() => setIsCartOpen(false)} variant="ghost" size="icon" className="h-11 w-11 sm:h-10 sm:w-10" aria-label="Fechar o carrinho">
                <X aria-hidden="true" />
              </Button>
            </div>

            {/* Steps indicator */}
            {cartItems.length > 0 && (
              <ol className="flex gap-2 px-5 py-2.5 border-b border-border bg-muted/30 text-xs font-medium" aria-label="Passos da compra">
                {[['cart', '1. Carrinho'], ['checkout', '2. Dados e pagamento']].map(([id, label]) => (
                  <li key={id} className="flex-1 space-y-1" aria-current={step === id ? 'step' : undefined}>
                    <span className={step === id ? 'text-primary' : 'text-muted-foreground'}>{label}</span>
                    <span className={`block h-1 rounded-full ${step === id ? 'bg-primary' : id === 'cart' ? 'bg-primary/40' : 'bg-muted'}`} />
                  </li>
                ))}
              </ol>
            )}

            <div className="grow overflow-y-auto overscroll-contain relative" ref={cartScrollRef}>
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
                    <>
                    {/* Quanto falta para os portes grátis, à vista logo no carrinho: no telemóvel
                        ficava dentro do resumo recolhido, e era aqui que fazia diferença — quando
                        ainda se pode juntar mais um livro. */}
                    {shipping === 'delivery' && FREE_SHIPPING_THRESHOLD > 0 && physicalCents > 0 && (
                      <div className="rounded-xl border border-marca/20 bg-marca/5 p-3">
                        {freeShippingRemaining > 0 ? (
                          <>
                            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-foreground">
                              <Truck className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                              Faltam {formatCurrency(freeShippingRemaining)} para os portes grátis
                            </p>
                            <div
                              className="h-1.5 overflow-hidden rounded-full bg-muted"
                              role="progressbar" aria-label="Caminho até aos portes grátis"
                              aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(freeShippingProgress)}
                            >
                              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${freeShippingProgress}%` }} />
                            </div>
                            <Link to="/shop" onClick={() => setIsCartOpen(false)} className="mt-1 inline-flex min-h-9 items-center text-xs font-semibold text-primary hover:underline">
                              Juntar mais livros
                            </Link>
                          </>
                        ) : (
                          <p className="flex items-center gap-1.5 text-xs font-medium text-green-700 dark:text-green-400">
                            <Truck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> Portes grátis nesta encomenda
                          </p>
                        )}
                      </div>
                    )}
                    {cartDigital?.any && (
                      <div className="flex gap-2 rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs text-foreground" data-carrinho-digital={digitalOnly ? 'so-digital' : 'misto'}>
                        <Library className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                        <p>
                          {digitalOnly
                            ? <>Edição digital: <strong>sem portes nem morada</strong>. Fica na sua biblioteca (Perfil → Biblioteca) assim que o pagamento for confirmado.</>
                            : <>A edição digital de <strong>{digitalTitles}</strong> não tem envio: abre na sua biblioteca quando o pagamento for confirmado. Os portes contam só os impressos.</>}
                          {needsLogin && <> Precisa de entrar na sua conta, que é onde o livro fica.</>}
                        </p>
                      </div>
                    )}
                    {cartItems.map((item) => (
                      <div key={item.variant.id} className="flex gap-3 bg-muted/30 border border-border p-3 rounded-xl">
                        <img
                          src={item.product.image}
                          alt={item.product.title}
                          className="w-16 h-20 object-cover rounded-lg shrink-0 bg-muted"
                          onError={(e) => { e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="64" height="80" fill="%23e5e7eb"%3E%3Crect width="100%25" height="100%25"/%3E%3C/svg%3E'; }}
                        />
                        <div className="grow min-w-0">
                          <h3 className="font-semibold text-sm line-clamp-2">{item.product.title}</h3>
                          {/* A variante (tamanho, edição): M e L do mesmo uniforme eram duas linhas iguais. */}
                          {cartVariantLabel(item.variant) && (
                            <p className="text-xs font-medium text-foreground/80">{cartVariantLabel(item.variant)}</p>
                          )}
                          <p className="text-xs text-muted-foreground">{item.product.subtitle}</p>
                          {isDigitalCartItem(item) && (
                            <p className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-primary">
                              <Library className="h-3 w-3" aria-hidden="true" /> Edição digital · sem envio
                            </p>
                          )}
                          <p className="text-sm text-primary font-bold mt-1">
                            {item.variant.sale_price_formatted || item.variant.price_formatted}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-2 shrink-0">
                          {/* A edição digital é uma por conta: sem quantidade. */}
                          {isDigitalCartItem(item) ? (
                            <span className="text-xs text-muted-foreground" aria-label="Quantidade: 1">1 por conta</span>
                          ) : (
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
                          )}
                          <Button onClick={() => removeFromCart(item.variant.id)} size="sm" variant="ghost" className="text-destructive text-xs h-9 sm:h-6 px-2 sm:px-1">
                            Remover
                          </Button>
                        </div>
                      </div>
                    ))}
                    </>
                  )}
                </div>
              )}

              {step === 'checkout' && (
                <div className="p-5 space-y-4">
                  {digitalOnly ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm font-medium text-primary">
                        <Library className="h-4 w-4" aria-hidden="true" /> Entrega
                      </div>
                      <div className="rounded-lg border border-marca bg-marca/5 p-3 text-sm" data-envio="digital">
                        <span className="font-medium">{DIGITAL_SHIPPING.label}</span>
                        <span className="block text-xs text-muted-foreground">
                          Sem portes, sem morada. O livro abre em Perfil → Biblioteca, neste e noutros aparelhos, quando o pagamento for confirmado.
                        </span>
                        <span className="block text-xs font-semibold mt-0.5 text-green-600">Sem portes</span>
                      </div>
                    </div>
                  ) : (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-primary">
                      <Truck className="h-4 w-4" /> Método de Entrega
                    </div>
                    {cartDigital?.any && (
                      <p className="text-xs text-muted-foreground">
                        A edição digital de <strong className="text-foreground">{digitalTitles}</strong> não tem envio: abre na sua biblioteca. O envio e os portes são dos impressos.
                      </p>
                    )}
                    <RadioGroup
                      value={form.shippingMethod}
                      onValueChange={(v) => setForm({ ...form, shippingMethod: v, pickupStore: v === 'pickup' ? form.pickupStore : '' })}
                    >
                      {Object.values(SHIPPING_METHODS).map((opt) => {
                        const cost = calcShippingCents(opt.id, physicalCents, settings);
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
                      <div className="space-y-2 ml-1" id="checkout-loja" tabIndex={-1}>
                        <Label id="checkout-loja-rotulo">Loja de levantamento *</Label>
                        {errors.pickupStore && <p id="checkout-loja-erro" className="text-xs font-medium text-destructive" role="alert">{errors.pickupStore}</p>}
                        <RadioGroup
                          value={form.pickupStore}
                          onValueChange={(v) => { setForm({ ...form, pickupStore: v }); clearError('pickupStore'); }}
                          aria-labelledby="checkout-loja-rotulo"
                          {...fieldError('pickupStore')}
                        >
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
                  )}

                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-primary">
                      <MapPin className="h-4 w-4" /> {digitalOnly ? 'Os seus dados' : shipping === 'pickup' ? 'Dados de Contacto' : 'Dados de Entrega'}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="checkout-nome">Nome completo *</Label>
                      <Input id="checkout-nome" autoComplete="name" enterKeyHint="next" value={form.name} onChange={(e) => { setForm({ ...form, name: e.target.value }); clearError('name'); }} placeholder="O seu nome" {...fieldError('name')} />
                      {errors.name && <p id="checkout-nome-erro" className="text-xs font-medium text-destructive" role="alert">{errors.name}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="checkout-email">
                        Email {digitalOnly
                          ? <>* <span className="text-muted-foreground font-normal">(o recibo e o aviso do pagamento)</span></>
                          : shipping === 'pickup'
                          ? <span className="text-muted-foreground font-normal">(opcional — para receber o recibo)</span>
                          : <>* <span className="text-muted-foreground font-normal">(para acompanhar a encomenda)</span></>}
                      </Label>
                      <Input id="checkout-email" type="email" autoComplete="email" inputMode="email" enterKeyHint="next" value={form.email} onChange={(e) => { setForm({ ...form, email: e.target.value }); clearError('email'); }} placeholder="email@exemplo.com" {...fieldError('email')} />
                      {errors.email && <p id="checkout-email-erro" className="text-xs font-medium text-destructive" role="alert">{errors.email}</p>}
                    </div>
                    {(shipping === 'pickup' || digitalOnly) && (
                      <div className="space-y-2">
                        <Label htmlFor="checkout-telefone">
                          Telefone {digitalOnly ? <span className="text-muted-foreground font-normal">(opcional — para o avisarmos por WhatsApp)</span> : '*'}
                        </Label>
                        <PhoneInput id="checkout-telefone" value={form.phone} onChange={(phone) => { setForm({ ...form, phone }); clearError('phone'); }} />
                        {errors.phone && <p id="checkout-telefone-erro" className="text-xs font-medium text-destructive" role="alert">{errors.phone}</p>}
                      </div>
                    )}
                    {shipping !== 'pickup' && !digitalOnly && (
                      <>
                        <div id="checkout-morada" tabIndex={-1} className="space-y-2 focus:outline-hidden">
                          <AngolaAddressSelector value={deliveryAddress} onChange={(v) => { setDeliveryAddress(v); clearError('address'); }} />
                          {errors.address && <p id="checkout-morada-erro" className="text-xs font-medium text-destructive" role="alert">{errors.address}</p>}
                        </div>
                        {/* O ponto no mapa, como na página das lojas. A morada em Angola é
                            muitas vezes uma referência; isto dá ao estafeta o sítio exacto. */}
                        <div className="rounded-lg border border-border p-3 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs text-muted-foreground">
                              {gps
                                ? 'Localização guardada: a entrega vai a quem estiver mais perto de si'
                                : 'Partilhe a localização: a entrega vai ao colportor mais perto de si e ele encontra a morada'}
                            </span>
                            <Button type="button" size="sm" variant={gps ? 'secondary' : 'outline'} onClick={locate} disabled={locating}>
                              {locating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MapPin className="h-3.5 w-3.5" />}
                              <span className="ml-1.5 text-xs">{gps ? 'Actualizar' : 'Usar a minha localização'}</span>
                            </Button>
                          </div>
                          {gps && (
                            <p className="text-xs text-muted-foreground font-mono">
                              {gps.lat.toFixed(5)}, {gps.lng.toFixed(5)}
                            </p>
                          )}
                        </div>
                      </>
                    )}
                  </div>

                  <label htmlFor="checkout-lembrar" className="flex min-h-11 cursor-pointer items-start gap-2.5 rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                    <Checkbox id="checkout-lembrar" checked={remember} onCheckedChange={(v) => toggleRemember(v === true)} className="mt-0.5" />
                    <span>
                      <span className="block font-medium text-foreground">Lembrar estes dados neste aparelho</span>
                      Na próxima compra, o nome, o contacto e a morada já vêm preenchidos. Desligue num aparelho partilhado.
                    </span>
                  </label>

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
                            className={`flex items-start gap-2 p-3 rounded-lg border transition-colors cursor-pointer ${form.paymentMethod === m.code ? 'border-(--brand-primary) bg-[rgb(var(--brand-primary-rgb)/0.05)]' : 'hover:bg-muted/50'}`}
                          >
                            <RadioGroupItem value={m.code} id={`pagamento-${m.code}`} className="mt-1" />
                            <Label htmlFor={`pagamento-${m.code}`} className="cursor-pointer flex-1">
                              <span className="font-medium flex items-center gap-2 flex-wrap">
                                {m.icon && <span>{m.icon}</span>}
                                {m.name}
                                {/* "p2p"/"offline" é jargão nosso; o cliente precisa é de saber quando paga. */}
                                <span className="text-xs text-muted-foreground font-normal">{paymentMoment(m, shipping)}</span>
                              </span>
                              {m.account_info && (
                                // Fonte normal (Inter), não monoespaçada: nesta o "O" de AO06 e o zero eram iguais.
                                <span className="block text-xs text-foreground/80 tabular-nums tracking-wide mt-0.5 wrap-break-word">{m.account_info}</span>
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
                      )) : digitalOnly ? (
                        // A edição digital paga-se antes (transferência, Multicaixa) ou pelo gateway:
                        // "pagar na entrega" não tem entrega.
                        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200" role="status">
                          De momento a edição digital não se paga pelo site. Fale connosco pelo WhatsApp para a comprar.
                        </p>
                      ) : (
                        // Sem lista (falhou a carregar ou não há métodos activos): só o pagamento na
                        // entrega, que o servidor aceita quando não há métodos configurados.
                        <div className="flex items-center space-x-2 p-3 rounded-lg border"><RadioGroupItem value="entrega" id="pagamento-entrega" /><Label htmlFor="pagamento-entrega">Pagamento na entrega</Label></div>
                      )}
                    </RadioGroup>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="checkout-notas">Notas (opcional)</Label>
                    <Textarea id="checkout-notas" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder={digitalOnly ? 'Alguma observação para a loja...' : 'Instruções de entrega...'} />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="checkout-colportor">Código do colportor (opcional)</Label>
                    <Input id="checkout-colportor" autoComplete="off" value={form.colporteurCode} onChange={(e) => setForm({ ...form, colporteurCode: e.target.value })} placeholder="CPT-0000" maxLength={12} />
                    {form.colporteurCode && !normalizeColporteurCode(form.colporteurCode) && (
                      <p className="text-xs text-destructive">O código tem a forma CPT-0000.</p>
                    )}
                  </div>

                  {shipping !== 'pickup' && !digitalOnly && (
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
              // A área segura de baixo: sem ela, o "Confirmar compra" ficava em cima da barra de
              // gestos do iPhone, onde o toque vai para o sistema.
              <div
                className="p-4 sm:p-5 border-t border-border bg-muted/20 space-y-3"
                style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
              >
                {/* Avisos fora do resumo recolhível: no telemóvel o resumo vem fechado, e o aviso
                    ficava escondido — o cliente via o botão e não sabia o que lhe faltava. */}
                {maintenanceMode && (
                  <div className="text-xs p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200">
                    A loja está em manutenção — o checkout online está temporariamente desactivado.
                  </div>
                )}
                {needsLogin && (
                  <p className="text-xs text-foreground" role="status">
                    A edição digital fica na biblioteca da sua conta.{' '}
                    <button type="button" className="text-primary font-medium hover:underline" onClick={() => openAuth({ mode: 'login', reason: 'digital', defaultEmail: form.email, defaultName: form.name })}>
                      Entrar ou criar conta
                    </button>{' '}para a comprar.
                  </p>
                )}
                {!user && !needsLogin && step === 'checkout' && (
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
                    {summaryOpen ? 'Esconder resumo' : digitalOnly ? 'Ver resumo' : 'Ver resumo e portes'}
                  </span>
                  <span className="flex items-center gap-1.5 font-semibold">
                    {formatCurrency(totalCents)}
                    {summaryOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </span>
                </button>

                <div className={`${summaryOpen ? 'block' : 'hidden'} sm:block space-y-3`}>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground justify-center pb-1">
                  <span className="flex items-center gap-1"><Shield className="h-3 w-3 text-green-600" /> Compra segura</span>
                  <span className="flex items-center gap-1"><Lock className="h-3 w-3 text-green-600" /> Dados protegidos</span>
                  {digitalOnly
                    ? <span className="flex items-center gap-1"><Library className="h-3 w-3 text-primary" /> Na sua biblioteca</span>
                    : <span className="flex items-center gap-1"><Truck className="h-3 w-3 text-primary" /> Entrega nacional</span>}
                </div>
                <div className="space-y-1.5 text-sm">
                  {step === 'checkout' && shipping === 'delivery' && freeShippingRemaining > 0 && physicalCents > 0 && (
                    <div className="rounded-lg border border-marca/20 bg-marca/5 p-2.5 mb-2">
                      <div className="flex justify-between text-xs text-muted-foreground mb-1">
                        <span>Envio grátis</span>
                        <span>Faltam {formatCurrency(freeShippingRemaining)}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${freeShippingProgress}%` }} />
                      </div>
                    </div>
                  )}
                  {shipping === 'delivery' && shippingCents === 0 && physicalCents >= FREE_SHIPPING_THRESHOLD && (
                    <p className="text-xs text-green-600 font-medium mb-1">Envio grátis aplicado neste pedido</p>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>{formatCurrency(subtotalCents)}</span>
                  </div>
                  {digitalOnly ? (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Library className="h-3.5 w-3.5 text-primary" aria-hidden="true" /> {DIGITAL_SHIPPING.label}
                      </span>
                      <span className="text-green-600 font-medium">Sem portes</span>
                    </div>
                  ) : (
                  <button
                    type="button"
                    onClick={() => setShippingOpen((o) => !o)}
                    className="w-full flex justify-between items-center rounded-lg px-2 py-1.5 -mx-2 hover:bg-muted/60 transition-colors text-left"
                  >
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Truck className="h-3.5 w-3.5 text-primary" />
                      {getShippingLabel(shipping)}
                      {shippingOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </span>
                    <span className={shippingCents === 0 ? 'text-green-600 font-medium' : ''}>
                      {shippingCents === 0 ? 'Grátis' : formatCurrency(shippingCents)}
                    </span>
                  </button>
                  )}
                  {shippingOpen && !digitalOnly && (
                    <div className="rounded-lg border border-border bg-background p-2 space-y-1">
                      {Object.values(SHIPPING_METHODS).map((opt) => {
                        const cost = calcShippingCents(opt.id, physicalCents, settings);
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
                        <p className="text-xs text-muted-foreground px-2 pt-1">
                          Envio grátis acima de {formatCurrency(FREE_SHIPPING_THRESHOLD)}
                        </p>
                      )}
                      {step === 'cart' && (
                        <p className="text-xs text-primary px-2">Continue para escolher a loja de levantamento</p>
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
                  needsLogin && !maintenanceMode ? (
                    <Button className="w-full btn-primary py-6 text-base" onClick={() => openAuth({ mode: 'login', reason: 'digital', defaultEmail: form.email, defaultName: form.name })}>
                      Entrar para comprar a edição digital
                    </Button>
                  ) : (
                  <Button className="w-full btn-primary py-6 text-base" onClick={() => setStep('checkout')} disabled={maintenanceMode}>
                    {maintenanceMode ? 'Compras indisponíveis' : 'Continuar para finalizar a compra'}
                  </Button>
                  )
                ) : (
                  <>
                    {/* Resumo de quem e para onde, só com o que o cliente já escreveu: antes mostrava
                        "— ·" e "Luanda, Angola" a quem ainda não tinha preenchido nada. */}
                    {(form.name.trim() || form.email.trim() || (shipping === 'pickup' ? form.pickupStore : deliveryAddress.street.trim())) && (
                      <div className="text-xs text-muted-foreground bg-muted/40 rounded-lg p-2 space-y-0.5">
                        <p className="truncate sm:whitespace-normal">
                          {form.name.trim() && <strong>{form.name.trim()}</strong>}
                          {form.name.trim() && form.email.trim() ? ' · ' : ''}
                          {form.email.trim()}
                        </p>
                        <p className="truncate sm:whitespace-normal">{digitalOnly
                          ? 'Edição digital — na sua biblioteca'
                          : shipping === 'pickup'
                          ? (form.pickupStore ? `Levantamento: ${form.pickupStore}` : 'Levantamento na loja')
                          : (deliveryAddress.street.trim() ? angolaAddressToPayload(deliveryAddress).deliveryAddressFull : 'Entrega ao domicílio')}
                        </p>
                      </div>
                    )}
                    <Button className="w-full btn-primary py-6 text-base" onClick={() => handleCheckout(false)} disabled={checkingOut || maintenanceMode || noDigitalPayment}>
                      {checkingOut && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Confirmar Compra · {formatCurrency(totalCents)}
                    </Button>
                    {(settings.whatsapp || settings.contact_phone) && (
                      <Button
                        variant="outline"
                        className="w-full py-5 border-green-500/50 text-green-700 hover:bg-green-50"
                        onClick={() => handleCheckout(true)}
                        disabled={checkingOut || maintenanceMode || needsLogin}
                      >
                        <MessageCircle className="mr-2 h-4 w-4" />
                        {waApiActive ? 'Confirmar e receber no WhatsApp' : 'Finalizar via WhatsApp'}
                      </Button>
                    )}
                    <p className="hidden sm:block text-xs text-center text-muted-foreground">
                      <strong>Compra online</strong> — {digitalOnly ? 'pagamento pela loja; o livro abre na sua biblioteca.' : 'pagamento e entrega pela loja.'}{' '}
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

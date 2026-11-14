import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { formatCurrency } from '@/api/EcommerceApi';
import { supabase } from '@/lib/supabaseClient';
import { effectivePrice, isSaleActive, variantPrices } from '@/lib/pricing';
import { toast } from 'sonner';
import { cartVariantLabel, needsVariantChoice, variantNames } from '@/lib/productTypes';
import { cartDigitalState, isDigitalEdition, variantIndexOf } from '@/lib/digitalEditions';

const bookIdOf = (variantId) => String(variantId || '').replace(/-(default|v\d+)$/, '');

const CartContext = createContext();
const CART_STORAGE_KEY = 'e-commerce-cart';

export const useCart = () => useContext(CartContext);

export const CartProvider = ({ children }) => {
  const [cartItems, setCartItems] = useState(() => {
    try {
      const storedCart = localStorage.getItem(CART_STORAGE_KEY);
      return storedCart ? JSON.parse(storedCart) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartItems));
    } catch {
      // armazenamento cheio ou bloqueado: o carrinho fica só nesta visita
    }
  }, [cartItems]);

  // Com a loja aberta em dois separadores, o carrinho é o mesmo: juntar um livro num aparece no
  // outro (antes só depois de recarregar, e quem comprava no segundo separador perdia o livro).
  // O evento só chega aos outros separadores, e gravar o mesmo valor não o volta a disparar.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key !== CART_STORAGE_KEY) return;
      try {
        const next = e.newValue ? JSON.parse(e.newValue) : [];
        if (Array.isArray(next)) setCartItems(next);
      } catch {
        // valor estragado noutro separador: fica o deste
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const addToCart = useCallback((product, variant, quantity, availableQuantity, options = {}) => {
    return new Promise((resolve, reject) => {
      // Handle polymorphic arguments: e.g. addToCart(product, variant, quantity, { silent: true })
      let finalAvailable = availableQuantity;
      let finalOptions = options;
      if (typeof availableQuantity === 'object' && availableQuantity !== null) {
        finalOptions = availableQuantity;
        finalAvailable = undefined;
      }
      
      const silent = !!finalOptions.silent;
      // Produto com tamanhos ou edições: só entra com um escolhido (o servidor recusa sem ele).
      if (needsVariantChoice(product) && !/-v\d+$/.test(String(variant?.id || ''))) {
        const errMsg = `Para comprar "${product.title}", ${variantNames(product.product_type, product.versions).ask} na página do produto.`;
        if (!silent) toast.error(errMsg);
        reject(new Error(errMsg));
        return;
      }
      const effectiveAvailable = finalAvailable !== undefined ? finalAvailable : (variant.inventory_quantity ?? 99);

      // Edição digital: uma por conta, sem stock. Pôr outra vez não soma — já lá está.
      if (variant.digital === true) {
        if (cartItems.some((item) => item.variant.id === variant.id)) {
          if (!silent) toast.info(`A edição digital de "${product.title}" já está no carrinho.`);
          resolve();
          return;
        }
        setCartItems((prevItems) => (prevItems.some((item) => item.variant.id === variant.id)
          ? prevItems
          : [...prevItems, { product, variant, quantity: 1 }]));
        if (!silent) {
          toast.success(`"${product.title}" adicionado ao carrinho!`, {
            description: 'Edição digital · fica na sua biblioteca quando o pagamento for confirmado',
          });
        }
        resolve();
        return;
      }

      if (variant.manage_inventory) {
        const existingItem = cartItems.find((item) => item.variant.id === variant.id);
        const currentCartQuantity = existingItem ? existingItem.quantity : 0;
        if (currentCartQuantity + quantity > effectiveAvailable) {
          const errMsg = `Stock insuficiente para "${product.title}". Apenas ${effectiveAvailable} unidade${effectiveAvailable !== 1 ? 's' : ''} disponíve${effectiveAvailable !== 1 ? 'is' : 'l'}.`;
          if (!silent) {
            toast.error(errMsg);
          }
          reject(new Error(errMsg));
          return;
        }
      }

      setCartItems((prevItems) => {
        const existingItem = prevItems.find((item) => item.variant.id === variant.id);
        if (existingItem) {
          return prevItems.map((item) =>
            item.variant.id === variant.id
              ? { ...item, quantity: item.quantity + quantity }
              : item,
          );
        }
        return [...prevItems, { product, variant, quantity }];
      });
      
      if (!silent) {
        // `variant.name` não existe: as variantes têm `title` (ver `bookToProduct`). O `||`
        // caía sempre no texto fixo, por isso juntar uma t-shirt em M dizia "1x · Edição
        // Standard" — nome errado e palavra errada, que o achado 47 já tinha corrigido
        // noutros sítios. O `cartVariantLabel` dá "M · Azul" e devolve vazio na variante
        // única, que não tem nome nenhum para dizer.
        const etiqueta = cartVariantLabel(variant);
        toast.success(`"${product.title}" adicionado ao carrinho!`, {
          description: etiqueta ? `${quantity}× · ${etiqueta}` : `${quantity}×`,
        });
      }
      resolve();
    });
  }, [cartItems]);

  // Tirar um livro deixa anular durante uns segundos (um toque fora do sítio no telemóvel
  // tirava-o de vez, e era preciso voltar a procurá-lo): volta com a mesma quantidade e para
  // o mesmo lugar da lista. O aviso sai fora da actualização do estado — dentro dela corria
  // duas vezes no modo estrito do React.
  const removeFromCart = useCallback((variantId) => {
    const index = cartItems.findIndex((i) => i.variant.id === variantId);
    const item = index >= 0 ? cartItems[index] : null;
    setCartItems((prevItems) => prevItems.filter((i) => i.variant.id !== variantId));
    if (!item) return;
    toast(`"${item.product.title}" saiu do carrinho.`, {
      duration: 6000,
      action: {
        label: 'Anular',
        onClick: () => setCartItems((prevItems) => {
          if (prevItems.some((i) => i.variant.id === variantId)) return prevItems;
          const next = [...prevItems];
          next.splice(Math.min(index, next.length), 0, item);
          return next;
        }),
      },
    });
  }, [cartItems]);

  const updateQuantity = useCallback((variantId, quantity) => {
    setCartItems((prevItems) =>
      prevItems.map((item) => {
        if (item.variant.id !== variantId) return item;
        if (item.variant.digital === true) return item.quantity === 1 ? item : { ...item, quantity: 1 };
        const max = item.variant.manage_inventory ? (item.variant.inventory_quantity ?? 99) : 99;
        const safeQty = Math.max(1, Math.min(quantity, max));
        return { ...item, quantity: safeQty };
      }),
    );
  }, []);

  /**
   * Confirma o carrinho com a base de dados: livros ocultos, apagados ou esgotados saem;
   * preço, promoção e stock são actualizados; a quantidade não passa do stock.
   * Devolve a lista de mudanças (para avisar o cliente). As edições extra (`<id>-v<n>`, tamanhos e
   * edições em `versions`) também: antes guardavam o preço de quando entraram no carrinho, e o
   * cliente via um preço e pagava outro (o `place_order` cobra o actual, com `variantPrices`).
   */
  const refreshCart = useCallback(async () => {
    const ids = [...new Set(cartItems.map((i) => bookIdOf(i.variant.id)).filter(Boolean))];
    if (!ids.length) return [];
    const { data, error } = await supabase
      .from('stock_books')
      .select('*')
      .in('id', ids);
    if (error) return [];
    const byId = Object.fromEntries((data || []).filter((b) => b.active !== false).map((b) => [b.id, b]));
    const changes = [];
    // O resultado é por linha (id da variante) e aplica-se ao carrinho de AGORA, não ao de antes da
    // leitura: com rede lenta, quem tirava um livro ou mudava a quantidade enquanto isto corria
    // via o livro voltar, ou a quantidade antiga, quando a resposta chegava.
    const updates = new Map(); // id da variante → null (sai) ou { variant, stock }
    let changed = false;
    for (const item of cartItems) {
      const book = byId[bookIdOf(item.variant.id)];
      const title = item.product.title;
      if (!book) { changes.push(`"${title}" já não está disponível e saiu do carrinho.`); updates.set(item.variant.id, null); continue; }
      let stock = Math.max(0, Number(book.stock) || 0);
      const extra = /-v(\d+)$/.exec(item.variant.id);
      const version = extra && Array.isArray(book.versions) ? book.versions[Number(extra[1])] : null;
      if (extra && !version) { changes.push(`A edição escolhida de "${title}" já não existe e saiu do carrinho.`); updates.set(item.variant.id, null); continue; }
      // Entrou sem variante (pelo cartão, antes desta regra) num produto que passou a ter: o
      // servidor recusa-o, por isso sai já, com o aviso do que falta.
      if (!extra && needsVariantChoice(book)) {
        changes.push(`"${title}" saiu do carrinho: ${variantNames(book.product_type, book.versions).ask} na página do produto.`);
        updates.set(item.variant.id, null);
        continue;
      }
      // Edição digital: sem stock e uma só (migração edicoes_digitais). Se o painel deixar de a
      // marcar como digital, volta às regras do stock.
      const digital = isDigitalEdition(book, variantIndexOf(item.variant.id));
      // Stock próprio da edição, quando o painel o regista (o servidor recusa acima dele).
      if (version && /^\s*-?\d+(\.\d+)?\s*$/.test(String(version.stock ?? ''))) {
        stock = Math.min(stock, Math.max(0, Math.floor(Number(version.stock))));
      }
      if (digital) stock = 1;
      if (stock === 0) { changes.push(`"${title}" esgotou e saiu do carrinho.`); updates.set(item.variant.id, null); continue; }
      const variant = { ...item.variant, inventory_quantity: stock, manage_inventory: !digital, digital };
      if (version) {
        const { price, sale } = variantPrices(book, version);
        const priceInCents = Math.round(price * 100);
        const saleInCents = sale != null ? Math.round(sale * 100) : null;
        const before = item.variant.sale_price_in_cents ?? item.variant.price_in_cents;
        const after = saleInCents ?? priceInCents;
        variant.price_in_cents = priceInCents;
        variant.price_formatted = formatCurrency(priceInCents);
        variant.sale_price_in_cents = saleInCents;
        variant.sale_price_formatted = saleInCents != null ? formatCurrency(saleInCents) : null;
        if (before !== after) changes.push(`O preço de "${title}" mudou para ${formatCurrency(after)}.`);
      }
      if (item.variant.id.endsWith('-default')) {
        const priceInCents = Math.round((Number(book.price) || 0) * 100);
        const saleInCents = isSaleActive(book) ? Math.round(effectivePrice(book) * 100) : null;
        const before = item.variant.sale_price_in_cents ?? item.variant.price_in_cents;
        const after = saleInCents ?? priceInCents;
        variant.price_in_cents = priceInCents;
        variant.price_formatted = formatCurrency(priceInCents);
        variant.sale_price_in_cents = saleInCents;
        variant.sale_price_formatted = saleInCents != null ? formatCurrency(saleInCents) : null;
        if (before !== after) changes.push(`O preço de "${title}" mudou para ${formatCurrency(after)}.`);
      }
      const quantity = Math.min(item.quantity, stock);
      if (quantity < item.quantity && !digital) changes.push(`Só há ${stock} unidade(s) de "${title}"; a quantidade foi ajustada.`);
      // O painel marcou (ou desmarcou) a edição como digital: grava-se, mesmo sem aviso a dar.
      if (item.variant.digital !== digital) changed = true;
      updates.set(item.variant.id, { variant, stock });
    }
    if (changes.length || changed) {
      setCartItems((prev) => prev.flatMap((item) => {
        if (!updates.has(item.variant.id)) return [item]; // entrou depois da leitura: fica como está
        const update = updates.get(item.variant.id);
        if (!update) return [];
        return [{ ...item, variant: update.variant, quantity: Math.min(item.quantity, update.stock) }];
      }));
    }
    return changes;
  }, [cartItems]);

  const clearCart = useCallback(() => {
    setCartItems([]);
    // Gravado já, e não só no efeito acima: depois de uma compra o carrinho esvazia e a página
    // muda logo para /success. O efeito corre depois do próximo desenho, e quando a página nova
    // chegava primeiro, os livros acabados de comprar continuavam no carrinho — à vista no
    // cabeçalho da página de sucesso, prontos para serem encomendados outra vez. Apanhado
    // pelo teste de ponta a ponta (e2e/compra.spec.js).
    try {
      localStorage.setItem(CART_STORAGE_KEY, '[]');
    } catch {
      // armazenamento bloqueado: não havia carrinho guardado para esvaziar
    }
    toast.success('Carrinho limpo com sucesso.');
  }, []);

  const getCartTotalCents = useCallback(() => {
    return cartItems.reduce((total, item) => {
      const price = item.variant.sale_price_in_cents ?? item.variant.price_in_cents;
      return total + price * item.quantity;
    }, 0);
  }, [cartItems]);

  const getCartTotal = useCallback(() => {
    if (cartItems.length === 0) return formatCurrency(0);
    return formatCurrency(getCartTotalCents(), cartItems[0].variant.currency_info);
  }, [cartItems, getCartTotalCents]);

  const getCartCount = useCallback(() => {
    return cartItems.reduce((sum, item) => sum + item.quantity, 0);
  }, [cartItems]);

  // Pre-calculated values for reactive accessibility
  const cartCount = useMemo(() => getCartCount(), [getCartCount]);
  const cartTotalCents = useMemo(() => getCartTotalCents(), [getCartTotalCents]);
  const cartTotal = useMemo(() => getCartTotal(), [getCartTotal]);
  const cartTotalAmount = useMemo(() => cartTotalCents / 100, [cartTotalCents]);
  // Edições digitais no carrinho: só digitais (sem envio), alguma (precisa de conta), o subtotal
  // do que se envia (os portes contam só isso).
  const cartDigital = useMemo(() => cartDigitalState(cartItems), [cartItems]);

  const value = useMemo(() => ({
    cartItems,
    addToCart,
    removeFromCart,
    updateQuantity,
    clearCart,
    refreshCart,
    getCartTotal,
    getCartTotalCents,
    getCartCount,
    cartCount,
    cartTotalCents,
    cartTotal,
    cartTotalAmount,
    cartDigital,
  }), [
    cartItems,
    addToCart,
    removeFromCart,
    updateQuantity,
    clearCart,
    refreshCart,
    getCartTotal,
    getCartTotalCents,
    getCartCount,
    cartCount,
    cartTotalCents,
    cartTotal,
    cartTotalAmount,
    cartDigital,
  ]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};

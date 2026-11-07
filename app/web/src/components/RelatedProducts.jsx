import React, { useEffect, useState } from 'react';
import ProductRail from '@/components/home/ProductRail';
import { getProducts } from '@/api/EcommerceApi';
import { getRecentlyViewed } from '@/lib/recentlyViewed';
import { buildInterest, relatedProducts, relationLabel } from '@/lib/discovery';
import { useWishlist } from '@/hooks/useWishlist';
import { useCart } from '@/hooks/useCart';

/**
 * "Quem leu este, procurou também": produtos parecidos com **este**, na ficha dele.
 *
 * A ficha tinha só duas prateleiras: "Vistos recentemente" (o histórico da pessoa) e "Também
 * lhe pode interessar", que é o catálogo inteiro por ordem de descoberta. Faltava a resposta
 * à pergunta que se faz em frente a um livro: *e o que é parecido com este?* É a prateleira
 * que mais vende numa livraria, porque quem está a ver o primeiro volume de uma colecção
 * quer o segundo.
 *
 * O critério está em `lib/discovery.js`: mesma colecção primeiro, depois mesmo autor, depois
 * mesmo género, com a faixa de preço a desempatar. O gosto da pessoa (carrinho, desejos,
 * vistos) só reordena dentro do mesmo grau de semelhança — não troca "da mesma colecção" por
 * "um livro de saúde que ela viu ontem".
 *
 * O catálogo só é pedido quando a prateleira se aproxima do ecrã: na ficha de um livro, a
 * prioridade é a capa, o preço e o botão de comprar.
 */
export default function RelatedProducts({ product, onCartOpen, onQuickView }) {
  const [catalog, setCatalog] = useState(null);
  const { wishlist } = useWishlist();
  const { cartItems } = useCart();

  useEffect(() => {
    if (!product?.id) return undefined;
    let activo = true;
    getProducts({})
      .then(({ products }) => { if (activo) setCatalog(products || []); })
      .catch(() => { if (activo) setCatalog([]); });
    return () => { activo = false; };
  }, [product?.id]);

  if (!product?.id || !catalog?.length) return null;

  // `bookId` na lista de desejos e o id do livro dentro do id da variante no carrinho
  // (`<livro>-default`, `<livro>-v2`): é o livro que diz algo sobre o gosto, não a edição.
  const interest = buildInterest(
    {
      recent: getRecentlyViewed(),
      wishlist: (wishlist || []).map((w) => w?.bookId || w?.id).filter(Boolean),
      cart: (cartItems || [])
        .map((item) => String(item?.variant?.id || '').replace(/-(default|v\d+)$/, ''))
        .filter(Boolean),
    },
    catalog,
  );
  const relacionados = relatedProducts(product, catalog, { limit: 12, interest });
  if (relacionados.length === 0) return null;

  // A razão da semelhança do primeiro da fila explica a prateleira inteira: "Mesma colecção"
  // diz muito mais do que "Produtos relacionados".
  const razao = relationLabel(relacionados[0], product);

  return (
    <div className="border-t border-border bg-muted/20">
      <ProductRail
        id="relacionados"
        title="Quem leu este, procurou também"
        description={razao ? `A começar pelos da mesma área — ${razao.toLowerCase()}` : 'Do mesmo autor, colecção ou género'}
        products={relacionados}
        shopLink={`/shop?category=${encodeURIComponent(product.type?.value || '')}`}
        onCartOpen={onCartOpen}
        onQuickView={onQuickView}
      />
    </div>
  );
}

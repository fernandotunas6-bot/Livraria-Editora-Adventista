import React, { useEffect, useState } from 'react';
import { FileDown } from 'lucide-react';
import DownloadItem from '@/components/downloads/DownloadItem';
import { loadDownloads } from '@/lib/downloadsApi';
import { useAuth } from '@/hooks/useAuth';

/**
 * PDFs ligados a este produto, na ficha. Sem nenhum (ou sem a migração), não mostra nada.
 * `product` serve para dizer que variante dá acesso a um PDF pago.
 */
export default function ProductDownloads({ productId, product = null }) {
  const { user } = useAuth();
  const [items, setItems] = useState([]);

  useEffect(() => {
    let alive = true;
    if (!productId) return undefined;
    // Com outra sessão, o can_download muda: por isso depende também do utilizador.
    loadDownloads({ bookId: productId })
      .then((rows) => { if (alive) setItems(rows); })
      .catch(() => { if (alive) setItems([]); });
    return () => { alive = false; };
  }, [productId, user?.id]);

  if (!items.length) return null;
  return (
    <section aria-labelledby="pdfs-do-produto" className="mb-4 rounded-xl border border-dashed p-3">
      <h2 id="pdfs-do-produto" className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <FileDown className="h-4 w-4 text-primary" /> PDFs deste produto
      </h2>
      <ul className="space-y-2">
        {items.map((item) => <DownloadItem key={item.id} item={item} product={product} compact />)}
      </ul>
    </section>
  );
}

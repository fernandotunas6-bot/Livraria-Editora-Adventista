import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import DownloadItem from '@/components/downloads/DownloadItem';
import { loadDownloads } from '@/lib/downloadsApi';

/** Perfil → PDFs: os materiais pagos que esta conta já pode descarregar (compras pagas). */
export default function MyDownloads({ userId }) {
  const [items, setItems] = useState(null);

  useEffect(() => {
    let alive = true;
    loadDownloads()
      .then((rows) => { if (alive) setItems(rows.filter((r) => r.access === 'paid' && r.can_download)); })
      .catch(() => { if (alive) setItems([]); });
    return () => { alive = false; };
  }, [userId]);

  if (items === null) return <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  return (
    <div className="space-y-4">
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          Ainda não tem PDFs comprados. Os PDFs aparecem aqui quando a encomenda do produto estiver paga.
        </p>
      ) : (
        <ul className="space-y-3">{items.map((item) => <DownloadItem key={item.id} item={item} />)}</ul>
      )}
      <p className="text-sm text-muted-foreground">
        Os gratuitos estão em <Link to="/materiais" className="text-primary hover:underline">Materiais</Link>.
      </p>
    </div>
  );
}

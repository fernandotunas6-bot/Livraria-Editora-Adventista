import React from 'react';
import { FileCheck2, ExternalLink } from 'lucide-react';
import { CodigoQr } from '@/pages/AppDownloadPage';

/**
 * A factura do KanGest de uma encomenda (e a nota de crédito, se foi reembolsada): o número do documento e o código
 * QR da AGT, para o cliente confirmar a factura no portal da AGT (docs/KANGEST.md).
 */
export default function FacturaKanGest({ factura, notaCredito }) {
  if (!factura && !notaCredito) return null;
  const docs = [factura && { rotulo: 'Factura/Recibo', ...factura }, notaCredito && { rotulo: 'Nota de crédito', ...notaCredito }].filter(Boolean);
  return (
    <div className="rounded-2xl border bg-card p-5">
      <p className="mb-3 flex items-center gap-2 text-sm font-semibold"><FileCheck2 className="h-4 w-4 text-[#0a748f]" />Documentos fiscais</p>
      <div className="flex flex-wrap gap-5">
        {docs.map((d) => (
          <div key={d.numero} className="flex items-center gap-3">
            {d.url_agt && <CodigoQr texto={d.url_agt} className="h-20 w-20 ring-1 ring-black/10" />}
            <div className="text-sm">
              <p className="text-xs text-muted-foreground">{d.rotulo}</p>
              <p className="font-mono font-semibold">{d.numero}</p>
              {d.url_agt && (
                <a href={d.url_agt} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-[#0a748f] hover:underline">
                  Confirmar na AGT <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

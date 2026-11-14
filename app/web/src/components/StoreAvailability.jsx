import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Store } from 'lucide-react';
import { getPhysicalStores } from '@/api/PlatformApi';
import { cidadeDaLoja, juntarNomes, provinciasServidas } from '@/lib/stores';
import { lojasComProduto, marcasDosProdutos } from '@/lib/storeStock';

/** «Lubango (Huíla, Namibe e Cunene)»; «Huambo», quando a loja só serve a sua própria terra. */
export function lojaComZonas(loja) {
  const nome = cidadeDaLoja(loja) || loja.name;
  const zonas = provinciasServidas(loja);
  const soAPropria = zonas.length === 1 && zonas[0].localeCompare(nome, 'pt', { sensitivity: 'base' }) === 0;
  return zonas.length && !soAPropria ? `${nome} (${juntarNomes(zonas)})` : nome;
}

/**
 * Na página do produto: as lojas que marcaram «temos» neste produto (painel → Disponibilidade nas
 * lojas; migração lojas_donas_dos_dados), com as províncias que cada uma serve — para o cliente
 * saber de que loja compra. Sem nenhuma marcada (ou antes de as lojas marcarem) fica a linha de
 * sempre. «Não temos» e «por marcar» não aparecem: o cliente vê só onde há.
 */
export default function StoreAvailability({ bookId }) {
  const [lojas, setLojas] = useState([]);

  useEffect(() => {
    if (!bookId) return undefined;
    let vivo = true;
    setLojas([]);
    Promise.all([marcasDosProdutos([bookId]), getPhysicalStores()])
      .then(([marcas, todas]) => { if (vivo) setLojas(lojasComProduto(marcas, todas || [])); })
      .catch(() => { /* sem a informação, fica a linha de sempre */ });
    return () => { vivo = false; };
  }, [bookId]);

  return (
    <li className="flex items-start gap-2.5">
      <Store className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      {lojas.length > 0 ? (
        <span>
          <strong className="font-medium text-foreground">Disponível nas lojas:</strong>{' '}
          <span className="text-muted-foreground">{lojas.map(lojaComZonas).join(' · ')}.</span>{' '}
          <Link to="/lojas" className="text-primary underline underline-offset-2 hover:no-underline">Ver moradas</Link>
        </span>
      ) : (
        <span><strong className="font-medium text-foreground">Levantamento nas lojas,</strong> <Link to="/lojas" className="text-primary underline underline-offset-2 hover:no-underline">ver moradas</Link>.</span>
      )}
    </li>
  );
}

// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { MonitorUp, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabaseClient';
import { kangestEnderecosWeb, kangestRepetir } from '@/api/PlatformApi';
import { destinoDaEncomenda, ligacaoDoPrograma, ligacaoPeloServidor, postoParaAbrir } from '@/lib/kangestServidor';
import { cn } from '@/lib/utils';

const NOMES = { ne: 'Nota de encomenda', fr: 'Factura/Recibo', anular: 'Anulação da NE', nc: 'Nota de crédito' };
const ESTADOS = {
  feito: ['Feito', 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'],
  pendente: ['Na fila', 'bg-amber-500/10 text-amber-700 dark:text-amber-400'],
  erro: ['Erro', 'bg-red-500/10 text-red-700 dark:text-red-400'],
  ignorado: ['Não vai', 'bg-muted text-muted-foreground'],
};

// os servidores das lojas: pedidos uma vez por página (mudam pouco); um erro deixa a ligação kangest://
let servidores = null;
const servidoresDasLojas = () => {
  servidores ??= kangestEnderecosWeb().then((r) => r?.postos || []).catch(() => { servidores = null; return []; });
  return servidores;
};

/**
 * Os documentos do KanGest de uma encomenda (public.kangest_da_encomenda): a NE, a FR, a anulação e a nota de
 * crédito, com o número e o estado; um documento com erro repete-se daqui (docs/KANGEST.md). Quem entra no KanGest
 * (as permissões «KanGest: caixa» ou «gestor») tem também «Abrir no KanGest», que abre a encomenda no ecrã da Loja online:
 * - **automático:** pelo servidor da loja (o modo web do KanGest, http://IP-DA-LOJA:7799), sem a pergunta do navegador;
 * - **ao lado:** «no programa» abre o KanGest deste computador pela ligação kangest://, como antes. Sem servidor, é a
 *   única.
 * A ligação só leva ao ecrã, não faz nada sozinha, e o KanGest pede a entrada.
 */
export default function OrderKanGest({ orderId, loja = null, podeRepetir = false, podeAbrir = false }) {
  const [docs, setDocs] = useState(null);
  const [posto, setPosto] = useState(null);
  useEffect(() => {
    if (!podeAbrir) return undefined;
    let vivo = true;
    servidoresDasLojas().then((l) => { if (vivo) setPosto(postoParaAbrir(l, loja)); });
    return () => { vivo = false; };
  }, [podeAbrir, loja]);
  const destino = destinoDaEncomenda(orderId);
  const pelaLoja = posto ? ligacaoPeloServidor(posto.endereco, destino) : '';
  const carregar = useCallback(async () => {
    const { data, error } = await supabase.rpc('kangest_da_encomenda', { p_order_id: orderId });
    if (!error) setDocs(data || {});
  }, [orderId]);
  useEffect(() => { carregar(); }, [carregar]);
  const ordem = ['ne', 'fr', 'anular', 'nc'].filter((k) => docs?.[k]);
  if (!ordem.length && !podeAbrir) return null;
  async function repetir(id) {
    try {
      await kangestRepetir(id);
      toast.success('Volta a ir para o KanGest no próximo ciclo (até 5 minutos).');
      carregar();
    } catch (e) {
      toast.error(e?.message || 'Não foi possível repetir.');
    }
  }
  return (
    <div className="rounded-lg border bg-muted/30 p-3 text-xs">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="font-semibold">KanGest</p>
        {podeAbrir && pelaLoja && (
          <span className="inline-flex items-center gap-2">
            <a
              href={pelaLoja}
              target="_blank"
              rel="noopener noreferrer"
              title={`Abre esta encomenda no KanGest pelo servidor da loja (${posto.nome}, ${posto.endereco}). Funciona na rede da loja.`}
              className="inline-flex items-center gap-1 font-medium text-[#0a748f] hover:underline"
            >
              <MonitorUp className="h-3 w-3" />
              Abrir no KanGest
            </a>
            <a href={ligacaoDoPrograma(destino)} title="Abre no KanGest instalado neste computador" className="text-muted-foreground hover:underline">no programa</a>
          </span>
        )}
        {podeAbrir && !pelaLoja && (
          <a
            href={ligacaoDoPrograma(destino)}
            title="Abre esta encomenda no KanGest Livraria deste computador (tem de estar instalado)"
            className="inline-flex items-center gap-1 font-medium text-[#0a748f] hover:underline"
          >
            <MonitorUp className="h-3 w-3" />
            Abrir no KanGest
          </a>
        )}
      </div>
      {!ordem.length && <p className="text-muted-foreground">Ainda sem documentos do KanGest.</p>}
      <ul className="space-y-1.5">
        {ordem.map((k) => {
          const d = docs[k];
          const [rot, cor] = ESTADOS[d.estado] || ESTADOS.pendente;
          return (
            <li key={k} className="flex flex-wrap items-center gap-2">
              <span className="w-32 text-muted-foreground">{NOMES[k]}</span>
              <span className={cn('rounded-full px-2 py-0.5 font-semibold', cor)}>{rot}</span>
              {d.resultado?.numero && <span className="font-mono font-semibold">{d.resultado.numero}</span>}
              {d.resultado?.fe?.url_consulta && (
                <a href={d.resultado.fe.url_consulta} target="_blank" rel="noopener noreferrer" className="text-[#0a748f] hover:underline">AGT</a>
              )}
              {d.estado === 'erro' && <span className="w-full text-red-700 dark:text-red-400">{d.erro}</span>}
              {d.estado === 'erro' && podeRepetir && d.id && (
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => repetir(d.id)}><RotateCcw className="mr-1 h-3 w-3" />Repetir</Button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

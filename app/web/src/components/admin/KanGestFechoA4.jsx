// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React from 'react';
import { kz, kzNum, pct, qtd } from '@/lib/kangestRecibo';

// O relatório completo de um fecho de caixa (o Z) do KanGest em A4, como o KanGest o imprime
// (app/kangest-sistema/src/components/FechoA4.tsx; pedido do dono a 27/11: «refinar o fecho da caixa com relatórios
// extensivos e arquivar»). Vem do resumo que o posto mandou (kangest_fechos.resumo): sem os nomes dos clientes.

const dataHora = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)} ${s.slice(11, 16)}` : '—');

function Seccao({ titulo, children }) {
  return (
    <div className="mt-3">
      <div className="border-b border-black pb-0.5 text-[11.5px] font-bold">{titulo}</div>
      {children}
    </div>
  );
}

function Tabela({ linhas }) {
  if (!linhas.length) return null;
  return (
    <table className="mt-1 w-full border-collapse">
      <tbody>
        {linhas.map(([k, v, forte], i) => (
          <tr key={`${k}-${i}`} className={forte ? 'font-bold' : ''}>
            <td className="py-px pr-2">{k}</td>
            <td className="whitespace-nowrap py-px text-right">{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Uma tabela com cabeçalhos; as colunas de números (por omissão, as que não são a primeira) à direita. */
function Grelha({ titulo, cab, linhas, numeros }) {
  if (!linhas.length) return null;
  const direita = (i) => (numeros ? numeros.includes(i) : i > 0);
  return (
    <Seccao titulo={titulo}>
      <table className="mt-1 w-full border-collapse">
        <thead>
          <tr className="border-b border-black/40 text-[9.5px] uppercase">
            {cab.map((c, i) => <th key={c} className={`py-px pr-2 font-bold ${direita(i) ? 'text-right' : 'text-left'}`}>{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l, n) => (
            <tr key={n}>
              {l.map((c, i) => <td key={i} className={`py-px pr-2 align-top ${direita(i) ? 'whitespace-nowrap text-right' : ''}`}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </Seccao>
  );
}

/** `f`: a linha de kangest_fechos (com o resumo); `loja`: o nome da loja, para o cabeçalho. */
export default function KanGestFechoA4({ f, loja }) {
  const r = f.resumo || {};
  const s = r.sessao || {};
  const a = r.analise || {};
  const res = a.resumo;
  const contado = f.valor_contado ?? s.valor_contado ?? null;
  const esperado = f.numerario_esperado ?? r.numerario_esperado ?? 0;
  const dif = Number(contado ?? 0) - Number(esperado);
  const online = r.online;
  return (
    <div className="recibo-kangest mx-auto w-[190mm] bg-white p-1 font-sans text-[10.5px] leading-snug text-black">
      <div className="flex items-start justify-between gap-6">
        <div>
          <div className="text-[13px] font-bold">{loja || 'Livraria Adventista'}</div>
          <div>{f.posto || s.posto || 'Posto'}</div>
        </div>
        <div className="text-right">
          <div className="text-[15px] font-bold">FECHO DE CAIXA (Z) N.º {f.numero_z ?? s.numero_z ?? '—'}</div>
          <div>Relatório completo</div>
        </div>
      </div>
      {f.reconstruido && (
        <div className="mt-2 border border-black px-1.5 py-0.5">Reconstruído: este fecho é de antes do arquivo dos fechos e foi refeito com os valores do dia em que se arquivou.</div>
      )}
      <Tabela
        linhas={[
          ['Abertura', dataHora(f.aberta_em)],
          ['Fecho', dataHora(f.fechada_em)],
          ['Operador', f.operador || s.utilizador || '—'],
          ...(f.fechado_por && f.fechado_por !== f.operador ? [['Fechado por', f.fechado_por]] : []),
        ]}
      />

      <div className="mt-1 grid grid-cols-2 gap-6">
        <Seccao titulo="Recebimentos por forma de pagamento">
          <Tabela linhas={(r.por_modo || []).filter((m) => Number(m.total) !== 0).map((m) => [m.descricao, kz(m.total)])} />
        </Seccao>
        <Seccao titulo="Gaveta">
          <Tabela
            linhas={[
              [`Total de ${r.documentos ?? 0} documento(s)`, kz(f.total_vendido), true],
              ['Fundo de maneio', kz(s.valor_inicial)],
              ['Entradas', kz(r.entradas)],
              ['Saídas', kz(r.saidas)],
              ['Numerário esperado', kz(esperado), true],
              ...(r.moedas_estrangeiras || []).map((m) => [`Em ${m.moeda} (na gaveta)`, `${kzNum(m.valor)} ${m.moeda}`]),
              ['Valor físico', contado === null ? '—' : kz(contado), true],
              ...(contado !== null ? [[dif < 0 ? 'Diferença (falta)' : dif > 0 ? 'Diferença (sobra)' : 'Diferença', kz(dif), true]] : []),
            ]}
          />
        </Seccao>
      </div>

      {s.contagem && typeof s.contagem === 'object' && Object.keys(s.contagem).length > 0 && (
        <Seccao titulo="Contagem do numerário">
          <Tabela
            linhas={Object.entries(s.contagem)
              .sort(([x], [y]) => Number(y) - Number(x))
              .map(([d, q]) => [`${Number(d).toLocaleString('pt-PT')} Kz × ${q}`, kz(Number(d) * 100 * Number(q))])}
          />
        </Seccao>
      )}
      {(r.conferencia || []).some((c) => c.codigo !== 'NU' && c.contado !== null) && (
        <Seccao titulo="Conferência (contado − sistema)">
          <Tabela linhas={(r.conferencia || []).filter((c) => c.codigo !== 'NU' && c.contado !== null).map((c) => [`${c.descricao}: ${kz(c.contado)}`, kz(c.diferenca), c.diferenca !== 0])} />
        </Seccao>
      )}
      {s.observacoes && <div className="mt-2">Obs.: {s.observacoes}</div>}

      {res && (
        <Seccao titulo="Resumo das vendas">
          <Tabela
            linhas={[
              ['Vendas', String(res.vendas)],
              ['Valor vendido', kz(res.vendido), true],
              ...(res.vendas > 0 ? [['Valor médio por venda', kz(Math.trunc(res.vendido / res.vendas))]] : []),
              ...(res.devolucoes > 0 ? [[`Devoluções (${res.devolucoes})`, kz(res.devolvido)]] : []),
              ...(res.com_desconto > 0 ? [[`Descontos (${res.com_desconto} venda(s))`, kz(res.descontos)]] : []),
              ...(res.primeira ? [['Primeira venda', dataHora(res.primeira)], ['Última venda', dataHora(res.ultima)]] : []),
            ]}
          />
        </Seccao>
      )}
      <div className="grid grid-cols-2 gap-6">
        <Grelha titulo="Por tipo de documento" cab={['Tipo', 'Docs', 'Anul.', 'Total']} linhas={(a.por_tipo || []).map((x) => [`${x.codigo} ${x.descricao}`, String(x.documentos), String(x.anulados), kz(x.total)])} />
        <Grelha titulo="Por operador" cab={['Operador', 'Docs', 'Total']} linhas={(a.por_operador || []).map((x) => [x.nome, String(x.documentos), kz(x.total)])} />
        <Grelha titulo="Por hora" cab={['Hora', 'Docs', 'Total']} linhas={(a.por_hora || []).map((x) => [`${x.hora}h`, String(x.documentos), kz(x.total)])} />
        <Grelha titulo="Por família" cab={['Família', 'Qtd.', 'Total']} linhas={(a.por_familia || []).map((x) => [x.familia, qtd(x.quantidade), kz(x.total)])} />
        <Grelha titulo="IVA por taxa" cab={['Taxa', 'Incidência', 'Imposto']} linhas={(a.iva || []).map((x) => [x.motivo_isencao ? `Isento (${x.motivo_isencao})` : `IVA ${pct(x.taxa)}`, kz(x.base), kz(x.iva)])} />
        <Grelha titulo="Documentos anulados" cab={['Documento', 'Hora', 'Motivo', 'Total']} numeros={[3]} linhas={(a.anulados || []).map((x) => [x.numero_doc, String(x.data_hora || '').slice(11, 16), x.motivo, kz(x.total)])} />
      </div>

      <Grelha titulo="Artigos vendidos" cab={['Referência', 'Descrição', 'Qtd.', 'Total']} numeros={[2, 3]} linhas={(r.artigos || []).map((l) => [l.referencia, l.descricao, qtd(l.quantidade), kz(l.total)])} />
      <Grelha
        titulo="Documentos da sessão"
        cab={['Documento', 'Hora', 'Pagamento', 'Total']}
        numeros={[3]}
        linhas={(r.documentos_lista || []).map((d) => [`${d.numero_doc}${d.estado === 'A' ? ' (anulado)' : ''}`, String(d.data_hora || '').slice(11, 16), d.pagamento || '', kz(d.total)])}
      />
      <Grelha
        titulo="Movimentos de caixa"
        cab={['Data', 'Vale', 'Total']}
        linhas={(r.movimentos || []).map((m) => [dataHora(m.data_hora), `Vale n.º ${m.id} — ${m.descricao || ''}`, kz(m.tipo === 'SAIDA' ? -m.valor : m.valor)])}
      />
      {online?.incluidas && (online.quantidade || 0) > 0 && (
        <div className="mt-3 rounded border border-black px-2 pb-1">
          <Grelha
            titulo="Vendas online (fora da gaveta)"
            cab={['Venda', 'Pagamento', 'Total']}
            linhas={[
              ...(online.documentos || []).map((d) => [d.numero_doc, d.pagamento || '', kz(d.total)]),
              ...(online.encomendas || []).map((d) => [`Encomenda ${d.numero}`, `${d.pagamento || ''}${d.na_entrega ? ' (na entrega)' : ''}`, kz(d.total)]),
            ]}
          />
          <Tabela linhas={[[`Total online (${online.quantidade} venda(s))`, kz(online.total ?? 0), true]]} />
        </div>
      )}
      <div className="mt-4 break-all border-t border-black pt-1 text-[9px]">
        Arquivado no KanGest{f.selo ? ` · selo SHA-256 do arquivo: ${f.selo}` : ''}{f.recebido_em ? ` · recebido no site a ${new Date(f.recebido_em).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' })}` : ''}
      </div>
    </div>
  );
}

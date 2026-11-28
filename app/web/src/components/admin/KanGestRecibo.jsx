// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { Fragment } from 'react';
import {
  MOTIVO_TXT, consumidorFinal, data, ehRecibo, extenso, hora, kzNum, local, naoServeFactura, nomeDoDocumento, pagamentosEntregues, pct, qtd,
  rodapeAgt,
} from '@/lib/kangestRecibo';

// Os documentos do KanGest como o KanGest os imprime: o talão de 80 mm (Ticket) e o A4 (A4), copiados de
// app/kangest-sistema/src/components/DocumentoPrint.tsx. Preto sobre branco, em Arial, também no modo escuro do
// painel: é o papel. `d` vem de montarDocumento (lib/kangestRecibo.js).

const ARIAL = { fontFamily: 'Arial, Helvetica, sans-serif' };

/** O logótipo da empresa, só se for uma imagem (a fotografia das configurações marca os ficheiros grandes). */
const logoDe = (e) => (typeof e?.logo === 'string' && /^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,/i.test(e.logo) ? e.logo : '');
const nifTexto = (nif) => (consumidorFinal(nif) ? 'Consumidor Final' : nif);

function Linha({ k, v }) {
  return (
    <div className="flex justify-between">
      <span>{k}</span>
      <span>{v}</span>
    </div>
  );
}

/**
 * O talão para a impressora térmica de 80 mm: curto e fácil de ler, com tudo o que a AGT exige. A empresa, o
 * documento, a data e a hora, o cliente (o NIF só quando o tem), cada linha com a descrição e o total e, por baixo,
 * quantidade × preço sem IVA, taxa e desconto; os totais, o que se pagou e o troco; o IVA por taxa só quando há mais
 * de uma taxa ou isenções; a certificação.
 */
export function Talao({ d, via = 'Original', reimpressao }) {
  const doc = d.documento;
  const e = d.empresa || {};
  const recibo = ehRecibo(doc.classe);
  const segunda = via.startsWith('2.ª');
  const consumidor = consumidorFinal(doc.entidade_nif);
  const resumo = d.resumo_iva;
  const umaTaxa = resumo.length === 1 && !resumo[0].motivo_isencao;
  const corte = 'mt-1.5 border-t border-dashed border-black pt-1';
  const morada = [e.endereco, e.localidade || e.provincia].filter(Boolean).join(', ');
  const pago = pagamentosEntregues(d);
  const logo = logoDe(e);
  const rodape = rodapeAgt(doc);
  return (
    <div className="recibo-kangest mx-auto w-[300px] bg-white p-3 text-[11px] leading-[1.3] text-black" style={ARIAL} data-ficheiro={nomeDoDocumento(d)}>
      <div className="text-right font-bold">{via}</div>
      <div className="text-center">
        {logo && <img src={logo} alt="" className="mx-auto mb-1 max-h-12 max-w-[160px] object-contain grayscale" />}
        <div className="text-[13px] font-bold leading-tight">{e.designacao_comercial || e.nome}</div>
        {e.designacao_comercial && e.designacao_comercial !== e.nome && <div>{e.nome}</div>}
        {morada && <div>{morada}</div>}
        <div>NIF {e.nif || '—'}{e.telefone ? ` · Tel. ${e.telefone}` : ''}</div>
      </div>
      {segunda && <div className="mt-1 text-center font-bold">2.ª via em conformidade com o original</div>}

      <div className={corte}>
        <div className="flex items-baseline justify-between gap-2 font-bold">
          <span>{doc.tipo_desc}</span>
          <span className="text-[12px]">{doc.numero_doc}</span>
        </div>
        <div>{data(doc.data_emissao)} {hora(doc.data_hora)}</div>
        <div>Cliente: {consumidor ? 'Consumidor final' : doc.entidade_nome}</div>
        {!consumidor && <div>NIF {doc.entidade_nif}</div>}
        {doc.doc_origem && <div>Ref.: {doc.doc_origem}</div>}
        {doc.motivo && <div>Motivo: {doc.motivo}</div>}
        {doc.data_vencimento && doc.data_vencimento.slice(0, 10) !== String(doc.data_emissao).slice(0, 10) && !recibo && (
          <div>{doc.classe === 'PROFORMA' ? 'Válido até' : 'Vencimento'}: {data(doc.data_vencimento)}</div>
        )}
        {naoServeFactura(doc.classe) && <div className="text-center">Este documento não serve de factura</div>}
        {doc.estado === 'A' && <div className="text-center font-bold">*** DOCUMENTO ANULADO ***</div>}
      </div>

      {!recibo && (
        <div className={corte}>
          {d.linhas.map((l) => (
            <div key={l.id} className="mb-0.5">
              <div className="flex justify-between gap-2">
                <span className="min-w-0">{l.descricao}</span>
                <span className="shrink-0">{kzNum(l.total)}</span>
              </div>
              <div className="pl-2 text-[0.9em]">
                {qtd(l.quantidade)} {l.unidade} × {kzNum(l.preco_unitario)} · IVA {pct(l.taxa_iva_pct)}
                {l.motivo_isencao ? ` (${l.motivo_isencao})` : ''}
                {Number(l.desconto_pct) ? ` · desc. ${pct(l.desconto_pct)}` : ''}
                {l.lote ? ` · lote ${l.lote}` : ''}
              </div>
            </div>
          ))}
        </div>
      )}
      {recibo && (
        <div className={corte}>
          {d.liquidacoes.map((l, i) => (
            <div key={`${l.numero_doc}-${i}`} className="flex justify-between gap-2">
              <span>{l.numero_doc} · {data(l.data_emissao)}</span>
              <span>{kzNum(l.valor)}</span>
            </div>
          ))}
        </div>
      )}

      <div className={corte}>
        {!recibo && (
          <>
            {doc.total_desconto > 0 && <Linha k="Desconto" v={`−${kzNum(doc.total_desconto)}`} />}
            <Linha k="Total sem IVA" v={kzNum(doc.total_liquido)} />
            <Linha k={umaTaxa ? `IVA ${pct(resumo[0].taxa)}` : 'IVA'} v={kzNum(doc.total_iva)} />
          </>
        )}
        <div className="flex justify-between text-[15px] font-bold">
          <span>{recibo ? 'Recebido' : 'TOTAL'} ({doc.moeda || 'AOA'})</span>
          <span>{kzNum(doc.total)}</span>
        </div>
        {pago.map((p) => <Linha key={p.chave} k={p.descricao} v={kzNum(p.valor)} />)}
        {doc.troco > 0 && <Linha k="Troco" v={kzNum(doc.troco)} />}
      </div>

      {!recibo && !umaTaxa && resumo.length > 0 && (
        <div className={`${corte} text-[0.9em]`}>
          {resumo.map((r) => (
            <div key={`${r.taxa}${r.motivo_isencao}`} className="flex justify-between gap-2">
              <span>
                {r.motivo_isencao ? `Isento ${r.motivo_isencao} ${MOTIVO_TXT[r.motivo_isencao] ?? ''}`.trim() : `IVA ${pct(r.taxa)}`} s/ {kzNum(r.base)}
              </span>
              <span>{kzNum(r.iva)}</span>
            </div>
          ))}
        </div>
      )}

      <div className={`${corte} text-center text-[0.9em]`}>
        {rodape && <div>{rodape}</div>}
        {doc.classe === 'VENDA' && <div>Bens/serviços colocados à disposição na data e local do documento.</div>}
        <div>Emitido por {doc.utilizador || '—'}{doc.data_hora ? ` em ${data(doc.data_emissao)} ${hora(doc.data_hora)}` : ''}</div>
        {reimpressao && <div>{reimpressao}</div>}
        {doc.classe === 'PROFORMA' && (e.bancos || []).map((b) => <div key={b.iban}>{b.banco}: {b.iban}</div>)}
        {doc.texto_rodape && <div>{doc.texto_rodape}</div>}
        <div className="mt-1 text-[1.1em] font-medium">{e.rodape || 'Obrigado e volte sempre!'}</div>
      </div>
    </div>
  );
}

function Seccao({ titulo, children }) {
  return (
    <div className="mt-2">
      <div className="border-b border-black text-[8.5px] font-bold uppercase">{titulo}</div>
      {children}
    </div>
  );
}

/**
 * O documento em A4, com o desenho dos modelos do KIGEST que o KanGest usa: o logótipo e a empresa à esquerda; o n.º do
 * documento e «Exmo(s) Senhor(es)» à direita; a faixa com o contribuinte, as datas e a origem; as linhas; e no fundo
 * o resumo do imposto, o método de pagamento e as coordenadas bancárias à esquerda e os totais à direita.
 */
export function FolhaA4({ d, via = 'Original', reimpressao }) {
  const doc = d.documento;
  const e = d.empresa || {};
  const recibo = ehRecibo(doc.classe);
  const proforma = doc.classe === 'PROFORMA';
  const moeda = doc.moeda || 'AOA';
  const porLinha = Math.min(
    d.linhas.reduce((s, l) => s + Math.round((Number(l.quantidade) * Number(l.preco_unitario) * (Number(l.desconto_pct) || 0)) / 100), 0),
    doc.total_desconto,
  );
  const faixa = [
    ['V/ Nº Contrib.', nifTexto(doc.entidade_nif)],
    ['V/ Refª', doc.referencia || '—'],
    ['Data de Emissão', data(doc.data_emissao)],
    ['Hora', hora(doc.data_hora)],
  ];
  const vence = doc.data_vencimento && doc.data_vencimento.slice(0, 10) !== String(doc.data_emissao).slice(0, 10);
  if (!recibo && (proforma || vence)) faixa.push([proforma ? 'Validade' : 'Data de Vencimento', data(doc.data_vencimento || doc.data_emissao)]);
  if (doc.doc_origem) faixa.push(['Documento de Origem', doc.doc_origem]);
  if (moeda !== 'AOA') faixa.push(['Moeda', moeda]);
  const totais = recibo
    ? []
    : [
      ['Total Ilíquido', doc.total_desconto > 0 ? doc.total_bruto : 0],
      ['Descontos por Linha', porLinha],
      ['Desconto Global', doc.total_desconto - porLinha],
      ['Total Líquido', Number(doc.total_liquido)],
      ['Imposto (IVA)', Number(doc.total_iva)],
      ['Retenção', doc.total_retencao],
    ].filter(([k, v]) => v !== 0 || k === 'Total Líquido' || k === 'Imposto (IVA)');
  const logo = logoDe(e);
  const rodape = rodapeAgt(doc);

  return (
    <div
      className="recibo-kangest mx-auto flex min-h-[272mm] w-[190mm] flex-col bg-white p-1 text-[10px] leading-snug text-black"
      style={{ ...ARIAL, ...(doc.formato === 'A5' ? { zoom: 134 / 190 } : {}) }}
      data-ficheiro={nomeDoDocumento(d)}
    >
      <div className="grid grid-cols-2 gap-8">
        <div>
          {logo ? <img src={logo} alt="" className="mb-2 max-h-[30mm] max-w-[68mm] object-contain object-left" /> : <div className="h-2" />}
          <div className="text-[11.5px] font-bold">{e.nome}</div>
          {e.designacao_comercial && e.designacao_comercial !== e.nome && <div>{e.designacao_comercial}</div>}
          <div>NIF: {e.nif || '—'}</div>
          {e.endereco && <div>{e.endereco}</div>}
          {e.telefone && <div>Tel. : {e.telefone}</div>}
          {e.email && <div>Email: {e.email}</div>}
          <div>{local(e)}</div>
        </div>
        <div className="flex flex-col">
          <div className="text-right text-[12px] font-bold">{via}</div>
          <div className="text-right text-[8.5px]">
            Emitido em {data(doc.data_emissao)} {hora(doc.data_hora)}{doc.utilizador ? ` por ${doc.utilizador}` : ''}
          </div>
          {reimpressao && <div className="text-right text-[8.5px]">{reimpressao}</div>}
          <div className="mt-3 text-[11px] font-bold uppercase">{doc.tipo_desc}</div>
          <div className="text-[17px] font-bold leading-tight">{doc.numero_doc}</div>
          {naoServeFactura(doc.classe) && <div className="text-[9.5px]">Este documento não serve de factura</div>}
          {doc.estado === 'A' && <div className="mt-1 text-[12px] font-bold">DOCUMENTO ANULADO</div>}
          <div className="mt-3">Exmo(s) Senhor(es)</div>
          <div className="font-bold">{consumidorFinal(doc.entidade_nif) ? 'Consumidor Final' : doc.entidade_nome}</div>
        </div>
      </div>

      <table className="mt-4 w-full border-collapse">
        <thead>
          <tr className="border-b border-black text-left align-bottom text-[8.5px] font-bold uppercase">
            {faixa.map(([k]) => <th key={k} className="pb-0.5 pr-2 font-bold">{k}</th>)}
          </tr>
        </thead>
        <tbody>
          <tr className="align-top">
            {faixa.map(([k, v]) => <td key={k} className="pr-2 pt-0.5">{v}</td>)}
          </tr>
        </tbody>
      </table>

      {doc.motivo && <div className="mt-3"><b>Motivo de emissão:</b> {doc.motivo}</div>}
      {doc.estado === 'A' && doc.motivo_anulacao && <div className="mt-1"><b>Motivo da anulação:</b> {doc.motivo_anulacao}</div>}

      {!recibo && (
        <table className="mt-4 w-full border-collapse">
          <thead>
            <tr className="border-y border-black text-left text-[8.5px] uppercase">
              <th className="w-[22mm] py-0.5 font-bold">Referência</th>
              <th className="font-bold">Descrição</th>
              <th className="text-right font-bold">Qtd</th>
              <th className="pl-1 font-bold">Un</th>
              <th className="text-right font-bold">Preço Unit.</th>
              <th className="text-right font-bold">Desc.(%)</th>
              <th className="text-right font-bold">Taxa(%)</th>
              <th className="text-right font-bold">Total</th>
            </tr>
          </thead>
          <tbody className="text-[9.5px]">
            {d.linhas.map((l) => (
              <Fragment key={l.id}>
                <tr className="align-top">
                  <td className="pr-2 pt-0.5">{l.referencia}</td>
                  <td className="pr-2 pt-0.5">{l.descricao}</td>
                  <td className="pt-0.5 text-right">{qtd(l.quantidade)}</td>
                  <td className="pl-1 pt-0.5">{l.unidade}</td>
                  <td className="pt-0.5 text-right">{kzNum(l.preco_unitario)}</td>
                  <td className="pt-0.5 text-right">{Number(l.desconto_pct) ? pct(l.desconto_pct) : '0,00'}</td>
                  <td className="pt-0.5 text-right">{pct(l.taxa_iva_pct)}</td>
                  <td className="pt-0.5 text-right">{kzNum(l.valor_liquido)}</td>
                </tr>
                {(l.motivo_isencao || l.lote) && (
                  <tr>
                    <td />
                    <td colSpan={7} className="text-[8.5px]">
                      {l.motivo_isencao && `${l.motivo_isencao} ${MOTIVO_TXT[l.motivo_isencao] ?? 'Isento'}`}
                      {l.motivo_isencao && l.lote && ' · '}
                      {l.lote && `Lote ${l.lote}${l.validade ? ` · validade ${data(l.validade)}` : ''}`}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}

      {recibo && (
        <table className="mt-4 w-full border-collapse">
          <thead>
            <tr className="border-y border-black text-left text-[8.5px] uppercase">
              <th className="py-0.5 font-bold">Doc. de Referência</th>
              <th className="font-bold">Data de Emissão</th>
              <th className="text-right font-bold">Total</th>
              <th className="text-right font-bold">Liquidado</th>
            </tr>
          </thead>
          <tbody className="text-[9.5px]">
            {d.liquidacoes.map((l, i) => (
              <tr key={`${l.numero_doc}-${i}`}>
                <td className="pt-0.5">{l.numero_doc}</td>
                <td className="pt-0.5">{data(l.data_emissao)}</td>
                <td className="pt-0.5 text-right">{kzNum(l.total)}</td>
                <td className="pt-0.5 text-right">{kzNum(l.valor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="mt-auto pt-6">
        <div className="flex items-end justify-between gap-4 border-b border-black pb-0.5 text-[9.5px]">
          <span>{rodape}</span>
          {doc.utilizador && <span className="shrink-0">Operador : {doc.utilizador}</span>}
        </div>
        <div className="grid grid-cols-2 gap-8">
          <div>
            {!recibo && d.resumo_iva.length > 0 && (
              <Seccao titulo="Resumo de imposto">
                <table className="w-full border-collapse text-[9px]">
                  <thead>
                    <tr className="text-[8px] uppercase">
                      <th className="text-left font-bold">Descrição</th>
                      <th className="text-right font-bold">Taxa</th>
                      <th className="text-right font-bold">Incidência</th>
                      <th className="text-right font-bold">Imposto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.resumo_iva.map((r) => (
                      <tr key={`${r.taxa}${r.motivo_isencao}`}>
                        <td>{r.motivo_isencao ? `${r.motivo_isencao} ${MOTIVO_TXT[r.motivo_isencao] ?? 'Isento'}` : 'IVA'}</td>
                        <td className="text-right">{pct(r.taxa)}</td>
                        <td className="text-right">{kzNum(r.base)}</td>
                        <td className="text-right">{kzNum(r.iva)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Seccao>
            )}
            {d.pagamentos.length > 0 && (
              <Seccao titulo="Método de pagamento">
                {d.pagamentos.map((p, i) => (
                  <div key={`${p.modo_codigo}-${i}`} className="flex justify-between text-[9px]">
                    <span>{p.descricao || p.modo_codigo}{p.moeda && p.moeda !== 'AOA' ? ` (${p.moeda} ${kzNum(p.valor_moeda)} ao câmbio ${String(p.cambio ?? '').replace('.', ',')})` : ''}</span>
                    <span>{kzNum(p.valor)}</span>
                  </div>
                ))}
              </Seccao>
            )}
            {(e.bancos || []).length > 0 && !recibo && (
              <Seccao titulo="Coordenadas bancárias">
                <table className="w-full border-collapse text-[9px]">
                  <thead>
                    <tr className="text-[8px] uppercase">
                      <th className="text-left font-bold">Banco</th>
                      <th className="text-left font-bold">Conta</th>
                      <th className="text-left font-bold">IBAN</th>
                    </tr>
                  </thead>
                  <tbody>
                    {e.bancos.map((b) => (
                      <tr key={b.iban}>
                        <td>{b.banco}</td>
                        <td>{b.conta ?? ''}</td>
                        <td>{b.iban}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Seccao>
            )}
          </div>
          <div>
            <div className="mt-2">
              {totais.map(([k, v]) => (
                <div key={k} className="flex justify-between border-b border-black/40 py-[1px] text-[9px]">
                  <span className="font-bold uppercase">{k}</span>
                  <span>{kzNum(v)}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-start justify-between gap-3">
              <div className="text-[12px] font-bold uppercase leading-tight">
                {recibo ? 'Liquidado' : 'Total do documento'}
                <br />({moeda})
              </div>
              <div className="text-[14px] font-bold">{kzNum(doc.total)}</div>
            </div>
            {doc.total_retencao > 0 && (
              <div className="flex justify-between text-[10px] font-bold">
                <span>Total a pagar</span>
                <span>{kzNum(Number(doc.total) - doc.total_retencao)}</span>
              </div>
            )}
            {moeda !== 'AOA' && doc.total_moeda != null && (
              <div className="mt-1 text-right text-[9.5px]">
                Total em {moeda}: <b>{kzNum(doc.total_moeda)}</b> · câmbio {String(doc.cambio ?? '').replace('.', ',')} Kz
              </div>
            )}
            <div className="mt-2 text-[9.5px]">{doc.prefixo_extenso || 'São'}: {extenso(doc.total)}</div>
          </div>
        </div>

        {doc.tipo_codigo === 'NC' && (
          <div className="mt-10 grid grid-cols-2 gap-16 text-center text-[9.5px]">
            <div className="border-t border-black pt-0.5 font-bold uppercase">Assinatura do cliente</div>
            <div className="border-t border-black pt-0.5" />
          </div>
        )}

        <div className="mt-3 flex items-end justify-between gap-4 text-[9px]">
          <div>
            {doc.texto_rodape && <div className="font-medium">{doc.texto_rodape}</div>}
            {doc.classe === 'VENDA' && <div>Os bens e/ou serviços foram colocados à disposição do adquirente na data e local do documento.</div>}
            {e.rodape && <div>{e.rodape}</div>}
          </div>
          <div className="shrink-0 text-[8px]">Processado por KanGest</div>
        </div>
      </div>
    </div>
  );
}

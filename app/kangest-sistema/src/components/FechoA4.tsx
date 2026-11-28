// KanGest — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import type { ReactNode } from "react";
import type { CaixaResumo, Empresa } from "@/lib/types";
import { dataHora, kz, kzNum, pct, qtd } from "@/lib/format";

/**
 * O relatório completo do fecho de caixa em A4 (pedido do dono a 27/11: «refinar o fecho da caixa com relatórios
 * extensivos e arquivar»). Tem o mesmo que o documento do arquivo (services/caixa_fechos.rs, `html`):
 * - a empresa e o n.º do Z, as datas, o posto e quem fechou;
 * - os recebimentos por forma de pagamento, os totais da gaveta, a contagem e a conferência;
 * - as análises: o resumo das vendas, por tipo de documento, por operador, por hora e por família, o IVA por taxa e os
 *   anulados;
 * - os artigos, os documentos, os movimentos de caixa e as vendas online;
 * - o selo do arquivo.
 */
export function FechoA4({ r, e, comDocumentos = true }: { r: CaixaResumo; e?: Empresa | null; comDocumentos?: boolean }) {
  const s = r.sessao;
  const a = r.analise ?? {};
  const dif = (s.valor_contado ?? 0) - (r.numerario_esperado ?? 0);
  const morada = [e?.endereco, e?.localidade || e?.provincia].filter(Boolean).join(", ");
  const res = a.resumo;
  const online = r.online;
  return (
    <div className="mx-auto w-[190mm] bg-white p-1 text-[10.5px] leading-snug text-black" style={{ fontFamily: "Arial, Helvetica, sans-serif" }} data-ficheiro={`Fecho Z-${s.numero_z ?? s.id} ${s.posto ?? ""} ${(s.fechada_em ?? s.aberta_em).slice(0, 10)}`}>
      <div className="flex items-start justify-between gap-6">
        <div>
          <div className="text-[13px] font-bold">{e?.designacao_comercial || e?.nome}</div>
          {morada && <div>{morada}</div>}
          {e?.nif && <div>NIF: {e.nif}</div>}
          {e?.telefone && <div>Tel. {e.telefone}</div>}
        </div>
        <div className="text-right">
          <div className="text-[15px] font-bold">{s.estado === "ABERTA" ? "CAIXA EM ABERTO (X)" : `FECHO DE CAIXA (Z) N.º ${s.numero_z ?? s.id}`}</div>
          <div>Relatório completo</div>
        </div>
      </div>
      {r.arquivo?.reconstruido && (
        <div className="mt-2 border border-black px-1.5 py-0.5">Reconstruído: este fecho é de antes do arquivo dos fechos e foi refeito com os valores do dia em que se arquivou.</div>
      )}
      <Tabela
        linhas={[
          ["Abertura", dataHora(s.aberta_em)],
          ["Fecho", s.fechada_em ? dataHora(s.fechada_em) : "(em aberto)"],
          ["Posto", s.posto ?? "—"],
          ["Operador", s.utilizador],
        ]}
      />

      <div className="mt-1 grid grid-cols-2 gap-6">
        <Seccao titulo="Recebimentos por forma de pagamento">
          <Tabela linhas={r.por_modo.filter((m) => m.total !== 0).map((m) => [m.descricao, m.total === null ? "—" : kz(m.total)])} />
        </Seccao>
        <Seccao titulo="Gaveta">
          <Tabela
            linhas={[
              [`Total de ${r.documentos} documento(s)`, kz(r.total_vendido), true],
              ["Fundo de maneio", kz(s.valor_inicial)],
              ["Entradas", kz(r.entradas)],
              ["Saídas", kz(r.saidas)],
              ["Numerário esperado", kz(r.numerario_esperado), true],
              ...(r.moedas_estrangeiras ?? []).map((m): Linha => [`Em ${m.moeda} (na gaveta)`, `${kzNum(m.valor)} ${m.moeda}`]),
              ["Valor físico", s.valor_contado === null ? "—" : kz(s.valor_contado), true],
              ...(s.valor_contado !== null ? [[dif < 0 ? "Diferença (falta)" : dif > 0 ? "Diferença (sobra)" : "Diferença", kz(dif), true] as Linha] : []),
            ]}
          />
        </Seccao>
      </div>

      {s.contagem && Object.keys(s.contagem).length > 0 && (
        <Seccao titulo="Contagem do numerário">
          <Tabela
            linhas={Object.entries(s.contagem)
              .sort(([x], [y]) => Number(y) - Number(x))
              .map(([d, q]): Linha => [`${Number(d).toLocaleString("pt-PT")} Kz × ${q}`, kz(Number(d) * 100 * q)])}
          />
        </Seccao>
      )}
      {(r.conferencia ?? []).some((c) => c.codigo !== "NU" && c.contado !== null) && (
        <Seccao titulo="Conferência (contado − sistema)">
          <Tabela
            linhas={(r.conferencia ?? [])
              .filter((c) => c.codigo !== "NU" && c.contado !== null)
              .map((c): Linha => [`${c.descricao}: ${kz(c.contado)}`, kz(c.diferenca), c.diferenca !== 0])}
          />
        </Seccao>
      )}
      {s.observacoes && <div className="mt-2">Obs.: {s.observacoes}</div>}

      {res && (
        <Seccao titulo="Resumo das vendas">
          <Tabela
            linhas={[
              ["Vendas", String(res.vendas)],
              ["Valor vendido", kz(res.vendido), true],
              ...(res.vendas > 0 ? [["Valor médio por venda", kz(Math.trunc(res.vendido / res.vendas))] as Linha] : []),
              ...(res.devolucoes > 0 ? [[`Devoluções (${res.devolucoes})`, kz(res.devolvido)] as Linha] : []),
              ...(res.com_desconto > 0 ? [[`Descontos (${res.com_desconto} venda(s))`, kz(res.descontos)] as Linha] : []),
              ...(res.primeira ? [["Primeira venda", dataHora(res.primeira)] as Linha, ["Última venda", dataHora(res.ultima)] as Linha] : []),
            ]}
          />
        </Seccao>
      )}
      <div className="grid grid-cols-2 gap-6">
        <Grelha
          titulo="Por tipo de documento"
          cab={["Tipo", "Docs", "Anul.", "Total"]}
          linhas={(a.por_tipo ?? []).map((x) => [`${x.codigo} ${x.descricao}`, String(x.documentos), String(x.anulados), kz(x.total)])}
        />
        <Grelha titulo="Por operador" cab={["Operador", "Docs", "Total"]} linhas={(a.por_operador ?? []).map((x) => [x.nome, String(x.documentos), kz(x.total)])} />
        <Grelha titulo="Por hora" cab={["Hora", "Docs", "Total"]} linhas={(a.por_hora ?? []).map((x) => [`${x.hora}h`, String(x.documentos), kz(x.total)])} />
        <Grelha titulo="Por família" cab={["Família", "Qtd.", "Total"]} linhas={(a.por_familia ?? []).map((x) => [x.familia, qtd(x.quantidade), kz(x.total)])} />
        <Grelha
          titulo="IVA por taxa"
          cab={["Taxa", "Incidência", "Imposto"]}
          linhas={(a.iva ?? []).map((x) => [x.motivo_isencao ? `Isento (${x.motivo_isencao})` : `IVA ${pct(x.taxa)}`, kz(x.base), kz(x.iva)])}
        />
        <Grelha
          titulo="Documentos anulados"
          cab={["Documento", "Hora", "Motivo", "Total"]}
          numeros={[3]}
          linhas={(a.anulados ?? []).map((x) => [x.numero_doc, x.data_hora.slice(11, 16), x.motivo, kz(x.total)])}
        />
      </div>

      <Grelha titulo="Artigos vendidos" cab={["Referência", "Descrição", "Qtd.", "Total"]} numeros={[2, 3]} linhas={r.artigos.map((l) => [l.referencia, l.descricao, qtd(l.quantidade), kz(l.total)])} />
      {comDocumentos && (
        <Grelha
          titulo="Documentos da sessão"
          cab={["Documento", "Hora", "Cliente", "Pagamento", "Total"]}
          numeros={[4]}
          riscadas={(r.documentos_lista ?? []).map((d) => d.estado === "A")}
          linhas={(r.documentos_lista ?? []).map((d) => [`${d.numero_doc}${d.estado === "A" ? " (anulado)" : ""}`, d.data_hora.slice(11, 16), d.cliente ?? "", d.pagamento ?? "", kz(d.total)])}
        />
      )}
      <Grelha
        titulo="Movimentos de caixa"
        cab={["Data", "Vale", "Total"]}
        linhas={r.movimentos.map((m) => [dataHora(m.data_hora), `Vale n.º ${m.id} — ${m.descricao}`, kz(m.tipo === "SAIDA" ? -m.valor : m.valor)])}
      />
      {online?.incluidas && !online.cego && (online.quantidade ?? 0) > 0 && (
        <div className="mt-3 rounded border border-black px-2 pb-1">
          <Grelha
            titulo="Vendas online (fora da gaveta)"
            cab={["Venda", "Cliente", "Pagamento", "Total"]}
            numeros={[3]}
            linhas={[
              ...(online.documentos ?? []).map((d) => [d.numero_doc, d.cliente, d.pagamento, kz(d.total)]),
              ...(online.encomendas ?? []).map((d) => [`Encomenda ${d.numero}`, d.cliente, `${d.pagamento}${d.na_entrega ? " (na entrega)" : ""}`, kz(d.total)]),
            ]}
          />
          <Tabela linhas={[[`Total online (${online.quantidade} venda(s))`, kz(online.total ?? 0), true]]} />
        </div>
      )}
      {e?.rodape && <div className="mt-3 text-center">{e.rodape}</div>}
      {r.arquivo && (
        <div className="mt-4 break-all border-t border-black pt-1 text-[9px]">
          Arquivado em {dataHora(r.arquivo.criado_em)} · selo SHA-256 do arquivo: {r.arquivo.selo}
        </div>
      )}
    </div>
  );
}

type Linha = [string, string, boolean?];

function Seccao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="mt-3">
      <div className="border-b border-black pb-0.5 text-[11.5px] font-bold">{titulo}</div>
      {children}
    </div>
  );
}

function Tabela({ linhas }: { linhas: Linha[] }) {
  if (!linhas.length) return null;
  return (
    <table className="mt-1 w-full border-collapse">
      <tbody>
        {linhas.map(([k, v, forte], i) => (
          <tr key={`${k}-${i}`} className={forte ? "font-bold" : ""}>
            <td className="py-px pr-2">{k}</td>
            <td className="whitespace-nowrap py-px text-right">{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Uma tabela com cabeçalhos; as colunas de números (por omissão, as que não são a primeira) à direita. Sem linhas, não aparece. */
function Grelha({ titulo, cab, linhas, numeros, riscadas }: { titulo: string; cab: string[]; linhas: string[][]; numeros?: number[]; riscadas?: boolean[] }) {
  if (!linhas.length) return null;
  const direita = (i: number) => (numeros ? numeros.includes(i) : i > 0);
  return (
    <Seccao titulo={titulo}>
      <table className="mt-1 w-full border-collapse">
        <thead>
          <tr className="border-b border-black/40 text-[9.5px] uppercase">
            {cab.map((c, i) => (
              <th key={c} className={`py-px pr-2 font-bold ${direita(i) ? "text-right" : "text-left"}`}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l, n) => (
            <tr key={n} className={riscadas?.[n] ? "text-black/50 line-through" : ""}>
              {l.map((c, i) => (
                <td key={i} className={`py-px pr-2 align-top ${direita(i) ? "whitespace-nowrap text-right" : ""}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Seccao>
  );
}

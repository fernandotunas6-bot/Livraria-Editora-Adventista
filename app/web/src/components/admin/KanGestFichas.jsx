// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { kangestFicha, kangestFichas } from '@/api/PlatformApi';
import { data, kz } from '@/lib/kangestRecibo';
import { AdminViewNav, useSectionView } from './shell/AdminViewNav';
import { DocumentoDoKanGest } from './KanGestDocumentos';

const TIPO_DA_VISTA = { clientes: 'entidade', artigos: 'artigo', utilizadores: 'utilizador' };
const PERFIS = { ADMIN: 'Administrador', GESTOR: 'Gestor', CAIXA: 'Caixa' };
const activo = (v) => v === 1 || v === true || v === '1';
const sim = (v) => (activo(v) ? 'Sim' : 'Não');

/** Os campos de cada ficha, pela ordem e com o nome com que aparecem (o resto não se mostra). */
const CAMPOS = {
  entidade: [
    ['tipo', 'Tipo', (v) => (v === 'F' ? 'Fornecedor' : 'Cliente')], ['localidade', 'Localidade'], ['provincia', 'Província'], ['pais', 'País'],
    ['limite_credito', 'Limite de crédito', kz], ['desconto', 'Desconto (%)'], ['nivel_preco', 'Nível de preço'], ['ativo', 'Activo', sim],
    ['criado_em', 'Criado em', data], ['alterado_em', 'Alterado em', data],
  ],
  artigo: [
    ['referencia', 'Referência'], ['codigo_barras', 'Código de barras'], ['descricao_curta', 'Descrição curta'], ['tipo', 'Tipo', (v) => (v === 'S' ? 'Serviço' : 'Produto')],
    ['familia', 'Família'], ['subfamilia', 'Subfamília'], ['unidade', 'Unidade'], ['taxa_iva', 'IVA (%)'],
    ['preco1', 'Preço 1 (sem IVA)', kz], ['preco2', 'Preço 2', kz], ['preco3', 'Preço 3', kz], ['preco4', 'Preço 4', kz],
    ['custo', 'Custo', kz], ['custo_medio', 'Custo médio', kz], ['stock_total', 'Stock (todos os armazéns)'],
    ['qtd_minima', 'Stock mínimo'], ['qtd_maxima', 'Stock máximo'], ['controla_stock', 'Controla o stock', sim],
    ['promo_desconto', 'Promoção (%)'], ['promo_inicio', 'Promoção de', data], ['promo_fim', 'Promoção até', data],
    ['ativo', 'Activo', sim], ['criado_em', 'Criado em', data], ['alterado_em', 'Alterado em', data],
  ],
  utilizador: [
    ['login', 'Utilizador'], ['perfil', 'Perfil', (v) => PERFIS[v] || v], ['loja', 'Loja'], ['email', 'Email'], ['telefone', 'Telefone'],
    ['conta_site', 'Conta do site', (v) => (v ? 'Ligada' : 'Por ligar')], ['limite_desconto', 'Desconto máximo (%)'],
    ['ativo', 'Activo', sim], ['ultimo_acesso', 'Último acesso', data], ['criado_em', 'Criado em', data],
  ],
};
const CONTACTOS = [['nif', 'NIF'], ['telefone', 'Telefone'], ['telefone2', 'Outro telefone'], ['email', 'Email'], ['endereco', 'Morada'], ['pessoa_contacto', 'Pessoa de contacto'], ['observacoes', 'Observações']];

/**
 * As fichas do balcão: os clientes e os fornecedores, os artigos e os utilizadores que o KanGest de cada loja manda para
 * a base central (sincronização completa, #188), como estão no programa. Só se lêem: mudam-se no KanGest. Quem as gere
 * no site vê as de todas as lojas; o gerente de uma loja, as dos postos da sua (a regra está no servidor). Os contactos
 * dos clientes chegam cifrados e só se decifram ao abrir a ficha.
 */
export default function KanGestFichas() {
  const sv = useSectionView('fichas-kangest');
  const tipo = TIPO_DA_VISTA[sv.view] || 'entidade';
  return (
    <div className="space-y-4">
      <AdminViewNav state={sv} className="mb-0" />
      <ListaDeFichas key={tipo} tipo={tipo} />
    </div>
  );
}

function ListaDeFichas({ tipo }) {
  const [filtros, setFiltros] = useState({ q: '', classe: '', activos: false });
  const [procura, setProcura] = useState('');
  const [pagina, setPagina] = useState(0);
  const [lista, setLista] = useState(null);
  const [erro, setErro] = useState('');
  const [aCarregar, setACarregar] = useState(false);
  const [aberta, setAberta] = useState(null);

  useEffect(() => {
    let vivo = true;
    setACarregar(true);
    kangestFichas({ tipo, ...filtros, pagina })
      .then((r) => { if (vivo) { setLista(r); setErro(''); } })
      .catch((e) => { if (vivo) setErro(e?.message || 'Não foi possível carregar as fichas.'); })
      .finally(() => { if (vivo) setACarregar(false); });
    return () => { vivo = false; };
  }, [tipo, filtros, pagina]);

  const mudar = (k, v) => { setPagina(0); setFiltros((f) => ({ ...f, [k]: v })); };
  const fichas = lista?.fichas || [];
  const total = lista?.total || 0;
  const paginas = Math.max(1, Math.ceil(total / (lista?.por_pagina || 50)));

  return (
    <section className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Como estão no KanGest de cada loja. Só se lêem aqui: mudam-se no KanGest, e chegam na volta seguinte.
      </p>
      <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); mudar('q', procura.trim()); }}>
        <label className="grid min-w-[14rem] flex-1 gap-1 text-xs text-muted-foreground">
          {tipo === 'artigo' ? 'Descrição, referência ou código de barras' : 'Nome'}
          <Input value={procura} onChange={(e) => setProcura(e.target.value)} className="h-9" />
        </label>
        <Button type="submit" size="sm" variant="outline" className="h-9" aria-label="Procurar"><Search className="h-4 w-4" /></Button>
        {tipo === 'entidade' && (
          <label className="grid gap-1 text-xs text-muted-foreground">Mostrar
            <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={filtros.classe} onChange={(e) => mudar('classe', e.target.value)}>
              <option value="">Clientes e fornecedores</option>
              <option value="C">Só clientes</option>
              <option value="F">Só fornecedores</option>
            </select>
          </label>
        )}
        <label className="inline-flex h-9 items-center gap-1.5 text-sm">
          <input type="checkbox" checked={filtros.activos} onChange={(e) => mudar('activos', e.target.checked)} /> Só os activos
        </label>
      </form>
      {erro && <p className="text-sm text-destructive" role="alert">{erro}</p>}

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">{tipo === 'artigo' ? 'Artigo' : 'Nome'}</th>
              <th className="px-3 py-2 font-medium">{tipo === 'artigo' ? 'Família' : tipo === 'utilizador' ? 'Perfil' : 'Localidade'}</th>
              <th className="px-3 py-2 font-medium">Posto</th>
              <th className="px-3 py-2 text-right font-medium">{tipo === 'artigo' ? 'Preço 1' : ''}</th>
            </tr>
          </thead>
          <tbody>
            {fichas.map((f) => {
              const d = f.dados || {};
              return (
                <tr
                  key={`${f.posto_id}-${f.chave}`}
                  className="cursor-pointer border-t border-border hover:bg-muted/30 focus-visible:bg-muted/40 focus-visible:outline-none"
                  tabIndex={0}
                  onClick={() => setAberta(f)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setAberta(f); } }}
                >
                  <td className="px-3 py-2">
                    <span className="font-medium">{tipo === 'artigo' ? d.descricao : d.nome}</span>
                    {tipo === 'artigo' && <span className="block text-xs text-muted-foreground">{[d.referencia, d.codigo_barras].filter(Boolean).join(' · ')}</span>}
                    {tipo === 'utilizador' && d.login && <span className="block text-xs text-muted-foreground">{d.login}</span>}
                    <span className="mt-0.5 flex flex-wrap gap-1">
                      {tipo === 'entidade' && d.tipo === 'F' && <Badge variant="outline">Fornecedor</Badge>}
                      {!activo(d.ativo) && <Badge variant="secondary">Inactivo</Badge>}
                      {tipo === 'utilizador' && !d.conta_site && <Badge variant="outline">Sem conta do site</Badge>}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {tipo === 'artigo' ? d.familia || '—' : tipo === 'utilizador' ? PERFIS[d.perfil] || d.perfil || '—' : d.localidade || d.provincia || '—'}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{f.posto || '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">{tipo === 'artigo' ? kz(d.preco1) : ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!fichas.length && !aCarregar && !erro && (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">Nenhuma ficha. As fichas chegam quando o KanGest da loja está ligado ao site.</p>
        )}
        {aCarregar && !fichas.length && <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="A carregar" /></div>}
      </div>
      <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>{total} ficha{total === 1 ? '' : 's'}</span>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" disabled={pagina === 0 || aCarregar} onClick={() => setPagina((p) => p - 1)} aria-label="Anteriores"><ChevronLeft className="h-4 w-4" /></Button>
          <span>{pagina + 1} / {paginas}</span>
          <Button size="sm" variant="ghost" disabled={pagina + 1 >= paginas || aCarregar} onClick={() => setPagina((p) => p + 1)} aria-label="Seguintes"><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>
      <Ficha tipo={tipo} f={aberta} onFechar={() => setAberta(null)} />
    </section>
  );
}

/** Uma ficha aberta: os campos, os contactos (num cliente ou fornecedor) e os documentos do cliente. */
export function Ficha({ tipo, f, onFechar }) {
  const [r, setR] = useState(null);
  const [erro, setErro] = useState('');
  const [doc, setDoc] = useState(null);
  useEffect(() => {
    if (!f) return undefined;
    let vivo = true;
    setR(null);
    setErro('');
    kangestFicha(f.posto_id, tipo, f.chave)
      .then((x) => { if (vivo) setR(x); })
      .catch((e) => { if (vivo) setErro(e?.message || 'Não foi possível abrir a ficha.'); });
    return () => { vivo = false; };
  }, [f, tipo]);
  const d = r?.dados || f?.dados || {};
  const titulo = tipo === 'artigo' ? d.descricao : d.nome;
  return (
    <Dialog open={!!f} onOpenChange={(v) => { if (!v) onFechar(); }}>
      <DialogContent className="max-h-[92vh] max-w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{titulo || 'Ficha'}</DialogTitle>
          <DialogDescription>{[f?.posto && `posto ${f.posto}`, r?.recebido_em && `recebida a ${new Date(r.recebido_em).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' })}`].filter(Boolean).join(' · ')}</DialogDescription>
        </DialogHeader>
        {erro && <p className="text-sm text-destructive" role="alert">{erro}</p>}
        <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
          {(CAMPOS[tipo] || []).filter(([k]) => d[k] !== undefined && d[k] !== null && d[k] !== '').map(([k, rotulo, fmt]) => (
            <div key={k} className="flex justify-between gap-3 border-b border-border/60 py-1">
              <dt className="text-muted-foreground">{rotulo}</dt>
              <dd className="text-right font-medium">{fmt ? fmt(d[k]) : String(d[k])}</dd>
            </div>
          ))}
        </dl>
        {tipo === 'entidade' && r && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Contactos</h3>
            {r.pessoais ? (
              <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
                {CONTACTOS.filter(([k]) => r.pessoais[k]).map(([k, rotulo]) => (
                  <div key={k} className="flex justify-between gap-3 border-b border-border/60 py-1">
                    <dt className="text-muted-foreground">{rotulo}</dt>
                    <dd className="break-all text-right font-medium">{String(r.pessoais[k])}</dd>
                  </div>
                ))}
              </dl>
            ) : <p className="text-sm text-muted-foreground">Sem contactos nesta ficha.</p>}
            {Array.isArray(r.documentos) && (
              <>
                <h3 className="pt-2 text-sm font-semibold">
                  Documentos ({r.documentos_total}){r.em_divida > 0 ? <span className="ml-2 text-destructive">em dívida {kz(r.em_divida)}</span> : null}
                </h3>
                {r.documentos.length ? (
                  <ul className="divide-y rounded-lg border text-sm">
                    {r.documentos.map((x) => (
                      <li key={x.id}>
                        <button type="button" className="flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left hover:bg-muted/40" onClick={() => setDoc(x.id)}>
                          <span>
                            <span className="font-medium">{x.numero_doc}</span>
                            <span className="ml-2 text-xs text-muted-foreground">{data(x.data_emissao)}</span>
                            {x.estado === 'A' && <Badge variant="destructive" className="ml-2">Anulado</Badge>}
                          </span>
                          <span className="whitespace-nowrap">
                            {kz(x.total)}
                            {Number(x.valor_pendente) > 0 && x.estado !== 'A' && <span className="ml-2 text-xs text-destructive">falta {kz(x.valor_pendente)}</span>}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : <p className="text-sm text-muted-foreground">Ainda sem documentos deste cliente na base central.</p>}
              </>
            )}
          </div>
        )}
        <DocumentoDoKanGest id={doc} onAbrir={setDoc} onFechar={() => setDoc(null)} />
      </DialogContent>
    </Dialog>
  );
}

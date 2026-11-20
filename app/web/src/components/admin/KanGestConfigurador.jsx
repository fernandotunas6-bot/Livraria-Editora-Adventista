// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Copy, KeyRound, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { APP_API_URL, SUPABASE_URL, supabase } from '@/lib/supabaseClient';
import {
  MODOS_KANGEST, comandoSegredo, modoSugerido, montarLigacoes, projectoSupabase, sqlAgendador, tokenAleatorio,
} from '@/lib/kangestConfig';

const vazia = () => ({ id: '', url: '', chave: '', segredo: '', padrao: false, lojas: {}, armazens_online: '', portes: 'PORTES', generico: '' });

const copiar = (txt) => navigator.clipboard?.writeText(txt).then(() => toast.success('Copiado.'), () => toast.error('Não foi possível copiar.'));

function Bloco({ titulo, texto, aviso }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold">{titulo}</span>
        <Button size="sm" variant="outline" className="ml-auto h-7" onClick={() => copiar(texto)}><Copy className="mr-1 h-3.5 w-3.5" />Copiar</Button>
      </div>
      <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-muted p-3 text-xs">{texto}</pre>
      {aviso && <p className="text-xs text-amber-700 dark:text-amber-400">{aviso}</p>}
    </div>
  );
}

function Campo({ rotulo, ajuda, children }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{rotulo}</Label>
      {children}
      {ajuda && <p className="text-[11px] leading-snug text-muted-foreground">{ajuda}</p>}
    </div>
  );
}

/**
 * Assistente da configuração (docs/KANGEST.md §2): monta o segredo KANGEST_LIGACOES (uma ligação por KanGest), o
 * comando para o gravar e o token e o SQL do agendador. Tudo fica neste navegador: a chave e o segredo não vão
 * para o servidor nem ficam guardados.
 */
export default function KanGestConfigurador({ ligacoesActuais = [], lojas = [] }) {
  const [form, setForm] = useState(() => (ligacoesActuais.length
    ? ligacoesActuais.map((l) => ({ ...vazia(), ...l, chave: '', segredo: '', armazens_online: (l.armazens_online || []).join(', '), lojas: { ...(l.lojas || {}) } }))
    : [vazia()]));
  const [metodos, setMetodos] = useState([]);
  const [pagamentos, setPagamentos] = useState(() => ({ ...(ligacoesActuais[0]?.pagamentos || {}) }));
  const [token, setToken] = useState('');

  useEffect(() => {
    supabase.from('payment_methods').select('code, name, category, type').eq('enabled', true).order('sort_order')
      .then(({ data }) => {
        setMetodos(data || []);
        setPagamentos((p) => {
          const n = { ...p };
          for (const m of data || []) if (m.code && !n[m.code]) n[m.code] = modoSugerido(m);
          return n;
        });
      });
  }, []);

  const muda = (i, campo, valor) => setForm((f) => f.map((l, j) => (j === i ? { ...l, [campo]: valor } : l)));
  const mudaLoja = (i, loja, valor) => setForm((f) => f.map((l, j) => (j === i ? { ...l, lojas: { ...l.lojas, [loja]: valor } } : l)));
  const { json, erros } = useMemo(() => montarLigacoes(form, pagamentos), [form, pagamentos]);
  const projecto = projectoSupabase(SUPABASE_URL);
  const activas = lojas.filter((l) => l.active !== false);

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Preencha com os dados de cada KanGest (no KanGest: <em>Sistema → API e Integrações</em> para a chave e, em <em>Avisos</em>, o segredo).
        A chave e o segredo ficam só neste navegador — o resultado é para gravar como segredo no Supabase.
      </p>

      {form.map((l, i) => (
        <div key={i} className="space-y-3 rounded-xl border p-4">
          <div className="flex items-center gap-2">
            <span className="font-semibold">Ligação {i + 1}</span>
            <label className="ml-auto flex items-center gap-2 text-xs">
              <Switch checked={!!l.padrao} onCheckedChange={(v) => muda(i, 'padrao', v)} /> Padrão (encomendas sem loja)
            </label>
            {form.length > 1 && (
              <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Retirar ligação" onClick={() => setForm((f) => f.filter((_, j) => j !== i))}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Identificador" ajuda="Curto, sem espaços: central, huambo, lubango…">
              <Input value={l.id} onChange={(e) => muda(i, 'id', e.target.value)} placeholder="central" />
            </Campo>
            <Campo rotulo="Endereço da API" ajuda="O domínio ou túnel HTTPS do KanGest (ex.: api-huambo.livrariaadventista.ao).">
              <Input value={l.url} onChange={(e) => muda(i, 'url', e.target.value)} placeholder="api.livrariaadventista.ao" />
            </Campo>
            <Campo rotulo="Chave da API" ajuda="kg_… — com as permissões da lista em docs/KANGEST.md.">
              <Input type="password" autoComplete="off" value={l.chave} onChange={(e) => muda(i, 'chave', e.target.value)} placeholder="kg_…" />
            </Campo>
            <Campo rotulo="Segredo dos avisos" ajuda="whsec_… — sem ele, stock e vendas só chegam de hora a hora.">
              <Input type="password" autoComplete="off" value={l.segredo} onChange={(e) => muda(i, 'segredo', e.target.value)} placeholder="whsec_…" />
            </Campo>
            <Campo rotulo="Artigo dos portes" ajuda="Referência no KanGest do artigo «Portes de envio».">
              <Input value={l.portes} onChange={(e) => muda(i, 'portes', e.target.value)} />
            </Campo>
            <Campo rotulo="Artigo genérico (opcional)" ajuda="Para edições digitais e produtos sem referência no KanGest.">
              <Input value={l.generico} onChange={(e) => muda(i, 'generico', e.target.value)} placeholder="DIGITAL" />
            </Campo>
            <Campo rotulo="Armazéns que vendem online" ajuda="N.º dos armazéns separados por vírgula. Vazio = todos.">
              <Input value={l.armazens_online} onChange={(e) => muda(i, 'armazens_online', e.target.value)} placeholder="1, 2" />
            </Campo>
          </div>
          {activas.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold">Lojas deste KanGest → n.º do armazém</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {activas.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">{s.name}</span>
                    <Input className="h-8 w-20" inputMode="numeric" value={l.lojas[s.id] ?? ''} onChange={(e) => mudaLoja(i, s.id, e.target.value)} placeholder="—" />
                  </label>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">Deixe vazio nas lojas que vendem noutro KanGest.</p>
            </div>
          )}
        </div>
      ))}
      <Button size="sm" variant="outline" onClick={() => setForm((f) => [...f, vazia()])}><Plus className="mr-1 h-4 w-4" />Outro KanGest (uma loja com servidor próprio)</Button>

      {metodos.length > 0 && (
        <div className="space-y-2 rounded-xl border p-4">
          <p className="text-sm font-semibold">Pagamentos do site → modo no KanGest</p>
          <datalist id="modos-kangest">{MODOS_KANGEST.map(([c, d]) => <option key={c} value={c}>{d}</option>)}</datalist>
          <div className="grid gap-2 sm:grid-cols-2">
            {metodos.map((m) => (
              <label key={m.code} className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{m.name}</span>
                <Input className="h-8 w-20 uppercase" list="modos-kangest" value={pagamentos[m.code] || ''} onChange={(e) => setPagamentos((p) => ({ ...p, [m.code]: e.target.value }))} />
              </label>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">NU numerário · MB Multicaixa · TB transferência · CC cartão. O «Testar ligação» confirma que o KanGest os tem.</p>
        </div>
      )}

      <div className="space-y-3 rounded-xl border p-4">
        <p className="text-sm font-semibold">1. Segredo KANGEST_LIGACOES</p>
        {erros.length > 0 ? (
          <ul className="space-y-1 text-sm text-red-700 dark:text-red-400">
            {erros.map((e) => <li key={e} className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{e}</li>)}
          </ul>
        ) : (
          <>
            <Bloco titulo="No terminal (Supabase CLI)" texto={comandoSegredo('KANGEST_LIGACOES', json, projecto)}
              aviso="Tem a chave da API: não o cole em conversas, emails nem no repositório." />
            <Bloco titulo="Ou em Supabase → Edge Functions → Secrets, com o nome KANGEST_LIGACOES" texto={json} />
          </>
        )}
      </div>

      <div className="space-y-3 rounded-xl border p-4">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold">2. Agendador (de 5 em 5 minutos)</p>
          <Button size="sm" variant="outline" className="ml-auto" onClick={() => setToken(tokenAleatorio())}>
            <KeyRound className="mr-1 h-4 w-4" />{token ? 'Gerar outro token' : 'Gerar token'}
          </Button>
        </div>
        {token ? (
          <>
            <Bloco titulo="No terminal" texto={comandoSegredo('KANGEST_CRON_TOKEN', token, projecto)} />
            <Bloco titulo="No Supabase → SQL Editor (o mesmo token)" texto={sqlAgendador(APP_API_URL, token)} />
          </>
        ) : (
          <p className="text-xs text-muted-foreground">Gera um token novo; grave-o nos dois sítios. Trocar o token só exige repetir os dois passos.</p>
        )}
      </div>
      <p className="text-xs text-muted-foreground">3. Depois de gravar os segredos, carregue em «Testar ligação».</p>
    </div>
  );
}

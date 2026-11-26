// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { useCallback, useEffect, useState } from 'react';
import { HeartPulse, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { sistemaSaude } from '@/api/PlatformApi';
import { cn } from '@/lib/utils';

const TONS = {
  ok: ['Tudo bem', 'bg-estado-ok-fundo text-estado-ok'],
  aviso: ['Atenção', 'bg-estado-aviso-fundo text-estado-aviso'],
  grave: ['Problema', 'bg-estado-erro-fundo text-estado-erro'],
};
const dataHora = (v) => (v ? new Date(v).toLocaleString('pt-PT', { timeZone: 'Africa/Luanda', dateStyle: 'short', timeStyle: 'short' }) : '—');

function Estado({ estado }) {
  const [rotulo, cor] = TONS[estado] || TONS.aviso;
  return <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', cor)}>{rotulo}</span>;
}

/**
 * A saúde do ecossistema (KANGEST ONE, fase E; GET /api/v1/system/health): a base, o Auth, o Storage, a fila de emails,
 * os postos do KanGest, a última migração e a versão mínima do KanGest. Só aparece a quem gere as configurações.
 */
export default function SaudeEcossistema() {
  const [s, setS] = useState(null);
  const [erro, setErro] = useState('');
  const [aLer, setALer] = useState(true);

  const ler = useCallback(async () => {
    setALer(true);
    setErro('');
    try {
      setS((await sistemaSaude()).data);
    } catch (e) {
      // sem «Gerir configurações» não se mostra nada
      if (e?.status === 403 || e?.status === 401) setS(null);
      else setErro(e?.message || 'Não foi possível ler a saúde do ecossistema.');
    } finally {
      setALer(false);
    }
  }, []);
  useEffect(() => { ler(); }, [ler]);

  if (!s && !erro) return null;
  const pecas = s ? [
    ['Base de dados', s.base],
    ['Contas (Auth)', s.auth],
    ['Ficheiros (Storage)', s.storage],
  ] : [];

  return (
    <section className="rounded-xl border p-3 text-sm" aria-labelledby="saude-ecossistema">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <HeartPulse className="h-4 w-4 text-primary" aria-hidden="true" />
        <h3 id="saude-ecossistema" className="font-semibold">Ecossistema</h3>
        {s && <Estado estado={s.estado} />}
        <Button size="sm" variant="outline" className="ml-auto h-7" onClick={ler} disabled={aLer}>
          <RefreshCw className={cn('mr-1 h-3.5 w-3.5', aLer && 'animate-spin')} />Actualizar
        </Button>
      </div>
      {erro && <p className="text-estado-erro">{erro}</p>}
      {s && (
        <div className="space-y-2">
          <ul className="flex flex-wrap gap-x-5 gap-y-1">
            {pecas.map(([nome, p]) => (
              <li key={nome} className="flex items-center gap-1.5">
                {nome} <Estado estado={p?.estado} />
                {p?.ms != null && <span className="text-xs text-muted-foreground">{p.ms} ms</span>}
                {p?.erro && <span className="text-xs text-estado-erro">{p.erro}</span>}
              </li>
            ))}
            <li className="flex items-center gap-1.5">
              Emails <Estado estado={s.emails?.estado} />
              <span className="text-xs text-muted-foreground">
                {s.emails?.pendentes ?? 0} por enviar · {s.emails?.falhados ?? 0} falhado(s){s.emails?.motivo ? ` · ${s.emails.motivo}` : ''}
              </span>
            </li>
          </ul>
          {s.postos?.length > 0 && (
            <ul className="space-y-0.5">
              {s.postos.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-1.5">
                  <span className="font-medium">{p.nome}</span> <Estado estado={p.estado} />
                  <span className="text-xs text-muted-foreground">
                    {[p.versao, `última sincronização ${dataHora(p.ultima_sinc)}`, p.motivo].filter(Boolean).join(' · ')}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">
            Base na migração {s.ultima_migracao || '—'} · API v{s.api}
            {s.kangest_min_version ? ` · KanGest mínimo ${s.kangest_min_version}` : ''} · {dataHora(s.hora)}
          </p>
        </div>
      )}
    </section>
  );
}

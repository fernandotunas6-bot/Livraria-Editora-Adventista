import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { EyeOff, Eye, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { deletePost, isMissingTable, loadModerationQueue, restorePost, setHidden } from '@/lib/communityApi';
import { linkHost } from '@/lib/communityLinks';
import { relativeTime } from '@/lib/communityText';
import BlockedDomainsPanel from '@/components/admin/BlockedDomainsPanel';
import { ClubsPanel, PostsPanel, TopicsPanel } from '@/components/admin/CommunityStaffPanels';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

/**
 * Moderação da comunidade: publicações denunciadas ou ocultas. À terceira denúncia a base de
 * dados oculta sozinha; aqui a equipa decide se volta a mostrar (e limpa as denúncias), se a
 * deixa oculta ou se a apaga.
 */
function ReportsPanel({ onMissing }) {
  const { toast } = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await loadModerationQueue());
      setMissing(false);
    } catch (e) {
      if (isMissingTable(e)) { setMissing(true); onMissing?.(); }
      else toast({ variant: 'destructive', title: 'Não foi possível carregar', description: e.message });
    } finally {
      setLoading(false);
    }
  }, [toast, onMissing]);

  useEffect(() => { load(); }, [load]);

  const act = async (id, fn, done) => {
    setBusy(id);
    try {
      await fn();
      toast({ title: done });
      await load();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Não foi possível', description: e.message });
    } finally {
      setBusy('');
    }
  };

  if (missing) {
    return <p className="text-sm text-muted-foreground">A comunidade ainda não está activa nesta base de dados (falta a migração <code>comunidade</code>).</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">Denúncias</h3>
          <p className="text-sm text-muted-foreground">Publicações denunciadas ou ocultas. Com 3 denúncias ficam ocultas até decidir.</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Actualizar
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : items.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Nenhuma publicação denunciada.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((p) => (
            <li key={p.id} className="rounded-xl border bg-card p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className={`rounded-full px-2 py-0.5 font-medium ${p.hidden ? 'bg-destructive/10 text-destructive' : 'bg-amber-100 text-amber-800'}`}>
                  {p.hidden ? 'Oculta' : 'Visível'}
                </span>
                <span>{p.reports_count} denúncia{p.reports_count === 1 ? '' : 's'}</span>
                <span>· {p.parent_id ? 'resposta' : 'publicação'}</span>
                <span>· {relativeTime(p.created)}</span>
                {p.book_id && <Link to={`/product/${p.book_id}`} className="text-primary hover:underline">· ver o livro</Link>}
              </div>
              <p className="mt-2 whitespace-pre-line break-words text-sm">{p.body}</p>
              {p.quote && <p className="mt-1 border-l-2 pl-2 text-sm italic text-muted-foreground">“{p.quote}”</p>}
              {Array.isArray(p.links) && p.links.length > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">Links: {p.links.map(linkHost).join(', ')}</p>
              )}
              {p.moderation_note && (
                <p className="mt-1 text-xs font-medium text-destructive">{p.moderation_note}</p>
              )}
              {p.reasons.length > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">Motivos: {[...new Set(p.reasons)].join(' · ')}</p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {p.hidden ? (
                  <Button size="sm" variant="outline" disabled={busy === p.id} onClick={() => act(p.id, () => restorePost(p.id), 'Publicação visível outra vez')}>
                    <Eye className="mr-1.5 h-4 w-4" /> Mostrar e limpar denúncias
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" disabled={busy === p.id} onClick={() => act(p.id, () => setHidden(p.id, true), 'Publicação oculta')}>
                    <EyeOff className="mr-1.5 h-4 w-4" /> Ocultar
                  </Button>
                )}
                <Button size="sm" variant="ghost" className="text-destructive" disabled={busy === p.id} onClick={() => act(p.id, () => deletePost(p.id), 'Publicação apagada')}>
                  <Trash2 className="mr-1.5 h-4 w-4" /> Apagar
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const SECTIONS = [
  ['denuncias', 'Denúncias'],
  ['publicacoes', 'Publicações'],
  ['temas', 'Temas'],
  ['clube', 'Clube do livro'],
  ['sites', 'Sites bloqueados'],
];

/** Painel da comunidade: moderação, publicações, temas, clube do livro e sites bloqueados. */
export default function CommunityTab() {
  const [section, setSection] = useState('denuncias');
  return (
    <div className="space-y-4">
      {/* Título e descrição no cabeçalho do painel (lib/adminSections.js). */}
      <Tabs value={section} onValueChange={setSection}>
        <TabsList className="h-auto flex-wrap justify-start">
          {SECTIONS.map(([value, label]) => <TabsTrigger key={value} value={value}>{label}</TabsTrigger>)}
        </TabsList>
        <TabsContent value="denuncias" className="pt-2"><ReportsPanel /></TabsContent>
        <TabsContent value="publicacoes" className="pt-2"><PostsPanel /></TabsContent>
        <TabsContent value="temas" className="pt-2"><TopicsPanel /></TabsContent>
        <TabsContent value="clube" className="pt-2"><ClubsPanel /></TabsContent>
        <TabsContent value="sites" className="pt-2"><BlockedDomainsPanel /></TabsContent>
      </Tabs>
    </div>
  );
}

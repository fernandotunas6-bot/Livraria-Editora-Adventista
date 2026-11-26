// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Apple, Copy, Download, Monitor, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { lerInstaladores, sistemaDoAparelho, tamanhoLegivel } from '@/lib/kangestInstalador';

const data = (v) => (v ? new Date(`${v}T12:00:00`).toLocaleDateString('pt-PT', { dateStyle: 'long' }) : '');

/**
 * Descarregar o KanGest Livraria (docs/KANGEST.md, «Descarregar e actualizar»): os instaladores que o «publicar» do
 * kangest-livraria.yml pôs no site, para Windows e para Mac (Apple Silicon e Intel), com a versão, o SHA-256 e um
 * aviso claro quando é uma versão de ensaio (sem a chave do produtor da AGT). O do sistema deste aparelho vem
 * primeiro. Fica só no painel, junto dos postos: é o programa das lojas.
 */
export default function KanGestDescarregar() {
  const [lista, setLista] = useState(undefined);

  useEffect(() => {
    let vivo = true;
    lerInstaladores().then((l) => vivo && setLista(l), () => vivo && setLista(null));
    return () => { vivo = false; };
  }, []);
  const aqui = sistemaDoAparelho();
  const destaque = (i) => (aqui === 'windows' && i.sistema.startsWith('windows')) || (aqui === 'mac' && i.sistema.startsWith('macos'));
  const instalador = lista?.[0];
  const temMac = (lista || []).some((i) => i.sistema.startsWith('macos'));

  const copiar = (txt) => navigator.clipboard?.writeText(txt).then(() => toast.success('Copiado.'), () => toast.error('Não foi possível copiar.'));

  return (
    <section className="space-y-3 rounded-xl border p-4">
      <h3 className="flex items-center gap-2 font-semibold"><Download className="h-4 w-4" />Descarregar o KanGest Livraria</h3>

      {lista === undefined && <p className="text-sm text-muted-foreground">A procurar os instaladores…</p>}

      {lista === null && (
        <p className="text-sm text-muted-foreground">
          Ainda não há instalador publicado no site. Gera-se no GitHub: <strong>Actions → KanGest Livraria → Run workflow</strong>,
          a partir do <code>main</code>, com «Publicar o instalador no site».
        </p>
      )}

      {instalador && (
        <>
          {!instalador.certificado && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm" role="alert">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <p>
                <strong>Versão de ensaio.</strong> Este instalador não leva a chave do produtor da AGT: as facturas saem com a
                chave de desenvolvimento e não valem para vender ao público. Serve para o ensaio (<code>docs/KANGEST-ENSAIO.md</code>).
              </p>
            </div>
          )}

          <p className="text-sm text-muted-foreground">
            Versão {instalador.versao}
            {instalador.data ? ` · ${data(instalador.data)}` : ''}
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {lista.map((i) => (
              <div key={i.sistema} className={`space-y-2 rounded-lg border p-3 ${destaque(i) ? 'border-primary/60 bg-primary/5' : ''}`}>
                <div className="flex items-center gap-2 font-medium">
                  {i.sistema.startsWith('macos') ? <Apple className="h-4 w-4" /> : <Monitor className="h-4 w-4" />}
                  {i.rotulo}
                </div>
                <p className="text-xs text-muted-foreground">{i.detalhe}{i.tamanho ? ` · ${tamanhoLegivel(i.tamanho)}` : ''}</p>
                <Button asChild size="sm" variant={destaque(i) ? 'default' : 'outline'} className="w-full">
                  <a href={i.endereco} download={i.ficheiro}><Download className="mr-1 h-4 w-4" />Descarregar</a>
                </Button>
                <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <span className="shrink-0">SHA-256:</span>
                  <code className="min-w-0 flex-1 truncate rounded bg-muted px-1.5 py-0.5">{i.sha256}</code>
                  <Button size="sm" variant="ghost" className="h-6 px-1.5" onClick={() => copiar(i.sha256)} aria-label={`Copiar o SHA-256 do instalador ${i.rotulo}`}><Copy className="h-3 w-3" /></Button>
                </div>
                {i.assinado ? (
                  <p className="flex items-center gap-1 text-[11px] text-muted-foreground"><ShieldCheck className="h-3 w-3 text-emerald-600" />Assinado para as actualizações</p>
                ) : (
                  <p className="flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-400"><AlertTriangle className="h-3 w-3" />Sem assinatura das actualizações</p>
                )}
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            O programa só aceita versões novas assinadas com a chave das actualizações da edição.
          </p>

          {temMac && (
            <div className="space-y-1 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
              <p><strong className="text-foreground">No Mac:</strong> para saber qual escolher, abra o menu da maçã → <em>Acerca deste Mac</em>: «Chip Apple M…» é Apple Silicon; «Processador … Intel» é Intel.</p>
              <p>Abra o ficheiro .dmg e arraste o KanGest Livraria para <em>Aplicações</em>. Na primeira vez, abra-o com o botão direito → <em>Abrir</em> (o macOS pergunta, porque o programa não é da App Store).</p>
            </div>
          )}

          <ol className="list-decimal space-y-1 pl-5 text-sm">
            <li>Instale-o no computador servidor da loja. Pode ficar ao lado do KanGest oficial: tem a sua pasta de dados.</li>
            <li>
              Para trazer os dados do KanGest oficial: no oficial, <em>Configurações → Sistema → Fazer cópia</em>; no KanGest Livraria,
              «Já tem uma cópia de segurança do KanGest?» no primeiro arranque.
            </li>
            <li>Crie o posto da loja aqui em baixo e escreva o código no KanGest Livraria, em <em>Livraria → Ligação ao site</em>.</li>
            <li>
              Para as versões novas chegarem sozinhas: <em>Sistema → Sobre o KanGest → Actualizações → Usar a origem oficial</em>.
            </li>
          </ol>
        </>
      )}
    </section>
  );
}

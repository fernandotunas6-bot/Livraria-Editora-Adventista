// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Copy, Download, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { lerInstalador, tamanhoLegivel } from '@/lib/kangestInstalador';

const data = (v) => (v ? new Date(`${v}T12:00:00`).toLocaleDateString('pt-PT', { dateStyle: 'long' }) : '');

/**
 * Descarregar o KanGest Livraria (docs/KANGEST.md, «Descarregar e actualizar»): o instalador do Windows que o
 * «publicar» do kangest-livraria.yml pôs no site, com a versão, o SHA-256 e um aviso claro quando é uma versão de
 * ensaio (sem a chave do produtor da AGT). Fica só no painel, junto dos postos: é o programa das lojas.
 */
export default function KanGestDescarregar() {
  const [instalador, setInstalador] = useState(undefined);

  useEffect(() => {
    let vivo = true;
    lerInstalador().then((i) => vivo && setInstalador(i), () => vivo && setInstalador(null));
    return () => { vivo = false; };
  }, []);

  const copiar = (txt) => navigator.clipboard?.writeText(txt).then(() => toast.success('Copiado.'), () => toast.error('Não foi possível copiar.'));

  return (
    <section className="space-y-3 rounded-xl border p-4">
      <h3 className="flex items-center gap-2 font-semibold"><Download className="h-4 w-4" />Descarregar o KanGest Livraria</h3>

      {instalador === undefined && <p className="text-sm text-muted-foreground">A procurar o instalador…</p>}

      {instalador === null && (
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

          <div className="flex flex-wrap items-center gap-3">
            <Button asChild>
              <a href={instalador.endereco} download={instalador.ficheiro}><Download className="mr-1 h-4 w-4" />Descarregar para Windows</a>
            </Button>
            <span className="text-sm text-muted-foreground">
              Versão {instalador.versao}
              {instalador.data ? ` · ${data(instalador.data)}` : ''}
              {instalador.tamanho ? ` · ${tamanhoLegivel(instalador.tamanho)}` : ''}
            </span>
          </div>

          <div className="space-y-1 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <span className="shrink-0">SHA-256:</span>
              <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1">{instalador.sha256}</code>
              <Button size="sm" variant="outline" className="h-7" onClick={() => copiar(instalador.sha256)}><Copy className="mr-1 h-3.5 w-3.5" />Copiar</Button>
            </div>
            {instalador.assinado ? (
              <p className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />Assinado com a chave das actualizações da edição: o programa só aceita versões novas assinadas com ela.</p>
            ) : (
              <p className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400"><AlertTriangle className="h-3.5 w-3.5" />Sem assinatura das actualizações.</p>
            )}
          </div>

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

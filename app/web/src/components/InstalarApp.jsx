import React, { useState } from 'react';
import { Check, Copy, Download, EllipsisVertical, Share, SquarePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useInstalarApp } from '@/hooks/useInstalarApp';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import { cn } from '@/lib/utils';

function Passo({ n, children }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary" aria-hidden="true">{n}</span>
      <span className="min-w-0 pt-0.5 text-sm leading-relaxed">{children}</span>
    </li>
  );
}

const Icone = ({ icon: I, label }) => (
  <span className="mx-0.5 inline-flex translate-y-0.5 items-center rounded-md border border-border bg-muted px-1 py-0.5" role="img" aria-label={label}>
    <I className="h-3.5 w-3.5" aria-hidden="true" />
  </span>
);

/**
 * Os passos para instalar onde o navegador não abre a janela de instalação (iPhone e iPad,
 * navegadores dentro de outras apps, Firefox no Android…). Ver lib/pwaInstall.js.
 */
export function InstalarAppDialog({ open, onOpenChange, modo, nome = 'Livraria Adventista' }) {
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch { /* sem área de transferência: a pessoa copia o endereço à mão */ }
  };
  const ipad = typeof navigator !== 'undefined' && /iPad|Macintosh/i.test(navigator.userAgent || '');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-2rem)] rounded-2xl sm:max-w-md">
        <DialogHeader className="text-left">
          <DialogTitle>
            {modo === 'ios-app' ? 'Abra no Safari para instalar' : `Instalar a ${nome}`}
          </DialogTitle>
          <DialogDescription>
            {modo === 'ios-app'
              ? 'Está dentro de outra app (WhatsApp, Facebook, Instagram…), que não deixa instalar.'
              : 'Fica no ecrã principal como uma app: abre em ecrã inteiro e actualiza-se sozinha.'}
          </DialogDescription>
        </DialogHeader>

        {modo === 'ios' && (
          <ol className="space-y-3">
            <Passo n={1}>
              Toque em Partilhar <Icone icon={Share} label="Partilhar" />
              {ipad ? ' (no topo do Safari).' : ' (na barra de baixo do Safari; no Chrome, ao lado do endereço).'}
            </Passo>
            <Passo n={2}>
              Deslize a lista e toque em <b>«Adicionar ao ecrã principal»</b> <Icone icon={SquarePlus} label="Adicionar ao ecrã principal" />.
            </Passo>
            <Passo n={3}>Toque em <b>«Adicionar»</b>, no canto de cima. A app aparece no ecrã principal.</Passo>
          </ol>
        )}
        {modo === 'ios-app' && (
          <ol className="space-y-3">
            <Passo n={1}>
              Toque nos três pontos <Icone icon={EllipsisVertical} label="Mais opções" /> ou em <b>⋯</b> e escolha
              {' '}<b>«Abrir no Safari»</b> (ou «Abrir no navegador»).
            </Passo>
            <Passo n={2}>No Safari, toque outra vez em <b>Instalar a app</b> e siga os passos.</Passo>
          </ol>
        )}
        {modo === 'manual' && (
          <ol className="space-y-3">
            <Passo n={1}>Abra o menu do navegador <Icone icon={EllipsisVertical} label="Menu" /> (os três pontos).</Passo>
            <Passo n={2}>Toque em <b>«Instalar app»</b> ou <b>«Adicionar ao ecrã principal»</b>.</Passo>
            <Passo n={3}>Confirme. A app aparece no ecrã principal.</Passo>
          </ol>
        )}

        <DialogFooter className="flex-row gap-2 sm:justify-between">
          {modo === 'ios-app' ? (
            <Button type="button" variant="outline" onClick={copiar} className="flex-1 sm:flex-none">
              {copiado ? <Check className="mr-2 h-4 w-4" aria-hidden="true" /> : <Copy className="mr-2 h-4 w-4" aria-hidden="true" />}
              {copiado ? 'Endereço copiado' : 'Copiar o endereço'}
            </Button>
          ) : <span className="hidden sm:block" />}
          <Button type="button" onClick={() => onOpenChange(false)} className="flex-1 sm:flex-none">Percebi</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * O botão «Instalar a app», para quem ainda não a tem instalada no telemóvel. Não aparece na app
 * instalada, no computador (sem pedido do navegador) nem com a instalação desligada no painel.
 *  · `variante="icone"`: só o ícone (barra do topo do painel);
 *  · `variante="menu"`: uma linha de menu (menu do telemóvel do site);
 *  · `variante="botao"`: um botão normal.
 */
export function BotaoInstalarApp({ variante = 'botao', className, onDepois, ...props }) {
  const { settings } = useSiteSettings();
  const { modo, instalar, visivel } = useInstalarApp();
  const [passos, setPassos] = useState(false);
  if (!visivel || settings.pwa_enabled === false) return null;
  const nome = settings.pwa_short_name || 'Livraria Adventista';

  const carregar = async () => {
    const abriuJanela = await instalar();
    if (!abriuJanela) setPassos(true);
    onDepois?.();
  };

  let botao;
  if (variante === 'icone') {
    botao = (
      <Button
        type="button" variant="ghost" size="icon" onClick={carregar}
        className={cn('h-9 w-9 shrink-0 text-primary', className)}
        aria-label="Instalar a app" title="Instalar a app no telemóvel" {...props}
      >
        <Download className="h-4 w-4" aria-hidden="true" />
      </Button>
    );
  } else if (variante === 'menu') {
    botao = (
      <button type="button" onClick={carregar} className={className} {...props}>
        <Download className="h-4 w-4 text-[#22d3ee]" aria-hidden="true" /> Instalar a app
      </button>
    );
  } else {
    botao = (
      <Button type="button" onClick={carregar} className={className} {...props}>
        <Download className="mr-2 h-4 w-4" aria-hidden="true" /> Instalar a app
      </Button>
    );
  }
  return (
    <>
      {botao}
      <InstalarAppDialog open={passos} onOpenChange={setPassos} modo={modo} nome={nome} />
    </>
  );
}

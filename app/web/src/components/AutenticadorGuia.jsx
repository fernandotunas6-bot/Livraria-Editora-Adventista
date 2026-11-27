// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import * as React from 'react';
import { Download, ExternalLink, KeyRound, Plus, ScanLine, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** As páginas oficiais do Google Authenticator nas lojas de aplicações. */
export const GOOGLE_AUTHENTICATOR = {
  ios: 'https://apps.apple.com/app/google-authenticator/id388497605',
  android: 'https://play.google.com/store/apps/details?id=com.google.android.apps.authenticator2',
};

/** Só um endereço otpauth://totp/… abre a aplicação autenticadora (o que o Supabase devolve ao activar). */
export const otpauthValido = (uri) => /^otpauth:\/\/totp\/[^\s]+$/i.test(String(uri || ''));

/** As ligações para instalar o Google Authenticator (iPhone e Android). */
export function AppsAutenticadoras({ className = '' }) {
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      <Button asChild variant="outline" size="sm">
        <a href={GOOGLE_AUTHENTICATOR.ios} target="_blank" rel="noopener noreferrer">
          <Smartphone className="mr-1.5 h-4 w-4" aria-hidden="true" />
          Google Authenticator para iPhone
          <ExternalLink className="ml-1.5 h-3.5 w-3.5 opacity-60" aria-hidden="true" />
        </a>
      </Button>
      <Button asChild variant="outline" size="sm">
        <a href={GOOGLE_AUTHENTICATOR.android} target="_blank" rel="noopener noreferrer">
          <Smartphone className="mr-1.5 h-4 w-4" aria-hidden="true" />
          Google Authenticator para Android
          <ExternalLink className="ml-1.5 h-3.5 w-3.5 opacity-60" aria-hidden="true" />
        </a>
      </Button>
    </div>
  );
}

/** Um telemóvel desenhado, com o que se vê na aplicação em cada passo. */
function Telemovel({ children }) {
  return (
    <div className="mx-auto flex h-28 w-[4.5rem] flex-col rounded-[1.1rem] border-2 border-foreground/70 bg-background p-1.5 shadow-sm" aria-hidden="true">
      <div className="mx-auto mb-1 h-1 w-5 rounded-full bg-foreground/30" />
      <div className="relative flex flex-1 flex-col items-center justify-center rounded-[0.6rem] bg-muted/60 text-primary">{children}</div>
    </div>
  );
}

const PASSOS = [
  {
    titulo: 'Instale a aplicação',
    texto: 'O Google Authenticator, grátis, na App Store (iPhone) ou no Google Play (Android).',
    desenho: <Download className="h-7 w-7" />,
  },
  {
    titulo: 'Toque em «+»',
    texto: 'Abra a aplicação e toque no «+», no canto de baixo.',
    desenho: (
      <>
        <span className="mb-3 h-1.5 w-8 rounded bg-foreground/15" />
        <span className="absolute bottom-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Plus className="h-4 w-4" />
        </span>
      </>
    ),
  },
  {
    titulo: 'Leia o código QR',
    texto: 'Escolha «Ler código QR» e aponte a câmara ao quadrado desta página.',
    desenho: <ScanLine className="h-8 w-8" />,
  },
  {
    titulo: 'Escreva o código',
    texto: 'A aplicação mostra 6 algarismos, que mudam a cada 30 segundos. Escreva-os aqui em baixo.',
    desenho: (
      <>
        <KeyRound className="mb-1 h-5 w-5" />
        <span className="font-mono text-[11px] font-semibold tracking-wider text-foreground">123 456</span>
      </>
    ),
  },
];

/**
 * Como activar, com desenhos: instalar o Google Authenticator, tocar em «+», ler o QR e escrever o código. Num
 * telemóvel, `uri` (o otpauth:// da activação) abre a aplicação já com a conta, sem ler o QR.
 */
export function PassosAutenticador({ uri }) {
  return (
    <div className="flex flex-col gap-4">
      <ol className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Como activar a verificação em dois passos">
        {PASSOS.map((p, i) => (
          <li key={p.titulo} className="rounded-lg border bg-muted/20 p-3 text-center">
            <Telemovel>{p.desenho}</Telemovel>
            <p className="mt-2 text-sm font-semibold">
              <span className="mr-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">{i + 1}</span>
              {p.titulo}
            </p>
            <p className="mt-1 text-xs leading-snug text-muted-foreground">{p.texto}</p>
          </li>
        ))}
      </ol>
      <AppsAutenticadoras />
      {otpauthValido(uri) && (
        // no telemóvel é o caminho mais curto (não se lê o QR com a câmara do próprio telemóvel): vem primeiro
        <div className="order-first rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm sm:order-none">
          <p className="font-medium">Está a usar o telemóvel onde tem a aplicação?</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Em vez de ler o QR, toque aqui: a aplicação abre já com a conta. Depois volte a esta página e escreva o código.</p>
          <Button asChild size="sm" className="mt-2">
            <a href={uri}>
              <KeyRound className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Abrir na aplicação autenticadora
            </a>
          </Button>
        </div>
      )}
    </div>
  );
}

export default PassosAutenticador;

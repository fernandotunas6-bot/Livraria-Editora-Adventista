// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { useMemo } from 'react';
import LegalDocument from '@/components/LegalDocument';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import { TERMS_UPDATED, termsSections } from '@/lib/termsPolicy';

/** Termos e condições (/termos): o texto vem de lib/termsPolicy.js. */
export default function TermsPage() {
  const { settings } = useSiteSettings();
  const sections = useMemo(() => termsSections(settings), [settings]);

  return (
    <LegalDocument
      title="Termos e condições"
      description="As regras da loja online: conta, encomendas, pagamentos, entregas, devoluções, edições digitais, comunidade e as responsabilidades de cada parte."
      updated={TERMS_UPDATED}
      sections={sections}
    />
  );
}

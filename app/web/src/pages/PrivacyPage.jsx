import React, { useMemo } from 'react';
import LegalDocument from '@/components/LegalDocument';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import { PRIVACY_UPDATED, privacySections } from '@/lib/privacyPolicy';

/** Política de privacidade (/privacidade): o texto vem de lib/privacyPolicy.js. */
export default function PrivacyPage() {
  const { settings } = useSiteSettings();
  const sections = useMemo(() => privacySections(settings), [settings]);

  return (
    <LegalDocument
      title="Política de privacidade"
      description="Que dados pessoais tratamos na loja, na comunidade de leitores e no atendimento, com quem os partilhamos e como exercer os seus direitos."
      updated={PRIVACY_UPDATED}
      sections={sections}
    />
  );
}

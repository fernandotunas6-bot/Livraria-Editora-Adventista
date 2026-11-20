// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React from 'react';
import { Input } from '@/components/ui/input';
import { formatAngolaPhone } from '@/lib/angolaPhone';

/**
 * Campo de telefone com formatação automática +244 9XX XXX XXX
 */
export default function PhoneInput({ value, onChange, className, disabled, id, placeholder = '+244 9XX XXX XXX' }) {
  return (
    <Input
      id={id}
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      className={className}
      disabled={disabled}
      value={value ?? ''}
      onChange={(e) => onChange?.(formatAngolaPhone(e.target.value))}
      onFocus={(e) => {
        if (!e.target.value.trim()) onChange?.('+244 ');
      }}
      placeholder={placeholder}
    />
  );
}

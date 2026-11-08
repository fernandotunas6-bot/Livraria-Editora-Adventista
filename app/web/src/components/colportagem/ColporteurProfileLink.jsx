import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BadgeCheck, ChevronRight } from 'lucide-react';
import { colporteurMe } from '@/lib/colporteurApi';

/**
 * Atalho para a área do colportor no perfil, só para quem é colportor (conta ligada a uma ficha).
 * Sem a migração, ou para quem não é colportor, não mostra nada.
 */
export default function ColporteurProfileLink() {
  const [me, setMe] = useState(null);
  useEffect(() => {
    let alive = true;
    colporteurMe().then((r) => { if (alive) setMe(r || null); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  if (!me) return null;
  return (
    <Link to="/colportor" className="bg-card border rounded-xl p-4 flex items-center gap-3 hover:border-marca/40 transition-colors group">
      <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
        <BadgeCheck className="h-5 w-5 text-amber-600" />
      </div>
      <div className="flex-1">
        <p className="font-medium">Área do colportor</p>
        <p className="text-xs text-muted-foreground">{me.code} · relatório, livros e conta</p>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
    </Link>
  );
}

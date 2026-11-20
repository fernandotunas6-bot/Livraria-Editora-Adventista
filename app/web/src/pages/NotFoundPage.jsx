// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React from 'react';
import { Helmet } from 'react-helmet';
import { Link, useLocation } from 'react-router-dom';
import { BookOpen, Home, MessageCircle, Truck } from 'lucide-react';
import { pageTitle } from '@/lib/brand';

// Quem chega aqui veio quase sempre de um link antigo ou partilhado. Antes só havia "Voltar ao
// Início", e o separador dizia apenas "Livraria Adventista": não se percebia que a página não
// existia nem para onde ir. `noindex` para os motores de busca não guardarem o endereço errado.
const CAMINHOS = [
  { to: '/shop', label: 'Ver o catálogo', description: 'Livros, Bíblias, materiais e mais', icon: BookOpen },
  { to: '/track', label: 'Rastrear encomenda', description: 'Com o número e o email da compra', icon: Truck },
  { to: '/contact', label: 'Falar connosco', description: 'Telefone, email e lojas', icon: MessageCircle },
  { to: '/', label: 'Página inicial', description: 'Novidades e destaques', icon: Home },
];

export default function NotFoundPage() {
  const { pathname } = useLocation();
  return (
    <>
      <Helmet>
        <title>{pageTitle('Página não encontrada')}</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <main className="min-h-screen flex items-center justify-center bg-background px-4 py-16">
        <div className="w-full max-w-md text-center">
          <p className="text-6xl font-bold text-foreground mb-3" aria-hidden="true">404</p>
          <h1 className="text-2xl font-bold text-foreground mb-2">Página não encontrada</h1>
          <p className="text-muted-foreground mb-8 wrap-break-word">
            O endereço <code className="text-sm">{pathname}</code> não existe ou mudou de sítio.
          </p>
          <ul className="grid gap-2 text-left">
            {CAMINHOS.map(({ to, label, description, icon: Icon }) => (
              <li key={to}>
                <Link to={to} className="flex items-center gap-3 rounded-xl border border-border p-3 hover:bg-muted/50 transition-colors">
                  <Icon className="h-5 w-5 text-primary shrink-0" aria-hidden="true" />
                  <span>
                    <span className="block font-medium text-foreground">{label}</span>
                    <span className="block text-xs text-muted-foreground">{description}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </main>
    </>
  );
}

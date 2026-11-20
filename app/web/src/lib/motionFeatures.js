// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

// As animações do Framer Motion, carregadas depois da primeira pintura (LazyMotion em App.jsx).
// Os componentes usam `m` (importado como `motion`), que é só a casca: sem isto, os 38 KB
// comprimidos do motor de animação iam no carregamento inicial de todas as páginas.
// `domAnimation` cobre o que o site usa — animate, exit, variantes, hover, tap e whileInView;
// arrastar e animações de layout (domMax) não são usados.
export { domAnimation as default } from 'framer-motion';

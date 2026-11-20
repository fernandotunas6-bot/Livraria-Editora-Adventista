// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

/**
 * Posição fixa do assistente — canto inferior esquerdo.
 *
 * O afastamento ao fundo soma a área segura do sistema e a altura da barra de compra, que
 * aparece na ficha de um livro quando os botões reais já passaram — sem isso, o assistente
 * ficava por cima dela e tapava o preço. Com `viewport-fit=cover` no
 * `index.html`, a página estende-se para baixo da barra de gestos do telemóvel: 24px fixos
 * deixavam o botão por baixo dela, onde o toque vai para o sistema e não para a página.
 * `env()` devolve zero em quem não tem barra nenhuma, por isso não é preciso distinguir
 * equipamentos.
 */
export function useChatPosition() {
  const fixedStyle = {
    position: 'fixed',
    zIndex: 45,
    // + o aviso "Instalar App" quando ocupa a largura toda (telemóvel); ver installPrompt.js.
    bottom: 'calc(24px + env(safe-area-inset-bottom, 0px) + var(--barra-compra, 0px) + var(--barra-navegacao, 0px) + var(--aviso-instalar, 0px))',
    // 16 px do canto: o botão (48 px) acaba nos 64 px e cabe na margem do conteúdo em 1366 px
    // (75 px). A 24 px tocava na capa do livro e nas grelhas.
    left: 'calc(16px + env(safe-area-inset-left, 0px))',
    // Desce e sobe com a barra de baixo (que se esconde ao descer a página), ao mesmo ritmo
    // dela e do "Voltar ao topo", em vez de saltar.
    transition: 'bottom 300ms ease-out',
  };

  return { fixedStyle };
}

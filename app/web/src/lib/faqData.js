/**
 * Perguntas frequentes.
 *
 * Cada resposta descreve o que a loja faz de facto (o checkout, o painel e a Edge Function),
 * não o que uma loja genérica faria. Os valores que mudam no painel — portes, envio grátis —
 * entram por marcadores (`{free_threshold}`, `{shipping_cost}`, `{express_cost}`) e são
 * preenchidos com as Configurações, para a resposta nunca discordar do que o cliente paga.
 *
 * `link` leva a pergunta à página onde a coisa se faz.
 */
export const FAQ_SECTIONS = [
  {
    id: 'encomendas',
    category: 'Encomendas',
    questions: [
      {
        question: 'Como faço uma encomenda?',
        answer: 'Junte os livros ao carrinho, escolha entre entrega ao domicílio ou levantamento numa loja, indique os seus dados e o método de pagamento, e confirme. Recebe logo o número da encomenda, que serve para a acompanhar.',
        link: { to: '/shop', label: 'Ver o catálogo' },
      },
      {
        question: 'Preciso de conta para comprar?',
        answer: 'Para levantar na loja, não: basta o nome, o telefone e o email. Para entrega ao domicílio, sim — a conta guarda a morada e permite-nos confirmar a entrega consigo. Com conta também vê o histórico de encomendas e a lista de desejos.',
        link: { to: '/login', label: 'Entrar ou criar conta' },
      },
      {
        question: 'Posso alterar ou cancelar uma encomenda?',
        answer: 'Enquanto não estiver expedida, sim: fale connosco com o número da encomenda. Depois de sair da loja já não é possível alterar, mas pode devolver os livros nas condições de devolução.',
        link: { to: '/contact', label: 'Falar connosco' },
      },
      {
        question: 'Como acompanho a minha encomenda?',
        answer: 'Na página Rastrear Encomenda, com o número da encomenda e o email que usou. Se tiver conta, as encomendas aparecem também no seu perfil. Avisamos por email (e por WhatsApp, quando activo) sempre que a encomenda muda de etapa.',
        link: { to: '/track', label: 'Rastrear encomenda' },
      },
      {
        question: 'Um livro está esgotado. Ainda o posso receber?',
        answer: 'O stock do site é o das nossas lojas. Se um livro aparecer esgotado, escreva-nos: dizemos-lhe se há reposição prevista ou se existe noutra loja.',
      },
    ],
  },
  {
    id: 'pagamentos',
    category: 'Pagamentos',
    questions: [
      {
        question: 'Que métodos de pagamento aceitam?',
        answer: 'Os que estiverem activos no checkout — normalmente transferência bancária, Multicaixa Express e pagamento na entrega ou no levantamento. Os preços são em kwanzas (Kz) e já incluem os impostos aplicáveis.',
      },
      {
        question: 'Paguei por transferência ou Multicaixa Express. E agora?',
        answer: 'No checkout, escreva a referência ou o número do comprovativo. A nossa equipa confere o pagamento e confirma a encomenda; nessa altura recebe um email. Até lá, a encomenda fica "a aguardar confirmação".',
      },
      {
        question: 'Os meus dados de pagamento estão seguros?',
        answer: 'O site não pede nem guarda dados de cartão: os pagamentos são feitos no seu banco ou no Multicaixa Express, e aqui fica só a referência que nos indicar. A ligação ao site é sempre encriptada (HTTPS).',
        link: { to: '/privacidade', label: 'Política de privacidade' },
      },
      {
        question: 'Recebo fatura ou recibo?',
        answer: 'Pode descarregar o recibo de cada encomenda no seu perfil, em "Encomendas". Se precisar de fatura com o seu NIF, peça-nos com o número da encomenda.',
      },
    ],
  },
  {
    id: 'entregas',
    category: 'Entregas e levantamento',
    questions: [
      {
        question: 'Quanto custa e quanto demora a entrega?',
        answer: 'Entrega ao domicílio: {shipping_cost}, 5 a 7 dias úteis em Luanda e 7 a 14 dias úteis nas outras províncias. Entrega expressa: {express_cost}, 24 a 48 horas em Luanda. Os prazos contam a partir da confirmação do pagamento.',
        link: { to: '/shipping-returns', label: 'Envios e devoluções' },
      },
      {
        question: 'Oferecem envio grátis?',
        answer: 'Sim, em encomendas a partir de {free_threshold}, em todo o território nacional. O levantamento na loja é sempre grátis.',
      },
      {
        question: 'Como funciona o levantamento na loja?',
        answer: 'Escolha a loja no checkout. Avisamos quando a encomenda estiver pronta; leve o número da encomenda e um documento de identificação.',
        link: { to: '/lojas', label: 'Lojas e horários' },
      },
      {
        question: 'Porque é que me pedem assinatura na entrega?',
        answer: 'Para provar que a encomenda chegou às mãos certas. Na entrega registamos o nome de quem recebe, a assinatura e a hora. Se for outra pessoa a receber por si, fica registado o nome dela.',
        link: { to: '/privacidade', label: 'O que fazemos com estes dados' },
      },
      {
        question: 'E se ninguém estiver em casa?',
        answer: 'Contactamos pelo telefone indicado na encomenda para combinar outra hora. Se a entrega não for possível, a encomenda volta à loja e combinamos consigo o reenvio ou o levantamento.',
      },
    ],
  },
  {
    id: 'devolucoes',
    category: 'Devoluções e reembolsos',
    questions: [
      {
        question: 'Qual é a política de devolução?',
        answer: 'Tem 30 dias a contar da entrega para devolver um livro em bom estado e na embalagem original. Livros danificados no transporte ou diferentes do encomendado são trocados ou reembolsados por nossa conta.',
        link: { to: '/shipping-returns', label: 'Condições completas' },
      },
      {
        question: 'Como peço uma devolução?',
        answer: 'Escreva-nos pela página de Contacto com o número da encomenda e o motivo. Combinamos a recolha ou a entrega numa das lojas.',
        link: { to: '/contact', label: 'Pedir devolução' },
      },
      {
        question: 'Quando recebo o reembolso?',
        answer: 'Depois de recebermos e conferirmos o livro, devolvemos o valor pelo mesmo meio de pagamento (ou por transferência, nos pagamentos em numerário). Enviamos um email quando o reembolso for feito; conforme o banco, pode levar alguns dias a aparecer.',
      },
    ],
  },
  {
    id: 'conta',
    category: 'Conta e segurança',
    questions: [
      {
        question: 'Esqueci-me da palavra-passe.',
        answer: 'Use "Esqueceu?" no ecrã de entrada: enviamos um link para escolher uma nova, válido durante uma hora. Se entrou sempre com a Google, pode continuar a fazê-lo sem palavra-passe.',
        link: { to: '/forgot-password', label: 'Recuperar acesso' },
      },
      {
        question: 'Recebi um aviso de novo acesso que não reconheço.',
        answer: 'Mude a palavra-passe e, em Perfil → Segurança, termine a sessão em todos os aparelhos. Se tiver dúvidas, fale connosco: nunca lhe pedimos a palavra-passe por email nem por telefone.',
        link: { to: '/profile?tab=security', label: 'Segurança da conta' },
      },
      {
        question: 'Como mudo o meu email ou os meus dados?',
        answer: 'Em Perfil → Definições. Ao mudar o email, enviamos um link de confirmação para o endereço novo e um aviso para o antigo; até confirmar, a conta continua no email actual.',
        link: { to: '/profile?tab=settings', label: 'Os meus dados' },
      },
      {
        question: 'Como apago a minha conta?',
        answer: 'Peça-nos pela página de Contacto, a partir do email da conta. Apagamos os dados de acesso e o perfil; as encomendas ficam guardadas pelo tempo que a lei exige para os documentos de venda.',
        link: { to: '/privacidade', label: 'Os seus direitos' },
      },
    ],
  },
  {
    id: 'comunicacoes',
    category: 'Novidades e comunicações',
    questions: [
      {
        question: 'Que emails vou receber?',
        answer: 'Sempre: a confirmação da encomenda, do pagamento, da entrega e os avisos de segurança da conta. Só se aceitar: novidades e campanhas. Cada email de novidades tem um link para deixar de as receber.',
      },
      {
        question: 'Como deixo de receber as novidades?',
        answer: 'Clique em "Deixar de receber estas mensagens" no fim de qualquer email de novidades. Funciona com um clique, sem precisar de entrar na conta.',
      },
    ],
  },
];

/**
 * As secções com os marcadores preenchidos. `values` traz os valores já formatados (a página
 * calcula-os com as mesmas funções do checkout). Um marcador sem valor fica à vista, para se
 * notar, em vez de desaparecer.
 */
export function buildFaq(values = {}) {
  const fill = (text) => String(text).replace(/\{([a-z_]+)\}/g, (whole, key) => (values[key] ? values[key] : whole));
  return FAQ_SECTIONS.map((section) => ({
    ...section,
    questions: section.questions.map((q) => ({ ...q, question: fill(q.question), answer: fill(q.answer) })),
  }));
}

/** Pesquisa sem acentos nem maiúsculas, nas perguntas e nas respostas. */
const fold = (text) => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function filterFaq(sections, query) {
  const terms = fold(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return sections;
  return sections
    .map((section) => ({
      ...section,
      questions: section.questions.filter((q) => {
        const haystack = fold(`${q.question} ${q.answer} ${section.category}`);
        return terms.every((t) => haystack.includes(t));
      }),
    }))
    .filter((section) => section.questions.length);
}

export const FAQ_QUICK_REPLIES = FAQ_SECTIONS.flatMap((s) => s.questions);

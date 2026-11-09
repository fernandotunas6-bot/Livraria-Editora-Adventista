export const FAQ_SECTIONS = [
  {
    category: 'Encomendas e Envios',
    questions: [
      { question: 'Quanto tempo demora a entrega?', answer: 'A entrega padrão demora 5 a 7 dias úteis em Luanda e 7 a 14 dias para outras províncias. A entrega expressa demora 24 a 48 horas em Luanda.' },
      { question: 'Oferecem envio grátis?', answer: 'Sim, envio grátis para encomendas acima de {free_threshold} em todo o território nacional.' },
      { question: 'Posso acompanhar a minha encomenda?', answer: 'Sim! Use a página Rastrear Encomenda com o número e email da compra.' },
    ],
  },
  {
    category: 'Devoluções',
    questions: [
      { question: 'Qual é a política de devolução?', answer: 'Aceitamos devoluções em até 30 dias, desde que o livro esteja em bom estado e na embalagem original.' },
      { question: 'Como inicio uma devolução?', answer: 'Use o formulário da página de Contacto e indique o número da encomenda.' },
    ],
  },
  {
    category: 'Pagamentos',
    questions: [
      { question: 'Que métodos de pagamento aceitam?', answer: 'Transferência bancária, Multicaixa Express e pagamento na entrega (conforme zona).' },
      { question: 'Os meus dados estão seguros?', answer: 'Sim, utilizamos ligações encriptadas e não armazenamos dados de cartão nos nossos servidores.' },
    ],
  },
];

export const FAQ_QUICK_REPLIES = FAQ_SECTIONS.flatMap((s) => s.questions);

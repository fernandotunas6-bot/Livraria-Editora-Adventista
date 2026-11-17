/**
 * Termos e condições. O texto descreve o que o sistema faz de facto (levantado do código e de
 * docs/ENCOMENDAS.md, PAGAMENTOS.md, LIVROS_DIGITAIS.md e COLPORTAGEM.md em 2026-11-09); quem mudar
 * uma regra de encomendas, pagamentos ou entregas, muda aqui também, e actualiza a data. Os
 * contactos vêm das Configurações, como na política de privacidade.
 *
 * Blocos: { p: 'texto' } ou { list: ['…'] }. No texto, `[rótulo](/caminho)` vira link interno.
 */

import { privacyContacts } from '@/lib/privacyPolicy';

export const TERMS_UPDATED = '17 de Novembro de 2026';
export const TERMS_PATH = '/termos';

export function termsSections(settings = {}) {
  const c = privacyContacts(settings);
  const contactLine = [
    c.email && `pelo email ${c.email}`,
    c.phone && `pelo telefone ${c.phone}`,
    'pela página [Falar connosco](/contact)',
  ].filter(Boolean).join(', ');

  return [
    {
      id: 'ambito',
      title: 'A que se aplicam estes termos',
      blocks: [
        { p: `Estes termos regem o uso do site da ${c.name}: a loja online, a conta, a comunidade de leitores e o atendimento. Ao comprar, criar conta ou publicar, aceita a versão em vigor nesse momento.` },
        { p: 'Se não concordar com algum ponto, não use o site para esse fim e fale connosco. O tratamento dos seus dados pessoais está explicado na [política de privacidade](/privacidade).' },
      ],
    },
    {
      id: 'conta',
      title: 'A sua conta',
      blocks: [
        { list: [
          'Pode criar conta com email e palavra-passe ou com a sua conta Google. Para comprar livros impressos não precisa de conta: acompanha a encomenda com o número e o email da compra. As edições digitais precisam de conta, porque é nela que ficam.',
          'Os dados que indicar devem ser verdadeiros e estar actualizados, sobretudo o telefone, o email e a morada.',
          'A palavra-passe é pessoal. Avise-nos logo se suspeitar de um uso indevido da sua conta.',
          'Quem tem menos de 18 anos deve criar conta, comprar e publicar com a autorização dos pais ou do encarregado de educação.',
          'Podemos suspender uma conta usada para fraude, abuso ou para prejudicar outras pessoas. Se achar que é um engano, fale connosco.',
          'Pode apagar a sua conta em [Perfil → Segurança e privacidade](/profile?tab=security). As encomendas ficam guardadas, porque a lei obriga a isso.',
        ] },
      ],
    },
    {
      id: 'livros',
      title: 'Livros, preços e disponibilidade',
      blocks: [
        { list: [
          'Vendemos livros e outros artigos impressos e, em alguns títulos, edições digitais em PDF.',
          'As imagens e as descrições ajudam a escolher, mas a capa pode variar com a edição ou a reimpressão.',
          'Os preços estão em kwanzas (Kz). Os portes aparecem à parte, e o total a pagar é sempre mostrado antes de confirmar a compra.',
          'Os livros impressos ficam reservados quando faz a encomenda. Se mesmo assim um artigo não estiver disponível, avisamo-lo e devolvemos o que tiver pago por ele.',
          'Se um preço estiver manifestamente errado, por exemplo por um erro de escrita, contactamo-lo antes de continuar. Pode aceitar o preço correcto ou cancelar sem custos.',
        ] },
      ],
    },
    {
      id: 'encomendas',
      title: 'Encomendas e cancelamentos',
      blocks: [
        { p: 'Ao confirmar a compra, recebe o número da encomenda, com o qual a pode acompanhar em [Rastrear encomenda](/track).' },
        { list: [
          '**Cancelar sozinho.** Pode cancelar em [Perfil → Encomendas](/profile?tab=orders) ou, sem conta, em [Rastrear encomenda](/track), enquanto a encomenda não tiver nenhum pagamento registado ou indicado e não estiver em preparação.',
          '**Nos outros casos, fale connosco.** Se já pagou ou indicou um pagamento, ou se a encomenda já está a ser preparada ou a caminho, tratamos consigo do cancelamento e, se for o caso, do reembolso.',
          '**Falta de pagamento.** A loja pode definir um prazo para pagar. Passado esse prazo, uma encomenda por pagar, sem referência de pagamento e ainda não preparada pode ser cancelada, e avisamo-lo disso.',
        ] },
        { p: 'Podemos recusar ou cancelar uma encomenda, devolvendo sempre o que tiver sido pago, quando o artigo não estiver disponível, quando o preço estava errado e não aceitou o correcto, quando o pagamento não se confirmar, ou quando houver sinais claros de fraude ou de dados falsos.' },
      ],
    },
    {
      id: 'pagamentos',
      title: 'Pagamentos',
      blocks: [
        { list: [
          'Aceitamos os métodos activos no momento da compra, que dependem do que encomenda e de como a recebe. Podem incluir transferência bancária, Multicaixa Express, pagamento na entrega e pagamento no balcão da loja.',
          '**Um pagamento só fica confirmado pelo serviço de pagamentos ou pela nossa equipa.** Indicar uma referência ou enviar um comprovativo ajuda-nos a encontrá-lo, mas não confirma o pagamento: a encomenda fica a aguardar até o verificarmos.',
          'O site não guarda dados de cartão bancário.',
          'Se pagar a mais ou em duplicado, devolvemos a diferença.',
        ] },
      ],
    },
    {
      id: 'entrega',
      title: 'Entrega e levantamento',
      blocks: [
        { list: [
          'Os custos, as formas de entrega e os prazos estão em [Envios e devoluções](/shipping-returns), e os custos aparecem sempre antes de confirmar.',
          'Os prazos são estimativas e contam depois de a encomenda ser confirmada. Se houver atraso, procuramos avisá-lo.',
          'Uma encomenda paga para entrega ao domicílio pode ser entregue pela nossa equipa, por uma transportadora ou por um colportor perto de si. [Saiba que dados vê o colportor](/privacidade#colportagem).',
          '**O colportor que lhe leva uma encomenda não cobra por ela:** essa encomenda já está paga. Se lhe pedirem dinheiro nessa entrega, não pague e fale connosco.',
          'Na entrega, registamos o nome e a assinatura de quem recebe e, se for indicado, o número do documento. Serve de prova de entrega. Verifique a embalagem e diga-nos logo se vier danificada.',
          'Para levantar na loja, indique o número da encomenda. Se a encomenda ficar muito tempo por levantar, contactamo-lo antes de a cancelar e reembolsar.',
        ] },
      ],
    },
    {
      id: 'devolucoes',
      title: 'Devoluções e reembolsos de livros impressos',
      blocks: [
        { list: [
          'Tem 30 dias a contar da entrega para devolver um livro em bom estado e na embalagem original. O pedido faz-se em [Falar connosco](/contact), com o número da encomenda.',
          'Se o livro chegou danificado, incompleto ou não corresponde ao que encomendou, o reenvio é por nossa conta. Nas restantes devoluções, combinamos consigo no momento do pedido.',
          'O reembolso é feito depois de recebermos e conferirmos o livro, sempre que possível pelo mesmo meio de pagamento.',
        ] },
        { p: 'Estas condições somam-se aos direitos que a lei lhe dá como consumidor e não os substituem.' },
      ],
    },
    {
      id: 'digital',
      title: 'Edições digitais',
      blocks: [
        { list: [
          'A edição digital compra-se com conta, uma por conta, e não tem envio nem portes. Fica em [Perfil → Biblioteca](/profile?tab=biblioteca) e abre quando a encomenda inteira estiver paga e o pagamento confirmado.',
          'É para seu uso pessoal. Não pode copiar, partilhar, publicar ou revender o ficheiro.',
          'Podemos bloquear o acesso em caso de partilha do ficheiro ou de outro uso indevido. O acesso também fecha com o reembolso total ou o cancelamento da encomenda.',
          'Se o ficheiro não abrir, estiver incompleto ou não for o que comprou, fale connosco para resolvermos.',
        ] },
      ],
    },
    {
      id: 'comunidade',
      title: 'Comunidade, avaliações e outros conteúdos seus',
      blocks: [
        { p: 'A [comunidade](/comunidade) e as avaliações de livros são públicas. Criar publicações é para os membros da Comunidade de Leitores. O que escreve continua a ser seu, mas é responsável por isso e autoriza-nos a mostrá-lo no site enquanto não o apagar.' },
        { p: 'Quando publica, responde ou avalia, compromete-se a:' },
        { list: [
          'falar com respeito, sem linguagem ofensiva, discriminatória ou ilegal;',
          'não fazer publicidade nem publicar links enganadores ou maliciosos;',
          'não publicar dados pessoais seus ou de outras pessoas, como telefones, moradas ou documentos;',
          'não publicar conteúdo de outros sem autorização;',
          'ser fiel à sua experiência quando avalia um livro ou o serviço.',
        ] },
        { p: 'Não há tolerância para conteúdo ofensivo, abusivo ou ilegal, nem para quem incomoda outras pessoas: o que não cumprir estas regras é ocultado, e a conta de quem insiste pode ser suspensa.' },
        { p: 'Publica-se sem revisão prévia. Qualquer pessoa pode denunciar uma publicação; a equipa revê as denúncias, e uma publicação com várias denúncias fica oculta até a equipa decidir. Pode também bloquear quem não quer ver, no menu "⋯" das publicações dessa pessoa. Pode apagar o que publicou na comunidade a qualquer momento. [O que fica visível e o que não fica](/privacidade#comunidade).' },
      ],
    },
    {
      id: 'colportagem',
      title: 'Colportagem',
      blocks: [
        { p: 'Candidatar-se em [Ser colportor](/colportor/candidatura) não garante a aprovação. As regras da colaboração, como os livros entregues e as percentagens, são tratadas com cada colportor aprovado. Um colportor não pode alterar estes termos nem assumir compromissos em nome da loja que aqui não estejam previstos.' },
      ],
    },
    {
      id: 'uso',
      title: 'Uso aceitável do site',
      blocks: [
        { p: 'Não é permitido:' },
        { list: [
          'tentar entrar na conta de outra pessoa ou em áreas reservadas à equipa;',
          'fazer pedidos automáticos em massa que sobrecarreguem o site, ou contornar os limites de pedidos;',
          'usar o site para fraude, para enviar conteúdos maliciosos ou para recolher dados de outras pessoas.',
        ] },
        { p: 'Podemos bloquear o acesso a quem o faça.' },
      ],
    },
    {
      id: 'assistente',
      title: 'Assistente automático',
      blocks: [
        { p: 'O assistente do site usa inteligência artificial e pode enganar-se. As respostas dele são indicativas: sobre uma encomenda, um pagamento ou uma devolução, vale o que a nossa equipa confirmar.' },
      ],
    },
    {
      id: 'responsabilidade',
      title: 'Responsabilidades',
      blocks: [
        { p: '**Da nossa parte,** comprometemo-nos a entregar o que foi encomendado e pago, a corrigir informações erradas de preço, stock e prazos quando as detectarmos, a tratar os seus dados como explica a [política de privacidade](/privacidade) e a responder às reclamações.' },
        { p: '**Da sua parte,** pedimos-lhe que indique dados verdadeiros, esteja contactável para combinarmos a entrega, pague pelo método escolhido e verifique a encomenda ao recebê-la.' },
        { p: 'Não respondemos por atrasos ou falhas que não dependam de nós, como dados errados indicados na compra, falhas de bancos, de operadoras ou de transportadoras, e situações de força maior. Nada nestes termos limita a nossa responsabilidade nos casos em que a lei não o permite.' },
      ],
    },
    {
      id: 'propriedade',
      title: 'Propriedade intelectual',
      blocks: [
        { p: `Os textos, o logótipo e o desenho do site pertencem à ${c.name} ou são usados com autorização. As capas e os textos dos livros pertencem às respectivas editoras e autores. Não os reproduza sem autorização.` },
      ],
    },
    {
      id: 'comunicacoes',
      title: 'Comunicações',
      blocks: [
        { p: 'Enviamos os avisos necessários à encomenda e à segurança da conta. Novidades e campanhas podem ser recusadas a qualquer momento: cada email de novidades tem um link para deixar de as receber. Os avisos do site e as notificações ajustam-se em [Perfil → Notificações](/profile?tab=notifications).' },
      ],
    },
    {
      id: 'reclamacoes',
      title: 'Reclamações e lei aplicável',
      blocks: [
        { p: `Se algo correr mal, fale connosco primeiro, com o número da encomenda: ${contactLine}.${c.address ? ` Morada: ${c.address}.` : ''}` },
        { p: 'Se não ficar satisfeito com a nossa resposta, pode reclamar junto do Instituto Nacional de Defesa do Consumidor (INADEC).' },
        { p: 'Estes termos regem-se pela lei angolana. Os litígios são resolvidos no foro da comarca de Luanda, sem prejuízo das regras de protecção do consumidor que lhe sejam mais favoráveis.' },
      ],
    },
    {
      id: 'alteracoes',
      title: 'Alterações a estes termos',
      blocks: [
        { p: `Quando mudarmos estes termos, actualizamos a data no topo da página. Se a mudança for importante, avisamos no site ou por email. Cada encomenda rege-se pela versão em vigor no dia em que foi feita. Última actualização: ${TERMS_UPDATED}.` },
      ],
    },
  ];
}

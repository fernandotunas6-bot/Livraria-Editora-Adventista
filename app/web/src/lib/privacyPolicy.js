/**
 * Política de privacidade. O texto descreve o que o sistema faz de facto (levantado do código
 * e das migrações em 2026-11-07); quem mudar o que se recolhe ou para onde vai, muda aqui
 * também. Os contactos vêm das Configurações, para não ficarem desactualizados.
 *
 * Blocos: { p: 'texto' } ou { list: ['…'] }. No texto, `[rótulo](/caminho)` vira link interno.
 */

export const PRIVACY_UPDATED = '7 de Novembro de 2026';
export const PRIVACY_PATH = '/privacidade';

/** Contactos para pedidos sobre dados: o email e o telefone das Configurações, se existirem. */
export function privacyContacts(settings = {}) {
  const email = String(settings.contact_email || '').trim();
  const phone = String(settings.contact_phone || '').trim();
  const address = String(settings.contact_address || '').trim();
  return { email, phone, address, name: String(settings.site_name || '').trim() || 'Livraria Adventista' };
}

export function privacySections(settings = {}) {
  const c = privacyContacts(settings);
  const contactLine = [
    c.email && `pelo email ${c.email}`,
    c.phone && `pelo telefone ${c.phone}`,
    'pela página [Falar connosco](/contact)',
  ].filter(Boolean).join(', ');

  return [
    {
      id: 'quem-somos',
      title: 'Quem somos',
      blocks: [
        { p: `Esta política explica que dados pessoais a ${c.name} trata na loja online, na comunidade de leitores e no atendimento, para que servem, com quem são partilhados e como pode exercer os seus direitos, nos termos da Lei n.º 22/11, de 17 de Junho (Lei da Protecção de Dados Pessoais).` },
        { p: `Somos o responsável pelo tratamento. Para qualquer pedido sobre os seus dados, contacte-nos ${contactLine}.${c.address ? ` Morada: ${c.address}.` : ''}` },
      ],
    },
    {
      id: 'dados',
      title: 'Que dados recolhemos e para quê',
      blocks: [
        { p: '**Conta.** Nome, email, telefone e, se quiser, uma fotografia. Se entrar com o Google, recebemos dele o nome, o email e a fotografia. A palavra-passe é guardada cifrada pelo serviço de contas e ninguém da equipa a consegue ver. Guardamos também uma descrição resumida do navegador e do sistema de cada aparelho de onde entra, só para o avisar quando há um acesso a partir de um aparelho novo.' },
        { p: '**Encomendas.** Para entregar, cobrar e provar a entrega:' },
        { list: [
          'nome, email e telefone;',
          'morada de entrega (província, município, localidade, rua e ponto de referência) e notas;',
          'as coordenadas da morada, só se as partilhar no checkout;',
          'o contacto de um familiar, só se o indicar;',
          'o método de pagamento e a referência do pagamento;',
          'na recepção, o nome e o número do documento de quem recebe e a assinatura digital.',
        ] },
        { p: 'Pode comprar sem criar conta: nesse caso, a encomenda acompanha-se pelo número e pelo email da compra.' },
        { p: '**Atendimento e assistente.** As mensagens que nos envia no chat, nos pedidos de ajuda e por email. O assistente automático usa um serviço de inteligência artificial (Google Gemini ou DeepSeek, conforme a configuração da loja), ao qual enviamos o texto da conversa, o seu primeiro nome e o número e o estado das suas encomendas; nunca o email, o telefone ou a morada. As conversas do assistente feitas sem conta e que não passaram a pedido de ajuda são apagadas ao fim de 90 dias.' },
        { p: '**Avaliações de livros.** O nome e a fotografia do perfil aparecem publicamente junto da avaliação.' },
        { p: '**Lista de desejos e sugestões.** Os livros que guarda e os que vê com sessão iniciada, para lhe sugerirmos outros (página [Para si](/sugestoes)).' },
        { p: '**Newsletter e campanhas.** O email com que subscreve. Se nos deu o seu contacto, por exemplo numa loja, podemos enviar-lhe novidades por email ou WhatsApp. Cada email de novidades tem um link para deixar de receber, e pode pedir-nos que deixemos de o contactar a qualquer momento.' },
        { p: '**Notificações.** Se activar as notificações no navegador, guardamos o endereço técnico que o navegador nos dá para lhe enviar avisos de encomendas, de atendimento e da comunidade.' },
        { p: '**Segurança.** O endereço IP é usado durante pouco tempo para travar tentativas repetidas (por exemplo, palavras-passe erradas seguidas) e é apagado automaticamente.' },
        { p: '**Localização na página das lojas.** Só é pedida quando carrega em "lojas perto de mim", e fica no seu navegador: serve para ordenar as lojas pela distância e não nos é enviada.' },
      ],
    },
    {
      id: 'comunidade',
      title: 'Comunidade de leitores',
      blocks: [
        { p: 'A [comunidade](/comunidade) é um espaço público. Antes de publicar, saiba o que fica visível e o que não fica.' },
        { p: '**Visível para qualquer pessoa, mesmo sem conta:**' },
        { list: [
          'o nome do seu perfil, ao lado de cada publicação, resposta e citação;',
          'o que escreve: o texto, a citação e a página, os links e o livro que escolher;',
          'a data de cada publicação e o número de gostos e de respostas;',
          'o seu perfil de leitor: o nome, desde quando é leitor (mês e ano), quantas publicações e respostas fez, quantos gostos recebeu, quantos livros comentou e os selos "Equipa da Livraria" ou "Membro fundador" (quem publicou nos três primeiros meses da comunidade).',
        ] },
        { p: 'As publicações têm um endereço próprio e podem aparecer em motores de pesquisa. Quando alguém partilha esse endereço, por exemplo no WhatsApp, a pré-visualização mostra o seu nome, o início do texto e a capa do livro. Os perfis de leitor pedem aos motores de pesquisa que não os mostrem.' },
        { p: '**Nunca é mostrado:** o email, o telefone, a fotografia, as encomendas nem o identificador da sua conta. O endereço do seu perfil de leitor usa um código aleatório.' },
        { p: '**Fica privado:** de quem gostou (cada pessoa vê só os seus gostos; os outros vêem apenas o número) e as denúncias, que só a equipa vê. Quem é denunciado não sabe quem o denunciou.' },
        { p: '**Moderação.** Publica-se logo, sem revisão prévia. A equipa pode fixar publicações, marcar respostas oficiais e ocultar o que não respeita as regras. Com três denúncias, uma publicação fica oculta até a equipa decidir. Para proteger quem lê, o nome do site de cada link (nunca o resto do endereço nem quem o escreveu) é verificado num filtro de sites maliciosos e de conteúdo adulto da Cloudflare.' },
        { p: '**Avisos.** Avisamo-lo no site, e por notificação se a tiver activa, quando alguém responde ou gosta das suas publicações. Pode desligar estes avisos em [Perfil → Notificações](/profile?tab=notifications).' },
        { p: '**Apagar.** Pode apagar qualquer publicação ou resposta sua a qualquer momento, no menu "⋯" da publicação; apagar uma publicação apaga também as respostas a ela. Se a sua conta for apagada, as suas publicações, respostas e gostos são apagados com ela.' },
        { p: 'Não publique dados pessoais seus nem de outras pessoas, como telefones, moradas ou documentos.' },
      ],
    },
    {
      id: 'partilha',
      title: 'Com quem partilhamos',
      blocks: [
        { p: 'Não vendemos os seus dados. Partilhamo-los apenas com os serviços de que precisamos para a loja funcionar, que os tratam por nossa conta:' },
        { list: [
          'Supabase: base de dados, contas e ficheiros (fotografias, capas, materiais);',
          'Cloudflare: alojamento do site, estatísticas de visitas sem cookies e o filtro de links da comunidade;',
          'o serviço de email configurado pela loja (Brevo, Cloudflare ou SendGrid), para os emails de conta, encomendas e atendimento;',
          'WhatsApp Business (Meta), quando falamos consigo por WhatsApp;',
          'Google: entrada com a conta Google, tipos de letra do site, mapas das lojas e, se for o caso, o assistente (Gemini);',
          'OpenStreetMap, para os mapas das lojas quando não se usa o do Google;',
          'DeepSeek, se for o serviço de inteligência artificial escolhido para o assistente;',
          'o serviço de notificações do seu navegador (Google, Apple ou Mozilla), para entregar os avisos;',
          'a empresa de transporte, quando a entrega não é feita pela nossa equipa: nome, telefone e morada de entrega.',
        ] },
        { p: 'Alguns destes serviços têm servidores fora de Angola. Escolhemos fornecedores com medidas de segurança reconhecidas e enviamos-lhes só o necessário para cada tarefa. Também podemos ter de fornecer dados a autoridades, quando a lei o exigir.' },
      ],
    },
    {
      id: 'prazos',
      title: 'Durante quanto tempo guardamos',
      blocks: [
        { list: [
          'Conta, lista de desejos e preferências: enquanto tiver conta.',
          'Encomendas e comprovativos de entrega: durante o tempo que a lei fiscal e comercial exige.',
          'Publicações da comunidade: até as apagar ou a sua conta ser apagada.',
          'Conversas do assistente sem conta e sem pedido de ajuda: 90 dias.',
          'Newsletter e campanhas: até deixar de as querer receber.',
          'Endereços IP para segurança: pouco tempo, apagados automaticamente.',
        ] },
      ],
    },
    {
      id: 'direitos',
      title: 'Os seus direitos',
      blocks: [
        { p: 'Tem direito a saber que dados temos sobre si, a corrigi-los, a pedir que sejam apagados, a opor-se ao envio de comunicações de marketing e a retirar um consentimento que nos tenha dado.' },
        { list: [
          'Corrigir o nome, o telefone e a fotografia: em [Perfil → Definições](/profile?tab=settings).',
          'Desligar avisos e notificações: em [Perfil → Notificações](/profile?tab=notifications).',
          'Apagar publicações da comunidade: no menu "⋯" de cada uma.',
          `Pedir uma cópia dos seus dados ou apagar a conta: contacte-nos ${contactLine}. Podemos pedir-lhe que confirme a identidade antes de responder.`,
        ] },
        { p: 'Se achar que não tratámos bem os seus dados, pode apresentar queixa à Agência de Protecção de Dados (APD).' },
      ],
    },
    {
      id: 'navegador',
      title: 'Cookies e armazenamento no navegador',
      blocks: [
        { p: 'Não usamos cookies de publicidade nem de seguimento. O site guarda no seu navegador apenas o necessário para funcionar: a sessão iniciada, o carrinho, a lista de desejos de quem não tem conta, os livros vistos recentemente e preferências como avisos já fechados. As estatísticas de visitas da Cloudflare não usam cookies. Pode apagar estes dados nas definições do navegador; o carrinho e a sessão perdem-se.' },
      ],
    },
    {
      id: 'seguranca',
      title: 'Segurança',
      blocks: [
        { p: 'O site funciona só em ligação cifrada (HTTPS). Na base de dados, cada pessoa só consegue ler os seus próprios dados, e a equipa só vê o que precisa para o seu trabalho. Quem gere a loja pode activar a verificação em dois passos, que passa então a ser exigida em cada acesso ao painel. Nenhum sistema é infalível: se soubermos de uma falha que afecte os seus dados, avisamo-lo.' },
      ],
    },
    {
      id: 'menores',
      title: 'Menores',
      blocks: [
        { p: 'Quem tem menos de 18 anos deve criar conta, comprar e publicar na comunidade com a autorização dos pais ou do encarregado de educação.' },
      ],
    },
    {
      id: 'alteracoes',
      title: 'Alterações a esta política',
      blocks: [
        { p: `Quando mudarmos esta política, actualizamos a data no topo da página. Se a mudança for importante, avisamos no site ou por email. Última actualização: ${PRIVACY_UPDATED}.` },
      ],
    },
  ];
}

/**
 * Divide um texto em pedaços simples: texto, **negrito** e [link](/caminho). Só caminhos
 * internos viram link; qualquer outra coisa fica como texto.
 */
export function inlineParts(text) {
  const parts = [];
  const re = /\*\*([^*]+)\*\*|\[([^\]]+)\]\((\/[^)\s]*)\)/g;
  let last = 0;
  let m;
  const source = String(text || '');
  while ((m = re.exec(source))) {
    if (m.index > last) parts.push({ text: source.slice(last, m.index) });
    if (m[1]) parts.push({ text: m[1], bold: true });
    else if (/^\/(?!\/)/.test(m[3])) parts.push({ text: m[2], href: m[3] });
    else parts.push({ text: m[2] });
    last = re.lastIndex;
  }
  if (last < source.length) parts.push({ text: source.slice(last) });
  return parts;
}

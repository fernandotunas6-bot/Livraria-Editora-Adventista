// As secções do painel, num só sítio: a que grupo pertencem, como se chamam na navegação e no
// título da página, o que fazem, que ícone têm, quem as pode ver e — nas que se dividem em
// partes — as suas vistas (as sub-secções: Colportagem › Contas, Configurações › Envio…).
//
// As duas disposições do painel (separadores no topo e barra lateral), a gaveta do telemóvel, o
// caminho no topo, a procura (Ctrl+K), o menu do cabeçalho do site e o ecrã das permissões leem
// todos daqui. Antes cada um teria a sua lista, e as listas divergiam: uma secção nova aparecia
// num sítio e não noutro, ou com outro nome, ou aparecia a quem não a podia abrir.
//
// Os identificadores vão no endereço: a secção em `tab` e a vista em `vista`
// (/admin?tab=colportagem&vista=contas). Não mudar os existentes: há ligações para eles nos
// avisos, nos emails e noutras páginas do site.

import {
  Activity, ArrowLeftRight, Award, Ban, Banknote, BarChart3, Bell, Bike, BookHeart, BookOpen, Brush, Building2, CalendarClock,
  Church, ClipboardList, CreditCard, Factory, FileDown, FileUp, Flag, HandCoins, Hash, IdCard, Image, Inbox, KeyRound,
  LayoutDashboard, LayoutTemplate, Layers, Link2, Mail, Map as MapIcon, Megaphone,
  MessageCircle, MessageSquare, MessagesSquare, Newspaper, PackageCheck, PackageSearch, Palette, PanelTop, Percent, Phone, Plug,
  Rocket, Scale, Settings, Settings2, ShieldCheck, ShoppingBag, Siren, Smartphone, Store, TrendingUp, Truck, UserCheck,
  UserCog, UserPlus, UserRound, Users, UsersRound, Wallet,
} from 'lucide-react';

export const DEFAULT_SECTION = 'inicio';

/** Grupos, pela ordem em que aparecem. O Início fica sozinho, antes dos grupos. */
export const ADMIN_GROUPS = [
  { id: 'inicio', label: '', sections: ['inicio'] },
  { id: 'catalogo', label: 'Catálogo', sections: ['books', 'disponibilidade', 'collections', 'slides', 'downloads'] },
  { id: 'producao', label: 'Editora', sections: ['producao'] },
  { id: 'vendas', label: 'Vendas', sections: ['orders', 'acompanhamento', 'equipas', 'payments', 'stores'] },
  { id: 'relatorios', label: 'Relatórios', sections: ['vendas-huambo', 'pagamentos-caixa', 'financas'] },
  { id: 'clientes', label: 'Clientes', sections: ['users', 'contacts', 'support', 'community'] },
  { id: 'funcionarios', label: 'Pessoal', sections: ['funcionarios'] },
  { id: 'igreja', label: 'Igreja', sections: ['colportagem', 'igreja'] },
  { id: 'sistema', label: 'Sistema', sections: ['settings', 'notices', 'versoes', 'saude', 'apps', 'seguranca'] },
];

/**
 * `label`: nome curto, na navegação. `title`: título da página. `keywords`: outras palavras
 * que as pessoas usam para a mesma coisa (sem acentos), para a procura. `allowed(p)`: quem vê (as
 * mesmas regras das permissões na base de dados; ver `adminPermissions`). `readOnly(p)`: vê mas
 * não altera (aparece assim no ecrã das permissões).
 *
 * `views`: as vistas da secção, pela ordem da navegação; a primeira é a de omissão. Cada uma com
 * `id` (vai no endereço, em `vista`), `label`, `icon`, `description`, `keywords` e, se não for para
 * todos os que vêem a secção, `allowed(p)`. `group` arruma vistas seguidas sob um título
 * (Configurações: Identidade, Loja…). Vistas são partes diferentes da secção; os filtros de uma
 * mesma lista (estado das encomendas, tipo de produto) continuam a ser filtros.
 */
export const ADMIN_SECTIONS = {
  inicio: {
    label: 'Início', title: 'Início', icon: LayoutDashboard,
    keywords: 'resumo dashboard hoje painel principal',
    description: 'O que precisa de atenção no que cada um trata: encomendas, pagamentos, stock, produção e salários.',
    allowed: () => true,
  },
  books: {
    label: 'Produtos', title: 'Produtos', icon: PackageSearch,
    keywords: 'livros produtos stock inventario catalogo precos bíblias revistas uniformes',
    description: 'Livros, Bíblias, revistas, uniformes, t-shirts e materiais: tudo gerido aqui.',
    allowed: (p) => p.catalog,
  },
  // Migração lojas_donas_dos_dados: «temos / não temos» por loja. Quem gere o catálogo marca qualquer
  // loja; quem tem «Stock da loja», só a da sua ficha de funcionário.
  disponibilidade: {
    label: 'Disponibilidade nas lojas', title: 'Disponibilidade nas lojas', icon: PackageCheck,
    keywords: 'stock loja lojas temos nao temos existencias prateleira lubango catumbela huambo levantamento',
    description: 'Cada loja marca os produtos que tem. O site mostra em que lojas está cada produto.',
    allowed: (p) => p.catalog || p.storeStock,
  },
  collections: {
    label: 'Coleções', title: 'Coleções', icon: Layers,
    keywords: 'coleccoes colecoes series temas',
    description: 'Agrupe livros em coleções temáticas. A ordem aqui é a ordem na página Coleções.',
    allowed: (p) => p.catalog,
  },
  slides: {
    label: 'Slider', title: 'Slider da página inicial e da loja', icon: Image,
    keywords: 'banner banners carrossel destaque pagina inicial',
    description: 'O slide principal aparece sempre primeiro; os outros seguem a ordem da lista.',
    allowed: (p) => p.catalog,
  },
  downloads: {
    label: 'Materiais (PDF)', title: 'Materiais e livros digitais', icon: FileDown,
    keywords: 'pdf ficheiros materiais descarregar gratis livros digitais ebook edicao digital',
    description: 'PDFs gratuitos para todos, ou livros digitais que abrem a quem comprou e pagou. Aparecem em /materiais, na ficha do produto e na biblioteca de cada cliente.',
    allowed: (p) => p.catalog,
    views: [
      { id: 'materiais', label: 'Materiais', icon: FileDown, keywords: 'carregar publicar ficheiro capa', description: 'Os PDFs: carregar, publicar, gratuitos ou ligados a um produto ou à sua edição digital.' },
      { id: 'acessos', label: 'Acessos e pagamentos', icon: KeyRound, keywords: 'compradores biblioteca bloquear desbloquear confirmar pagamento abrir', description: 'Quem comprou cada livro digital, o pagamento e o acesso: abre com o pagamento confirmado; bloquear e desbloquear.' },
    ],
  },
  producao: {
    label: 'Produção', title: 'Produção da Editora', icon: Factory,
    keywords: 'editora grafica impressao tiragem reimpressao revisao paginacao capa ordens etapas fornecedores custos',
    description: 'Cada título em produção: as etapas, quem é responsável e os prazos, os custos e os fornecedores. Ao concluir, a tiragem entra no stock.',
    allowed: (p) => p.production || p.finance,
    views: [
      { id: 'ordens', label: 'Ordens', icon: ClipboardList, keywords: 'tiragens titulos novos reimpressoes concluir cancelar', description: 'As ordens de produção: planeadas, em curso, concluídas e canceladas.' },
      { id: 'etapas', label: 'Etapas e prazos', icon: CalendarClock, keywords: 'responsaveis atrasadas prazos tarefas', description: 'O que falta fazer em todas as ordens, por responsável e prazo, com as atrasadas primeiro.' },
      { id: 'fornecedores', label: 'Fornecedores', icon: Building2, keywords: 'graficas papel design transporte nif iban contactos', description: 'Gráficas, papel, design, revisão e transporte: contactos, NIF e IBAN.' },
      { id: 'contas', label: 'Contas e pagamentos', icon: HandCoins, keywords: 'dividas saldos pagar fornecedores anular', description: 'O que se deve a cada fornecedor e os pagamentos feitos. Só as finanças registam pagamentos.' },
    ],
  },
  orders: {
    label: 'Encomendas', title: 'Encomendas', icon: ShoppingBag,
    keywords: 'pedidos vendas compras encomenda entregas recibos',
    description: 'Todas as encomendas: estado, pagamento, entrega, seguimento e recibos.',
    allowed: (p) => p.orders,
  },
  acompanhamento: {
    label: 'Acompanhamento', title: 'Acompanhamento das encomendas', icon: Siren,
    keywords: 'atrasos vigilancia prazos assumir alertas',
    description: 'Encomendas por assumir, cada passo, os atrasos e os problemas dos clientes. Verificado de 10 em 10 minutos.',
    allowed: (p) => p.orders,
  },
  equipas: {
    label: 'Equipas e alertas', title: 'Equipas e alertas', icon: UsersRound,
    keywords: 'turnos responsaveis escalada alertas avisos',
    description: 'Quem recebe cada encomenda e cada alerta, quem tem de assumir, e a quem sobe quando ninguém responde a tempo.',
    allowed: (p) => p.users || p.orders,
  },
  payments: {
    label: 'Métodos de pagamento', title: 'Métodos de pagamento', icon: CreditCard,
    keywords: 'iban multicaixa express transferencia unitel referencia pagamento',
    description: 'Os métodos que o checkout aceita: dados da conta, instruções, links e QR.',
    allowed: (p) => p.payments,
  },
  stores: {
    label: 'Lojas', title: 'Lojas físicas', icon: Store,
    keywords: 'balcao levantamento moradas mapa',
    description: 'Aparecem em /lojas, no rodapé, no menu e no levantamento das encomendas.',
    allowed: (p) => p.settings,
  },
  'vendas-huambo': {
    label: 'Vendas por loja', title: 'Vendas por loja', icon: BarChart3,
    keywords: 'faturacao facturacao relatorio vendas lojas',
    description: 'Facturação de cada loja, por período, com os produtos mais vendidos.',
    allowed: (p) => p.reports,
  },
  'pagamentos-caixa': {
    label: 'Pagamentos e caixa', title: 'Pagamentos e caixa', icon: Wallet,
    keywords: 'caixa recebimentos reembolsos dinheiro fecho',
    description: 'Pagamentos recebidos e por confirmar, reembolsos e o fecho de caixa.',
    allowed: (p) => p.reports || p.confirmPayments,
  },
  financas: {
    label: 'Entradas e saídas', title: 'Entradas e saídas', icon: ArrowLeftRight,
    keywords: 'caixa fluxo saldo despesas receitas financas dinheiro',
    description: 'O dinheiro que entra (clientes) e o que sai (fornecedores e salários), por período, e o que está por pagar.',
    allowed: (p) => p.finance,
  },
  users: {
    label: 'Utilizadores', title: 'Utilizadores e clientes', icon: Users,
    keywords: 'equipa contas clientes permissoes papeis senha palavra-passe',
    description: 'Contas da equipa e dos clientes, papéis e permissões.',
    allowed: (p) => p.users,
    views: [
      { id: 'customers', label: 'Clientes', icon: Users, keywords: 'compradores contas suspensas convidados', description: 'Quem compra na loja: com conta ou só com encomendas, e as contas suspensas.' },
      { id: 'team', label: 'Equipa', icon: UserCheck, keywords: 'funcionarios gestores administradores papeis permissoes', description: 'Quem trabalha no painel, o papel de cada um e as permissões. Só um administrador as altera.' },
      { id: 'cargos', label: 'Cargos', icon: UserCog, keywords: 'funcoes caixa atendimento gerente perfis de acesso', description: 'Caixa, Atendimento, Gerente de loja…: as permissões de cada cargo. Mudar um cargo muda logo toda a gente que o tem.', allowed: (p) => p.isAdmin },
    ],
  },
  contacts: {
    label: 'Contactos e campanhas', title: 'Contactos e campanhas', icon: Megaphone,
    keywords: 'email marketing newsletter campanhas whatsapp listas',
    description: 'Listas de contactos e campanhas por email e WhatsApp.',
    allowed: (p) => p.marketing,
    views: [
      { id: 'contacts', label: 'Contactos', icon: Users, keywords: 'lista importar newsletter clientes', description: 'Os contactos que podem receber as campanhas, incluindo os das encomendas e da newsletter.' },
      { id: 'groups', label: 'Grupos', icon: UserPlus, keywords: 'listas segmentos', description: 'Contactos arrumados em grupos, para escolher a quem vai cada campanha.' },
      { id: 'campaigns', label: 'Campanhas', icon: Megaphone, keywords: 'envio newsletter agendar agendador', description: 'Mensagens por email e WhatsApp: escrever, agendar e enviar.' },
      { id: 'history', label: 'Histórico', icon: Bell, keywords: 'enviadas registo', description: 'O que foi enviado, a quem e quando.' },
    ],
  },
  support: {
    label: 'Atendimento', title: 'Atendimento', icon: MessageCircle,
    keywords: 'chat mensagens conversas ajuda clientes',
    description: 'Conversas com os clientes e pedidos de ajuda.',
    allowed: (p) => p.orders,
  },
  community: {
    label: 'Comunidade', title: 'Comunidade', icon: MessagesSquare,
    keywords: 'moderacao denuncias publicacoes leitores',
    description: 'Moderar, destacar e organizar a comunidade de leitores.',
    allowed: (p) => p.catalog,
    views: [
      { id: 'denuncias', label: 'Denúncias', icon: Flag, keywords: 'moderacao ocultas reportadas', description: 'Publicações denunciadas ou ocultas: voltar a mostrar, deixar oculta ou apagar.' },
      { id: 'publicacoes', label: 'Publicações', icon: Newspaper, keywords: 'posts fixar ocultar procurar', description: 'Todas as publicações: procurar, fixar no topo e ocultar.' },
      { id: 'temas', label: 'Temas', icon: Hash, keywords: 'categorias assuntos', description: 'Os temas da comunidade: nome, endereço, descrição, ordem e se estão visíveis.' },
      { id: 'clube', label: 'Clube do livro', icon: BookOpen, keywords: 'leitura livro do mes', description: 'Um livro por mês, em destaque no topo da comunidade, com a discussão desse livro.' },
      { id: 'sites', label: 'Sites bloqueados', icon: Ban, keywords: 'ligacoes dominios spam encurtadores', description: 'Os sites que não podem aparecer nas ligações da comunidade.' },
      { id: 'niveis', label: 'Níveis dos leitores', icon: Award, keywords: 'leitor assiduo honra distintivos fidelizacao comunidade de leitores', description: 'Conta nova → Leitor (1.º livro, ou participação) → Leitor assíduo → Leitor de honra: as regras e quantos há em cada nível.' },
    ],
  },
  funcionarios: {
    label: 'Funcionários', title: 'Funcionários', icon: IdCard,
    keywords: 'rh recursos humanos fichas pessoal vendedores estafetas salarios ordenados',
    description: 'A ficha de cada pessoa que trabalha na livraria e na Editora, com ou sem conta no painel, e os salários de cada mês.',
    allowed: (p) => p.staff || p.finance,
    readOnly: (p) => !p.staff,
    views: [
      { id: 'fichas', label: 'Fichas', icon: IdCard, keywords: 'cargo loja contactos admissao estado', description: 'Nome, cargo, departamento, loja, contactos, admissão e estado. A ficha não tem dinheiro.' },
      { id: 'salarios', label: 'Salários', icon: Banknote, keywords: 'ordenados mes folha pagar descontos inss irt', description: 'Os salários de cada mês: gerar, descontos, pagar e anular. Só as finanças.', allowed: (p) => p.finance },
    ],
  },
  colportagem: {
    label: 'Colportagem', title: 'Colportagem', icon: BookHeart,
    keywords: 'colportores candidaturas comissoes relatorios',
    description: 'Colportores, candidaturas, relatórios de vendas e comissões.',
    allowed: (p) => p.colporteurs,
    views: [
      { id: 'resumo', label: 'Resumo', icon: BarChart3, keywords: 'totais horas vendas', description: 'Quanto se trabalhou, vendeu e ganhou, por colportor, igreja, distrito, província ou campo.' },
      { id: 'candidaturas', label: 'Candidaturas', icon: Inbox, keywords: 'pedidos novos aprovar recusar', description: 'Quem se candidatou: aprovar, recusar ou pedir mais dados.' },
      { id: 'colportores', label: 'Colportores', icon: Users, keywords: 'fichas codigo cpt', description: 'As fichas dos colportores: código, categoria, igreja, zona e estado.' },
      { id: 'relatorios', label: 'Relatórios', icon: ClipboardList, keywords: 'semanais validar devolver', description: 'Relatórios semanais: validar ou devolver, ver quem falta e lançar por um colportor.' },
      { id: 'entregas', label: 'Entregas', icon: Bike, keywords: 'domicilio ofertas preparar levantar loja', description: 'As entregas ao domicílio com colportores: o que preparar na loja, as ofertas à espera e quanto cada um fez e ganhou.' },
      { id: 'guias', label: 'Guias e stock', icon: Truck, keywords: 'consignacao entrega devolucao compra', description: 'Guias de entrega, devolução e compra, com o stock da loja e o do colportor.' },
      { id: 'contas', label: 'Contas', icon: Scale, keywords: 'conta corrente saldo extracto acertos pagamentos', description: 'O saldo de cada colportor, o extracto, os pagamentos e as correcções.' },
      { id: 'reclassificacao', label: 'Reclassificação', icon: TrendingUp, keywords: 'categoria anual subir', description: 'A sugestão anual de categoria de cada colportor; a equipa aplica uma a uma.' },
      { id: 'percentagens', label: 'Percentagens', icon: Percent, keywords: 'comissoes regras simular', description: 'As percentagens por categoria e modo de venda, as regras por tipo de produto e uma simulação.' },
      { id: 'links', label: 'Links', icon: Link2, keywords: 'candidatura convite igreja', description: 'O link de candidatura geral e um por igreja, com a igreja já escolhida.' },
      { id: 'definicoes', label: 'Definições', icon: Settings2, keywords: 'candidaturas abertas nota formulario entregas percentagem base requisitos categoria', description: 'Candidaturas abertas ou fechadas, a nota do formulário, as entregas por colportor, a percentagem base e os requisitos de cada categoria.' },
    ],
  },
  igreja: {
    label: 'Registo da Igreja', title: 'Registo da Igreja', icon: Church,
    keywords: 'pastores igrejas distritos campos',
    description: 'Campos, distritos, igrejas e pastores, por província e município.',
    allowed: (p) => p.churchRegistry,
    readOnly: (p) => !p.churchRegistryEdit,
    views: [
      { id: 'resumo', label: 'Resumo', icon: LayoutDashboard, keywords: 'provincias totais completar', description: 'Totais por província e o que falta completar no registo.' },
      { id: 'distritos', label: 'Distritos', icon: MapIcon, keywords: 'titular transferir', description: 'Os distritos de cada campo, com o pastor titular e as igrejas.' },
      { id: 'igrejas', label: 'Igrejas', icon: Church, keywords: 'templos congregacoes municipio', description: 'As igrejas, com o distrito, a província e o município.' },
      { id: 'pastores', label: 'Pastores', icon: UserRound, keywords: 'contactos telefone distrital', description: 'Os pastores, o distrito ou o local de serviço de cada um e os contactos.' },
      { id: 'campos', label: 'Campos', icon: Building2, keywords: 'uniao associacao missao', description: 'Os campos (associações e missões) a que pertencem os distritos.' },
      { id: 'importar', label: 'Importar', icon: FileUp, keywords: 'json carregar ficheiro', description: 'Carregar igrejas e pastores de um ficheiro, vendo antes o que muda.', allowed: (p) => p.churchRegistryEdit },
    ],
  },
  settings: {
    label: 'Configurações', title: 'Configurações', icon: Settings,
    keywords: 'definicoes portes envio loja manutencao aparencia contactos',
    description: 'Dados da loja, portes, contactos, aparência e preferências do site.',
    allowed: (p) => p.settings,
    views: [
      { id: 'brand', label: 'Marca', group: 'Identidade', icon: Palette, keywords: 'nome slogan cor manutencao google', description: 'O nome da loja, o slogan, a cor principal, o modo manutenção e a entrada com a Google.' },
      { id: 'images', label: 'Imagens', group: 'Identidade', icon: Image, keywords: 'logotipo favicon fotografias equipa sobre', description: 'O logotipo, o ícone do separador e as fotografias da equipa na página Sobre.' },
      { id: 'theme', label: 'Tema visual', group: 'Identidade', icon: Brush, keywords: 'aparencia opaco vidro transparencia mapas google maps', description: 'As superfícies opacas, a transparência do vidro e a chave dos mapas.' },
      { id: 'shop', label: 'Catálogo e loja', group: 'Loja', icon: Store, keywords: 'hero topo ordenacao livros por pagina grelha colunas', description: 'O topo da loja, a ordenação por omissão, os livros por página e as colunas da grelha.' },
      { id: 'shipping', label: 'Envio', group: 'Loja', icon: Truck, keywords: 'portes entrega gratis expresso', description: 'Os portes: o normal, o expresso e o valor a partir do qual o envio é grátis.' },
      { id: 'rules', label: 'Regras da loja', group: 'Loja', icon: ShieldCheck, keywords: 'prefixo numero sku stock baixo notas cancelar por pagar limites', description: 'Os números das encomendas e dos produtos, o stock baixo e os limites das encomendas por pagar.' },
      { id: 'contact', label: 'Contacto', group: 'Comunicação', icon: Phone, keywords: 'telefone email morada whatsapp nif recibo', description: 'O email, o telefone, a morada, o WhatsApp e os dados do recibo (nome legal e NIF).' },
      { id: 'messaging', label: 'Email, push e chat', group: 'Comunicação', icon: Mail, keywords: 'smtp provedor remetente notificacoes push vapid assistente ia', description: 'O envio dos emails (provedor e remetente), as notificações push e o assistente do chat.' },
      { id: 'header', label: 'Barra superior', group: 'Comunicação', icon: MessageSquare, keywords: 'topo cabecalho mensagem cta', description: 'A mensagem da barra no topo do site, para visitantes e para quem entrou, com uma ligação.' },
      { id: 'footer', label: 'Rodapé', group: 'Comunicação', icon: LayoutTemplate, keywords: 'copyright colunas ligacoes lojas', description: 'O texto, o copyright, as colunas de ligações e as lojas no rodapé.' },
      { id: 'pwa', label: 'PWA / telemóvel', group: 'Aplicação', icon: Smartphone, keywords: 'instalar app aplicacao cor', description: 'A instalação como aplicação no telemóvel: o nome, o nome curto e a cor.' },
    ],
  },
  notices: {
    label: 'Faixa de aviso', title: 'Faixa de aviso', icon: PanelTop,
    keywords: 'banner faixa aviso promocao topo',
    description: 'Um aviso curto no topo de todas as páginas da loja: urgente, promoção ou informação.',
    allowed: (p) => p.settings || p.marketing,
  },
  versoes: {
    label: 'Versões da app', title: 'Versões da app', icon: Rocket,
    keywords: 'versao novidades actualizacao atualizacao app telemovel lancamento push todos',
    description: 'O que mudou em cada versão da app (em /novidades) e o aviso por push a todos os telemóveis.',
    allowed: (p) => p.settings,
  },
  saude: {
    label: 'Saúde do site', title: 'Saúde do site', icon: Activity,
    keywords: 'velocidade lento rapido erros javascript core web vitals lcp inp cls desempenho telemovel',
    description: 'A velocidade medida nos aparelhos de quem visita (por página, telemóvel e computador) e os erros no navegador.',
    allowed: (p) => p.settings,
  },
  apps: {
    label: 'Integrações', title: 'Integrações', icon: Plug,
    keywords: 'whatsapp email api servicos ligacoes',
    description: 'WhatsApp, email, pagamentos e os outros serviços ligados à loja.',
    allowed: (p) => p.isAdmin,
    views: [
      { id: 'apps', label: 'Serviços', icon: Smartphone, keywords: 'whatsapp drive smtp chaves activar', description: 'Activar e configurar os serviços externos usados pelo site.' },
      { id: 'templates', label: 'Modelos de email', icon: Mail, keywords: 'textos mensagens assunto', description: 'O texto de cada email que a loja envia.' },
      { id: 'logs', label: 'Registo de envios', icon: Activity, keywords: 'falhas entregues historico', description: 'Cada email e mensagem enviados, com o estado e o erro, se houve.' },
    ],
  },
  seguranca: {
    label: 'Registo de segurança', title: 'Registo de segurança', icon: ShieldCheck,
    keywords: 'auditoria log registo alteracoes',
    description: 'Cada alteração sensível (pagamentos, contactos, permissões, segredos, preços), com quem a fez e o antes e depois. Não se pode apagar.',
    allowed: (p) => p.isAdmin,
  },
};

/** As permissões do painel a partir da conta (`useAuth`): as mesmas regras de sempre. */
export function adminPermissions({ isAdmin = false, hasPermission = () => false } = {}) {
  const has = (key) => !!isAdmin || !!hasPermission(key);
  return {
    isAdmin: !!isAdmin,
    catalog: has('manage_catalog'),
    // Só o «temos / não temos» da sua loja (migração lojas_donas_dos_dados).
    storeStock: has('manage_store_stock'),
    orders: has('manage_orders'),
    settings: has('manage_settings'),
    users: has('manage_users'),
    payments: has('manage_payments'),
    confirmPayments: has('confirm_payments'),
    // A facturação (vendas por loja, caixa, números do mês): separada das encomendas.
    reports: has('view_reports'),
    marketing: has('manage_marketing'),
    // Quem gere colportores também vê as igrejas e os pastores (só leitura).
    churchRegistry: has('manage_church_registry') || has('manage_colporteurs'),
    churchRegistryEdit: has('manage_church_registry'),
    colporteurs: has('manage_colporteurs'),
    production: has('manage_production'),
    staff: has('manage_staff'),
    finance: has('manage_finance'),
  };
}

/** As mesmas permissões, a partir de uma conta guardada ({ role, permissions }) — para o ecrã
 *  das permissões mostrar o menu que essa pessoa vai ter. */
export function permissionsOfAccount({ role, permissions } = {}) {
  return adminPermissions({
    isAdmin: role === 'admin',
    hasPermission: (key) => role === 'manager' && permissions?.[key] === true,
  });
}

const normBadge = (badge, { counts = false } = {}) => {
  if (!badge || !(Number(badge.count) > 0)) return null;
  const tone = badge.tone || 'info';
  if (tone === 'count' && !counts) return null;
  return { count: Number(badge.count), tone };
};

/**
 * A navegação para esta pessoa: só os grupos com alguma secção que ela pode ver, e em cada
 * secção só as vistas que pode abrir.
 * `badges`: { [secção]: { count, tone: 'warning' | 'info' } } — o que pede acção (encomendas por
 * tratar, stock baixo…), não totais.
 */
export function buildAdminNav(perms, badges = {}) {
  return ADMIN_GROUPS.map((group) => ({
    id: group.id,
    label: group.label,
    items: group.sections
      .filter((id) => ADMIN_SECTIONS[id]?.allowed(perms))
      .map((id) => {
        const s = ADMIN_SECTIONS[id];
        const views = (s.views || [])
          .filter((v) => !v.allowed || v.allowed(perms))
          .map((v) => ({
            id: v.id,
            section: id,
            label: v.label,
            title: v.title || v.label,
            description: v.description || '',
            keywords: v.keywords || '',
            icon: v.icon,
            group: v.group || '',
            badge: null,
          }));
        return {
          id,
          group: group.id,
          groupLabel: group.label,
          label: s.label,
          title: s.title,
          description: s.description,
          keywords: s.keywords || '',
          icon: s.icon,
          readOnly: !!s.readOnly?.(perms),
          views,
          badge: normBadge(badges[id]),
        };
      }),
  })).filter((group) => group.items.length > 0);
}

/**
 * Junta à navegação os números das vistas que a secção aberta conhece (candidaturas por decidir,
 * relatórios por validar…). `viewBadges`: { [secção]: { [vista]: { count, tone } } }. Os totais
 * (`tone: 'count'`, "Igrejas (31)") ficam só na linha das vistas dentro da secção; a barra
 * lateral mostra só o que pede acção.
 */
export function withViewBadges(nav, viewBadges = {}, { counts = false } = {}) {
  return nav.map((group) => ({
    ...group,
    items: group.items.map((item) => {
      const own = viewBadges[item.id];
      if (!own || !item.views.length) return item;
      return { ...item, views: item.views.map((v) => ({ ...v, badge: normBadge(own[v.id], { counts }) })) };
    }),
  }));
}

export const flattenNav = (nav) => nav.flatMap((g) => g.items);

export function findSection(nav, id) {
  for (const group of nav) {
    const item = group.items.find((i) => i.id === id);
    if (item) return item;
  }
  return null;
}

/** A secção a abrir: a pedida, se a pessoa a pode ver; senão o Início (ou a primeira que tiver). */
export function resolveSection(nav, requested, fallback = DEFAULT_SECTION) {
  const items = flattenNav(nav);
  if (requested && items.some((i) => i.id === requested)) return requested;
  if (items.some((i) => i.id === fallback)) return fallback;
  return items[0]?.id || fallback;
}

export function findView(item, id) {
  return (id && item?.views?.find((v) => v.id === id)) || null;
}

/** A vista de omissão de uma secção (a primeira que a pessoa pode abrir), ou null sem vistas. */
export const defaultView = (item) => item?.views?.[0]?.id || null;

/**
 * A vista a abrir numa secção: a pedida, se a pessoa a pode abrir; senão a de omissão. Sem
 * vistas, null. Uma vista de outra secção (ficou no endereço) também cai na de omissão.
 */
export function resolveView(item, requested) {
  if (!item?.views?.length) return null;
  return findView(item, requested)?.id || defaultView(item);
}

/** O endereço de uma secção (e vista) do painel, para ligações noutras páginas. */
export function adminHref(section, view) {
  const params = new URLSearchParams();
  if (section && section !== DEFAULT_SECTION) params.set('tab', section);
  if (view) params.set('vista', view);
  const qs = params.toString();
  return qs ? `/admin?${qs}` : '/admin';
}

/** Todas as vistas, com a secção e o grupo a que pertencem (para a procura). */
export const flattenViews = (nav) => nav.flatMap((g) => g.items.flatMap((item) => item.views.map((v) => ({
  ...v, sectionLabel: item.label, groupLabel: g.label, sectionIcon: item.icon,
}))));

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const matches = (words, hay) => words.every((w) => fold(hay).includes(w));

/** Procura (Ctrl+K): por nome, título, descrição, grupo e sinónimos ("iban", "faturação",
 *  "senha"…), sem acentos nem maiúsculas. */
export function searchSections(nav, query) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  const items = flattenNav(nav);
  if (!words.length) return items;
  return items.filter((i) => matches(words, `${i.label} ${i.title} ${i.description} ${i.groupLabel} ${i.keywords || ''}`));
}

/** O mesmo para as vistas: "contas colportagem", "envio", "pastores". Vazio não devolve nada
 *  (a procura vazia mostra as secções, não as 41 vistas). */
export function searchViews(nav, query) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return flattenViews(nav).filter((v) => matches(words, `${v.label} ${v.title} ${v.description} ${v.sectionLabel} ${v.groupLabel} ${v.group} ${v.keywords}`));
}

/** Texto curto para leitores de ecrã e dicas: "3 por tratar". */
export function badgeLabel(badge) {
  if (!badge) return '';
  if (badge.tone === 'count') return `${badge.count} no total`;
  return badge.tone === 'warning' ? `${badge.count} com alerta` : `${badge.count} por tratar`;
}

/**
 * O que uma permissão abre sozinha no painel (para o ecrã das permissões): as secções, pela
 * ordem da navegação, e se alguma fica só de leitura. O Início é de todos e não conta.
 * `key`: uma chave de `lib/permissions.js` (manage_catalog…).
 */
export function sectionsOpenedBy(key) {
  const perms = adminPermissions({ hasPermission: (k) => k === key });
  return flattenNav(buildAdminNav(perms))
    .filter((i) => i.id !== DEFAULT_SECTION)
    .map((i) => ({ id: i.id, label: i.label, group: i.group, groupLabel: i.groupLabel, readOnly: i.readOnly }));
}

/** As secções que só o administrador vê (nenhuma permissão de gestor as abre). */
export function adminOnlySections() {
  const all = adminPermissions({ hasPermission: () => true });
  return Object.entries(ADMIN_SECTIONS)
    .filter(([, s]) => !s.allowed({ ...all, isAdmin: false }))
    .map(([id, s]) => ({ id, label: s.label }));
}

/** As áreas (grupos) que a pessoa vê, sem o Início: "Catálogo · Vendas · Clientes". */
export const navAreas = (nav) => nav.filter((g) => g.id !== DEFAULT_SECTION && g.label).map((g) => g.label);

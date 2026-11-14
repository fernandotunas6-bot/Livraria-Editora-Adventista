/**
 * Quem pode o quê.
 *
 * Saiu do `index.ts`, onde vivia no meio de 2 544 linhas de encaminhamento, envio de emails
 * e checkout. Aqui é código puro — não toca na rede nem na base de dados —, o que o torna
 * testável de verdade: as regras de autorização são a parte onde um engano não dá erro
 * nenhum, só dá acesso a quem não devia.
 *
 * As regras são a cópia fiel de `private.has_permission()` na base de dados. As duas têm de
 * concordar: a função serve para responder depressa sem ir à base, e a base é quem manda de
 * facto, pelas políticas RLS. Mexer numa sem mexer na outra deixa o painel a mostrar botões
 * que o servidor recusa — ou, pior, a escondê-los a quem tinha direito.
 */

/** O mapa de permissões de um gestor, como está guardado em `profiles.permissions`. */
export type Permissoes = Record<string, unknown>;

/** Quem está a fazer o pedido. `null` quando não há sessão válida. */
export type Auth = { id: string; email: string; role: string; permissions: Permissoes } | null;

/**
 * As chaves que o painel conhece. Serve também para normalizar o que vem do formulário:
 * tudo o que não esteja nesta lista é ignorado, e o que falta fica `false`.
 */
export const PERMISSION_KEYS = [
  "manage_catalog",
  "manage_orders",
  "manage_settings",
  "manage_users",
  "manage_payments",
  // Confirmar, rejeitar e anular pagamentos e registar reembolsos (migração pagamentos_registados).
  // Separada de "Pagamentos" (métodos, IBAN, links): quem confirma dinheiro não muda para onde ele vai.
  "confirm_payments",
  // A facturação (vendas por loja, caixa, números do mês), separada de "Gerir encomendas"
  // (migração cargos_e_ver_relatorios): o atendimento trata encomendas sem ver a facturação.
  "view_reports",
  // Gravar os relatórios de vendas (vendas_anos e os documentos do painel), com «Ver relatórios»
  // (migração relatorios_de_todas_as_livrarias). Apagar um ano inteiro continua só do administrador.
  "edit_reports",
  "manage_marketing",
  "manage_church_registry",
  "manage_colporteurs",
  // Produção da Editora, fichas dos funcionários e saídas de dinheiro (migrações funcionarios,
  // producao e saidas). Finanças à parte: quem regista a produção não paga a gráfica.
  "manage_production",
  "manage_staff",
  "manage_finance",
  // «Temos / não temos» nos produtos da sua loja, a da ficha de funcionário (migração
  // lojas_donas_dos_dados). Sem o resto do catálogo: preços e textos continuam centrais.
  "manage_store_stock",
];

/** Faz parte da equipa — distinto de ter uma permissão concreta. */
export const isStaff = (auth: Auth) => !!auth && (auth.role === "admin" || auth.role === "manager");

/**
 * Admin pode tudo; gestor só o que tiver activo; mais ninguém.
 *
 * A comparação é `=== true` de propósito: em `profiles.permissions` os valores vêm de JSON,
 * e `"false"`, `0` ou `null` não podem passar por engano.
 *
 * A base de dados exige o mesmo desde a migração `permissoes_so_booleanos`: usava
 * `permissions ->> chave = 'true'`, e o `->>` devolve o texto `'true'` tanto para o booleano
 * `true` como para a *string* `"true"` — ou seja, aceitava um valor que esta função recusa.
 * O desacordo estava no lado que manda, o RLS, e abria em vez de fechar. Agora são
 * `permissions -> chave = 'true'::jsonb` lá e `=== true` aqui.
 */
export const can = (auth: Auth, key: string) =>
  !!auth && (auth.role === "admin" || (auth.role === "manager" && auth.permissions?.[key] === true));

/**
 * CRM — contactos e campanhas. Como nas políticas RLS, chega ter "Utilizadores e Clientes"
 * **ou** "Marketing": são dois papéis que mexem nos mesmos contactos por razões diferentes.
 */
export const canCrm = (auth: Auth) => can(auth, "manage_users") || can(auth, "manage_marketing");

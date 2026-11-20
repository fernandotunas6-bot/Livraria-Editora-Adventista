// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

/**
 * Quem pode chamar cada rota da Edge Function, declarado no registo da rota.
 *
 * Antes, cada rota fazia a sua verificação na primeira linha do handler (`requirePermission`,
 * `if (!auth) …`, `canManageDeliveries`…). Funcionava, mas a segurança dependia de ninguém se
 * esquecer de uma linha: uma rota nova sem ela ficava aberta a toda a internet, com a chave
 * `service_role`, que passa por cima do RLS. E a ordem também contava: o `/admin/users/*`
 * chegou a ir à base de dados antes de verificar a permissão, e a resposta (404 ou 403) dizia
 * a qualquer pessoa que ids de conta existiam.
 *
 * Agora o acesso faz parte do registo (`route(método, caminho, acesso, handler)`), e o
 * encaminhamento verifica-o antes de o handler correr. Não há valor por omissão: uma rota sem
 * acesso declarado não compila. E as rotas abertas (`publica`, `segredo`) dizem porquê, para que
 * uma rota pública nova seja uma decisão visível na revisão — o `access.test.ts` lista-as todas.
 *
 * O handler continua a fazer o que é mais fino do que isto: ser dono da encomenda, poder gerir
 * aquela conta em concreto, ter email na sessão. Este módulo é só a porta de entrada.
 *
 * Código puro, como o `permissions.ts`: não toca na rede nem na base de dados.
 */
import { type Auth, can, isStaff } from "./permissions.ts";

/**
 * Rotas abertas: `publica` (qualquer pessoa, com ou sem sessão) e `segredo` (quem chama prova-se
 * com um segredo partilhado, que o handler confere: o agendador, o gateway de pagamentos).
 * `porque` diz o que as torna seguras de abrir.
 */
export type AcessoAberto = { kind: "publica" | "segredo"; porque: string };

/**
 * Rotas que exigem sessão: `sessao` (qualquer conta), `equipa` (admin ou gestor) e `permissao`
 * (pelo menos uma das chaves; o admin tem todas). O handler destas recebe `auth` não nulo: o
 * tipo diz que a porta já foi conferida.
 */
export type AcessoComSessao =
  | { kind: "sessao" | "equipa"; mensagem: string }
  | { kind: "permissao"; chaves: string[]; mensagem: string };

export type Access = AcessoAberto | AcessoComSessao;

// As mensagens por omissão são as que as rotas já davam, para nada mudar para quem as lê.
const SEM_SESSAO = "Sessão necessária.";
const SEM_PERMISSAO = "Sem permissão para esta operação.";

const comPorque = (porque: string) => {
  if (!porque.trim()) throw new Error("Uma rota aberta tem de dizer porque é segura de abrir.");
  return porque;
};

/** Aberta a todos. Diga porquê: limite de pedidos, só dados públicos, número + email… */
export const publica = (porque: string): AcessoAberto => ({ kind: "publica", porque: comPorque(porque) });

/** Aberta à rede, mas o handler exige um segredo partilhado (cabeçalho ou assinatura). */
export const segredo = (porque: string): AcessoAberto => ({ kind: "segredo", porque: comPorque(porque) });

/** Só com sessão iniciada (401 sem ela). */
export const sessao = (mensagem = SEM_SESSAO): AcessoComSessao => ({ kind: "sessao", mensagem });

/** Só a equipa: admin ou gestor (403). */
export const equipa = (mensagem = SEM_PERMISSAO): AcessoComSessao => ({ kind: "equipa", mensagem });

/** A permissão, com a mensagem que a rota já dava. `permissaoCom(m, "a", "b")` é "a ou b". */
export const permissaoCom = (mensagem: string, ...chaves: string[]): AcessoComSessao => {
  if (!chaves.length) throw new Error("Uma rota com permissão precisa de pelo menos uma chave.");
  return { kind: "permissao", chaves, mensagem };
};

/** Só com uma das permissões indicadas (403). `permissao("a", "b")` é "a ou b". */
export const permissao = (...chaves: string[]): AcessoComSessao => permissaoCom(SEM_PERMISSAO, ...chaves);

/**
 * `null` quando o pedido pode seguir; senão o estado HTTP e a mensagem da recusa.
 *
 * Um `kind` desconhecido recusa: se alguém acrescentar um tipo de acesso e se esquecer dele
 * aqui, a rota fica fechada, nunca aberta.
 */
export function recusa(access: Access, auth: Auth): { status: number; message: string } | null {
  switch (access.kind) {
    case "publica":
    case "segredo":
      return null;
    case "sessao":
      return auth?.id ? null : { status: 401, message: access.mensagem };
    case "equipa":
      return isStaff(auth) ? null : { status: 403, message: access.mensagem };
    case "permissao":
      return access.chaves.some((k) => can(auth, k)) ? null : { status: 403, message: access.mensagem };
    default:
      // Tipo desconhecido (só por engano, fora do TypeScript): fecha.
      return { status: 403, message: SEM_PERMISSAO };
  }
}

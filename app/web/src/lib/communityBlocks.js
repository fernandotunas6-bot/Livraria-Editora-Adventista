// Bloquear uma pessoa na comunidade (migração 20261117130000_bloquear_na_comunidade).
//
// A regra 1.2 da App Store pede, para conteúdo publicado pelos utilizadores, que cada pessoa possa
// bloquear quem abusa. Aqui guarda-se a lista de quem a conta bloqueou — pela chave pública de
// leitor, a `author_key` das publicações — e o site deixa de lhe mostrar as publicações e as
// respostas dessas pessoas (components/community/PostCard.jsx). A lista é da conta: segue para
// todos os aparelhos. Quem foi bloqueado não sabe.
//
// Um só estado para o site inteiro (como hooks/useNotifications.js): cada cartão do feed lê-o sem
// pedir nada ao servidor.

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { isMissingTable } from '@/lib/communityApi';
import { supabase } from '@/lib/supabaseClient';

const VAZIO = { dono: '', lista: [], chaves: new Set(), pronto: false };
let estado = VAZIO;
let pedido = null;
const ouvintes = new Set();

function mudar(novo) {
  estado = { ...estado, ...novo };
  ouvintes.forEach((f) => f());
}

const subscrever = (f) => { ouvintes.add(f); return () => ouvintes.delete(f); };
const ler = () => estado;

/** Só para os testes. */
export function _reporBloqueios() { estado = VAZIO; pedido = null; ouvintes.clear(); }

const comLista = (dono, lista) => ({ dono, lista, chaves: new Set(lista.map((b) => b.blocked_key)), pronto: true });

/** Carrega a lista da conta (uma vez por conta); sem conta, fica vazia. */
export function carregarBloqueios(dono) {
  if (!dono) {
    if (estado.dono || !estado.pronto) mudar({ ...VAZIO, pronto: true });
    return Promise.resolve();
  }
  if (estado.dono === dono && estado.pronto) return Promise.resolve();
  if (pedido?.dono === dono) return pedido.promessa;
  const promessa = (async () => {
    const { data, error } = await supabase.from('community_blocks')
      .select('blocked_key, blocked_name, created').order('created', { ascending: false });
    // Sem a tabela (migração por aplicar) ou sem rede: ninguém bloqueado, como antes.
    if (error && !isMissingTable(error)) console.warn('Bloqueios da comunidade:', error.message);
    if (pedido?.promessa === promessa) pedido = null;
    mudar(comLista(dono, error ? [] : data || []));
  })();
  pedido = { dono, promessa };
  return promessa;
}

/** Bloqueia a pessoa desta chave. Devolve uma mensagem de erro, ou '' se correu bem. */
export async function bloquearPessoa(dono, chave, nome = '') {
  const key = String(chave || '').trim();
  if (!dono || !key) return 'Entre na sua conta para bloquear.';
  if (estado.chaves.has(key)) return '';
  const linha = { blocked_key: key, blocked_name: String(nome || '').trim().slice(0, 100), created: new Date().toISOString() };
  const antes = estado.lista;
  mudar(comLista(dono, [linha, ...antes]));
  const { error } = await supabase.from('community_blocks').insert({ blocked_key: linha.blocked_key, blocked_name: linha.blocked_name });
  // Já estava bloqueada noutro aparelho: está certo na mesma.
  if (error && error.code !== '23505') {
    mudar(comLista(dono, antes));
    return 'Não foi possível bloquear agora. Tente outra vez.';
  }
  return '';
}

/** Desbloqueia. Devolve uma mensagem de erro, ou ''. */
export async function desbloquearPessoa(dono, chave) {
  const key = String(chave || '').trim();
  if (!dono || !key) return '';
  const antes = estado.lista;
  mudar(comLista(dono, antes.filter((b) => b.blocked_key !== key)));
  const { error } = await supabase.from('community_blocks').delete().eq('blocked_key', key);
  if (error) {
    mudar(comLista(dono, antes));
    return 'Não foi possível desbloquear agora. Tente outra vez.';
  }
  return '';
}

/**
 * Quem a conta bloqueou: `bloqueado(chave)`, `bloquear(chave, nome)`, `desbloquear(chave)` e a
 * `lista` (para o perfil). Sem sessão não há ninguém bloqueado e bloquear pede para entrar.
 */
export function useBloqueios() {
  const { user, isAuthed } = useAuth();
  const dono = isAuthed ? user?.id || '' : '';
  const atual = useSyncExternalStore(subscrever, ler, ler);
  useEffect(() => { carregarBloqueios(dono); }, [dono]);
  const daConta = atual.dono === dono ? atual : VAZIO;
  const bloqueado = useCallback((chave) => !!chave && daConta.chaves.has(chave), [daConta]);
  const bloquear = useCallback((chave, nome) => bloquearPessoa(dono, chave, nome), [dono]);
  const desbloquear = useCallback((chave) => desbloquearPessoa(dono, chave), [dono]);
  return { lista: daConta.lista, bloqueado, bloquear, desbloquear, podeBloquear: !!dono };
}

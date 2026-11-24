// KanGest — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

/**
 * O navegador integrado (src-tauri/src/navegador.rs, docs/NAVEGADOR.md). Só existe no programa instalado: cada
 * separador é uma janela do sistema, sem acesso ao programa.
 */
import { invoke } from "@tauri-apps/api/core";

export interface Pagina {
  url: string;
  titulo: string;
  em: string;
}

export interface Transferencia {
  url: string;
  ficheiro: string;
  ok: boolean;
  em: string;
}

export interface Separador {
  label: string;
  titulo: string;
  url: string;
}

export interface EstadoNavegador {
  separadores: Separador[];
  favoritos: Pagina[];
  historico: Pagina[];
  transferencias: Transferencia[];
}

/** `invoke("navegador", { acao, dados })`, com o erro do Rust (texto) como `Error`. */
export async function navegador<T = EstadoNavegador>(acao: string, dados?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>("navegador", { acao, dados: dados ?? null });
  } catch (e) {
    throw e instanceof Error ? e : new Error(String(e));
  }
}

/** O endereço sem o esquema e sem a barra do fim, para mostrar numa lista. */
export function enderecoCurto(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

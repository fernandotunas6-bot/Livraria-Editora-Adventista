// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

/**
 * Que imagens o site aceita enviar para o bucket público `media`.
 *
 * O SVG ficou de fora de propósito. Um SVG é um documento que pode levar `<script>`, e o
 * bucket `media` é público: o ficheiro fica servido em
 * `<projecto>.supabase.co/storage/v1/object/public/media/...` com `Content-Type:
 * image/svg+xml`, que o browser executa quando o endereço é aberto directamente (dentro de
 * um `<img>` não executa). Como qualquer cliente registado pode escrever em
 * `users/<o-seu-id>/` (ver `private.can_write_media`), isso dava execução de código na
 * origem `*.supabase.co` — a mesma de `/auth/v1/*` — e uma página de phishing num domínio
 * do próprio projecto, a partir de uma conta de cliente comum.
 *
 * É a mesma decisão que já estava tomada nos outros dois sítios onde o SVG aparecia: o
 * `sanitizeHtml` põe `svg` em `FORBID_TAGS`, e as assinaturas só aceitam PNG
 * (`isPngSignature`), precisamente porque um SVG pode levar código.
 *
 * Esta lista é a segunda linha de defesa, para dar erro na hora e em português. A que manda
 * é o `allowed_mime_types` do bucket (migração `svg_fora_do_bucket_publico`): o atributo
 * `accept` de um `<input type="file">` é só uma sugestão da janela de ficheiros, e o tipo
 * enviado vem do cliente.
 */

/** Tipos aceites no envio de imagens. Nenhum deles executa código. */
export const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

/** Valor para o atributo `accept` de um `<input type="file">`. */
export const ALLOWED_IMAGE_ACCEPT = ALLOWED_IMAGE_TYPES.join(',');

/** Nomes dos formatos, para as mensagens de erro. */
export const ALLOWED_IMAGE_LABEL = 'PNG, JPG, WebP ou GIF';

/** O ficheiro é de um tipo aceite? Um ficheiro sem tipo não passa. */
export const isAllowedImage = (file) => ALLOWED_IMAGE_TYPES.includes(file?.type);

/**
 * Mensagem de erro para um ficheiro recusado, ou `''` quando serve.
 *
 * Valida o tipo e, se `maxSizeMB` vier, o tamanho — a ordem conta: um SVG de 10 KB tem de
 * dar erro de formato, não passar por ser pequeno.
 */
export function imageFileError(file, maxSizeMB = 0) {
  if (!file) return 'Escolha um ficheiro.';
  if (!isAllowedImage(file)) return `Formato não suportado. Use ${ALLOWED_IMAGE_LABEL}.`;
  if (maxSizeMB > 0 && file.size > maxSizeMB * 1024 * 1024) {
    return `Ficheiro demasiado grande. Máximo ${maxSizeMB} MB.`;
  }
  return '';
}

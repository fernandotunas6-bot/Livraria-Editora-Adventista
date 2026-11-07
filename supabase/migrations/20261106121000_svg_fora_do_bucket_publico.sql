-- SVG deixa de ser aceite no bucket público `media`.
--
-- O `media` é público: qualquer ficheiro lá dentro fica servido em
-- `<projecto>.supabase.co/storage/v1/object/public/media/...` com o `Content-Type` com que
-- foi enviado. Um SVG não é uma imagem como as outras — é um documento que pode levar
-- `<script>` —, e servido como `image/svg+xml` o browser executa-o quando o endereço é
-- aberto directamente (dentro de um `<img>` não executa).
--
-- E escrever lá não é privilégio de ninguém: `private.can_write_media` deixa qualquer conta
-- escrever em `users/<o-seu-id>/`, que é por onde passa a foto de perfil. O site só validava
-- o tamanho da foto (2 MB), e o `accept` de um `<input type="file">` é uma sugestão da janela
-- de ficheiros, não um controlo. Resultado, visto na revisão de 2026-11-06: um cliente comum
-- conseguia pôr código a correr na origem `*.supabase.co` — a mesma de `/auth/v1/*` e
-- `/storage/v1/*` — e alojar uma página de phishing num domínio do próprio projecto.
--
-- Não chega à origem da loja, onde vive a sessão (o `localStorage` é por origem), por isso
-- não é roubo de sessão directo. Mas é execução de código numa origem do projecto a partir de
-- uma conta sem permissões, e é incoerente com as duas decisões que já estavam tomadas sobre
-- SVG: o `sanitizeHtml` põe `svg` em `FORBID_TAGS`, e as assinaturas só aceitam PNG
-- (`isPngSignature`), pela mesma razão.
--
-- Isto é o controlo que manda. O site valida também o tipo, para dar erro na hora e em
-- português (`app/web/src/lib/imageTypes.js`), mas o tipo vem do cliente: quem decide é aqui.
--
-- Os ficheiros já enviados não são tocados — `allowed_mime_types` é verificado no envio. Se
-- houver um logótipo SVG no bucket, continua a funcionar; para o substituir, usar PNG ou
-- WebP. `.ico` fica na lista por causa do campo do favicon.
--
-- Reverter: voltar a pôr 'image/svg+xml' na lista (e repor o SVG em `imageTypes.js`).

update storage.buckets
   set allowed_mime_types = array[
         'image/png',
         'image/jpeg',
         'image/webp',
         'image/gif',
         'image/x-icon',
         'image/vnd.microsoft.icon'
       ]
 where id = 'media';

-- Vídeo de apresentação do produto (YouTube).
--
-- A equipa cola o endereço do YouTube no painel (Livros → Mídia) e a ficha do produto passa a
-- mostrar o vídeo: uma miniatura com botão de "play" que só carrega a moldura do YouTube
-- quando alguém a abre.
--
-- A coluna guarda texto, não um endereço validado: a validação que manda está no site
-- (`app/web/src/lib/youtube.js`), que só constrói o `src` da moldura a partir de um
-- identificador de 11 caracteres que reconheceu. Um valor estranho nesta coluna faz o botão
-- desaparecer; nunca vira uma moldura para outro sítio. Mesmo assim fica aqui uma restrição
-- de tamanho, para a coluna não servir de depósito de texto.
--
-- Reverter: alter table public.stock_books drop column video_url;

alter table public.stock_books
  add column if not exists video_url text default '';

alter table public.stock_books
  drop constraint if exists stock_books_video_url_tamanho;

alter table public.stock_books
  add constraint stock_books_video_url_tamanho
  check (video_url is null or length(video_url) <= 300);

comment on column public.stock_books.video_url is
  'Endereço do vídeo de apresentação no YouTube. O site valida e constrói a incorporação (lib/youtube.js); vazio = sem vídeo.';

-- Canal do YouTube da livraria, para o rodapé (ao lado do Facebook e do Instagram).
--
-- Uma livraria adventista tem quase sempre canal, e o rodapé só oferecia duas redes. Sem
-- valor, o ícone não aparece — nada muda para quem não o preencher.
--
-- Reverter: alter table public.site_settings drop column youtube;

alter table public.site_settings
  add column if not exists youtube text default '';

comment on column public.site_settings.youtube is
  'Endereço do canal do YouTube da livraria. Aparece no rodapé quando preenchido.';

-- Fotografias da loja da Huíla (Lubango) e o horário que está na porta.
--
-- Segue a 20261113103000_fotografias_das_lojas, que juntou a coluna `gallery`; aqui só entram os
-- dados desta loja. As cinco fotografias que a loja mandou ficam todas: a fachada, a equipa, as
-- prateleiras, os livros ao perto e o balcão. Convertidas para WebP de 1280 e 480 px por
-- `scripts/imagens/lojas.py` e servidas pelo próprio site (/images/lojas/).
--
-- A fachada é a miniatura: é a porta que quem lá vai tem de reconhecer da rua.
--
-- O horário é o que está escrito na porta — segunda a quinta das 8h às 17h30, sexta, domingo e
-- feriados das 8h às 13h. Ao sábado a loja não abre, e o horário que a ficha podia ter («Seg–Sex
-- 9h–18h, Sáb 9h–13h», o de omissão do painel) dizia o contrário: por isso substitui-se também
-- esse, e não só o vazio. Um horário escrito à mão no painel fica como está.
--
-- A província escreve-se «Huíla» ou «Huila» conforme quem a escreveu: compara-se sem acentos com
-- private.plain_text (20261108220000_entregas_loja_e_robustez.sql).
--
-- Reverter: pôr gallery = '[]'::jsonb nesta loja; as fotografias ficam no site.

update public.physical_stores
set gallery = jsonb_build_array(
      jsonb_build_object('url', '/images/lojas/lubango-1.webp',
                         'caption', 'A entrada da loja, com o horário de trabalho na porta'),
      jsonb_build_object('url', '/images/lojas/lubango-2.webp',
                         'caption', 'A equipa da loja do Lubango'),
      jsonb_build_object('url', '/images/lojas/lubango-3.webp',
                         'caption', 'Atendimento junto às prateleiras de Bíblias e livros'),
      jsonb_build_object('url', '/images/lojas/lubango-4.webp',
                         'caption', 'Teologia, profecia e biografias nas prateleiras'),
      jsonb_build_object('url', '/images/lojas/lubango-5.webp',
                         'caption', 'O balcão de atendimento')
    ),
    image_url = case when coalesce(image_url, '') = '' and coalesce(image, '') = ''
                     then '/images/lojas/lubango-1.webp' else image_url end,
    hours = case when coalesce(hours, '') = '' or hours = 'Seg–Sex 9h–18h, Sáb 9h–13h'
                 then 'Seg–Qui 8h–17h30 · Sex, Dom e feriados 8h–13h' else hours end,
    updated = now()
where private.plain_text(province) = 'huila' or name ilike '%Lubango%';

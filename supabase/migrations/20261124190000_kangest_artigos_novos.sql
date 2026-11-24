-- Artigo novo no KanGest → produto oculto no site, à espera de fotografia (docs/KANGEST.md §4.1).
--
-- Até aqui, um artigo criado no KanGest não chegava ao site: o aviso «artigo.alterado» só
-- mudava o preço de produtos que já tinham a referência (stock_books.kigest_ref). Quem queria
-- vender online um livro novo da loja tinha de o criar à mão no painel e escrever a referência.
--
-- Com esta migração, um artigo que o site não conhece entra OCULTO (active = false), com o nome,
-- o preço com IVA e o código de barras do KanGest, sem capa e sem descrição, e com o stock do
-- KanGest. Nunca se publica sozinho: alguém revê o nome, põe a capa e a descrição e publica,
-- como com os 201 da importação do KiGest (20261112140000).
--
-- Três guardas, pelas lições da importação do KiGest (docs/catalogo/KIGEST.md):
--  1. Uma referência só dá UM rascunho, uma vez. Fica em private.kangest_referencias_vistas; se
--     alguém apagar o rascunho por não o querer na loja, o próximo aviso não o volta a criar.
--  2. As 397 referências que já passaram por pessoas na exportação de 12/11 (ligadas, novas,
--     repetidas e as ambíguas que ficaram para o dono) entram já como vistas: o que foi decidido
--     à mão não volta pela porta das traseiras.
--  3. Um rascunho cujo nome (sem acentos nem pontuação) ou código de barras bate com um produto
--     que já existe fica marcado com kangest_parecido_com. O painel mostra «parece o mesmo que…»
--     e uma pessoa decide; nada se liga sozinho, porque foi assim que os lenços de membro
--     apanharam o preço dos de líder.
--
-- Quem chama: a Edge Function (service_role), no aviso «artigo.alterado» e na sincronização de
-- hora a hora. O público e as contas não executam a função.

alter table public.stock_books
  add column if not exists kangest_novo_em timestamptz,
  add column if not exists kangest_parecido_com text references public.stock_books (id) on delete set null;

comment on column public.stock_books.kangest_novo_em is
  'Quando o produto entrou sozinho, oculto, a partir de um artigo novo do KanGest (null = criado no painel ou importado).';
comment on column public.stock_books.kangest_parecido_com is
  'Produto do site com o mesmo nome ou código de barras, quando o rascunho do KanGest entrou: a rever por uma pessoa.';

create table if not exists private.kangest_referencias_vistas (
  referencia text primary key,
  origem text not null,
  book_id text,
  visto_em timestamptz not null default now()
);
comment on table private.kangest_referencias_vistas is
  'Referências do KanGest que já deram (ou não podem dar) um produto no site: «kigest-20261112» = decididas à mão na importação; «kangest» = rascunho criado sozinho.';
alter table private.kangest_referencias_vistas enable row level security;
revoke all on private.kangest_referencias_vistas from public, anon, authenticated;

insert into private.kangest_referencias_vistas (referencia, origem)
select r, 'kigest-20261112'
  from unnest(array[
    '0', '0000', '00000333', '00001', '00002', '000029', '00003', '000030', '000031', '000032', '00004', '00005',
    '000051', '00006', '0000667766', '00007', '00009999', '000100', '000101', '000102', '000103', '000104',
    '000105', '000106', '000107', '000109', '00011', '000111', '000112', '000113', '000114', '000115', '000116',
    '000118', '000122', '000123', '000124', '000125', '000126', '000127', '000128', '000129', '00013', '000130',
    '000134', '000135', '000136', '000137', '000138', '00014', '000141', '000142', '000143', '000144', '000145',
    '000146', '000147', '000149', '00015', '000150', '000152', '000153', '000154', '000155', '000156', '000157',
    '000158', '00016', '000160', '000161', '000163', '000168', '00017', '000170', '000175', '000179', '00018',
    '000180', '000181', '000183', '000184', '000185', '00019', '000190', '000191', '000192', '000193', '000194',
    '000196', '000197', '000199', '00020', '000200', '0002010', '000201058', '000203', '000204', '000205',
    '000206', '000207', '000208', '000209', '000211', '000212', '000213', '000215', '000216', '000217', '000218',
    '000219', '00022', '000220', '000221', '000222', '000224', '000226', '000227', '000229', '00023', '000231',
    '000232', '00024', '00025', '00026', '00027', '00028', '000300', '000301', '000304', '000305', '000306',
    '000307', '000308', '000310', '000311', '000312', '000313', '000314', '000315', '000316', '000318', '000321',
    '000322', '000323', '000329', '00033', '000332', '000333', '000334', '000335', '000339', '00034', '000340',
    '00035', '000350', '000353', '000354', '00036', '000360', '00037', '00039', '00040', '000400', '000401',
    '000403', '000404', '000405', '0004050', '000406', '000408', '00041', '00042', '00043', '00044', '000450',
    '000452', '000453', '000455', '000456', '000457', '000459', '000460', '000462', '000468', '00048', '00049',
    '00050', '000500', '000502', '000503', '000504', '000508', '000523', '00055', '00056', '000560', '000562',
    '00057', '00059', '0006', '00060', '00061', '00063', '00064', '00065', '00067', '00068', '00069', '00070',
    '000700', '00076', '00078', '00079', '000790', '0008', '00080', '00081', '00082', '00083', '00084', '00085',
    '00086', '0009', '00090', '00091', '00092', '00093', '00094', '00095', '00096', '00097', '00098', '00099',
    '00099444', '001', '0010', '0011', '0012', '0013', '0014', '0015', '0016', '0017', '0018', '0019', '002',
    '0020', '0021', '0023', '0024', '0025', '0026', '0027', '0028', '003', '0030', '0031', '0035', '0036',
    '0037', '0038', '0039', '004', '0040', '005', '0050', '006', '007', '00700', '008', '009', '01042026',
    '01052026', '010520262', '010520263', '010520264', '01234', '015062026', '023876', '024365', '03957684',
    '04032026', '05032026', '06042026', '06052026', '060520261', '08062026', '080620261', '080620262',
    '080620263', '080620264', '09032026', '090320261', '10032026', '100320261', '100320262', '100320263',
    '100320264', '1111999', '11493', '11631', '11761', '12032026', '123', '12382', '12383', '129954', '13165',
    '13167', '13346', '13348', '14082026', '140820261', '14159', '14456', '14499', '14504', '14620', '14875',
    '14878', '15062026', '15120', '15329', '15439', '15528', '15529', '15766', '16032026', '16044', '16086',
    '16206', '16298', '16373', '16686', '16707', '16711', '17032026', '19032026', '190320261', '190320262',
    '193883', '195', '19612', '19964', '19989', '20092', '20147', '20837', '21002', '21068', '21102026', '21411',
    '2164987', '2225588', '234569877', '23568', '24032026', '25559888', '2564000', '26498', '299874', '30032026',
    '30042026', '300420261', '300420262', '30062026', '30072026', '31082026', '33336974', '33338844', '33339999',
    '333999', '36487', '444444', '444499', '455475126', '456127', '4568213', '45992', '46512', '5100',
    '546972000', '5487963', '55556666', '6218731', '666677', '944231', '961000', '9788534527248', '99456',
    '999999', 'CDC0001', 'LV00021', 'OO29', 'T-SHIRT20', 'T-SHIRT23', 'id-59'
  ]::text[]) as r
on conflict (referencia) do nothing;

-- O nome para comparar: minúsculas, sem acentos, só letras e algarismos separados por um espaço.
create or replace function private.kangest_titulo_normal(p_titulo text)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(regexp_replace(
    translate(lower(coalesce(p_titulo, '')), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn'),
    '[^a-z0-9]+', ' ', 'g'))
$$;
revoke all on function private.kangest_titulo_normal(text) from public, anon, authenticated;

create or replace function public.kangest_artigo_novo(p_referencia text, p_titulo text, p_preco numeric, p_ean text default '')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ref text := btrim(coalesce(p_referencia, ''));
  v_titulo text := btrim(regexp_replace(coalesce(p_titulo, ''), '\s+', ' ', 'g'));
  v_ean text := upper(regexp_replace(coalesce(p_ean, ''), '[^0-9Xx]', '', 'g'));
  v_existe text;
  v_parecido text;
  v_novo text;
begin
  if v_ref = '' or v_titulo = '' then
    return jsonb_build_object('feito', 'sem referência ou sem nome');
  end if;
  if length(v_ean) < 8 then
    v_ean := '';
  end if;

  -- o aviso e a sincronização de hora a hora podem chegar juntos com o mesmo artigo
  perform pg_advisory_xact_lock(hashtext('kangest_artigo_novo:' || v_ref));

  select id into v_existe from public.stock_books where kigest_ref = v_ref limit 1;
  if v_existe is not null then
    return jsonb_build_object('feito', 'existe', 'book_id', v_existe);
  end if;
  if exists (select 1 from private.kangest_referencias_vistas where referencia = v_ref) then
    return jsonb_build_object('feito', 'já visto');
  end if;

  select b.id into v_parecido
    from public.stock_books b
   where private.kangest_titulo_normal(b.title) = private.kangest_titulo_normal(v_titulo)
      or (v_ean <> '' and upper(regexp_replace(coalesce(b.isbn, ''), '[^0-9Xx]', '', 'g')) = v_ean)
   order by b.active desc, b.created
   limit 1;

  insert into public.stock_books
    (title, product_type, genre, kigest_ref, isbn, price, stock, author, publisher, cover, description,
     active, featured, kangest_novo_em, kangest_parecido_com)
  values
    (left(v_titulo, 200), 'livro', 'Catálogo Geral', v_ref, v_ean, greatest(coalesce(p_preco, 0), 0), 0, '',
     'Livraria e Editora Adventista', '', '', false, false, now(), v_parecido)
  returning id into v_novo;

  insert into private.kangest_referencias_vistas (referencia, origem, book_id) values (v_ref, 'kangest', v_novo);

  -- o stock que o KanGest já mandou para esta referência (kangest_stock), se mandou
  perform public.kangest_recalcular_stock(v_ref);

  return jsonb_build_object('feito', 'criado', 'book_id', v_novo, 'parecido_com', v_parecido);
end;
$$;
revoke all on function public.kangest_artigo_novo(text, text, numeric, text) from public, anon, authenticated;
grant execute on function public.kangest_artigo_novo(text, text, numeric, text) to service_role;

-- No painel, num rascunho marcado como parecido, quem gere o catálogo decide:
--  «mesmo»: é o produto que o site já tinha. A referência passa para ele (que passa a receber o stock e o preço do
--           KanGest, como os outros produtos ligados) e o rascunho é apagado. Só se o produto ainda não tiver outra
--           referência: dois artigos da loja no mesmo produto seriam o mesmo stock contado duas vezes.
--  «outro»: é outro produto. A marca sai e o rascunho fica, à espera de capa e descrição.
create or replace function public.kangest_rascunho_decidir(p_rascunho text, p_decisao text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  alvo record;
begin
  if not private.has_permission('manage_catalog') then
    raise exception 'Sem permissão para gerir o catálogo.' using errcode = '42501';
  end if;
  select id, kigest_ref, active, kangest_novo_em, kangest_parecido_com into r
    from public.stock_books where id = p_rascunho for update;
  if r.id is null or r.kangest_novo_em is null or r.active then
    raise exception 'Este produto não é um rascunho do KanGest por rever.' using errcode = '22023';
  end if;

  if p_decisao = 'outro' then
    update public.stock_books set kangest_parecido_com = null where id = r.id;
    return jsonb_build_object('feito', 'outro', 'book_id', r.id);
  end if;
  if coalesce(p_decisao, '') <> 'mesmo' then
    raise exception 'Decisão desconhecida: use «mesmo» ou «outro».' using errcode = '22023';
  end if;
  if r.kangest_parecido_com is null then
    raise exception 'Este rascunho não está marcado como parecido com outro produto.' using errcode = '22023';
  end if;
  select id, title, kigest_ref into alvo from public.stock_books where id = r.kangest_parecido_com for update;
  if alvo.id is null then
    raise exception 'O produto parecido já não existe.' using errcode = '22023';
  end if;
  if coalesce(alvo.kigest_ref, '') <> '' then
    raise exception 'O produto «%» já está ligado a outro artigo do KanGest (%).', alvo.title, alvo.kigest_ref using errcode = '22023';
  end if;

  delete from public.stock_books where id = r.id;
  update public.stock_books set kigest_ref = r.kigest_ref where id = alvo.id;
  update private.kangest_referencias_vistas set book_id = alvo.id where referencia = r.kigest_ref;
  perform public.kangest_recalcular_stock(r.kigest_ref);
  return jsonb_build_object('feito', 'mesmo', 'book_id', alvo.id);
end;
$$;
revoke all on function public.kangest_rascunho_decidir(text, text) from public, anon;
grant execute on function public.kangest_rascunho_decidir(text, text) to authenticated, service_role;

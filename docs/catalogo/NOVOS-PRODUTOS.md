# Produtos novos da loja (fotografias de 2026-11-09)

Estado em 2026-11-10, para quem continuar o trabalho.

## O que está feito

- **Levantamento das 295 fotografias** da pasta `Novos livros/` (fica na raiz do repositório, fora
  do git — 52 MB). Cada fotografia foi vista e identificada em
  [levantamento-fotografias.tsv](levantamento-fotografias.tsv): número, frente/verso, tipo, título,
  autor, editora. O número de cada fotografia → nome do ficheiro está em
  [indice-fotografias.json](indice-fotografias.json) (também diz quais são cópias exactas).
- **Duplicados**: 20 ficheiros repetidos; 42 produtos já existiam no catálogo (LIV-010…LIV-099) e
  ficaram de fora. Sobram **93 produtos novos**: 55 livros, 23 bíblias, 3 hinários em umbundo,
  9 artigos de Desbravadores/Jovens, 3 peças de vestuário.
- **Capas** em `app/web/public/images/capas/novos/` (340×510, como o resto do catálogo):
  - 44 capas oficiais da loja da CPB (`https://imagens.cpb.com.br/produtos/<id>/<id>-01-web-product-page.png`),
    conferidas uma a uma contra a fotografia;
  - 46 tratadas a partir da fotografia (`scripts/catalogo/enquadrar.py`: recorte do produto,
    perspectiva, rotação, limpeza) — edições de Angola/Portugal, bíblias da SBB, lenços, emblemas;
  - 3 montagens de camisas (`scripts/catalogo/modelo_camisa.py`) com a estampa real extraída das
    fotografias (logótipo da Igreja e marca UmaVoz27).
  A lista produto → ficheiro → origem está em [mapa-novos-produtos.json](mapa-novos-produtos.json).
- **Descrições**: 44 sinopses da CPB em [sinopses-cpb.json](sinopses-cpb.json).
- **Migração** `supabase/migrations/20261110090000_produtos_novos_da_loja.sql`: insere os 93
  produtos **ocultos (active = false), com preço e stock a 0**. O código (LIV-/BIB-/MUS-/DBV-/VES-)
  é dado pelo gatilho. Pode correr mais de uma vez. **Ainda não foi testada no PGlite** (ver abaixo).

## O que falta

1. **Testar a migração** com o PGlite antes de integrar (instruções em `scripts/pglite/base.mjs`):
   correr todas as migrações e confirmar `select count(*) from stock_books where cover like '%/capas/novos/%'` = 93
   e que os códigos saem com o prefixo certo.
2. **Preços e stock**: não há preços nas fotografias. O dono tem de os pôr no painel; só depois se
   publicam (`update … set active = true where cover like '…/capas/novos/%' and price > 0`).
3. **Materiais de Santa Ceia**: o dono falou neles, mas não há nenhum nas fotografias. Confirmar se
   faltam fotografias ou se quer que se acrescentem a partir de imagens da internet.
4. **Emblemas oficiais**: os logótipos vectoriais dos Desbravadores/Aventureiros/JA estão em
   `https://downloads.adventistas.org/pt/desbravadores/logomarcas/logos-abertos-desbravadores/`
   (ZIP em `deptos.adventistas.org`, que recusa descargas fora do navegador — 403). Os emblemas
   ficaram com a fotografia tratada; se se quiser arte limpa, descarregar o ZIP à mão.
5. **Cinco contracapas sem frente** (não entraram): 026 (livro pequeno da LEA sobre Jesus Mestre),
   032 (livro laranja de evangelismo, esperanca.com.br), 037 (livro verde da CPB sobre
   administração/finanças, «Crede no Senhor»), 276 (Carol Cannon, capa amarela), 295 (Karl Haffner,
   alegoria de John Bunyan, CASA). Precisam de fotografia da frente ou de identificação.
6. **Bíblia do Desbravador laranja** entrou só com a contracapa fotografada (170) e a capa da CPB —
   confirmar que existe em stock.
7. Capas que ficaram aceitáveis mas não perfeitas (hinário castanho 027 com outro atrás, bíblias
   147/153/156 com um pouco de fundo): se se quiser, voltar a fotografar de frente, em fundo liso.

## Como voltar a correr

```bash
python3 -m venv /tmp/venv-capas && /tmp/venv-capas/bin/pip install opencv-python-headless pillow numpy
# capa a partir da fotografia (rodar=180 quando o livro foi fotografado ao contrário)
/tmp/venv-capas/bin/python -c "import sys; sys.path.insert(0,'scripts/catalogo'); import enquadrar; \
  print(enquadrar.recortar('Novos livros/<ficheiro>.jpeg', 'saida.jpg', rodar=0))"
# busca na loja da CPB
python3 scripts/catalogo/cpb.py "Título do livro"
```

`scripts/catalogo/produtos.py` é a lista dos 93 produtos (fotografia, tipo, título, autor, editora,
origem da capa); `sinopses.py` recolhe as sinopses da CPB a partir dela.

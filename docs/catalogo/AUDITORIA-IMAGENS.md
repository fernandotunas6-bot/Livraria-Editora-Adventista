# Auditoria das imagens do catálogo (2026-11-11)

> Continuação (2026-11-14): as capas tipográficas dos produtos do KiGest foram trocadas pelas
> capas verdadeiras encontradas na internet, e as bíblias com várias cores ficaram com
> as cores à escolha — ver [CAPAS-INTERNET.md](CAPAS-INTERNET.md).

Vistas à mão as 195 capas da loja: as 102 do catálogo antigo (`images/capas/LIV-*.jpg`,
`COL-*.jpg`) e as 93 dos produtos novos (`images/capas/novos/`). Mudaram **97**; os nomes dos
ficheiros são os mesmos, por isso a base de dados não muda. O registo de cada uma (fonte,
cantos usados, se foi ampliada) está em [capas-refinadas.json](capas-refinadas.json).

## O que estava mal

| Problema | Quantas | Exemplos |
|---|---|---|
| Mão ou dedos na imagem | 9 | emblemas dos Desbravadores e JA na palma da mão, lenços seguros à mão, «Testemunhando por Cristo», bíblia «Jesus» |
| Contorno ou fundo preto (maqueta 3D do livro em pé) | 29 antigas + 23 novas | LIV-012 «Apocalipse Verso por Verso», LIV-030 «Os Dez Mandamentos», «O Atirador Convertido» |
| Fotografia de bíblia embalada (reflexos, plástico, fundo da loja) | 16 | todas as bíblias da Sociedade Bíblica do Brasil |
| Outro livro ou fundo dentro da capa | 6 | hinário castanho com o branco atrás, «Segredos do Bem-Estar Emocional» com um livro por baixo, «Amor em Família» |
| Objecto sobre livros e balcão | 7 | cordão de apito, os seis lenços |

## O que se fez

- **52 capas da CPB endireitadas.** A loja da CPB serve a capa como maqueta do livro em pé
  (com lombada, faixa das páginas e fundo preto ou transparente). Recortou-se só a frente e
  endireitou-se a perspectiva (`scripts/catalogo/achatar.py`). Quando a frente tinha menos de
  290 px de largura, ampliou-se primeiro 4× com Real-ESRGAN (`esrgan.py`) e só depois se reduziu
  para 340×510, o que dá letras mais limpas.
- **16 bíblias com a foto oficial da SBB.** Cada bíblia foi identificada à vista no catálogo da
  loja da SBB (476 produtos) e substituída pela foto do fabricante, com a frente endireitada
  (`sbb.py` descarrega, `achatar.py` endireita). O número do produto na SBB ficou em `ref` no
  [mapa](mapa-novos-produtos.json) (`origem: "sbb"`). A bíblia NTLH «flores e borboletas» estava
  fotografada deitada, por isso as letras pareciam horizontais; é a SBB 151425.
- **20 capas fotografadas recortadas.** Livros que a CPB já não vende (livros missionários de anos
  anteriores, edições de Angola e Portugal) e os hinários: cortou-se o que não era capa (mão,
  fundo, o hinário de trás) pelas arestas detectadas (`arestas.py`) e ampliou-se.
- **Desbravadores sem mãos.** Os dois emblemas foram recortados da palma da mão, os seis lenços e o
  cordão de apito recortados do balcão e dos livros, e todos postos sobre um fundo neutro claro
  com sombra suave (`produto.py`). As cores, as faixas e os bordados são os da fotografia.
- As 102 capas antigas que não mudaram já eram planas e iguais às da CPB.
- No total as capas ficaram 15% mais leves (3,9 MB → 3,4 MB).

## O que fica por fazer

1. **Fotografar de novo, de frente e sem plástico**, se houver exemplares: «Futuro de Glória»,
   «Jesus Voltará», «Momentos de Paz», «O Limite do Prazer» e a bíblia «Jesus» (184) ainda
   mostram o reflexo do plástico. A CPB já não tem estas edições à venda.
2. **Emblemas oficiais em vector**: os logótipos dos Desbravadores/JA continuam a ser a fotografia
   tratada; o pacote oficial está em `downloads.adventistas.org` (o site recusa descargas fora do
   navegador).
3. **Bíblia SBB capa dura castanha (161)**: não se encontrou na loja da SBB; ficou a fotografia,
   que já estava de frente.
4. **Títulos repetidos**: «Por que, Senhor?» e «Mensageira do Senhor» existem no catálogo antigo
   (LIV-072 e LIV-057) e estão também entre os 93 produtos novos. A migração só salta um título
   igual; se os títulos na base de dados não forem iguais, ficam dois produtos do mesmo livro.

## Como refazer uma capa

```bash
python3 -m venv /tmp/venv-capas
/tmp/venv-capas/bin/pip install opencv-python-headless pillow numpy torch onnxruntime
curl -LO https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth
```

```python
import sys; sys.path.insert(0, 'scripts/catalogo')
from achatar import achatar
# maqueta da CPB com fundo transparente, sem faixa de páginas; cantos em capas-refinadas.json
achatar('19612-01-web-product-page.png', fundo='alfa', faixa=False, out='frente.png')
```

As lojas usadas (`cpb.com.br`, `imagens.cpb.com.br`, `www.sbb.com.br`, `sbb.fbitsstatic.net`)
têm de estar autorizadas na rede do ambiente.

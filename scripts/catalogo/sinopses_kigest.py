#!/usr/bin/env python3
"""Sinopses, autor e ficha dos produtos que vieram do KiGest, da loja da editora.

Os artigos do KiGest chegam só com nome, preço e existência. Sem descrição não se publica um
produto: é o texto da página, é a `meta description` que o Google mostra e é o que aparece quando
alguém partilha o livro numa conversa.

Dois caminhos, por esta ordem:

1. **Pela referência.** Em muitos artigos o KiGest usa como referência o próprio código do
   produto na Casa Publicadora Brasileira (o `14878` do KiGest é o `cpb.com.br/produto/14878`).
   Confirma-se comparando o título que a página devolve com o do artigo — a referência pode ser
   coincidência, e uma sinopse no produto errado é pior do que nenhuma.
2. **Por procura do título.** Quando a referência não serve, procura-se o título na loja da
   editora e aceita-se o resultado cujo nome se parece o suficiente.

O que não se encontrar fica sem sinopse daqui e leva um texto escrito à mão (ver
`docs/catalogo/descricoes-kigest.json`): os cartões, os certificados, os lenços, a Santa Ceia e
as bíblias não estão no catálogo da editora brasileira.

Correr da raiz do repositório:
    python3 scripts/catalogo/sinopses_kigest.py docs/catalogo/mapa-kigest-<data>.json

Escreve `docs/catalogo/sinopses-kigest.json` e pode correr outra vez: o que já lá está não é
pedido de novo, para não voltar a bater à porta da editora por nada.
"""
import html
import json
import re
import subprocess
import sys
import unicodedata
import urllib.parse
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
SAIDA = RAIZ / 'docs/catalogo/sinopses-kigest.json'

# Linhas que não são sinopse: rótulos de promoção e ficha técnica.
LIXO = re.compile(
    r'^(reformulado|lan[çc]amento|novidade|promo[çc][ãa]o|frete|baixe o aplicativo|dispon[íi]vel na'
    r'|acesse|c[óo]digo do produto|formato|n[úu]mero de p[áa]ginas|isbn|acabamento|peso|editora|autor)\b',
    re.I,
)
# As avaliações dos clientes vêm a seguir à sinopse e trazem o nome e a data de cada pessoa.
AVALIACAO = re.compile(r'^por: .{1,80} em: \d{2}/\d{2}/\d{4}$')

VAZIAS = {'de', 'da', 'do', 'das', 'dos', 'a', 'o', 'e', 'em', 'no', 'na', 'para', 'com', 'um',
          'uma', 'os', 'as', 'ao', 'que', 'se', 'por'}


def palavras(texto):
    s = unicodedata.normalize('NFKD', texto or '').encode('ascii', 'ignore').decode().lower()
    return {p for p in re.split(r'[^a-z0-9]+', s) if len(p) > 1 and p not in VAZIAS}


def parecido(a, b):
    """Quanto do nome do artigo cabe no título da editora."""
    pa, pb = palavras(a), palavras(b)
    if not pa or not pb:
        return 0.0
    comuns = len(pa & pb)
    return max(comuns / len(pa), comuns / len(pb))


def buscar(url):
    r = subprocess.run(['curl', '-s', '-L', '--max-time', '40', '-A', 'Mozilla/5.0', url],
                       capture_output=True)
    return r.stdout.decode('utf-8', 'ignore')


def pagina(pid):
    return buscar(f'https://cpb.com.br/produto/{pid}/x')


def titulo_da_pagina(h):
    m = re.search(r'<title>(.*?)</title>', h, re.S)
    return re.sub(r'\s+', ' ', html.unescape(m.group(1))).strip() if m else ''


def sinopse_da_pagina(h):
    i = h.find('id="review"')
    if i < 0:
        return ''
    j = h.find('para-details', i)
    if j < 0:
        return ''
    fim = h.find('</p>', j + 2000)
    bloco = h[j:h.find('</div>', fim if fim > 0 else j + 6000)][:12000]
    saida = []
    for p in re.findall(r'<p[^>]*>(.*?)</p>', bloco, re.S):
        t = html.unescape(re.sub(r'<(?!/?strong\b)[^>]*>', '', p))
        t = re.sub(r'\s+', ' ', t).strip()
        if '","' in t:
            break
        if AVALIACAO.match(t):
            if saida:
                saida.pop()
            if saida and len(re.sub(r'<[^>]+>', '', saida[-1])) <= 60 and '<strong>' not in saida[-1]:
                saida.pop()
            break
        if len(t) < 12 or LIXO.match(t) or t in saida:
            continue
        saida.append(t)
    return ''.join(f'<p>{t}</p>' for t in saida)


def ficha_da_pagina(h):
    isbn = re.search(r'ISBN[^0-9]{0,20}([0-9][0-9\- ]{10,20})', h)
    paginas = re.search(r'[Pp][áa]ginas?[^0-9]{0,20}(\d{2,4})', h)
    return {
        'isbn': re.sub(r'\D', '', isbn.group(1)) if isbn else '',
        'paginas': int(paginas.group(1)) if paginas else 0,
    }


def procurar(termo):
    h = buscar('https://cpb.com.br/search.html?terms=' + urllib.parse.quote(termo))
    achados, vistos = [], set()
    for b in re.split(r'(?=<div class="product-item)', h)[1:]:
        m = re.search(r'href="https://cpb\.com\.br/produto/(\d+)/([^"]+)"', b)
        t = re.search(r'<p class="titulo">(.*?)</p>', b, re.S)
        if not (m and t) or m.group(1) in vistos:
            continue
        vistos.add(m.group(1))
        achados.append({'id': m.group(1),
                        'titulo': re.sub(r'\s+', ' ', re.sub('<[^>]+>', '', t.group(1))).strip()})
    return achados


# Um título abreviado («…») na lista de resultados não dá para comparar até ao fim; a página do
# produto traz o título inteiro. Daí a confirmação ser sempre na página.
MINIMO_PARECIDO = 0.75
# Só os livros estão no catálogo da editora. Os cartões, certificados, lenços, hinários, bíblias
# e artigos de Santa Ceia não — nem vale gastar pedidos com eles.
TIPOS = {'livro'}


# A loja da editora responde devagar (20 a 30 segundos por página). Em série, 159 produtos
# levariam mais de uma hora; com um punhado de pedidos ao mesmo tempo leva minutos. Seis é
# comedido — não é um número que incomode um servidor.
TRABALHADORES = 6
# Quantos resultados da procura vale a pena confirmar. O primeiro é quase sempre o certo.
CANDIDATOS = 2


def buscar_um(n):
    ref, nome = n['kigest_ref'], n['titulo']
    # 1. A referência do KiGest como código da editora.
    if re.fullmatch(r'\d{3,6}', ref):
        h = pagina(ref)
        t = titulo_da_pagina(h)
        if t and parecido(nome, t) >= MINIMO_PARECIDO:
            return ref, {'titulo': nome, 'encontrado': True, 'cpb': ref, 'titulo_cpb': t,
                         'via': 'referencia', 'sinopse': sinopse_da_pagina(h), **ficha_da_pagina(h)}
    # 2. Procura pelo título.
    for cand in procurar(nome)[:CANDIDATOS]:
        h = pagina(cand['id'])
        t = titulo_da_pagina(h)
        if t and parecido(nome, t) >= MINIMO_PARECIDO:
            return ref, {'titulo': nome, 'encontrado': True, 'cpb': cand['id'], 'titulo_cpb': t,
                         'via': 'procura', 'sinopse': sinopse_da_pagina(h), **ficha_da_pagina(h)}
    return ref, {'titulo': nome, 'encontrado': False}


def main():
    mapa = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
    feito = json.loads(SAIDA.read_text(encoding='utf-8')) if SAIDA.exists() else {}
    alvos = [n for n in mapa['novos'] if n['tipo'] in TIPOS and n['kigest_ref'] not in feito]
    print(f'{len(alvos)} por buscar ({len(feito)} já feitos)', flush=True)

    def guardar():
        SAIDA.write_text(json.dumps(feito, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')

    with ThreadPoolExecutor(max_workers=TRABALHADORES) as pool:
        for i, (ref, dados) in enumerate(pool.map(buscar_um, alvos), 1):
            feito[ref] = dados
            marca = f"{len(dados.get('sinopse', ''))} car. ({dados['via']})" if dados['encontrado'] else 'não encontrado'
            print(f"{i}/{len(alvos)} {ref} {dados['titulo'][:40]}: {marca}", flush=True)
            if i % 20 == 0:
                guardar()
    guardar()
    com = sum(1 for v in feito.values() if v.get('sinopse'))
    print(f'{com} com sinopse, de {len(feito)}')


if __name__ == '__main__':
    main()

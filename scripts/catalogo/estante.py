"""Pesquisa na Estante Virtual (acervo de livros novos e usados do Brasil) e devolve título e foto.

    python3 estante.py "9788534529303"
    python3 estante.py "chamados para salvar adventista"

Serve para os livros que a CPB já não vende (livros missionários de anos anteriores, edições
antigas). As fotos são dos livreiros: umas são a capa digitalizada, outras o exemplar fotografado.
Nenhuma entra sem ser vista (auditoria visual em docs/catalogo/CAPAS-INTERNET.md).
"""
import json, re, sys, subprocess, urllib.parse

UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'


def buscar(q, n=8):
    url = 'https://www.estantevirtual.com.br/busca?q=' + urllib.parse.quote(q)
    h = subprocess.run(['curl', '-s', '-L', '--max-time', '40', '-A', UA, url], capture_output=True).stdout.decode('utf-8', 'ignore')
    m = re.search(r'window\.dataLayer = (\[.*?\]);\s*\n', h, re.S)
    if not m:
        return []
    try:
        imps = json.loads(m.group(1))[0]['ecommerce']['impressions']
    except Exception:
        return []
    out, vistos = [], set()
    for i in imps:
        sku = i.get('skuFather') or i.get('item_id')
        if not sku or sku in vistos:
            continue
        vistos.add(sku)
        img = re.search(rf'https://static\.estantevirtual\.com\.br/book/\w+/{re.escape(sku)}/[^"\'?\s]+', h)
        if not img:
            continue  # o livreiro não pôs foto
        out.append({'nome': i.get('name', ''), 'sku': sku, 'img': img.group(0)})
    return out[:n]


if __name__ == '__main__':
    print(json.dumps(buscar(' '.join(sys.argv[1:])), ensure_ascii=False, indent=1))

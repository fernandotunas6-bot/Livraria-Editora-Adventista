"""Procura na loja da CPB a capa dos produtos que ainda têm capa tipográfica.

    python3 procurar_capas.py alvos.txt candidatos.json

alvos.txt: uma linha por produto, «id|título|isbn|tipo|activo|ficheiro|kigest_ref» (é o que sai da consulta
em docs/catalogo/CAPAS-INTERNET.md). Para cada produto pesquisa o título (e variantes sem «Vol.»,
«Encadernado», etc.) em cpb.com.br, abre a página de cada resultado e guarda o título completo, o
ISBN e o endereço da capa. Uma kigest_ref de 4 ou 5 algarismos sem zero à esquerda é o código do
produto na CPB (a loja lançou-os assim), e entra logo como candidato. Escolhe sozinho só quando o ISBN bate ou o título normalizado é igual;
o resto fica para a auditoria visual, que é quem decide.
"""
import json, os, re, sys, html, difflib, hashlib, subprocess
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cpb import buscar, norm

CACHE = os.environ.get('CAPAS_CACHE', '/tmp/capas-cache')
os.makedirs(CACHE, exist_ok=True)


def pagina(url):
    f = os.path.join(CACHE, hashlib.md5(url.encode()).hexdigest() + '.html')
    if os.path.exists(f) and os.path.getsize(f) > 1000:
        return open(f, encoding='utf-8', errors='ignore').read()
    r = subprocess.run(['curl', '-s', '-L', '--max-time', '40', '-A', 'Mozilla/5.0', url], capture_output=True)
    t = r.stdout.decode('utf-8', 'ignore')
    open(f, 'w', encoding='utf-8').write(t)
    return t


def produto_cpb(pid, slug):
    h = pagina(f'https://cpb.com.br/produto/{pid}/{slug}')
    tit = re.search(r'<h1[^>]*>(.*?)</h1>', h, re.S)
    tit = html.unescape(re.sub(r'\s+', ' ', re.sub('<[^>]+>', '', tit.group(1)))).strip() if tit else ''
    isbn = re.search(r'ISBN:\s*([0-9Xx-]{10,17})', h)
    autor = re.search(r'Autor(?:es|\(es\))?:\s*</?[^>]*>?\s*([^<]{2,80})', h)
    img = re.search(rf'https://imagens\.cpb\.com\.br/produtos/{pid}/[^"\'\s]+', h)
    return {
        'id': pid, 'slug': slug, 'titulo': tit,
        'isbn': isbn.group(1).replace('-', '') if isbn else '',
        'autor': autor.group(1).strip() if autor else '',
        'img': img.group(0) if img else f'https://imagens.cpb.com.br/produtos/{pid}/{pid}-01-web-product-page.png',
    }


LIXO = [r'\bvol\.?\s*\d+\b', r'\bencadernado\b', r'\(livro infantil\)', r'\binfantil\b', r'^b[ií]blia sagrada\b',
        r'\bcaderno de actividade\b', r'\btemas semanais\b', r'^nepp-?', r'\b\d{4}\b']


def variantes(t):
    v = [t]
    s = t
    for p in LIXO:
        s2 = re.sub(p, ' ', s, flags=re.I).strip(' -—,')
        if s2 and s2 != s:
            v.append(re.sub(r'\s+', ' ', s2))
    if '—' in t:
        v.append(t.split('—')[0].strip())
    return list(dict.fromkeys(x for x in v if len(x) > 2))


def procurar(linha):
    pid, titulo, isbn, tipo, activo, fich, ref = linha.split('|')
    vistos, cands = set(), []
    if re.fullmatch(r'[1-9]\d{3,4}', ref):
        c = produto_cpb(ref, 'x')
        if c['titulo']:
            vistos.add(ref)
            c['ref_kigest'] = True
            c['sim'] = round(difflib.SequenceMatcher(None, norm(titulo), norm(c['titulo'])).ratio(), 3)
            cands.append(c)
    for q in variantes(titulo):
        for r in buscar(q)[:8]:
            if r['id'] in vistos:
                continue
            vistos.add(r['id'])
            c = produto_cpb(r['id'], r['slug'])
            c['sim'] = round(difflib.SequenceMatcher(None, norm(titulo), norm(c['titulo'] or r['titulo'])).ratio(), 3)
            cands.append(c)
    cands.sort(key=lambda c: (c['isbn'] == isbn and isbn != '', c.get('ref_kigest', False), c['sim']), reverse=True)
    escolha, porque = None, ''
    if cands and cands[0].get('ref_kigest'):
        escolha, porque = cands[0]['id'], 'kigest_ref é o código CPB'
    elif isbn and cands and cands[0]['isbn'] == isbn:
        escolha, porque = cands[0]['id'], 'isbn'
    elif cands and norm(cands[0]['titulo']) == norm(titulo):
        escolha, porque = cands[0]['id'], 'titulo igual'
    return {'id': pid, 'titulo': titulo, 'isbn': isbn, 'ref': ref, 'tipo': tipo, 'activo': activo == 'true',
            'ficheiro': fich, 'candidatos': cands[:10], 'auto': escolha, 'porque': porque}


if __name__ == '__main__':
    linhas = [l.strip() for l in open(sys.argv[1], encoding='utf-8') if l.strip()]
    with ThreadPoolExecutor(8) as ex:
        res = list(ex.map(procurar, linhas))
    json.dump(res, open(sys.argv[2], 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    auto = sum(1 for r in res if r['auto'])
    sem = sum(1 for r in res if not r['candidatos'])
    print(f'{len(res)} produtos · {auto} escolhidos sozinhos · {sem} sem nenhum resultado na CPB')

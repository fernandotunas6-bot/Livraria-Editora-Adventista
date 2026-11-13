"""Lê uma página de produto da loja da SBB e descarrega as fotos do próprio produto.

    python3 sbb.py https://www.sbb.com.br/produto/<slug>-<id> pasta/
As fotos ficam em sbb.fbitsstatic.net (tamanho original: 599 px nas mais antigas, até 2400 px).
"""
import re, subprocess, sys, os
def fetch(url):
    r = subprocess.run(['curl', '-s', '-L', '--max-time', '40', '-A', 'Mozilla/5.0', '-w', '\n%{url_effective}', url], capture_output=True)
    t = r.stdout.decode('utf-8', 'ignore'); body, _, eff = t.rpartition('\n'); return body, eff
def produto(url, pasta, larg=1200):
    h, eff = fetch(url)
    pid = re.search(r'-(\d{6})$', eff.rstrip('/'))
    pid = pid.group(1) if pid else None
    tit = re.search(r'<title>([^<]*)', h); tit = tit.group(1).strip() if tit else ''
    imgs = sorted(set(re.findall(r'https://sbb\.fbitsstatic\.net/img/p/[^"\'?\s]+', h)))
    if pid: imgs = [i for i in imgs if f'-{pid}/' in i]
    os.makedirs(pasta, exist_ok=True); saida = []
    for i in imgs:
        nome = f'{pid}_' + i.rsplit('/', 1)[1]
        dest = os.path.join(pasta, nome)
        subprocess.run(['curl', '-s', '--max-time', '40', '-o', dest, f'{i}?w={larg}&h={larg}'])
        saida.append(dest)
    return pid, tit, saida
if __name__ == '__main__':
    pid, tit, s = produto(sys.argv[1], sys.argv[2])
    print(pid, '|', tit, '|', len(s), 'fotos')

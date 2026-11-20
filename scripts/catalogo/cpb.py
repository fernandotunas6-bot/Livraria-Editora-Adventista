# Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
# © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import json, re, sys, time, unicodedata, urllib.parse, subprocess, difflib, os
SP=os.path.dirname(os.path.abspath(__file__))
def norm(s):
    s=unicodedata.normalize('NFKD',s).encode('ascii','ignore').decode().lower()
    return re.sub(r'\s+',' ',re.sub(r'[^a-z0-9 ]',' ',s)).strip()
def fetch(url):
    r=subprocess.run(['curl','-s','-L','--max-time','40','-A','Mozilla/5.0',url],capture_output=True)
    return r.stdout.decode('utf-8','ignore')
def buscar(termo):
    url='https://cpb.com.br/search.html?terms='+urllib.parse.quote(termo)
    h=fetch(url)
    out=[]
    for b in re.split(r'(?=<div class="product-item)', h)[1:]:
        m=re.search(r'href="https://cpb\.com\.br/produto/(\d+)/([^"]+)"', b)
        t=re.search(r'<p class="titulo">(.*?)</p>', b, re.S)
        if m and t:
            out.append({'id':m.group(1),'slug':m.group(2),'titulo':re.sub(r'\s+',' ',re.sub('<[^>]+>','',t.group(1))).strip()})
    # sem repetidos
    seen=set(); r=[]
    for o in out:
        if o['id'] in seen: continue
        seen.add(o['id']); r.append(o)
    return r
if __name__=='__main__':
    print(json.dumps(buscar(sys.argv[1]), ensure_ascii=False, indent=1))

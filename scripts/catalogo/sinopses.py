# Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
# © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import re, html, json, subprocess, time, sys
sys.path.insert(0,'.')
from produtos import P
SP="/private/tmp/claude-501/-Volumes-canguele-livraria/524602a5-63a9-4712-bf5c-eb92d5f51b89/scratchpad"

LIXO = re.compile(r'^(reformulado|lan[çc]amento|novidade|promo[çc][ãa]o|frete|baixe o aplicativo|dispon[íi]vel na|acesse|c[óo]digo do produto|formato|n[úu]mero de p[áa]ginas|isbn|acabamento|peso|editora|autor)\b', re.I)

AVALIACAO = re.compile(r'^por: .{1,80} em: \d{2}/\d{2}/\d{4}$')

def sinopse(pid):
    url=f"https://cpb.com.br/produto/{pid}/x"
    h=subprocess.run(['curl','-s','-L','--max-time','40','-A','Mozilla/5.0',url],capture_output=True).stdout.decode('utf-8','ignore')
    i=h.find('id="review"')
    if i<0: return ''
    j=h.find('para-details', i)
    if j<0: return ''
    bloco=h[j:h.find('</div>', h.find('</p>', j+2000) if h.find('</p>', j+2000)>0 else j+6000)]
    bloco=bloco[:12000]
    paras=re.findall(r'<p[^>]*>(.*?)</p>', bloco, re.S)
    saida=[]
    for p in paras:
        t=html.unescape(re.sub(r'<(?!/?strong\b)[^>]*>', '', p))
        t=re.sub(r'\s+',' ',t).strip('  ')
        # O JSON da página (",\"subtitle\":…) e as avaliações dos clientes da CPB vêm a seguir à
        # sinopse e não são dela: as avaliações trazem o nome e a data de cada pessoa. Ao chegar
        # ao "por: … em: dd/mm/aaaa", saem o texto da avaliação e o título dela (se for curto).
        if '","' in t: break
        if AVALIACAO.match(t):
            if saida: saida.pop()
            if saida and len(re.sub(r'<[^>]+>', '', saida[-1])) <= 60 and '<strong>' not in saida[-1]: saida.pop()
            break
        if len(t) < 12 or LIXO.match(t): continue
        if t in saida: continue
        saida.append(t)
    return ''.join(f'<p>{t}</p>' for t in saida)

if __name__=='__main__':
    res={}
    alvos=[(p[0],p[5][1]) for p in P if p[5][0]=='cpb']
    for foto,pid in alvos:
        s=sinopse(pid)
        res[foto]=s
        print(f"{foto} {pid}: {len(s)} car.", flush=True)
        time.sleep(1.0)
    json.dump(res, open(f"{SP}/sinopses.json","w"), ensure_ascii=False, indent=1)

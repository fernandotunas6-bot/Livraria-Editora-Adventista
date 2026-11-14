"""Trata as capas aprovadas na auditoria visual e grava-as no lugar das capas tipográficas.

    python3 capas_internet.py docs/catalogo/capas-internet.json pasta-das-fontes/ [--so id1,id2]

Para cada produto lê a imagem descarregada (CPB ou Estante Virtual) e:
  - fundo transparente, preto ou branco uniforme (maquetas da CPB, capas digitalizadas):
    encontra as quatro arestas e endireita a frente (achatar.py);
  - capa digitalizada de frente com orla irregular («plano»): apara a margem branca ou preta e
    ajusta a 2:3 sem perspectiva;
  - fotografia com fundo real (mesa, parede): recorta o livro pelo contorno (enquadrar.py).
Grava 400×600 WebP com o nome que a base de dados já usa (images/capas/kigest/<ficheiro>), por isso
a base de dados só muda para os produtos que não tinham imagem nenhuma. Cada entrada pode trazer
«quad» (cantos à mão) ou «metodo» quando a detecção automática não acerta.
"""
import json, os, sys, tempfile
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from achatar import achatar
from enquadrar import recortar

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
DEST = os.path.join(RAIZ, 'app', 'web', 'public', 'images', 'capas', 'kigest')
TAM = (400, 600)


def fundo(caminho):
    """'alfa', 'preto', 'branco' ou 'foto', pelo canal alfa e pelos cantos da imagem."""
    im = Image.open(caminho)
    if im.mode in ('RGBA', 'LA', 'P'):
        a = np.asarray(im.convert('RGBA'))[..., 3]
        if (a < 20).mean() > 0.02:
            return 'alfa'
    a = np.asarray(im.convert('RGB')).astype(int)
    h, w = a.shape[:2]; k = max(4, min(h, w) // 25)
    cantos = np.concatenate([a[:k, :k].reshape(-1, 3), a[:k, -k:].reshape(-1, 3),
                             a[-k:, :k].reshape(-1, 3), a[-k:, -k:].reshape(-1, 3)])
    m, d = cantos.mean(), cantos.std()
    if d < 18 and m < 45:
        return 'preto'
    if d < 18 and m > 210:
        return 'branco'
    return 'foto'


def plano(src, out, tol=28, corte_max=0.06, aparar=True):
    """Capa digitalizada de frente: tira a margem da cor do fundo e ajusta a 2:3 sem perspectiva.

    Só apara quando a orla é branca ou preta: numa capa impressa até à borda (as da Ellen G. White
    da CPB, bege ou cinzenta), a «orla» é a própria capa e aparar cortava-lhe as letras.
    Se a proporção da capa difere de 2:3 até corte_max, corta o excesso ao centro; se difere mais,
    completa com a cor da orla da própria capa (nunca deforma)."""
    im = Image.open(src).convert('RGBA')
    base = Image.new('RGBA', im.size, (255, 255, 255, 255)); base.alpha_composite(im)
    a = np.asarray(base.convert('RGB')).astype(int)
    orla = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
    bg = np.median(orla, axis=0)
    aparar = aparar and (bg.min() > 225 or bg.max() < 30)
    m = np.abs(a - bg).max(axis=2) > tol
    lin, col = np.where(m.mean(1) > 0.04)[0], np.where(m.mean(0) > 0.04)[0]
    if aparar and len(lin) and len(col):
        a = a[lin[0]:lin[-1] + 1, col[0]:col[-1] + 1]
    capa = Image.fromarray(a.astype(np.uint8))
    w, h = capa.size; alvo = TAM[0] / TAM[1]; r = w / h
    if abs(r - alvo) / alvo <= corte_max:
        if r > alvo:
            nw = round(h * alvo); capa = capa.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
        else:
            nh = round(w / alvo); capa = capa.crop((0, (h - nh) // 2, w, (h - nh) // 2 + nh))
        capa = capa.resize(TAM, Image.LANCZOS)
    else:
        f = min(TAM[0] / w, TAM[1] / h); capa = capa.resize((round(w * f), round(h * f)), Image.LANCZOS)
        c = np.asarray(capa).astype(int); cor = tuple(int(v) for v in np.median(np.concatenate([c[0], c[-1], c[:, 0], c[:, -1]]), axis=0))
        fundo_ = Image.new('RGB', TAM, cor); fundo_.paste(capa, ((TAM[0] - capa.width) // 2, (TAM[1] - capa.height) // 2)); capa = fundo_
    capa.save(out)


def tratar(e, fontes):
    src = os.path.join(fontes, e['fonte'])
    out = os.path.join(DEST, e['ficheiro'])
    metodo = e.get('metodo') or fundo(src)
    if metodo == 'foto' and e['origem'].startswith('Casa'):
        metodo = 'plano'  # a CPB não fotografa: imagem plana com orla irregular
    with tempfile.NamedTemporaryFile(suffix='.png') as t:
        if metodo == 'plano':
            plano(src, t.name, aparar=e.get('aparar', True))
        elif metodo == 'foto':
            recortar(src, t.name, tam=TAM)
        else:
            achatar(src, fundo=metodo, faixa=e.get('faixa', False), inset=e.get('inset', 2.5),
                    quad=e.get('quad'), lombada=e.get('lombada', 0.0), tam=TAM, out=t.name)
        Image.open(t.name).convert('RGB').save(out, 'WEBP', quality=86, method=6)
    return metodo


if __name__ == '__main__':
    lista = json.load(open(sys.argv[1], encoding='utf-8'))['capas']
    so = set(sys.argv[sys.argv.index('--so') + 1].split(',')) if '--so' in sys.argv else None
    for e in lista:
        if so and e['id'] not in so:
            continue
        print(e['ficheiro'], tratar(e, sys.argv[2]))

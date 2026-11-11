"""Encontra as quatro arestas da capa numa imagem já quase enquadrada (procura perto de cada lado)."""
import numpy as np, cv2
from PIL import Image
from achatar import linha, cruza
def arestas(src, lados=('l','r','t','b'), faixa=48):
    im = Image.open(src).convert('RGB'); a = np.asarray(im)
    g = cv2.GaussianBlur(cv2.cvtColor(a, cv2.COLOR_RGB2LAB).astype(np.float32), (0, 0), 1.0)
    H, W = g.shape[:2]
    gx = np.linalg.norm(np.diff(g, axis=1), axis=2); gy = np.linalg.norm(np.diff(g, axis=0), axis=2)
    Y = np.arange(int(H*.08), int(H*.92)); X = np.arange(int(W*.08), int(W*.92))
    def busca(perfil, lo, hi):
        seg = perfil[lo:hi]; i = int(np.argmax(seg)); return lo + i + 1, seg[i]
    res = {}
    if 'l' in lados: res['l'] = [busca(gx[y], 0, faixa)[0] for y in Y]
    if 'r' in lados: res['r'] = [busca(gx[y], W-1-faixa, W-1)[0] for y in Y]
    if 't' in lados: res['t'] = [busca(gy[:, x], 0, faixa)[0] for x in X]
    if 'b' in lados: res['b'] = [busca(gy[:, x], H-1-faixa, H-1)[0] for x in X]
    vL = linha(res['l'], Y) if 'l' in res else (0.0, 0.0)
    vR = linha(res['r'], Y) if 'r' in res else (0.0, W-1.0)
    hT = linha(res['t'], X) if 't' in res else (0.0, 0.0)
    hB = linha(res['b'], X) if 'b' in res else (0.0, H-1.0)
    return [cruza(vL, hT), cruza(vR, hT), cruza(vR, hB), cruza(vL, hB)]

# Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
# © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

"""Recorta a capa do produto a partir da fotografia (OpenCV)."""
import cv2, numpy as np, math
from PIL import Image, ImageOps, ImageEnhance

def _carrega(caminho):
    im = ImageOps.exif_transpose(Image.open(caminho)).convert('RGB')
    return im, np.array(im)[:, :, ::-1].copy()

def _ordena(p):
    s, d = p.sum(1), np.diff(p, axis=1).ravel()
    return np.array([p[np.argmin(s)], p[np.argmin(d)], p[np.argmax(s)], p[np.argmax(d)]], dtype=np.float32)

def _quads(bgr, lado=900):
    h, w = bgr.shape[:2]
    esc = lado/max(h, w)
    p = cv2.resize(bgr, (round(w*esc), round(h*esc)), interpolation=cv2.INTER_AREA)
    g = cv2.cvtColor(p, cv2.COLOR_BGR2GRAY)
    g = cv2.bilateralFilter(g, 9, 60, 60)
    H, W = g.shape
    saida = []
    for lo, hi in ((30, 90), (50, 150), (20, 60), (70, 200)):
        e = cv2.Canny(g, lo, hi)
        e = cv2.morphologyEx(e, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))
        e = cv2.dilate(e, np.ones((3, 3), np.uint8), iterations=1)
        cnts, _ = cv2.findContours(e, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
        for c in sorted(cnts, key=cv2.contourArea, reverse=True)[:8]:
            a = cv2.contourArea(c)
            if a < 0.12*H*W: continue
            peri = cv2.arcLength(c, True)
            for k in (0.02, 0.035, 0.05):
                ap = cv2.approxPolyDP(c, k*peri, True)
                if len(ap) == 4 and cv2.isContourConvex(ap):
                    saida.append((a/(H*W), _ordena(ap.reshape(4, 2).astype(np.float32))/esc))
                    break
            else:
                r = cv2.minAreaRect(c)
                if cv2.contourArea(cv2.boxPoints(r).astype(np.int32)) > 1.35*a: continue
                saida.append((a/(H*W)*0.92, _ordena(cv2.boxPoints(r))/esc))
    return saida

def _pontua(q, im_w, im_h):
    larg = (np.linalg.norm(q[1]-q[0]) + np.linalg.norm(q[2]-q[3]))/2
    alt  = (np.linalg.norm(q[3]-q[0]) + np.linalg.norm(q[2]-q[1]))/2
    if larg < 1 or alt < 1: return None
    prop = larg/alt
    if prop > 1.0: prop = 1/prop          # aceita a foto deitada; roda-se depois
    if not (0.40 <= prop <= 1.05): return None
    area = larg*alt/(im_w*im_h)
    if not (0.14 <= area <= 1.05): return None
    if q.min() < -0.05*im_w or q[:, 0].max() > 1.05*im_w or q[:, 1].max() > 1.05*im_h: return None
    def ang(a, b): return math.atan2(b[1]-a[1], b[0]-a[0])
    par = abs(ang(q[0], q[1]) - ang(q[3], q[2])) + abs(ang(q[0], q[3]) - ang(q[1], q[2]))
    return area - 1.5*par - 0.5*abs(prop - 0.68)

def _grabcut(bgr, lado=500, m=0.06):
    """Separa o produto do fundo e devolve o rectângulo que o envolve."""
    h, w = bgr.shape[:2]
    esc = lado/max(h, w)
    p = cv2.resize(bgr, (round(w*esc), round(h*esc)), interpolation=cv2.INTER_AREA)
    H, W = p.shape[:2]
    mask = np.zeros((H, W), np.uint8)
    rect = (int(W*m), int(H*m), int(W*(1-2*m)), int(H*(1-2*m)))
    try:
        cv2.grabCut(p, mask, rect, np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64), 5, cv2.GC_INIT_WITH_RECT)
    except cv2.error:
        return None
    fg = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)
    fg = cv2.morphologyEx(fg, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    fg = cv2.morphologyEx(fg, cv2.MORPH_CLOSE, np.ones((15, 15), np.uint8))
    n, lab, stats, _ = cv2.connectedComponentsWithStats(fg, 8)
    if n < 2: return None
    i = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    c, _ = cv2.findContours((lab == i).astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not c: return None
    return _ordena(cv2.boxPoints(cv2.minAreaRect(c[0])))/esc

def recortar(caminho, destino, tam=(340, 510), rodar=0, folga=0.012):
    im, bgr = _carrega(caminho)
    W, H = im.size
    melhor = None
    for _, q in _quads(bgr):
        s = _pontua(q, W, H)
        if s is not None and (melhor is None or s > melhor[0]): melhor = (s, q)
    if melhor is None:
        for m in (0.06, 0.03, 0.10, 0.15):
            q = _grabcut(bgr, m=m)
            if q is None: continue
            s = _pontua(q, W, H)
            if s is not None and (melhor is None or s > melhor[0]): melhor = (s, q)
            if melhor is not None: break
    oW, oH = tam[0]*3, tam[1]*3
    if melhor is not None:
        q = melhor[1].astype(np.float32)
        c = q.mean(0)
        q = c + (q - c)*(1 + folga)          # folga para não cortar a capa
        lw = (np.linalg.norm(q[1]-q[0]) + np.linalg.norm(q[2]-q[3]))/2
        lh = (np.linalg.norm(q[3]-q[0]) + np.linalg.norm(q[2]-q[1]))/2
        dW, dH = (oH, oW) if lw > lh else (oW, oH)
        M = cv2.getPerspectiveTransform(q, np.array([[0,0],[dW,0],[dW,dH],[0,dH]], dtype=np.float32))
        capa = Image.fromarray(cv2.warpPerspective(bgr, M, (dW, dH), flags=cv2.INTER_CUBIC,
                                                   borderMode=cv2.BORDER_REPLICATE)[:, :, ::-1])
        metodo = 'recorte'
    else:
        prop = tam[0]/tam[1]
        nw, nh = (int(H*prop), H) if W/H > prop else (W, int(W/prop))
        capa = im.crop(((W-nw)//2, (H-nh)//2, (W-nw)//2+nw, (H-nh)//2+nh)).resize((oW, oH), Image.LANCZOS)
        metodo = 'centro'
    if rodar: capa = capa.rotate(rodar, expand=True)
    capa = capa.resize(tam, Image.LANCZOS)
    capa = ImageOps.autocontrast(capa, cutoff=(0.5, 0.3))
    capa = ImageEnhance.Sharpness(capa).enhance(1.2)
    capa = ImageEnhance.Color(capa).enhance(1.05)
    capa.save(destino, quality=89)
    return metodo

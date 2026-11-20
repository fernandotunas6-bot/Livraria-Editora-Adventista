# Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
# © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

"""Real-ESRGAN x4plus (RRDBNet) em CPU, sem basicsr: amplia 4× antes de endireitar ou recortar.

Pesos (64 MB): https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth
Precisa de `pip install torch pillow numpy`. Uma capa de 340×510 leva ~30 s em 4 núcleos.
    python3 esrgan.py entrada.jpg saida.png RealESRGAN_x4plus.pth
"""
import torch, torch.nn as nn, torch.nn.functional as F, numpy as np, sys
from PIL import Image
class RDB(nn.Module):
    def __init__(s, nf=64, gc=32):
        super().__init__()
        s.conv1 = nn.Conv2d(nf, gc, 3, 1, 1); s.conv2 = nn.Conv2d(nf+gc, gc, 3, 1, 1)
        s.conv3 = nn.Conv2d(nf+2*gc, gc, 3, 1, 1); s.conv4 = nn.Conv2d(nf+3*gc, gc, 3, 1, 1)
        s.conv5 = nn.Conv2d(nf+4*gc, nf, 3, 1, 1); s.lrelu = nn.LeakyReLU(0.2, True)
    def forward(s, x):
        x1 = s.lrelu(s.conv1(x)); x2 = s.lrelu(s.conv2(torch.cat((x, x1), 1)))
        x3 = s.lrelu(s.conv3(torch.cat((x, x1, x2), 1))); x4 = s.lrelu(s.conv4(torch.cat((x, x1, x2, x3), 1)))
        return s.conv5(torch.cat((x, x1, x2, x3, x4), 1)) * 0.2 + x
class RRDB(nn.Module):
    def __init__(s, nf, gc=32):
        super().__init__(); s.rdb1 = RDB(nf, gc); s.rdb2 = RDB(nf, gc); s.rdb3 = RDB(nf, gc)
    def forward(s, x): return s.rdb3(s.rdb2(s.rdb1(x))) * 0.2 + x
class RRDBNet(nn.Module):
    def __init__(s, nf=64, nb=23, gc=32):
        super().__init__()
        s.conv_first = nn.Conv2d(3, nf, 3, 1, 1)
        s.body = nn.Sequential(*[RRDB(nf, gc) for _ in range(nb)])
        s.conv_body = nn.Conv2d(nf, nf, 3, 1, 1)
        s.conv_up1 = nn.Conv2d(nf, nf, 3, 1, 1); s.conv_up2 = nn.Conv2d(nf, nf, 3, 1, 1)
        s.conv_hr = nn.Conv2d(nf, nf, 3, 1, 1); s.conv_last = nn.Conv2d(nf, 3, 3, 1, 1)
        s.lrelu = nn.LeakyReLU(0.2, True)
    def forward(s, x):
        f = s.conv_first(x); f = f + s.conv_body(s.body(f))
        f = s.lrelu(s.conv_up1(F.interpolate(f, scale_factor=2, mode='nearest')))
        f = s.lrelu(s.conv_up2(F.interpolate(f, scale_factor=2, mode='nearest')))
        return s.conv_last(s.lrelu(s.conv_hr(f)))
_net = None
def net(path):
    global _net
    if _net is None:
        _net = RRDBNet(); sd = torch.load(path, map_location='cpu', weights_only=True)
        _net.load_state_dict(sd.get('params_ema', sd.get('params', sd)), strict=True); _net.eval()
        torch.set_num_threads(4)
    return _net
def x4(img, model, tile=200, pad=10):
    """img: PIL RGB -> PIL RGB 4x, por blocos."""
    a = torch.from_numpy(np.asarray(img.convert('RGB')).astype(np.float32)/255.).permute(2, 0, 1)[None]
    _, _, H, W = a.shape; out = torch.zeros(1, 3, H*4, W*4); m = net(model)
    with torch.no_grad():
        for y in range(0, H, tile):
            for x in range(0, W, tile):
                y0, x0 = max(y-pad, 0), max(x-pad, 0); y1, x1 = min(y+tile+pad, H), min(x+tile+pad, W)
                o = m(a[:, :, y0:y1, x0:x1])
                ty1, tx1 = min(y+tile, H), min(x+tile, W)
                out[:, :, y*4:ty1*4, x*4:tx1*4] = o[:, :, (y-y0)*4:(y-y0+ty1-y)*4, (x-x0)*4:(x-x0+tx1-x)*4]
    return Image.fromarray((out[0].clamp(0, 1).permute(1, 2, 0).numpy()*255).round().astype(np.uint8))
if __name__ == '__main__':
    import time; t = time.time()
    x4(Image.open(sys.argv[1]), sys.argv[3]).save(sys.argv[2]); print('ok', round(time.time()-t, 1), 's')

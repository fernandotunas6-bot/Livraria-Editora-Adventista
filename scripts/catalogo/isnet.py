"""Máscara de primeiro plano com IS-Net (isnet-general-use.onnx do rembg).

Pesos (170 MB): https://github.com/danielgatis/rembg/releases/download/v0.0.0/isnet-general-use.onnx
Precisa de `pip install onnxruntime pillow numpy`. Serve de ponto de partida; os dedos e o fundo
parecido com o objecto ainda se tiram à mão (ver produto.pele e os contornos em capas-refinadas.json).
"""
import numpy as np, onnxruntime as ort
from PIL import Image
_s = None
def mascara(img, modelo):
    global _s
    if _s is None: _s = ort.InferenceSession(modelo, providers=['CPUExecutionProvider'])
    im = img.convert('RGB'); W, H = im.size
    a = np.asarray(im.resize((1024, 1024), Image.LANCZOS)).astype(np.float32); a = a / max(a.max(), 1e-6)
    a = (a - np.array([0.485, 0.456, 0.406], np.float32)) / np.array([1.0, 1.0, 1.0], np.float32)
    x = a.transpose(2, 0, 1)[None].astype(np.float32)
    p = _s.run(None, {_s.get_inputs()[0].name: x})[0][:, 0]
    p = (p - p.min()) / (p.max() - p.min() + 1e-8)
    return Image.fromarray((p[0] * 255).astype(np.uint8)).resize((W, H), Image.LANCZOS)

"""Variantes de 960 e 1280 px dos slides do herói, para os telemóveis.

Os slides têm 1920×1080 (44–153 KB) e eram servidos assim a ecrãs de 390 px: no telemóvel, a
imagem do herói é o maior elemento da página inicial e chegava a demorar mais de 4 s a aparecer
(auditoria 360°, A360-28). Com `srcset`, o navegador escolhe a mais pequena que chega para o ecrã:
960 px para um telemóvel de 390 px com densidade 2, 1280 px com densidade 3.

Gera `app/web/public/images/site/<largura>/<caminho>.webp` para cada `slide-*.webp` de
`app/web/public/images/site/` e de `opcoes/` (os que o painel deixa escolher), e escreve a lista em
`app/web/src/lib/slideVariants.json`, que o site lê (`lib/imageUrl.js`, `siteSrcSet`).

Correr da raiz do repositório depois de juntar ou trocar um slide:
    python3 scripts/imagens/variantes.py
Precisa do Pillow (`pip install pillow`).
"""
import json
from pathlib import Path

from PIL import Image

RAIZ = Path(__file__).resolve().parents[2]
SITE = RAIZ / 'app/web/public/images/site'
LISTA = RAIZ / 'app/web/src/lib/slideVariants.json'
LARGURAS = (960, 1280)  # as mesmas de `siteSrcSet` (app/web/src/lib/imageUrl.js)
QUALIDADE = 78


def origens():
    for pasta in (SITE, SITE / 'opcoes'):
        yield from sorted(pasta.glob('slide-*.webp'))


def main():
    feitas = []
    for origem in origens():
        relativo = origem.relative_to(SITE)
        with Image.open(origem) as img:
            if img.width <= max(LARGURAS):
                continue
            tamanhos = []
            for largura in LARGURAS:
                destino = SITE / str(largura) / relativo
                destino.parent.mkdir(parents=True, exist_ok=True)
                altura = round(img.height * largura / img.width)
                img.convert('RGB').resize((largura, altura), Image.LANCZOS).save(
                    destino, 'WEBP', quality=QUALIDADE, method=6)
                tamanhos.append(f'{largura}: {destino.stat().st_size // 1024} KB')
        feitas.append(f'/images/site/{relativo.as_posix()}')
        print(f'{relativo}: {origem.stat().st_size // 1024} KB → ' + ', '.join(tamanhos))
    LISTA.write_text(json.dumps(sorted(feitas), indent=2) + '\n', encoding='utf-8')
    print(f'{len(feitas)} variantes; lista em {LISTA.relative_to(RAIZ)}')


if __name__ == '__main__':
    main()

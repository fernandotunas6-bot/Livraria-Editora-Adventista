import React, { useState } from 'react';
import { ArrowDown, ArrowUp, Camera, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import ImageField from '@/components/admin/ImageField';
import { GALERIA_MAX_FOTOS, GALERIA_MAX_LEGENDA, erroDaGaleria } from '@/lib/stores';

/**
 * As fotografias de uma loja, no formulário do painel.
 *
 * A ficha da loja já tinha uma foto — a miniatura do cartão. As lojas mandam várias (a fachada,
 * as prateleiras, a equipa), e até aqui só entravam por migração: a equipa tinha de pedir a um
 * programador para pôr no site uma fotografia que já tinha no telemóvel.
 *
 * Cada fotografia é enviada para o Storage assim que é escolhida (pasta `physical_stores`, que
 * exige a permissão «Configurações»), e o que fica guardado na loja é o endereço dela. A legenda
 * é a frase que aparece por baixo da fotografia quando esta é aberta em grande.
 */
export default function StoreGalleryField({ photos = [], onChange, driveConfig = null }) {
  // O campo de adicionar esvazia-se a cada fotografia aceite: a chave nova dá-lhe um estado
  // limpo, senão ficava a mostrar a anterior como se ainda estivesse por juntar.
  const [chave, setChave] = useState(0);
  const cheia = photos.length >= GALERIA_MAX_FOTOS;
  const aviso = erroDaGaleria(photos);

  const trocar = (i, j) => {
    if (j < 0 || j >= photos.length) return;
    const lista = [...photos];
    [lista[i], lista[j]] = [lista[j], lista[i]];
    onChange(lista);
  };

  const juntar = (url) => {
    if (!url || url.startsWith('blob:') || cheia) return;
    onChange([...photos, { url, caption: '' }]);
    setChave((k) => k + 1);
  };

  return (
    <div className="space-y-3">
      {photos.length > 0 && (
        <ul className="space-y-2">
          {photos.map((foto, i) => (
            <li key={`${foto.url}-${i}`} className="flex items-start gap-3 rounded-xl border border-border p-2">
              <img
                src={foto.url}
                alt=""
                className="h-16 w-20 shrink-0 rounded-lg border border-border object-cover"
                loading="lazy"
              />
              <div className="min-w-0 flex-1 space-y-1">
                <Input
                  value={foto.caption || ''}
                  maxLength={GALERIA_MAX_LEGENDA}
                  placeholder="Legenda (ex.: A entrada da loja)"
                  aria-label={`Legenda da fotografia ${i + 1}`}
                  onChange={(e) => onChange(photos.map((f, j) => (j === i ? { ...f, caption: e.target.value } : f)))}
                />
                <p className="text-[11px] text-muted-foreground">Fotografia {i + 1} de {photos.length}{i === 0 ? ' · a primeira abre a galeria' : ''}</p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button type="button" size="icon" variant="ghost" aria-label={`Subir a fotografia ${i + 1}`} disabled={i === 0} onClick={() => trocar(i, i - 1)}>
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button type="button" size="icon" variant="ghost" aria-label={`Descer a fotografia ${i + 1}`} disabled={i === photos.length - 1} onClick={() => trocar(i, i + 1)}>
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button type="button" size="icon" variant="ghost" aria-label={`Remover a fotografia ${i + 1}`} onClick={() => onChange(photos.filter((_, j) => j !== i))}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {aviso && <p className="text-xs font-medium text-destructive" role="alert">{aviso}</p>}

      {cheia ? (
        <p className="text-xs text-muted-foreground">
          <Camera className="mr-1 inline h-3.5 w-3.5" aria-hidden />
          Galeria completa ({GALERIA_MAX_FOTOS} fotografias). Remova uma para juntar outra.
        </p>
      ) : (
        <ImageField
          key={chave}
          label={photos.length ? 'Juntar outra fotografia' : 'Juntar a primeira fotografia'}
          value=""
          onChange={juntar}
          uploadFolder="physical_stores"
          aspect="4:3"
          previewClassName="h-20 w-28"
          driveConfig={driveConfig}
          hint={`Aparecem na página das lojas, por esta ordem. Até ${GALERIA_MAX_FOTOS} fotografias.`}
        />
      )}
    </div>
  );
}

# Trajeto da encomenda com GPS

Estado em 2026-11-08. Pedido do dono: "refinar também o trajeto da encomenda, GPS refinado dos dois
lados, de quem recebe e de quem envia".

Como fazem as entregas com estafeta (Glovo, Uber Eats, Bolt Food, Yango): quem entrega partilha a
posição enquanto vai a caminho; quem recebe vê-a no mapa, com a distância e o tempo estimado, e afina
o ponto onde quer receber. Mapa: OpenStreetMap, com a biblioteca Leaflet (carregada só quando aparece
um mapa).

## Quem recebe (o cliente)

- **No checkout**, "Usar a minha localização" espera até 15 segundos pela leitura mais precisa (pára
  antes, se chegar a ±20 m) e diz a precisão. "Ver no mapa e afinar" abre o mapa: arrasta-se a
  casinha (ou toca-se no mapa) até à porta. Antes era uma leitura só, muitas vezes pela rede, com
  centenas de metros de erro.
- **No rastreio** (`/track`), numa entrega ao domicílio ainda por entregar, aparece **Trajeto da
  entrega**:
  - o ponto de entrega, com a precisão (um círculo à volta quando passa de 15 m);
  - enquanto a encomenda vai a caminho (expedida, em trânsito, saiu para entrega): quem a leva (só o
    primeiro nome), o caminho que já fez, a distância e o tempo estimado ("cerca de 7 min"),
    actualizados de 15 em 15 segundos com a página à vista, e a etiqueta "Ao vivo";
  - sem notícias há mais de 5 minutos: "Última posição de Ana há 7 min — pode estar sem rede"; há
    mais de 1 hora, deixa de aparecer;
  - **Afinar o ponto**: com a localização do telemóvel ou arrastando a casinha, até a encomenda ser
    entregue. O colportor que a leva recebe o aviso "O cliente afinou o ponto de entrega".
- O tempo é uma estimativa pela distância em linha recta (×1,35 pelas ruas, a 20 km/h): diz-se
  "cerca de", e a página explica que é uma estimativa.

## Quem entrega (o colportor ou a equipa)

- **Colportor:** área do colportor → Entregas → cada entrega aceite tem **Trajeto até ao cliente**:
  o mapa com o ponto do cliente (e a precisão), a distância, e **Navegar (Google Maps)** e **Waze**.
- **Equipa** (quem tem «Gerir encomendas»): Encomendas → abrir a encomenda → o mesmo bloco, nas
  entregas ao domicílio que não foram para um colportor.
- Depois de marcar "Saiu para entrega" (ou expedida / em trânsito), **Partilhar a minha localização
  com o cliente**: o GPS do telemóvel manda a posição de 10 em 10 segundos quando anda pelo menos
  25 m, ou de 30 em 30 segundos parado — poupa a bateria e os dados de quem entrega. O ecrã fica
  ligado enquanto partilha (Wake Lock, onde o telemóvel o deixa).
- **No site, deixar a página aberta** durante a entrega: um site não consegue mandar a localização
  com a página fechada. Fechar pára a partilha e o cliente vê "última posição há X min".
- **No app iOS a partilha continua com o ecrã apagado**, noutra página ou noutra app, até à entrega
  (`app/mobile/ios/App/App/TrajetoPlugin.swift`, `lib/trajetoNativo.js`). É o iPhone que lê o GPS e
  manda a posição, pela mesma `delivery_share_position`, com a sessão de quem entrega e as mesmas
  regras (10 s / 25 m, ou 30 s parado). Basta a permissão «Durante a utilização»: começa com o app à
  frente e o iOS mostra o indicador azul no topo enquanto partilha. A sessão renova-se no site de
  hora a hora com o app à frente; se caducar em segundo plano, o envio pára e o iPhone avisa
  «A partilha da localização parou — abra a app». Pára sozinha quando a encomenda é entregue ou
  cancelada (o servidor responde «terminou»).
- "Parar de partilhar" pára; a partilha também pára sozinha quando a encomenda é entregue ou
  cancelada.

## Privacidade

- A posição de quem entrega só se mostra enquanto a encomenda vai a caminho e com notícias da última
  hora; o cliente vê só o primeiro nome.
- As posições (a última e o trajeto, até 200 pontos) apagam-se 7 dias depois de a partilha parar
  (cron `trajetos-limpeza`, às 03:41).
- O cliente identifica-se como no rastreio (número da encomenda e email); só a Edge Function muda o
  ponto de entrega (`order_set_destination` é só do servidor).
- A política de privacidade já fala da localização do checkout; vale a pena acrescentar a de quem
  entrega (fica para o dono decidir o texto).

## Por dentro

| Peça | Onde |
|---|---|
| Ponto do cliente com a precisão e a hora | `orders.delivery_gps_accuracy`, `orders.delivery_gps_updated_at` |
| Posição de quem entrega e o trajeto | `public.delivery_positions` (uma linha por encomenda; RLS: quem entrega e quem gere encomendas) |
| Partilhar / parar / ver o ponto do cliente | `delivery_share_position`, `delivery_stop_sharing`, `delivery_route_info` |
| Afinar o ponto (só o servidor) | `order_set_destination` |
| Rastreio ao vivo e afinar, para o cliente | Edge Function: `POST /track/live`, `POST /track/destination` (`deliveryTracking.ts`) |
| Site | `components/delivery/LiveTracking.jsx` (quem recebe), `components/delivery/CourierShare.jsx` (quem entrega), `components/maps/DeliveryMap.jsx`, `lib/deliveryTracking.js` |

Migração `20261108211000_trajeto_gps`. Testes: `scripts/pglite/trajeto.mjs` (39 cenários), vitest
`lib/deliveryTracking.test.js`, `components/delivery/*.test.jsx` e `deliveryTracking.test.ts` na Edge
Function.

## Limites

- Os mosaicos vêm do servidor público do OpenStreetMap, com o crédito no mapa. A política de uso
  deles serve para um tráfego pequeno como o da loja; se o uso crescer muito, troca-se por um
  fornecedor de mosaicos com chave (MapTiler, Stadia, Thunderforest) mudando só o endereço em
  `DeliveryMap.jsx`.
- O tempo estimado não conhece o trânsito nem as ruas: é uma conta pela distância.
- No site, sem partilha com a página fechada (ver acima). No app iOS, até uma hora em segundo
  plano sem abrir o app (a validade da sessão do Supabase).

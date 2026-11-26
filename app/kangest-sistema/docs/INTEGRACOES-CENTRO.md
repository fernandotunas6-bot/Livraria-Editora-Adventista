# O Centro de Integrações

Em **Sistema → Centro de Integrações** (`/centro-integracoes`; `src-tauri/src/services/integracoes.rs`) vê-se cada
ligação do KanGest com o mundo numa só vista, a pior primeiro:

| Ligação | O que mostra | Leva a |
|---|---|---|
| Site da livraria | o posto, a última sincronização, o erro da ligação; os documentos por enviar e com erro, o catálogo e os fechos com erro, as alterações de encomendas à espera | Ligação ao site |
| API de integração | as chaves activas, os pedidos desde ontem e os que falharam do lado do KanGest (5xx) | API e Integrações |
| Avisos automáticos (webhooks) | os avisos activos, os que falham seguidos, as entregas falhadas e por fazer | API e Integrações |
| Facturação electrónica (AGT) | os validados, os rejeitados, os por enviar e os à espera da validação | Facturação Electrónica |
| Importação do KIGEST | se está ligada, a última importação e o erro | Importar dados |
| Acesso pela Internet | se o túnel está a correr | Internet |

Cada uma fica **com erro**, **atenção**, **a funcionar** ou **desligada**. **Só lê a base deste computador**, por isso é
rápido e funciona sem Internet. «Repetir» e «Testar» ficam nos ecrãs de cada ligação, onde já estavam. Cada pessoa só vê
as ligações das suas permissões (API, AGT, importar, configurações).

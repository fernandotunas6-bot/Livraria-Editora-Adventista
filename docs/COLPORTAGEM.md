# Colportagem e registo da Igreja

Guia para quem gere o painel. Em **Painel → Igreja → Registo da Igreja**.

## 1. Registo da Igreja

A colportagem assenta nesta estrutura. Cada colportor pertence a uma igreja, cada igreja a um distrito e cada distrito a um campo e a uma província.

```
Campo (União / Associação / Missão)
  └─ Distrito pastoral ── província e município (sede)
       ├─ Pastor titular (um de cada vez) e associados
       └─ Igrejas ── município
```

- **Províncias e municípios** são os do RGPH-2024, as mesmas tabelas das moradas de entrega.
  - O município de uma igreja ou de um distrito tem de pertencer à província escolhida; a base de dados recusa o contrário.
- **Distritos com o mesmo nome** podem existir em províncias diferentes: há "Distrito Centro" no Huambo e no Cuito.
- **Pastores:**
  - Cada pastor tem cargo, campo, província, telefone e "local de serviço". O local de serviço serve para quem não está num distrito, como o ISPAB, a Livraria ou a Missão.
  - O distrito de cada pastor atribui-se em **Distritos → ⇄ (transferir)**. A atribuição anterior fica no histórico (botão do relógio na lista de pastores), com as datas.
  - As **notas de avaliação** que vinham no `pastores.json` **não são importadas**.
- **Fundir:** quando o mesmo distrito ou o mesmo pastor aparece duas vezes, use ⑂ no que fica. As igrejas, as atribuições e os delegados passam para esse, e o outro é apagado. Uma fusão não se desfaz.
- **Desactivar em vez de apagar:** um distrito com igrejas não se pode apagar. Desactivado, sai das listas, mas o histórico mantém-se.
- **Excel:** cada lista exporta o que está filtrado.

### Importar os ficheiros

1. Abra o separador **Importar** e escolha o `churches.json` e/ou o `pastores.json`.
2. Confirme o **campo por omissão** (por exemplo, "Missão Centro"). É usado pelos distritos e pastores que não indicam outro.
3. Reveja a pré-visualização. Os **avisos** dizem o que precisa de confirmação:
   - pastores distritais com "Huambo" no lugar do distrito: ficam sem distrito, e atribui-se depois;
   - telefones repetidos;
   - números em sequência (924700000…), que parecem preenchidos à mão.
4. Reveja os **"Parecidos"**: nomes que talvez sejam o mesmo distrito ou a mesma pessoa, como "Calenga" e "Calenga e Lepi", ou "Feka" e "Feca". Não se juntam sozinhos. Depois de importar, use **Fundir**, ou corrija o delegado na igreja.
5. Carregue em **Importar**. O que já existe não é duplicado, por isso pode importar-se outra vez sem perigo.

Os dois ficheiros têm telefones e avaliações e **não vão para o repositório** (estão no `.gitignore`).

### Quem pode

| Permissão (Utilizadores → gestor) | Pode |
|---|---|
| **Registo da Igreja** | Ver e alterar campos, distritos, igrejas e pastores; importar |
| **Colportagem** | Ver o registo, sem alterar (precisa das igrejas para os colportores) |
| Administrador | Tudo |

Os clientes e os visitantes não vêem nada disto. Os telefones dos pastores só aparecem a quem tem uma destas permissões.

## Técnico

- Migração `supabase/migrations/20261106200000_registo_igreja.sql`:
  - tabelas `church_fields`, `church_districts`, `churches`, `pastors` e `pastor_assignments`, com RLS;
  - funções `church_assign_pastor`, `church_end_assignment`, `church_merge_districts`, `church_merge_pastors` e `church_registry_import`;
  - permissões `manage_church_registry` e `manage_colporteurs` em `users_admin_update`.
- A importação é preparada no browser (`app/web/src/lib/churchImport.js`, com testes) e gravada numa só transacção pela função da base de dados.
- Os testes SQL correram em PGlite: RLS por permissão, geografia coerente, transferência, fusões e importação idempotente.

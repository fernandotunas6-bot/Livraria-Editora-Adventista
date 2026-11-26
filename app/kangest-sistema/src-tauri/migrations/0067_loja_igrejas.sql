-- KanGest — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
-- © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

-- As igrejas do registo da Igreja no site (parte J1 do plano; sinc/loja.rs): vêm nas novidades dos postos, como as
-- encomendas e o catálogo, e a loja cria o cliente para facturar à igreja (Livraria → Loja online → Igrejas). Só o que
-- a loja precisa para facturar: o número (cn), o nome, o tipo, o distrito, o campo, a província, o município, a morada,
-- o delegado e se está activa. `entidade_id`: o cliente do KanGest criado a partir dela.
CREATE TABLE IF NOT EXISTS loja_igrejas (
    id TEXT PRIMARY KEY,
    cn TEXT NOT NULL DEFAULT '',
    nome TEXT NOT NULL DEFAULT '',
    tipo TEXT NOT NULL DEFAULT 'igreja',
    distrito TEXT NOT NULL DEFAULT '',
    campo TEXT NOT NULL DEFAULT '',
    provincia TEXT NOT NULL DEFAULT '',
    municipio TEXT NOT NULL DEFAULT '',
    morada TEXT NOT NULL DEFAULT '',
    delegado TEXT NOT NULL DEFAULT '',
    activa INTEGER NOT NULL DEFAULT 1,
    actualizada_em TEXT NOT NULL DEFAULT '',
    entidade_id INTEGER REFERENCES entidades(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_loja_igrejas_nome ON loja_igrejas(nome);
CREATE INDEX IF NOT EXISTS idx_loja_igrejas_entidade ON loja_igrejas(entidade_id);

-- KanGest — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
-- © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

-- As fichas para a base central (pedido do dono a 27/11: «ligar o KanGest totalmente com o banco de dados e enviar todos
-- os dados; e se não houver Internet, que fiquem em fila»; sinc/registos.rs). Os documentos (vendas, compras, recibos,
-- guias), o stock, o catálogo, os fechos, a tesouraria e o livro de stock já seguiam; faltavam as fichas:
-- - as entidades (clientes e fornecedores; o «Consumidor Final» não);
-- - os artigos, com todos os campos (não só o preço e o stock);
-- - os utilizadores e as permissões (nunca as senhas, os PIN nem os segredos dos dois passos).
--
-- Como o catálogo (0057): um gatilho marca a ficha na mesma transacção que a muda, só com a ligação activa; é um
-- conjunto, não uma fila de alterações (dez mudanças da mesma ficha dão uma linha, e o `mudou` sobe). Sem Internet, as
-- linhas esperam aqui; a volta seguinte manda o estado de agora.
CREATE TABLE sinc_registos (
    tipo TEXT NOT NULL CHECK (tipo IN ('entidade', 'artigo', 'utilizador')),
    chave INTEGER NOT NULL,
    mudou INTEGER NOT NULL DEFAULT 1,
    tentativas INTEGER NOT NULL DEFAULT 0,
    proximo_em INTEGER NOT NULL DEFAULT 0,      -- segundos Unix; 0 = já
    erro TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (tipo, chave)
);

CREATE TRIGGER trg_sinc_registo_entidade_nova AFTER INSERT ON entidades
WHEN NEW.id <> 1 AND EXISTS (SELECT 1 FROM sinc_ligacao WHERE ativa = 1)
BEGIN
    INSERT INTO sinc_registos (tipo, chave) VALUES ('entidade', NEW.id)
    ON CONFLICT (tipo, chave) DO UPDATE SET mudou = mudou + 1, tentativas = 0, proximo_em = 0, erro = '';
END;

CREATE TRIGGER trg_sinc_registo_entidade AFTER UPDATE ON entidades
WHEN NEW.id <> 1 AND EXISTS (SELECT 1 FROM sinc_ligacao WHERE ativa = 1)
BEGIN
    INSERT INTO sinc_registos (tipo, chave) VALUES ('entidade', NEW.id)
    ON CONFLICT (tipo, chave) DO UPDATE SET mudou = mudou + 1, tentativas = 0, proximo_em = 0, erro = '';
END;

CREATE TRIGGER trg_sinc_registo_artigo_novo AFTER INSERT ON artigos
WHEN EXISTS (SELECT 1 FROM sinc_ligacao WHERE ativa = 1)
BEGIN
    INSERT INTO sinc_registos (tipo, chave) VALUES ('artigo', NEW.id)
    ON CONFLICT (tipo, chave) DO UPDATE SET mudou = mudou + 1, tentativas = 0, proximo_em = 0, erro = '';
END;

CREATE TRIGGER trg_sinc_registo_artigo AFTER UPDATE ON artigos
WHEN EXISTS (SELECT 1 FROM sinc_ligacao WHERE ativa = 1)
BEGIN
    INSERT INTO sinc_registos (tipo, chave) VALUES ('artigo', NEW.id)
    ON CONFLICT (tipo, chave) DO UPDATE SET mudou = mudou + 1, tentativas = 0, proximo_em = 0, erro = '';
END;

CREATE TRIGGER trg_sinc_registo_utilizador_novo AFTER INSERT ON utilizadores
WHEN EXISTS (SELECT 1 FROM sinc_ligacao WHERE ativa = 1)
BEGIN
    INSERT INTO sinc_registos (tipo, chave) VALUES ('utilizador', NEW.id)
    ON CONFLICT (tipo, chave) DO UPDATE SET mudou = mudou + 1, tentativas = 0, proximo_em = 0, erro = '';
END;

-- Só o que a ficha mostra: não a cada entrada (ultimo_acesso, tentativas, bloqueado_ate mudam a cada login).
CREATE TRIGGER trg_sinc_registo_utilizador AFTER UPDATE OF nome, login, perfil, ativo, email, telefone, armazem_id, conta_site, permissoes, limite_desconto ON utilizadores
WHEN EXISTS (SELECT 1 FROM sinc_ligacao WHERE ativa = 1)
BEGIN
    INSERT INTO sinc_registos (tipo, chave) VALUES ('utilizador', NEW.id)
    ON CONFLICT (tipo, chave) DO UPDATE SET mudou = mudou + 1, tentativas = 0, proximo_em = 0, erro = '';
END;

-- Um KanGest já ligado manda as fichas todas uma vez (o que vier depois segue pelos gatilhos).
INSERT INTO sinc_registos (tipo, chave)
SELECT 'entidade', id FROM entidades WHERE id <> 1 AND EXISTS (SELECT 1 FROM sinc_ligacao WHERE ativa = 1);
INSERT INTO sinc_registos (tipo, chave)
SELECT 'artigo', id FROM artigos WHERE EXISTS (SELECT 1 FROM sinc_ligacao WHERE ativa = 1);
INSERT INTO sinc_registos (tipo, chave)
SELECT 'utilizador', id FROM utilizadores WHERE EXISTS (SELECT 1 FROM sinc_ligacao WHERE ativa = 1);

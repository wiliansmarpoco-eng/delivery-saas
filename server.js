const express = require("express");
const cors = require("cors");
const path = require("path");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));
app.use(express.static(__dirname));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function query(sql, params = []) {
  const client = await pool.connect();
  try {
    return await client.query(sql, params);
  } finally {
    client.release();
  }
}

app.get("/health", async (req, res) => {
  try {
    await query("SELECT 1");
    res.json({ ok: true, status: "online" });
  } catch (error) {
    res.status(500).json({ ok: false, erro: error.message });
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/index.html", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "login.html"));
});

app.get("/login.html", (req, res) => {
  res.sendFile(path.join(__dirname, "login.html"));
});

app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "admin.html"));
});

app.get("/admin.html", (req, res) => {
  res.sendFile(path.join(__dirname, "admin.html"));
});

// CARDÁPIO PÚBLICO EM HTML
app.get("/loja/:slug", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// LOGIN
app.post("/login", async (req, res) => {
  try {
    const { email, senha } = req.body;

    if (!email || !senha) {
      return res.status(400).json({ erro: "Email e senha são obrigatórios" });
    }

    const result = await query(
      `SELECT
        u.id AS usuario_id,
        u.nome AS usuario_nome,
        u.email,
        u.empresa_id,
        e.id AS empresa_id_real,
        e.nome AS empresa_nome,
        e.slug,
        e.telefone,
        e.categoria,
        e.horario,
        e.aberta,
        e.logo_url,
        e.banner_url
       FROM usuarios u
       LEFT JOIN empresas e ON e.id = u.empresa_id
       WHERE u.email = $1 AND u.senha = $2
       LIMIT 1`,
      [email, senha]
    );

    if (!result.rows.length) {
      return res.status(401).json({ erro: "Login inválido" });
    }

    const row = result.rows[0];

    res.json({
      ok: true,
      usuario: {
        usuario_id: row.usuario_id,
        usuario_nome: row.usuario_nome,
        email: row.email,
        empresa_id: row.empresa_id || row.empresa_id_real,
        empresa_nome: row.empresa_nome || row.usuario_nome || "Sem nome",
        slug: row.slug || "",
        telefone: row.telefone || "",
        categoria: row.categoria || "",
        horario: row.horario || "",
        aberta: row.aberta,
        logo_url: row.logo_url || "",
        banner_url: row.banner_url || "",
      },
    });
  } catch (error) {
    res.status(500).json({
      erro: "Erro no login",
      detalhe: error.message,
    });
  }
});

app.get("/admin/empresa/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT
        id,
        nome,
        slug,
        telefone,
        email,
        categoria,
        horario,
        aberta,
        logo_url,
        banner_url
       FROM empresas
       WHERE id = $1
       LIMIT 1`,
      [id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ erro: "Empresa não encontrada" });
    }

    res.json({ empresa: result.rows[0] });
  } catch (error) {
    res.status(500).json({
      erro: "Erro ao buscar empresa",
      detalhe: error.message,
    });
  }
});

app.put("/admin/empresa/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      nome,
      telefone,
      categoria,
      horario,
      aberta,
      logo_url,
      banner_url,
      email,
    } = req.body;

    const result = await query(
      `UPDATE empresas
       SET nome = $1,
           telefone = $2,
           categoria = $3,
           horario = $4,
           aberta = $5,
           logo_url = $6,
           banner_url = $7,
           email = $8
       WHERE id = $9
       RETURNING *`,
      [
        nome || "",
        telefone || "",
        categoria || "",
        horario || "",
        aberta === true || aberta === "true",
        logo_url || "",
        banner_url || "",
        email || "",
        id,
      ]
    );

    res.json({ ok: true, empresa: result.rows[0] });
  } catch (error) {
    res.status(500).json({
      erro: "Erro ao atualizar empresa",
      detalhe: error.message,
    });
  }
});

// API DO CARDÁPIO
app.get("/api/produtos/:slug", async (req, res) => {
  try {
    const { slug } = req.params;

    const empresaResult = await query(
      `SELECT
        id,
        nome,
        slug,
        telefone,
        email,
        categoria,
        horario,
        aberta,
        logo_url,
        banner_url
       FROM empresas
       WHERE slug = $1
       LIMIT 1`,
      [slug]
    );

    if (!empresaResult.rows.length) {
      return res.status(404).json({ erro: "Empresa não encontrada" });
    }

    const empresa = empresaResult.rows[0];

    const produtosResult = await query(
      `SELECT
        p.id,
        p.nome,
        COALESCE(p.descricao, '') AS descricao,
        p.preco,
        COALESCE(p.imagem_url, '') AS imagem_url,
        p.ativo,
        p.categoria_id,
        COALESCE(c.nome, 'Sem categoria') AS categoria
       FROM produtos p
       LEFT JOIN categorias c ON c.id = p.categoria_id
       WHERE p.empresa_id = $1
         AND p.ativo = true
       ORDER BY p.id ASC`,
      [empresa.id]
    );

    res.json({
      empresa,
      produtos: produtosResult.rows,
    });
  } catch (error) {
    res.status(500).json({
      erro: "Erro no servidor",
      detalhe: error.message,
    });
  }
});

app.post("/pedido/:slug", async (req, res) => {
  try {
    const { slug } = req.params;
    const { nome, whatsapp, endereco, itens, total } = req.body;

    if (!nome || !whatsapp || !endereco || !Array.isArray(itens) || !itens.length) {
      return res.status(400).json({ erro: "Dados do pedido incompletos" });
    }

    const empresaResult = await query(
      `SELECT id, nome, slug, telefone
       FROM empresas
       WHERE slug = $1
       LIMIT 1`,
      [slug]
    );

    if (!empresaResult.rows.length) {
      return res.status(404).json({ erro: "Empresa não encontrada" });
    }

    const empresa = empresaResult.rows[0];

    const pedidoResult = await query(
      `INSERT INTO pedidos (
        cliente_nome,
        cliente_whatsapp,
        endereco,
        total,
        status,
        empresa_id
      )
      VALUES ($1, $2, $3, $4, 'novo', $5)
      RETURNING *`,
      [nome, whatsapp, endereco, total || 0, empresa.id]
    );

    const pedido = pedidoResult.rows[0];

    for (const item of itens) {
      await query(
        `INSERT INTO pedido_itens (
          pedido_id,
          produto_nome,
          quantidade,
          preco
        )
        VALUES ($1, $2, $3, $4)`,
        [
          pedido.id,
          item.nome || "",
          Number(item.qtd || item.quantidade || 1),
          Number(item.preco || 0),
        ]
      );
    }

    res.json({
      ok: true,
      pedido,
      mensagem: "Pedido criado com sucesso",
    });
  } catch (error) {
    res.status(500).json({
      erro: "Erro ao criar pedido",
      detalhe: error.message,
    });
  }
});

app.get("/admin/categorias/:empresaId", async (req, res) => {
  try {
    const { empresaId } = req.params;

    const result = await query(
      `SELECT id, nome, empresa_id
       FROM categorias
       WHERE empresa_id = $1
       ORDER BY nome ASC`,
      [empresaId]
    );

    res.json({ categorias: result.rows });
  } catch (error) {
    res.status(500).json({
      erro: "Erro ao buscar categorias",
      detalhe: error.message,
    });
  }
});

app.post("/admin/categorias", async (req, res) => {
  try {
    const { nome, empresa_id } = req.body;

    if (!nome || !empresa_id) {
      return res.status(400).json({ erro: "Nome e empresa_id são obrigatórios" });
    }

    const result = await query(
      `INSERT INTO categorias (nome, empresa_id)
       VALUES ($1, $2)
       RETURNING *`,
      [nome, empresa_id]
    );

    res.json({ ok: true, categoria: result.rows[0] });
  } catch (error) {
    res.status(500).json({
      erro: "Erro ao criar categoria",
      detalhe: error.message,
    });
  }
});

app.get("/admin/produtos/:empresaId", async (req, res) => {
  try {
    const { empresaId } = req.params;

    const result = await query(
      `SELECT
        p.id,
        p.nome,
        COALESCE(p.descricao, '') AS descricao,
        p.preco,
        COALESCE(p.imagem_url, '') AS imagem_url,
        p.ativo,
        p.empresa_id,
        p.categoria_id,
        COALESCE(c.nome, 'Sem categoria') AS categoria_nome
       FROM produtos p
       LEFT JOIN categorias c ON c.id = p.categoria_id
       WHERE p.empresa_id = $1
       ORDER BY p.id DESC`,
      [empresaId]
    );

    res.json({ produtos: result.rows });
  } catch (error) {
    res.status(500).json({
      erro: "Erro ao buscar produtos",
      detalhe: error.message,
    });
  }
});

app.post("/admin/produtos", async (req, res) => {
  try {
    const {
      nome,
      descricao,
      preco,
      imagem_url,
      ativo,
      empresa_id,
      categoria_id,
    } = req.body;

    if (!nome || !preco || !empresa_id) {
      return res.status(400).json({ erro: "Nome, preço e empresa_id são obrigatórios" });
    }

    const result = await query(
      `INSERT INTO produtos (
        nome,
        descricao,
        preco,
        imagem_url,
        ativo,
        empresa_id,
        categoria_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        nome,
        descricao || "",
        preco,
        imagem_url || "",
        ativo === false ? false : true,
        empresa_id,
        categoria_id || null,
      ]
    );

    res.json({ ok: true, produto: result.rows[0] });
  } catch (error) {
    res.status(500).json({
      erro: "Erro ao criar produto",
      detalhe: error.message,
    });
  }
});

app.delete("/admin/produtos/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await query(`DELETE FROM produtos WHERE id = $1`, [id]);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({
      erro: "Erro ao excluir produto",
      detalhe: error.message,
    });
  }
});

app.get("/admin/pedidos/:empresaId", async (req, res) => {
  try {
    const { empresaId } = req.params;

    const pedidosResult = await query(
      `SELECT
        id,
        cliente_nome,
        cliente_whatsapp,
        endereco,
        total,
        status,
        empresa_id,
        criado_em
       FROM pedidos
       WHERE empresa_id = $1
       ORDER BY id DESC`,
      [empresaId]
    );

    const pedidos = [];

    for (const pedido of pedidosResult.rows) {
      const itensResult = await query(
        `SELECT
          id,
          pedido_id,
          produto_nome,
          quantidade,
          preco
         FROM pedido_itens
         WHERE pedido_id = $1
         ORDER BY id ASC`,
        [pedido.id]
      );

      pedidos.push({
        ...pedido,
        itens: itensResult.rows,
      });
    }

    res.json({ pedidos });
  } catch (error) {
    res.status(500).json({
      erro: "Erro ao buscar pedidos",
      detalhe: error.message,
    });
  }
});

app.put("/admin/pedidos/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ erro: "Status é obrigatório" });
    }

    const result = await query(
      `UPDATE pedidos
       SET status = $1
       WHERE id = $2
       RETURNING *`,
      [status, id]
    );

    res.json({ ok: true, pedido: result.rows[0] });
  } catch (error) {
    res.status(500).json({
      erro: "Erro ao atualizar status do pedido",
      detalhe: error.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
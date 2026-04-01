const express = require("express");
const cors = require("cors");
const path = require("path");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3000;

// ================= CONFIG =================
app.use(cors());
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));

// 🔥 CONEXÃO CORRETA (SEM SENHA NO CÓDIGO)
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

// ================= HEALTH =================
app.get("/health", async (req, res) => {
  try {
    await query("SELECT 1");
    res.json({ ok: true, status: "online" });
  } catch (error) {
    res.status(500).json({ ok: false, erro: error.message });
  }
});

// ================= ARQUIVOS =================
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "login.html"));
});

app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "admin.html"));
});

app.use(express.static(__dirname));

// ================= LOGIN =================
app.post("/login", async (req, res) => {
  try {
    const { email, senha } = req.body;

    if (!email || !senha) {
      return res.status(400).json({ erro: "Preencha email e senha" });
    }

    const result = await query(
      `SELECT u.*, e.nome as empresa_nome
       FROM usuarios u
       JOIN empresas e ON e.id = u.empresa_id
       WHERE u.email = $1 AND u.senha = $2
       LIMIT 1`,
      [email, senha]
    );

    if (!result.rows.length) {
      return res.status(401).json({ erro: "Login inválido" });
    }

    res.json({
      ok: true,
      empresa: result.rows[0],
    });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// ================= CARDÁPIO =================
app.get("/produtos/:slug", async (req, res) => {
  try {
    const { slug } = req.params;

    const empresa = await query(
      "SELECT * FROM empresas WHERE slug = $1",
      [slug]
    );

    if (!empresa.rows.length) {
      return res.status(404).json({ erro: "Empresa não encontrada" });
    }

    const produtos = await query(
      "SELECT * FROM produtos WHERE empresa_id = $1 AND ativo = true",
      [empresa.rows[0].id]
    );

    res.json({
      empresa: empresa.rows[0],
      produtos: produtos.rows,
    });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// ================= PEDIDOS =================
app.post("/pedido/:slug", async (req, res) => {
  try {
    const { slug } = req.params;
    const { nome, whatsapp, endereco, itens, total } = req.body;

    const empresa = await query(
      "SELECT * FROM empresas WHERE slug = $1",
      [slug]
    );

    if (!empresa.rows.length) {
      return res.status(404).json({ erro: "Empresa não encontrada" });
    }

    const pedido = await query(
      `INSERT INTO pedidos 
      (cliente_nome, cliente_whatsapp, endereco, total, status, empresa_id)
      VALUES ($1,$2,$3,$4,'novo',$5)
      RETURNING *`,
      [nome, whatsapp, endereco, total, empresa.rows[0].id]
    );

    for (let item of itens) {
      await query(
        `INSERT INTO pedido_itens 
        (pedido_id, produto_nome, quantidade, preco)
        VALUES ($1,$2,$3,$4)`,
        [pedido.rows[0].id, item.nome, item.qtd, item.preco]
      );
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// ================= PRODUTOS ADMIN =================
app.get("/admin/produtos/:empresaId", async (req, res) => {
  const result = await query(
    "SELECT * FROM produtos WHERE empresa_id = $1",
    [req.params.empresaId]
  );
  res.json(result.rows);
});

app.post("/admin/produtos", async (req, res) => {
  const { nome, preco, empresa_id } = req.body;

  const result = await query(
    `INSERT INTO produtos (nome, preco, empresa_id, ativo)
     VALUES ($1,$2,$3,true) RETURNING *`,
    [nome, preco, empresa_id]
  );

  res.json(result.rows[0]);
});

app.put("/admin/produtos/:id", async (req, res) => {
  const { nome, preco } = req.body;

  const result = await query(
    `UPDATE produtos SET nome=$1, preco=$2 WHERE id=$3 RETURNING *`,
    [nome, preco, req.params.id]
  );

  res.json(result.rows[0]);
});

app.delete("/admin/produtos/:id", async (req, res) => {
  await query("DELETE FROM produtos WHERE id=$1", [req.params.id]);
  res.json({ ok: true });
});

// ================= PEDIDOS ADMIN =================
app.get("/admin/pedidos/:empresaId", async (req, res) => {
  const pedidos = await query(
    "SELECT * FROM pedidos WHERE empresa_id = $1 ORDER BY id DESC",
    [req.params.empresaId]
  );

  res.json(pedidos.rows);
});

app.put("/admin/pedidos/:id/status", async (req, res) => {
  const { status } = req.body;

  await query(
    "UPDATE pedidos SET status=$1 WHERE id=$2",
    [status, req.params.id]
  );

  res.json({ ok: true });
});

// ================= START =================
app.listen(PORT, () => {
  console.log("Servidor rodando 🚀");
});		
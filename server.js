const express = require("express");
const cors = require("cors");
const path = require("path");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

async function query(sql, params = []) {
  const client = await pool.connect();
  try {
    const result = await client.query(sql, params);
    return result;
  } finally {
    client.release();
  }
}

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

/* =========================
   LOGIN
========================= */
app.post("/login", async (req, res) => {
  try {
    const { email, senha } = req.body;

    const result = await query(
      "SELECT * FROM usuarios WHERE email = $1 AND senha = $2 LIMIT 1",
      [email, senha]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ erro: "Email ou senha inválidos" });
    }

    const usuario = result.rows[0];

    if (usuario.tipo === "master") {
      return res.json({
        ok: true,
        usuario: {
          id: usuario.id,
          nome: usuario.nome,
          email: usuario.email,
          tipo: usuario.tipo,
        },
      });
    }

    const empresaResult = await query(
      "SELECT * FROM empresas WHERE usuario_id = $1 LIMIT 1",
      [usuario.id]
    );

    return res.json({
      ok: true,
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        tipo: usuario.tipo,
      },
      empresa: empresaResult.rows[0] || null,
    });
  } catch (error) {
    res.status(500).json({ erro: "Erro no servidor", detalhe: error.message });
  }
});

/* =========================
   EMPRESAS
========================= */
app.get("/admin/empresas", async (req, res) => {
  try {
    const result = await query(
      `SELECT e.*, u.email
       FROM empresas e
       LEFT JOIN usuarios u ON u.id = e.usuario_id
       ORDER BY e.id DESC`
    );

    res.json({ empresas: result.rows });
  } catch (error) {
    res.status(500).json({ erro: "Erro no servidor", detalhe: error.message });
  }
});

app.post("/admin/empresas", async (req, res) => {
  try {
    const {
      nome,
      slug,
      telefone,
      email,
      senha,
      categoria,
      horario,
      aberta = true,
      logo_url = "",
      banner_url = "",
    } = req.body;

    if (!nome || !slug || !email || !senha) {
      return res.status(400).json({ erro: "Preencha nome, slug, email e senha" });
    }

    const usuarioResult = await query(
      `INSERT INTO usuarios (nome, email, senha, tipo)
       VALUES ($1, $2, $3, 'loja')
       RETURNING *`,
      [nome, email, senha]
    );

    const usuario = usuarioResult.rows[0];

    const empresaResult = await query(
      `INSERT INTO empresas
       (nome, slug, telefone, email, logo_url, banner_url, categoria, horario, aberta, usuario_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        nome,
        slug,
        telefone || "",
        email,
        logo_url,
        banner_url,
        categoria || "Loja",
        horario || "",
        aberta,
        usuario.id,
      ]
    );

    res.json({ ok: true, empresa: empresaResult.rows[0] });
  } catch (error) {
    res.status(500).json({ erro: "Erro ao criar empresa", detalhe: error.message });
  }
});

/* =========================
   CATEGORIAS
========================= */
app.get("/admin/categorias/:empresaId", async (req, res) => {
  try {
    const { empresaId } = req.params;
    const result = await query(
      "SELECT * FROM categorias WHERE empresa_id = $1 ORDER BY id ASC",
      [empresaId]
    );
    res.json({ categorias: result.rows });
  } catch (error) {
    res.status(500).json({ erro: "Erro no servidor", detalhe: error.message });
  }
});

app.post("/admin/categorias", async (req, res) => {
  try {
    const { nome, empresa_id } = req.body;

    const result = await query(
      `INSERT INTO categorias (nome, empresa_id)
       VALUES ($1, $2)
       RETURNING *`,
      [nome, empresa_id]
    );

    res.json({ ok: true, categoria: result.rows[0] });
  } catch (error) {
    res.status(500).json({ erro: "Erro ao criar categoria", detalhe: error.message });
  }
});

/* =========================
   PRODUTOS ADMIN
========================= */
app.get("/admin/produtos/:empresaId", async (req, res) => {
  try {
    const { empresaId } = req.params;

    const result = await query(
      `SELECT p.*, c.nome AS categoria_nome
       FROM produtos p
       LEFT JOIN categorias c ON c.id = p.categoria_id
       WHERE p.empresa_id = $1
       ORDER BY p.id DESC`,
      [empresaId]
    );

    res.json({ produtos: result.rows });
  } catch (error) {
    res.status(500).json({ erro: "Erro no servidor", detalhe: error.message });
  }
});

app.post("/admin/produtos", async (req, res) => {
  try {
    const {
      nome,
      descricao,
      preco,
      imagem_url = "",
      categoria_id,
      ativo = true,
      empresa_id,
    } = req.body;

    const result = await query(
      `INSERT INTO produtos
       (nome, descricao, preco, imagem_url, categoria_id, ativo, empresa_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [nome, descricao || "", preco, imagem_url, categoria_id || null, ativo, empresa_id]
    );

    res.json({ ok: true, produto: result.rows[0] });
  } catch (error) {
    res.status(500).json({ erro: "Erro ao criar produto", detalhe: error.message });
  }
});

app.put("/admin/produtos/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      nome,
      descricao,
      preco,
      imagem_url = "",
      categoria_id,
      ativo = true,
    } = req.body;

    const result = await query(
      `UPDATE produtos
       SET nome = $1,
           descricao = $2,
           preco = $3,
           imagem_url = $4,
           categoria_id = $5,
           ativo = $6
       WHERE id = $7
       RETURNING *`,
      [nome, descricao || "", preco, imagem_url, categoria_id || null, ativo, id]
    );

    res.json({ ok: true, produto: result.rows[0] });
  } catch (error) {
    res.status(500).json({ erro: "Erro ao editar produto", detalhe: error.message });
  }
});

app.delete("/admin/produtos/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await query("DELETE FROM produtos WHERE id = $1", [id]);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ erro: "Erro ao excluir produto", detalhe: error.message });
  }
});

/* =========================
   CARDÁPIO PÚBLICO
========================= */
app.get("/produtos/:slug", async (req, res) => {
  try {
    const { slug } = req.params;

    const empresaResult = await query(
      `SELECT id, nome, telefone, banner_url, logo_url, categoria, horario, aberta
       FROM empresas
       WHERE slug = $1
       LIMIT 1`,
      [slug]
    );

    if (empresaResult.rows.length === 0) {
      return res.status(404).json({ erro: "Empresa não encontrada" });
    }

    const empresa = empresaResult.rows[0];

    const produtosResult = await query(
      `SELECT p.id, p.nome, p.descricao, p.preco, p.imagem_url, p.ativo, c.nome AS categoria
       FROM produtos p
       LEFT JOIN categorias c ON c.id = p.categoria_id
       WHERE p.empresa_id = $1 AND p.ativo = true
       ORDER BY p.id ASC`,
      [empresa.id]
    );

    res.json({
      empresa,
      produtos: produtosResult.rows,
    });
  } catch (error) {
    res.status(500).json({ erro: "Erro no servidor", detalhe: error.message });
  }
});

/* =========================
   PEDIDO PELO CARDÁPIO
========================= */
app.post("/pedido/:slug", async (req, res) => {
  try {
    const { slug } = req.params;
    const { nome, whatsapp, endereco, itens, total } = req.body;

    if (!nome || !whatsapp || !endereco || !itens || itens.length === 0) {
      return res.status(400).json({ erro: "Dados do pedido incompletos" });
    }

    const empresaResult = await query(
      "SELECT * FROM empresas WHERE slug = $1 LIMIT 1",
      [slug]
    );

    if (empresaResult.rows.length === 0) {
      return res.status(404).json({ erro: "Empresa não encontrada" });
    }

    const empresa = empresaResult.rows[0];

    const pedidoResult = await query(
      `INSERT INTO pedidos
       (cliente_nome, cliente_whatsapp, endereco, total, status, empresa_id)
       VALUES ($1,$2,$3,$4,'novo',$5)
       RETURNING *`,
      [nome, whatsapp, endereco, total, empresa.id]
    );

    const pedido = pedidoResult.rows[0];

    for (const item of itens) {
      await query(
        `INSERT INTO pedido_itens
         (pedido_id, produto_nome, quantidade, preco)
         VALUES ($1,$2,$3,$4)`,
        [pedido.id, item.nome, item.qtd, item.preco]
      );
    }

    const texto = encodeURIComponent(
      `Olá! Novo pedido #${pedido.id}%0A` +
      `Cliente: ${nome}%0A` +
      `WhatsApp: ${whatsapp}%0A` +
      `Endereço: ${endereco}%0A` +
      `Total: R$ ${Number(total).toFixed(2).replace(".", ",")}`
    );

    const linkWhatsapp = `https://wa.me/55${empresa.telefone}?text=${texto}`;

    res.json({
      ok: true,
      pedido,
      whatsapp: linkWhatsapp,
    });
  } catch (error) {
    res.status(500).json({ erro: "Erro no servidor", detalhe: error.message });
  }
});

/* =========================
   PEDIDOS ADMIN
========================= */
app.get("/admin/pedidos/:empresaId", async (req, res) => {
  try {
    const { empresaId } = req.params;

    const pedidosResult = await query(
      `SELECT * FROM pedidos
       WHERE empresa_id = $1
       ORDER BY id DESC`,
      [empresaId]
    );

    const pedidos = pedidosResult.rows;

    for (const pedido of pedidos) {
      const itensResult = await query(
        `SELECT * FROM pedido_itens WHERE pedido_id = $1 ORDER BY id ASC`,
        [pedido.id]
      );
      pedido.itens = itensResult.rows;
    }

    res.json({ pedidos });
  } catch (error) {
    res.status(500).json({ erro: "Erro no servidor", detalhe: error.message });
  }
});

app.put("/admin/pedidos/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const result = await query(
      `UPDATE pedidos
       SET status = $1
       WHERE id = $2
       RETURNING *`,
      [status, id]
    );

    res.json({ ok: true, pedido: result.rows[0] });
  } catch (error) {
    res.status(500).json({ erro: "Erro ao atualizar status", detalhe: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});

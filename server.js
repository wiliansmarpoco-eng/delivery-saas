const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/teste-db', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ ok: true, agora: result.rows[0] });
  } catch (err) {
    console.error('ERRO TESTE-DB:', err);
    res.status(500).json({
      erro: 'Erro no banco',
      detalhe: err.message
    });
  }
});

app.get('/produtos/:slug', async (req, res) => {
  try {
    const { slug } = req.params;

    const empresa = await pool.query(
      'SELECT id, nome, telefone FROM empresas WHERE slug = $1',
      [slug]
    );

    if (empresa.rows.length === 0) {
      return res.status(404).json({ erro: 'Empresa não encontrada' });
    }

    const produtos = await pool.query(
      'SELECT id, nome, preco, categoria, ativo FROM produtos WHERE empresa_id = $1 ORDER BY id ASC',
      [empresa.rows[0].id]
    );

    res.json({
      empresa: empresa.rows[0],
      produtos: produtos.rows
    });
  } catch (err) {
    console.error('ERRO /produtos:', err);
    res.status(500).json({
      erro: 'Erro no servidor',
      detalhe: err.message
    });
  }
});

app.post('/pedido/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const { nome, whatsapp, endereco, itens, total } = req.body;

    const empresa = await pool.query(
      'SELECT id, nome, telefone FROM empresas WHERE slug = $1',
      [slug]
    );

    if (empresa.rows.length === 0) {
      return res.status(404).json({ erro: 'Empresa não encontrada' });
    }

    const empresaId = empresa.rows[0].id;
    const telefoneLoja = empresa.rows[0].telefone;

    const pedido = await pool.query(
      `INSERT INTO pedidos (empresa_id, cliente_nome, whatsapp, endereco, total)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [empresaId, nome, whatsapp, endereco, total]
    );

    const pedidoId = pedido.rows[0].id;

    for (const item of itens) {
      await pool.query(
        `INSERT INTO itens_pedido (pedido_id, produto_id, quantidade, preco)
         VALUES ($1, $2, $3, $4)`,
        [pedidoId, item.id, item.qtd, item.preco]
      );
    }

    const itensTexto = itens
      .map(item => `• ${item.qtd}x ${item.nome} - R$ ${Number(item.preco).toFixed(2)}`)
      .join('\n');

    const mensagem = `🛒 Novo Pedido
Cliente: ${nome}
WhatsApp: ${whatsapp}
Endereço: ${endereco}

Itens:
${itensTexto}

Total: R$ ${Number(total).toFixed(2)}`;

    const linkWhatsapp = `https://wa.me/55${telefoneLoja}?text=${encodeURIComponent(mensagem)}`;

    res.json({
      ok: true,
      pedido_id: pedidoId,
      whatsapp: linkWhatsapp
    });
  } catch (err) {
    console.error('ERRO /pedido:', err);
    res.status(500).json({
      erro: 'Erro ao criar pedido',
      detalhe: err.message
    });
  }
});

/* =========================
   ADMIN PRODUTOS
========================= */

app.post('/admin/produtos/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const { nome, preco, categoria, ativo } = req.body;

    const empresa = await pool.query(
      'SELECT id FROM empresas WHERE slug = $1',
      [slug]
    );

    if (empresa.rows.length === 0) {
      return res.status(404).json({ erro: 'Empresa não encontrada' });
    }

    const result = await pool.query(
      `INSERT INTO produtos (empresa_id, nome, preco, categoria, ativo)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [empresa.rows[0].id, nome, preco, categoria || 'Geral', ativo ?? true]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error('ERRO POST /admin/produtos:', err);
    res.status(500).json({
      erro: 'Erro ao criar produto',
      detalhe: err.message
    });
  }
});

app.put('/admin/produtos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { nome, preco, categoria, ativo } = req.body;

    const result = await pool.query(
      `UPDATE produtos
       SET nome = $1, preco = $2, categoria = $3, ativo = $4
       WHERE id = $5
       RETURNING *`,
      [nome, preco, categoria || 'Geral', ativo ?? true, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ erro: 'Produto não encontrado' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('ERRO PUT /admin/produtos:', err);
    res.status(500).json({
      erro: 'Erro ao atualizar produto',
      detalhe: err.message
    });
  }
});

app.delete('/admin/produtos/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM produtos WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ erro: 'Produto não encontrado' });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('ERRO DELETE /admin/produtos:', err);
    res.status(500).json({
      erro: 'Erro ao remover produto',
      detalhe: err.message
    });
  }
});
app.get('/admin/pedidos/:slug', async (req, res) => {
  try {
    const { slug } = req.params;

    const empresa = await pool.query(
      'SELECT id FROM empresas WHERE slug = $1',
      [slug]
    );

    if (empresa.rows.length === 0) {
      return res.status(404).json({ erro: 'Empresa não encontrada' });
    }

    const pedidos = await pool.query(
      `SELECT id, cliente_nome, whatsapp, endereco, total, status
       FROM pedidos
       WHERE empresa_id = $1
       ORDER BY id DESC`,
      [empresa.rows[0].id]
    );

    res.json({ pedidos: pedidos.rows });
  } catch (err) {
    console.error('ERRO GET /admin/pedidos:', err);
    res.status(500).json({
      erro: 'Erro ao buscar pedidos',
      detalhe: err.message
    });
  }
});

app.put('/admin/pedidos/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const result = await pool.query(
      `UPDATE pedidos
       SET status = $1
       WHERE id = $2
       RETURNING *`,
      [status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ erro: 'Pedido não encontrado' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('ERRO PUT /admin/pedidos/:id/status:', err);
    res.status(500).json({
      erro: 'Erro ao atualizar status',
      detalhe: err.message
    });
  }
});
app.listen(process.env.PORT || 3000, () => {
  console.log('Servidor rodando 🚀');
});

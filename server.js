const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.get('/', (req, res) => {
  res.send('API ONLINE 🚀');
});

app.get('/produtos/:slug', async (req, res) => {
  try {
    const { slug } = req.params;

    const empresa = await pool.query(
      'SELECT id, nome, telefone FROM empresas WHERE slug = $1 LIMIT 1',
      [slug]
    );

    if (empresa.rows.length === 0) {
      return res.status(404).json({ erro: 'Empresa não encontrada' });
    }

    const produtos = await pool.query(
      'SELECT id, nome, preco FROM produtos WHERE empresa_id = $1 ORDER BY id ASC',
      [empresa.rows[0].id]
    );

    res.json({
      empresa: empresa.rows[0],
      produtos: produtos.rows
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: 'Erro ao buscar produtos' });
  }
});

app.post('/pedido/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const { nome, whatsapp, endereco, itens, total } = req.body;

    const empresa = await pool.query(
      'SELECT id, nome, telefone FROM empresas WHERE slug = $1 LIMIT 1',
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
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: 'Erro ao criar pedido' });
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log('Servidor rodando');
});

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
      'SELECT id, nome, telefone FROM empresas WHERE slug = $1',
      [slug]
    );

    if (empresa.rows.length === 0) {
      return res.status(404).json({ erro: 'Empresa não encontrada' });
    }

    const produtos = await pool.query(
      'SELECT id, nome, preco FROM produtos WHERE empresa_id = $1',
      [empresa.rows[0].id]
    );

    res.json({
      empresa: empresa.rows[0],
      produtos: produtos.rows
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro no servidor' });
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log('Servidor rodando');
});

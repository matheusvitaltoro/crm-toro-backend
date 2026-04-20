const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../db');
const { createInstance } = require('../services/evolution');

// POST /auth/register
router.post('/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password)
    return res.status(400).json({ error: 'Nome, email e senha são obrigatórios' });

  try {
    const hash = await bcrypt.hash(password, 10);
    // Instance name: letras/números apenas, único por usuário
    const instanceName = 'toro_' + email.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 20) + '_' + Date.now();

    const { rows } = await pool.query(
      `INSERT INTO users (name, email, password_hash, instance_name)
       VALUES ($1, $2, $3, $4) RETURNING id, name, email, instance_name`,
      [name, email, hash, instanceName]
    );
    const user = rows[0];

    // Cria a instância WhatsApp automaticamente
    try {
      await createInstance(instanceName);
    } catch (e) {
      console.warn('Evolution API indisponível no cadastro:', e.message);
    }

    const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Email já cadastrado' });
    console.error(e);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'Email e senha são obrigatórios' });

  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = rows[0];
    if (!user) return res.status(401).json({ error: 'Email ou senha incorretos' });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Email ou senha incorretos' });

    const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, whatsapp_status: user.whatsapp_status },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// GET /auth/me
router.get('/me', require('../middleware/auth'), async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, name, email, whatsapp_status FROM users WHERE id = $1',
    [req.user.id]
  );
  res.json(rows[0]);
});

module.exports = router;

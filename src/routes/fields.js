const router = require('express').Router();
const auth = require('../middleware/auth');
const { pool } = require('../db');

// GET /fields — lista campos personalizados
router.get('/', auth, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM custom_field_defs WHERE user_id=$1 ORDER BY sort_order, id',
    [req.user.id]
  );
  res.json(rows);
});

// POST /fields — cria campo
router.post('/', auth, async (req, res) => {
  const { name, type } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome obrigatório' });
  const { rows } = await pool.query(
    `INSERT INTO custom_field_defs (user_id, name, type) VALUES ($1,$2,$3) RETURNING *`,
    [req.user.id, name, type || 'text']
  );
  res.json(rows[0]);
});

// PUT /fields/:id — renomeia ou muda tipo
router.put('/:id', auth, async (req, res) => {
  const { name, type } = req.body;
  const { rows } = await pool.query(
    `UPDATE custom_field_defs SET name=COALESCE($1,name), type=COALESCE($2,type)
     WHERE id=$3 AND user_id=$4 RETURNING *`,
    [name, type, req.params.id, req.user.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Campo não encontrado' });
  res.json(rows[0]);
});

// DELETE /fields/:id
router.delete('/:id', auth, async (req, res) => {
  await pool.query('DELETE FROM custom_field_defs WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
  res.json({ ok: true });
});

// GET /fields/hidden — campos fixos ocultados
router.get('/hidden', auth, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT field_key FROM hidden_builtin_fields WHERE user_id=$1',
    [req.user.id]
  );
  res.json(rows.map(r => r.field_key));
});

// POST /fields/hidden/:key
router.post('/hidden/:key', auth, async (req, res) => {
  await pool.query(
    'INSERT INTO hidden_builtin_fields (user_id, field_key) VALUES ($1,$2) ON CONFLICT DO NOTHING',
    [req.user.id, req.params.key]
  );
  res.json({ ok: true });
});

// DELETE /fields/hidden/:key
router.delete('/hidden/:key', auth, async (req, res) => {
  await pool.query(
    'DELETE FROM hidden_builtin_fields WHERE user_id=$1 AND field_key=$2',
    [req.user.id, req.params.key]
  );
  res.json({ ok: true });
});

module.exports = router;

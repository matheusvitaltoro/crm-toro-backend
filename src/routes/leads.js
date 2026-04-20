const router = require('express').Router();
const auth = require('../middleware/auth');
const { pool } = require('../db');

// GET /leads
router.get('/', auth, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM leads WHERE user_id = $1 ORDER BY created_at DESC',
    [req.user.id]
  );
  res.json(rows);
});

// POST /leads
router.post('/', auth, async (req, res) => {
  const { name, phone, company, role, email, value, source, stage } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome é obrigatório' });

  const { rows } = await pool.query(
    `INSERT INTO leads (user_id, name, phone, company, role, email, value, source, stage)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [req.user.id, name, phone||'', company||'', role||'', email||'', value||0, source||'Manual', stage||0]
  );

  // Evento de entrada na timeline
  await pool.query(
    `INSERT INTO timeline (lead_id, user_id, type, text) VALUES ($1,$2,'entry',$3)`,
    [rows[0].id, req.user.id, `Lead captado via ${source||'Manual'}.`]
  );

  res.json(rows[0]);
});

// PUT /leads/:id
router.put('/:id', auth, async (req, res) => {
  const { name, phone, company, role, email, value, source, stage, custom_fields } = req.body;
  const { rows } = await pool.query(
    `UPDATE leads SET
      name=$1, phone=$2, company=$3, role=$4, email=$5,
      value=$6, source=$7, stage=$8, custom_fields=$9
     WHERE id=$10 AND user_id=$11 RETURNING *`,
    [name, phone||'', company||'', role||'', email||'', value||0, source, stage,
     JSON.stringify(custom_fields||{}), req.params.id, req.user.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Lead não encontrado' });
  res.json(rows[0]);
});

// DELETE /leads/:id
router.delete('/:id', auth, async (req, res) => {
  await pool.query('DELETE FROM leads WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
  res.json({ ok: true });
});

// GET /leads/:id/timeline
router.get('/:id/timeline', auth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM timeline WHERE lead_id=$1
     AND user_id=$2 ORDER BY created_at ASC`,
    [req.params.id, req.user.id]
  );
  res.json(rows);
});

// POST /leads/:id/timeline
router.post('/:id/timeline', auth, async (req, res) => {
  const { type, text, direction } = req.body;
  const { rows } = await pool.query(
    `INSERT INTO timeline (lead_id, user_id, type, direction, text)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [req.params.id, req.user.id, type, direction||'sent', text]
  );
  res.json(rows[0]);
});

module.exports = router;

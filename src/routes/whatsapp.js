const router = require('express').Router();
const auth = require('../middleware/auth');
const { pool } = require('../db');
const evolution = require('../services/evolution');

// GET /whatsapp/status — retorna status + QR code se desconectado
router.get('/status', auth, async (req, res) => {
  const { rows } = await pool.query('SELECT instance_name, whatsapp_status FROM users WHERE id=$1', [req.user.id]);
  const user = rows[0];
  if (!user?.instance_name) return res.json({ status: 'no_instance' });

  try {
    const state = await evolution.getStatus(user.instance_name);

    if (state === 'open') {
      await pool.query('UPDATE users SET whatsapp_status=$1 WHERE id=$2', ['connected', req.user.id]);
      return res.json({ status: 'connected' });
    }

    // Não conectado: busca QR
    const qrData = await evolution.getQR(user.instance_name);
    await pool.query('UPDATE users SET whatsapp_status=$1 WHERE id=$2', ['disconnected', req.user.id]);
    // Evolution API v2 retorna QR em base64 direto ou dentro de qrcode.base64
    const qrBase64 = qrData?.base64 || qrData?.qrcode?.base64 || null;
    res.json({ status: 'disconnected', qr: qrBase64 });
  } catch (e) {
    const status = e?.response?.status;
    // Instância não existe na Evolution API → pede reconexão
    if (status === 404 || status === 400) {
      return res.json({ status: 'no_instance', message: 'Instância não encontrada. Clique em Reconectar.' });
    }
    console.error('Evolution API erro:', e.message);
    res.json({ status: 'error', message: 'Erro ao comunicar com Evolution API.' });
  }
});

// POST /whatsapp/send — envia mensagem para um lead
router.post('/send', auth, async (req, res) => {
  const { lead_id, text } = req.body;
  if (!lead_id || !text) return res.status(400).json({ error: 'lead_id e text são obrigatórios' });

  const { rows: uRows } = await pool.query('SELECT instance_name FROM users WHERE id=$1', [req.user.id]);
  const { rows: lRows } = await pool.query('SELECT * FROM leads WHERE id=$1 AND user_id=$2', [lead_id, req.user.id]);

  if (!uRows[0]?.instance_name) return res.status(400).json({ error: 'WhatsApp não conectado' });
  if (!lRows[0]) return res.status(404).json({ error: 'Lead não encontrado' });

  const lead = lRows[0];
  if (!lead.phone) return res.status(400).json({ error: 'Lead sem número de WhatsApp' });

  try {
    const result = await evolution.sendText(uRows[0].instance_name, lead.phone, text);

    // Salva na timeline
    const { rows: tlRows } = await pool.query(
      `INSERT INTO timeline (lead_id, user_id, type, direction, text, wpp_message_id)
       VALUES ($1,$2,'whatsapp','sent',$3,$4) RETURNING *`,
      [lead_id, req.user.id, text, result?.key?.id || null]
    );

    res.json(tlRows[0]);
  } catch (e) {
    console.error('Erro ao enviar mensagem:', e.message);
    res.status(500).json({ error: 'Falha ao enviar mensagem: ' + e.message });
  }
});

// POST /whatsapp/reconnect — deleta instância antiga e cria uma nova
router.post('/reconnect', auth, async (req, res) => {
  const { rows } = await pool.query('SELECT instance_name, email FROM users WHERE id=$1', [req.user.id]);
  const oldName = rows[0]?.instance_name;
  const email   = rows[0]?.email;

  // Deleta instância antiga (ignora erro se não existir)
  if (oldName) {
    try { await evolution.deleteInstance(oldName); } catch (e) {
      console.log('Delete ignorado:', e.message);
    }
  }

  // Cria instância nova com timestamp único
  const instanceName = 'toro_' + email.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 20) + '_' + Date.now();
  try {
    await pool.query('UPDATE users SET instance_name=$1, whatsapp_status=$2 WHERE id=$3', [instanceName, 'disconnected', req.user.id]);
    await evolution.createInstance(instanceName);
    res.json({ ok: true, instanceName });
  } catch (e) {
    console.error('Reconnect error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /whatsapp/webhook/:instanceName — Evolution API chama aqui quando chega mensagem
router.post('/webhook/:instanceName', async (req, res) => {
  res.sendStatus(200); // responde rápido pra Evolution API

  const body = req.body;
  if (body.event !== 'messages.upsert') return;

  const msg = body.data;
  if (!msg || msg.key?.fromMe) return; // ignora mensagens enviadas por nós

  const phone = msg.key?.remoteJid?.replace('@s.whatsapp.net', '').replace('55', '');
  const text = msg.message?.conversation || msg.message?.extendedTextMessage?.message?.text || '';
  if (!phone || !text) return;

  try {
    // Busca o usuário pelo instanceName
    const { rows: uRows } = await pool.query(
      'SELECT id FROM users WHERE instance_name=$1',
      [req.params.instanceName]
    );
    if (!uRows[0]) return;
    const userId = uRows[0].id;

    // Busca lead pelo telefone (normalizado)
    const { rows: lRows } = await pool.query(
      `SELECT id FROM leads WHERE user_id=$1 AND regexp_replace(phone,'\\D','','g') LIKE $2`,
      [userId, `%${phone.slice(-8)}`]
    );

    let leadId;
    if (lRows[0]) {
      leadId = lRows[0].id;
    } else {
      // Cria lead novo automaticamente
      const { rows: newLead } = await pool.query(
        `INSERT INTO leads (user_id, name, phone, source) VALUES ($1,$2,$3,'WhatsApp') RETURNING id`,
        [userId, phone, phone]
      );
      leadId = newLead[0].id;
      await pool.query(
        `INSERT INTO timeline (lead_id, user_id, type, text) VALUES ($1,$2,'entry','Lead captado via WhatsApp.')`,
        [leadId, userId]
      );
    }

    // Salva mensagem recebida
    const { rows: tlRows } = await pool.query(
      `INSERT INTO timeline (lead_id, user_id, type, direction, text, wpp_message_id)
       VALUES ($1,$2,'whatsapp','received',$3,$4) RETURNING *`,
      [leadId, userId, text, msg.key?.id || null]
    );

    // Emite via WebSocket para o frontend
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${userId}`).emit('message:received', {
        lead_id: leadId,
        message: tlRows[0],
      });
    }
  } catch (e) {
    console.error('Erro no webhook:', e.message);
  }
});

module.exports = router;

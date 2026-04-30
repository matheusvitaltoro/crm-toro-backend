const axios = require('axios');

const api = () => axios.create({
  baseURL: process.env.EVOLUTION_API_URL,
  headers: { apikey: process.env.EVOLUTION_API_KEY },
  timeout: 15000,
});

// Registra webhook na Evolution API para a instância
async function setWebhook(instanceName) {
  const backendUrl = process.env.BACKEND_URL;
  if (!backendUrl) { console.warn('BACKEND_URL não definida — webhook não configurado'); return; }
  await api().post(`/webhook/set/${instanceName}`, {
    url: `${backendUrl}/whatsapp/webhook/${instanceName}`,
    webhook_by_events: true,
    webhook_base64: false,
    events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'],
  });
}

// Cria uma instância nova para o cliente (chamado no cadastro)
async function createInstance(instanceName) {
  const { data } = await api().post('/instance/create', {
    instanceName,
    qrcode: true,
    integration: 'WHATSAPP-BAILEYS',
  });
  try { await setWebhook(instanceName); } catch (e) { console.warn('setWebhook falhou:', e.message); }
  return data;
}

// Retorna QR code atual (base64) e status da conexão
async function getQR(instanceName) {
  const { data } = await api().get(`/instance/connect/${instanceName}`);
  return data; // { base64, count } or { state: 'open' }
}

// Status da conexão: open | connecting | close
async function getStatus(instanceName) {
  const { data } = await api().get(`/instance/connectionState/${instanceName}`);
  return data?.instance?.state || 'close';
}

// Envia mensagem de texto
async function sendText(instanceName, phone, text) {
  const number = phone.replace(/\D/g, '');
  const { data } = await api().post(`/message/sendText/${instanceName}`, {
    number: `55${number}`,
    text,
  });
  return data;
}

// Deleta instância (quando cliente cancela)
async function deleteInstance(instanceName) {
  await api().delete(`/instance/delete/${instanceName}`);
}

module.exports = { createInstance, setWebhook, getQR, getStatus, sendText, deleteInstance };

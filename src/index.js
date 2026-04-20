require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { migrate } = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

app.use(cors());
app.use(express.json());

// Disponibiliza io para as rotas
app.set('io', io);

// Rotas
app.use('/auth', require('./routes/auth'));
app.use('/leads', require('./routes/leads'));
app.use('/whatsapp', require('./routes/whatsapp'));
app.use('/fields', require('./routes/fields'));

app.get('/health', (req, res) => res.json({ ok: true }));

// Socket.io — cliente entra na sala user_<id> com JWT
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('unauthorized'));
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = payload.id;
    next();
  } catch {
    next(new Error('unauthorized'));
  }
});

io.on('connection', (socket) => {
  socket.join(`user_${socket.userId}`);
});

const PORT = process.env.PORT || 3000;

migrate()
  .then(() => {
    server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });

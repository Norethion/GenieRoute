require('dotenv').config();

const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const errorHandler = require('./middleware/errorHandler');
const { runMigrations } = require('./config/migrate');
const { setupChatSocket } = require('./services/chatService');

const placesRouter = require('./routes/places');
const plannerRouter = require('./routes/planner');
const tripsRouter = require('./routes/trips');
const routesRouter = require('./routes/routes');
const chatRouter = require('./routes/chat');
const adminRouter = require('./routes/admin');
const usageRouter = require('./routes/usage');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3001;

// Socket.io setup
const io = new Server(server, {
  cors: {
    origin: ['http://localhost:5173', 'http://localhost:3000'],
    methods: ['GET', 'POST'],
  },
});

// Middleware
app.use(cors());
// rawPlaces + photos + optimizedItinerary kombine edilince /planner/llm
// payload'ı büyüyebilir; default 100kb limit aşılmasın.
app.use(express.json({ limit: '5mb' }));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/places', placesRouter);
app.use('/api/planner', plannerRouter);
app.use('/api/trips', tripsRouter);
app.use('/api/routes', routesRouter);
app.use('/api/chats', chatRouter);
app.use('/api/admin', adminRouter);
app.use('/api/usage', usageRouter);

// Error handler
app.use(errorHandler);

// Chat WebSocket
setupChatSocket(io);

// DB migration'larını çalıştır, sonra sunucuyu başlat
runMigrations()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`GenieRoute API running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Migration failed, server not started:', err);
    process.exit(1);
  });

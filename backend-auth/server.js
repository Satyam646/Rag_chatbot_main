// const express = require('express');
// const mongoose = require('mongoose');
// const cors = require('cors');
// require('dotenv').config();

// const app = express();
// const frontendURL = process.env.FRONTEND_URL || 'http://localhost:5173';
// // Middleware
// app.use(cors({
//   origin: frontendURL,
//   credentials: true
// }));

// app.use(express.json());

// // Routes
// app.use('/api/auth', require('./routes/auth'));

// // MongoDB connection
// mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/loginapp')
//   .then(() => console.log('MongoDB connected'))
//   .catch(err => console.log(err));

// const PORT = process.env.PORT || 5000;
// app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

const frontendURL =
  process.env.FRONTEND_URL || 'http://localhost:5173';

// =========================
// Middleware
// =========================

app.use(cors({
  origin: frontendURL,
  credentials: true
}));

app.use(express.json());

// =========================
// API Request/Response Logger
// =========================

const SENSITIVE_KEYS = [
  'password',
  'confirmPassword',
  'token',
  'accessToken',
  'refreshToken'
];

// Hide sensitive fields (passwords, tokens) in logs
const mask = (obj) => {
  if (!obj || typeof obj !== 'object') return obj;

  const copy = Array.isArray(obj) ? [...obj] : { ...obj };

  for (const key of Object.keys(copy)) {
    if (SENSITIVE_KEYS.includes(key)) {
      copy[key] = '***';
    } else if (typeof copy[key] === 'object') {
      copy[key] = mask(copy[key]);
    }
  }

  return copy;
};

let requestCounter = 0;

app.use((req, res, next) => {
  const id = ++requestCounter;
  const start = Date.now();
  const time = new Date().toLocaleTimeString();

  console.log('\n========================================');
  console.log(`[#${id}] ${time} ➡️  ${req.method} ${req.originalUrl}`);

  if (Object.keys(req.query).length > 0) {
    console.log(`[#${id}] Query:`, req.query);
  }

  if (Object.keys(req.body || {}).length > 0) {
    console.log(`[#${id}] Body:`, mask(req.body));
  }

  // Capture response body sent via res.json()
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    res.locals.responseBody = body;
    return originalJson(body);
  };

  // Capture response body sent via res.send()
  const originalSend = res.send.bind(res);
  res.send = (body) => {
    if (res.locals.responseBody === undefined) {
      res.locals.responseBody = body;
    }
    return originalSend(body);
  };

  // Request finished normally
  res.on('finish', () => {
    const ms = Date.now() - start;
    const icon =
      res.statusCode >= 500 ? '❌' :
      res.statusCode >= 400 ? '⚠️ ' : '✅';

    console.log(
      `[#${id}] ${icon} ${res.statusCode} ${req.method} ${req.originalUrl} (${ms}ms)`
    );

    if (res.locals.responseBody !== undefined) {
      let body = res.locals.responseBody;

      // res.json() calls res.send() with a string internally
      if (typeof body === 'string') {
        try {
          body = JSON.parse(body);
        } catch (_) {
          // leave as plain string
        }
      }

      console.log(`[#${id}] Response:`, mask(body));
    }

    console.log('========================================');
  });

  // Client disconnected before a response was sent
  res.on('close', () => {
    if (!res.writableFinished) {
      console.log(
        `[#${id}] 🔌 Connection closed before response (${Date.now() - start}ms)`
      );
    }
  });

  next();
});

// =========================
// Routes
// =========================

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

app.use('/api/auth', require('./routes/auth'));

// =========================
// 404 Handler
// =========================

app.use((req, res) => {
  res.status(404).json({
    message: `Route not found: ${req.method} ${req.originalUrl}`
  });
});

// =========================
// Error Handler (must be after routes)
// =========================

app.use((err, req, res, next) => {
  console.error(`💥 ERROR in ${req.method} ${req.originalUrl}`);
  console.error(err.stack);

  res.status(err.status || 500).json({
    message: err.message || 'Server error'
  });
});

// =========================
// Process-level Error Logging
// =========================

process.on('unhandledRejection', (err) => {
  console.error('💥 Unhandled Rejection:', err);
});

process.on('uncaughtException', (err) => {
  console.error('💥 Uncaught Exception:', err);
});

// =========================
// MongoDB Connection
// =========================

const MONGODB_URI =
  process.env.MONGODB_URI ||
  'mongodb://127.0.0.1:27017/loginapp';

mongoose.connection.on('disconnected', () => {
  console.log('⚠️  MongoDB disconnected');
});

mongoose.connection.on('reconnected', () => {
  console.log('🔄 MongoDB reconnected');
});

mongoose
  .connect(MONGODB_URI)
  .then(() => {
    console.log('✅ MongoDB connected successfully');
  })
  .catch((error) => {
    console.error('❌ MongoDB connection error:');
    console.error(error.message);
  });

// =========================
// Server
// =========================

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log('========================================');
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌐 Frontend URL: ${frontendURL}`);
  console.log(`❤️  Health check: http://localhost:${PORT}/api/health`);
  console.log('========================================');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use. Change PORT in .env`);
  } else {
    console.error('❌ Server error:', err);
  }
  process.exit(1);
});
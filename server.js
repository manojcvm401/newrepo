import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

import db from './db/database.js';
import { runSeed } from './db/seed.js';
import { checkAndExpireDonations } from './services/expiryService.js';
import { errorHandler } from './middleware/errorHandler.js';

import authRouter from './routes/auth.js';
import donorsRouter from './routes/donors.js';
import ngosRouter from './routes/ngos.js';
import volunteersRouter from './routes/volunteers.js';
import donationsRouter from './routes/donations.js';
import notificationsRouter from './routes/notifications.js';
import reportsRouter from './routes/reports.js';
import publicRouter from './routes/public.js';
import devRouter from './routes/dev.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Automatically seed sample data if tables are empty
try {
  const adminCount = db.prepare('SELECT COUNT(*) AS count FROM admins').get()?.count || 0;
  if (adminCount === 0) {
    console.log('⚡ Initializing database with seed data...');
    runSeed();
  }
} catch (e) {
  console.warn('Initial seed check warning:', e.message);
}

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Request logger for debugging and viva demos
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    if (req.path.startsWith('/api/') || req.path === '/api') {
      const duration = Date.now() - start;
      console.log(`[HTTP] ${req.method} ${req.path} -> ${res.statusCode} (${duration}ms)`);
    }
  });
  next();
});

// Periodic Smart Expiry Priority check (every 60 seconds)
setInterval(() => {
  try {
    checkAndExpireDonations(db);
  } catch (err) {
    console.error('Background expiry check error:', err.message);
  }
}, 60 * 1000);

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/donors', donorsRouter);
app.use('/api/ngos', ngosRouter);
app.use('/api/volunteers', volunteersRouter);
app.use('/api/donations', donationsRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/public', publicRouter);
app.use('/api/dev', devRouter);

// Serve static frontend files from /public and root
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));
app.use(express.static(__dirname));

// HTML fallback for SPA-like navigation
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/') || req.path === '/api') return next();
  res.sendFile(path.join(publicDir, 'index.html'), (err) => {
    if (err) res.sendFile(path.join(__dirname, 'index.html'));
  });
});

// Global error handler
app.use(errorHandler);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`====================================================`);
  console.log(`🌿 FoodConnect Server running on port ${PORT}`);
  console.log(`📍 Web URL: http://0.0.0.0:${PORT}`);
  console.log(`🗄️ Database: SQLite (foodconnect.db)`);
  console.log(`====================================================`);
});

export default app;

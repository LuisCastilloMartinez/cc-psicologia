/* ╔══════════════════════════════════════════════════════╗
   ║  server.js — PsicoSoft Backend                       ║
   ║  Node.js + Express + SQLite                          ║
   ║                                                      ║
   ║  Seguridad: LFPDPPP · NOM-024 · ISO 27001/27799     ║
   ╚══════════════════════════════════════════════════════╝ */

'use strict';

// Load environment variables
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

const envPath = path.join(__dirname, '.env');

// Auto-generate .env if it doesn't exist
if (!fs.existsSync(envPath)) {
  const { generateEncryptionKey } = require('./utils/encryption');
  const crypto = require('crypto');
  const envContent = [
    '# PsicoSoft — Variables de entorno',
    '# ⚠️ NO COMPARTIR ESTE ARCHIVO — contiene las llaves de cifrado',
    '',
    '# Puerto del servidor',
    'PORT=3000',
    '',
    '# Entorno',
    'NODE_ENV=development',
    '',
    '# Llave de cifrado AES-256 para datos de pacientes (LFPDPPP)',
    '# ⚠️ SI PIERDES ESTA LLAVE, LOS DATOS NO SE PUEDEN RECUPERAR',
    `ENCRYPTION_KEY=${generateEncryptionKey()}`,
    '',
    '# Secreto para firmar tokens JWT',
    `JWT_SECRET=${crypto.randomBytes(48).toString('hex')}`,
    '',
    '# Orígenes permitidos (CORS)',
    'ALLOWED_ORIGINS=http://localhost:3000',
    '',
  ].join('\n');
  fs.writeFileSync(envPath, envContent);
  console.log('  ✅ Archivo .env generado automáticamente');
  console.log('  ⚠️  Guarda una copia segura de ENCRYPTION_KEY\n');
}

dotenv.config({ path: envPath });

// ── Express setup ──
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { initializeDatabase, closeDb } = require('./db/database');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Security middleware (ISO 27001) ──

// Helmet: secure HTTP headers but disable CSP for inline scripts compat
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

// CORS
app.use(cors({
  origin: (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(','),
  credentials: true,
}));

// Rate limiting: 100 requests per 15 minutes per IP
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes. Intenta más tarde.' },
}));

// Body parsing
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

// Access logging
app.use(morgan('short'));

// ── Serve static frontend files ──
app.use(express.static(path.join(__dirname, '..'), {
  extensions: ['html'],
  index: 'index.html',
}));

// ── API Routes ──
app.use('/api/auth', require('./routes/auth'));
app.use('/api/consultorios', require('./routes/consultorios'));
app.use('/api/pacientes', require('./routes/pacientes'));
app.use('/api/citas', require('./routes/citas'));
app.use('/api/audit', require('./routes/audit'));

// ── Health check ──
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' });
});

// ── SPA fallback ──
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api/')) {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
  } else {
    res.status(404).json({ error: 'Endpoint no encontrado.' });
  }
});

// ── Error handler ──
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Error interno del servidor.' });
});

// ── Start ──
(async () => {
  await initializeDatabase();

  app.listen(PORT, () => {
    console.log('');
    console.log('  ╔══════════════════════════════════════════════╗');
    console.log(`  ║  🌸 PsicoSoft Server v1.0.0                  ║`);
    console.log(`  ║  http://localhost:${PORT}                      ║`);
    console.log('  ║                                              ║');
    console.log('  ║  Seguridad: LFPDPPP · NOM-024 · ISO 27001   ║');
    console.log('  ║  Cifrado:   AES-256-GCM                     ║');
    console.log('  ║  Auth:      JWT + bcrypt                     ║');
    console.log('  ╚══════════════════════════════════════════════╝');
    console.log('');
  });
})();

// Graceful shutdown
process.on('SIGINT', () => { closeDb(); process.exit(0); });
process.on('SIGTERM', () => { closeDb(); process.exit(0); });

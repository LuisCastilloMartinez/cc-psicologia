/* ╔══════════════════════════════════════════════════════╗
   ║  auth.js — Authentication Routes                     ║
   ║  Login, Logout, Profile, Change Password             ║
   ╚══════════════════════════════════════════════════════╝ */

'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { get, run } = require('../db/database');
const { generateToken, requireAuth } = require('../middleware/auth');
const { logAudit } = require('../middleware/audit');
const { loginRules, handleValidation } = require('../utils/validation');

const router = express.Router();

// Rate limit login: 5 attempts per 15 min per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Demasiados intentos de inicio de sesión. Intenta en 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/** POST /api/auth/login */
router.post('/login', loginLimiter, loginRules, handleValidation, (req, res) => {
  const { email, password } = req.body;

  const user = get('SELECT * FROM usuarios WHERE email = ? AND activo = 1', [email]);
  if (!user) {
    logAudit({ accion: 'LOGIN_FAILED', tabla: 'usuarios', ip_address: req.ip, user_agent: req.get('user-agent'), datos_nuevos: { reason: 'user_not_found' }});
    return res.status(401).json({ error: 'Credenciales incorrectas.' });
  }

  if (!bcrypt.compareSync(password, user.password_hash)) {
    logAudit({ usuario_id: user.id, accion: 'LOGIN_FAILED', tabla: 'usuarios', ip_address: req.ip, user_agent: req.get('user-agent'), datos_nuevos: { reason: 'wrong_password' }});
    return res.status(401).json({ error: 'Credenciales incorrectas.' });
  }

  const token = generateToken(user);
  logAudit({ usuario_id: user.id, accion: 'LOGIN', tabla: 'usuarios', ip_address: req.ip, user_agent: req.get('user-agent') });

  res.json({
    token,
    user: { id: user.id, email: user.email, nombre: user.nombre, rol: user.rol },
  });
});

/** POST /api/auth/logout */
router.post('/logout', requireAuth, (req, res) => {
  logAudit({ usuario_id: req.user.id, accion: 'LOGOUT', tabla: 'usuarios', ip_address: req.ip, user_agent: req.get('user-agent') });
  res.json({ ok: true, message: 'Sesión cerrada.' });
});

/** GET /api/auth/me */
router.get('/me', requireAuth, (req, res) => {
  const user = get('SELECT id, email, nombre, rol, created_at FROM usuarios WHERE id = ?', [req.user.id]);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });
  res.json(user);
});

/** POST /api/auth/change-password */
router.post('/change-password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres.' });
  }

  const user = get('SELECT * FROM usuarios WHERE id = ?', [req.user.id]);
  if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
    return res.status(401).json({ error: 'Contraseña actual incorrecta.' });
  }

  const newHash = bcrypt.hashSync(newPassword, 12);
  run('UPDATE usuarios SET password_hash = ?, updated_at = datetime("now","localtime") WHERE id = ?', [newHash, req.user.id]);

  logAudit({ usuario_id: req.user.id, accion: 'UPDATE', tabla: 'usuarios', registro_id: req.user.id, ip_address: req.ip, user_agent: req.get('user-agent'), datos_nuevos: { field: 'password' }});

  res.json({ ok: true, message: 'Contraseña actualizada.' });
});

module.exports = router;

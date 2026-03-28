/* ╔══════════════════════════════════════════════════════╗
   ║  auth.js — JWT Authentication Middleware              ║
   ╚══════════════════════════════════════════════════════╝ */

'use strict';

const jwt = require('jsonwebtoken');
const { get } = require('../db/database');

const JWT_SECRET = () => process.env.JWT_SECRET || 'dev-secret-change-me';
const TOKEN_EXPIRY = '8h';

function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, rol: user.rol, nombre: user.nombre },
    JWT_SECRET(),
    { expiresIn: TOKEN_EXPIRY }
  );
}

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Acceso no autorizado. Inicia sesión.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET());
    const user = get('SELECT id, email, nombre, rol, activo FROM usuarios WHERE id = ?', [decoded.id]);
    if (!user || !user.activo) {
      return res.status(401).json({ error: 'Usuario desactivado o no encontrado.' });
    }
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Sesión expirada. Inicia sesión nuevamente.' });
    }
    return res.status(401).json({ error: 'Token inválido.' });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.rol !== 'admin') {
    return res.status(403).json({ error: 'Acceso denegado. Se requiere rol de administrador.' });
  }
  next();
}

module.exports = { generateToken, requireAuth, requireAdmin, JWT_SECRET };

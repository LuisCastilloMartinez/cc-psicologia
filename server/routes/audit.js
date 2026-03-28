/* ╔══════════════════════════════════════════════════════╗
   ║  audit.js — Audit Log Query Routes (admin only)      ║
   ╚══════════════════════════════════════════════════════╝ */

'use strict';

const express = require('express');
const { get, all } = require('../db/database');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);
router.use(requireAdmin);

/** GET /api/audit */
router.get('/', (req, res) => {
  const { tabla, accion, usuario_id, limit = 100, offset = 0 } = req.query;

  let query = `SELECT a.*, u.nombre as usuario_nombre, u.email as usuario_email
    FROM audit_log a LEFT JOIN usuarios u ON a.usuario_id = u.id WHERE 1=1`;
  const params = [];

  if (tabla) { query += ' AND a.tabla = ?'; params.push(tabla); }
  if (accion) { query += ' AND a.accion = ?'; params.push(accion); }
  if (usuario_id) { query += ' AND a.usuario_id = ?'; params.push(Number(usuario_id)); }

  query += ' ORDER BY a.timestamp DESC LIMIT ? OFFSET ?';
  params.push(Number(limit), Number(offset));

  const rows = all(query, params);
  const total = get('SELECT COUNT(*) as count FROM audit_log');

  res.json({ data: rows, total: total.count, limit: Number(limit), offset: Number(offset) });
});

/** GET /api/audit/stats */
router.get('/stats', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const totalOps = get('SELECT COUNT(*) as count FROM audit_log');
  const todayOps = get("SELECT COUNT(*) as count FROM audit_log WHERE timestamp >= ?", [today]);
  const logins = get("SELECT COUNT(*) as count FROM audit_log WHERE accion = 'LOGIN'");
  const failedLogins = get("SELECT COUNT(*) as count FROM audit_log WHERE accion = 'LOGIN_FAILED'");

  res.json({
    total_operaciones: totalOps.count,
    operaciones_hoy: todayOps.count,
    total_logins: logins.count,
    logins_fallidos: failedLogins.count,
  });
});

module.exports = router;

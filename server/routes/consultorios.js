/* ╔══════════════════════════════════════════════════════╗
   ║  consultorios.js — CRUD Routes                      ║
   ╚══════════════════════════════════════════════════════╝ */

'use strict';

const express = require('express');
const { run, get, all } = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { auditMiddleware } = require('../middleware/audit');
const { consultorioRules, handleValidation, idParam } = require('../utils/validation');

const router = express.Router();
router.use(requireAuth);
router.use(auditMiddleware('consultorios'));

/** GET /api/consultorios */
router.get('/', (req, res) => {
  const rows = all('SELECT * FROM consultorios ORDER BY created_at DESC');
  res.json(rows);
});

/** GET /api/consultorios/:id */
router.get('/:id', idParam, handleValidation, (req, res) => {
  const row = get('SELECT * FROM consultorios WHERE id = ?', [Number(req.params.id)]);
  if (!row) return res.status(404).json({ error: 'Consultorio no encontrado.' });
  res.json(row);
});

/** POST /api/consultorios */
router.post('/', consultorioRules, handleValidation, (req, res) => {
  const { nombre, direccion, telefono, horario, notas, color, activo } = req.body;
  const result = run(
    'INSERT INTO consultorios (nombre, direccion, telefono, horario, notas, color, activo) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [nombre, direccion || null, telefono || null, horario || null, notas || null, color || '#f9a8c9', activo !== false ? 1 : 0]
  );
  const created = get('SELECT * FROM consultorios WHERE id = ?', [result.lastInsertRowid]);
  res.status(201).json(created);
});

/** PUT /api/consultorios/:id */
router.put('/:id', [...idParam, ...consultorioRules], handleValidation, (req, res) => {
  const { nombre, direccion, telefono, horario, notas, color, activo } = req.body;
  const existing = get('SELECT * FROM consultorios WHERE id = ?', [Number(req.params.id)]);
  if (!existing) return res.status(404).json({ error: 'Consultorio no encontrado.' });

  run(
    `UPDATE consultorios SET nombre=?, direccion=?, telefono=?, horario=?, notas=?, color=?, activo=?, updated_at=datetime('now','localtime') WHERE id=?`,
    [nombre, direccion || null, telefono || null, horario || null, notas || null, color || '#f9a8c9', activo !== false ? 1 : 0, Number(req.params.id)]
  );

  const updated = get('SELECT * FROM consultorios WHERE id = ?', [Number(req.params.id)]);
  res.json(updated);
});

/** DELETE /api/consultorios/:id */
router.delete('/:id', idParam, handleValidation, (req, res) => {
  const existing = get('SELECT * FROM consultorios WHERE id = ?', [Number(req.params.id)]);
  if (!existing) return res.status(404).json({ error: 'Consultorio no encontrado.' });
  run('DELETE FROM consultorios WHERE id = ?', [Number(req.params.id)]);
  res.json({ ok: true, message: 'Consultorio eliminado.' });
});

module.exports = router;

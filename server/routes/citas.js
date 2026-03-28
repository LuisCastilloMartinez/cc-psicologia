/* ╔══════════════════════════════════════════════════════╗
   ║  citas.js — CRUD con detección de empalmes          ║
   ║  en servidor (validación lado backend)               ║
   ╚══════════════════════════════════════════════════════╝ */

'use strict';

const express = require('express');
const { run, get, all } = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { auditMiddleware } = require('../middleware/audit');
const { encrypt, decrypt } = require('../utils/encryption');
const { citaRules, handleValidation, idParam } = require('../utils/validation');

const router = express.Router();
router.use(requireAuth);
router.use(auditMiddleware('citas'));

const ENC_KEY = () => process.env.ENCRYPTION_KEY;

function toMinutes(time) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/** Detect scheduling conflicts */
function detectConflicts(cita, excludeId = null) {
  let query = `SELECT * FROM citas WHERE fecha = ? AND estado != 'Cancelada'`;
  const params = [cita.fecha];
  if (excludeId) {
    query += ' AND id != ?';
    params.push(excludeId);
  }

  const sameDayCitas = all(query, params);
  const conflicts = [];

  const newStart = toMinutes(cita.hora_inicio);
  const newEnd = toMinutes(cita.hora_fin);

  for (const existing of sameDayCitas) {
    const exStart = toMinutes(existing.hora_inicio);
    const exEnd = toMinutes(existing.hora_fin);

    if (newStart < exEnd && exStart < newEnd) {
      conflicts.push({
        cita_id: existing.id,
        paciente_id: existing.paciente_id,
        consultorio_id: existing.consultorio_id,
        hora_inicio: existing.hora_inicio,
        hora_fin: existing.hora_fin,
        tipo: existing.consultorio_id === cita.consultorio_id ? 'mismo_consultorio' : 'diferente_consultorio',
      });
    }
  }
  return conflicts;
}

function decryptCita(row) {
  if (!row) return null;
  const result = { ...row };
  result.notas = decrypt(row.notas_cifrado, ENC_KEY());
  delete result.notas_cifrado;
  return result;
}

/** GET /api/citas */
router.get('/', (req, res) => {
  let query = 'SELECT * FROM citas';
  const params = [];

  if (req.query.fecha) {
    query += ' WHERE fecha = ?';
    params.push(req.query.fecha);
  }

  query += ' ORDER BY fecha, hora_inicio';
  const rows = all(query, params);
  res.json(rows.map(decryptCita));
});

/** GET /api/citas/conflicts */
router.get('/conflicts', (req, res) => {
  const citas = all("SELECT * FROM citas WHERE estado != 'Cancelada' ORDER BY fecha, hora_inicio");
  const allConflicts = [];

  for (let i = 0; i < citas.length; i++) {
    for (let j = i + 1; j < citas.length; j++) {
      const a = citas[i], b = citas[j];
      if (a.fecha === b.fecha) {
        const aS = toMinutes(a.hora_inicio), aE = toMinutes(a.hora_fin);
        const bS = toMinutes(b.hora_inicio), bE = toMinutes(b.hora_fin);
        if (aS < bE && bS < aE) {
          allConflicts.push({
            cita_a: { id: a.id, paciente_id: a.paciente_id, consultorio_id: a.consultorio_id, fecha: a.fecha, hora_inicio: a.hora_inicio, hora_fin: a.hora_fin },
            cita_b: { id: b.id, paciente_id: b.paciente_id, consultorio_id: b.consultorio_id, fecha: b.fecha, hora_inicio: b.hora_inicio, hora_fin: b.hora_fin },
            tipo: a.consultorio_id === b.consultorio_id ? 'mismo_consultorio' : 'diferente_consultorio',
          });
        }
      }
    }
  }
  res.json(allConflicts);
});

/** GET /api/citas/:id */
router.get('/:id', idParam, handleValidation, (req, res) => {
  const row = get('SELECT * FROM citas WHERE id = ?', [Number(req.params.id)]);
  if (!row) return res.status(404).json({ error: 'Cita no encontrada.' });
  res.json(decryptCita(row));
});

/** POST /api/citas */
router.post('/', citaRules, handleValidation, (req, res) => {
  const { paciente_id, consultorio_id, fecha, hora_inicio, hora_fin, tipo, notas, estado } = req.body;

  if (toMinutes(hora_inicio) >= toMinutes(hora_fin)) {
    return res.status(400).json({ error: 'La hora de fin debe ser posterior a la hora de inicio.' });
  }

  const conflicts = detectConflicts({ fecha, hora_inicio, hora_fin, consultorio_id });
  const key = ENC_KEY();

  const result = run(
    'INSERT INTO citas (paciente_id, consultorio_id, fecha, hora_inicio, hora_fin, tipo, notas_cifrado, estado) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [paciente_id, consultorio_id, fecha, hora_inicio, hora_fin, tipo || 'Individual', notas ? encrypt(notas, key) : null, estado || 'Confirmada']
  );

  const created = get('SELECT * FROM citas WHERE id = ?', [result.lastInsertRowid]);
  res.status(201).json({
    ...decryptCita(created),
    _conflicts: conflicts,
    _warning: conflicts.length > 0 ? `⚠️ ${conflicts.length} empalme(s) detectado(s)` : null,
  });
});

/** PUT /api/citas/:id */
router.put('/:id', [...idParam, ...citaRules], handleValidation, (req, res) => {
  const { paciente_id, consultorio_id, fecha, hora_inicio, hora_fin, tipo, notas, estado } = req.body;
  const id = Number(req.params.id);

  const existing = get('SELECT * FROM citas WHERE id = ?', [id]);
  if (!existing) return res.status(404).json({ error: 'Cita no encontrada.' });

  if (toMinutes(hora_inicio) >= toMinutes(hora_fin)) {
    return res.status(400).json({ error: 'La hora de fin debe ser posterior a la hora de inicio.' });
  }

  const conflicts = detectConflicts({ fecha, hora_inicio, hora_fin, consultorio_id }, id);
  const key = ENC_KEY();

  run(
    `UPDATE citas SET paciente_id=?, consultorio_id=?, fecha=?, hora_inicio=?, hora_fin=?, tipo=?, notas_cifrado=?, estado=?, updated_at=datetime('now','localtime') WHERE id=?`,
    [paciente_id, consultorio_id, fecha, hora_inicio, hora_fin, tipo || 'Individual', notas ? encrypt(notas, key) : null, estado || 'Confirmada', id]
  );

  const updated = get('SELECT * FROM citas WHERE id = ?', [id]);
  res.json({
    ...decryptCita(updated),
    _conflicts: conflicts,
    _warning: conflicts.length > 0 ? `⚠️ ${conflicts.length} empalme(s) detectado(s)` : null,
  });
});

/** DELETE /api/citas/:id */
router.delete('/:id', idParam, handleValidation, (req, res) => {
  const id = Number(req.params.id);
  const existing = get('SELECT * FROM citas WHERE id = ?', [id]);
  if (!existing) return res.status(404).json({ error: 'Cita no encontrada.' });

  run('UPDATE citas SET estado = "Cancelada", updated_at = datetime("now","localtime") WHERE id = ?', [id]);
  res.json({ ok: true, message: 'Cita cancelada.' });
});

module.exports = router;

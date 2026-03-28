/* ╔══════════════════════════════════════════════════════╗
   ║  pacientes.js — CRUD con cifrado AES-256-GCM        ║
   ║  Cumple: LFPDPPP (datos sensibles de salud)          ║
   ╚══════════════════════════════════════════════════════╝ */

'use strict';

const express = require('express');
const { run, get, all } = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { auditMiddleware, logAudit } = require('../middleware/audit');
const { encrypt, decrypt } = require('../utils/encryption');
const { pacienteRules, handleValidation, idParam } = require('../utils/validation');

const router = express.Router();
router.use(requireAuth);
router.use(auditMiddleware('pacientes'));

const ENC_KEY = () => process.env.ENCRYPTION_KEY;

/** Decrypt a patient record for response */
function decryptPaciente(row) {
  if (!row) return null;
  return {
    id: row.id,
    nombre: decrypt(row.nombre_cifrado, ENC_KEY()) || '[Error descifrado]',
    edad: row.edad,
    telefono: decrypt(row.telefono_cifrado, ENC_KEY()),
    email: decrypt(row.email_cifrado, ENC_KEY()),
    fecha_nacimiento: row.fecha_nacimiento,
    fecha_registro: row.fecha_registro,
    motivo: decrypt(row.motivo_cifrado, ENC_KEY()),
    notas: decrypt(row.notas_cifrado, ENC_KEY()),
    activo: !!row.activo,
    consentimiento: !!row.consentimiento,
    fecha_consentimiento: row.fecha_consentimiento,
    consultorios: [],
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** GET /api/pacientes */
router.get('/', (req, res) => {
  const rows = all('SELECT * FROM pacientes WHERE activo = 1 ORDER BY created_at DESC');
  const pacientes = rows.map(decryptPaciente);

  for (const p of pacientes) {
    const rels = all('SELECT consultorio_id FROM paciente_consultorio WHERE paciente_id = ?', [p.id]);
    p.consultorios = rels.map(r => r.consultorio_id);
  }

  logAudit({ usuario_id: req.user.id, accion: 'READ', tabla: 'pacientes', ip_address: req.ip, user_agent: req.get('user-agent'), datos_nuevos: { count: pacientes.length } });
  res.json(pacientes);
});

/** GET /api/pacientes/:id */
router.get('/:id', idParam, handleValidation, (req, res) => {
  const row = get('SELECT * FROM pacientes WHERE id = ?', [Number(req.params.id)]);
  if (!row) return res.status(404).json({ error: 'Paciente no encontrado.' });

  const paciente = decryptPaciente(row);
  const rels = all('SELECT consultorio_id FROM paciente_consultorio WHERE paciente_id = ?', [row.id]);
  paciente.consultorios = rels.map(r => r.consultorio_id);

  logAudit({ usuario_id: req.user.id, accion: 'READ', tabla: 'pacientes', registro_id: row.id, ip_address: req.ip, user_agent: req.get('user-agent') });
  res.json(paciente);
});

/** POST /api/pacientes */
router.post('/', pacienteRules, handleValidation, (req, res) => {
  const { nombre, edad, telefono, email, fecha_nacimiento, fecha_registro, motivo, notas, consentimiento, consultorios } = req.body;

  if (!consentimiento) {
    return res.status(400).json({ error: 'Se requiere consentimiento del paciente para almacenar datos de salud (LFPDPPP Art. 9).' });
  }

  const key = ENC_KEY();
  const result = run(
    `INSERT INTO pacientes (nombre_cifrado, edad, telefono_cifrado, email_cifrado, fecha_nacimiento, fecha_registro, motivo_cifrado, notas_cifrado, activo, consentimiento, fecha_consentimiento)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1, datetime('now','localtime'))`,
    [
      encrypt(nombre, key),
      edad || null,
      telefono ? encrypt(telefono, key) : null,
      email ? encrypt(email, key) : null,
      fecha_nacimiento || null,
      fecha_registro || null,
      motivo ? encrypt(motivo, key) : null,
      notas ? encrypt(notas, key) : null,
    ]
  );

  const pacienteId = result.lastInsertRowid;

  if (consultorios && Array.isArray(consultorios)) {
    for (const cId of consultorios) {
      run('INSERT OR IGNORE INTO paciente_consultorio (paciente_id, consultorio_id) VALUES (?, ?)', [pacienteId, cId]);
    }
  }

  run(`INSERT INTO consentimientos (paciente_id, tipo, descripcion, aceptado) VALUES (?, 'TRATAMIENTO', 'Consentimiento para almacenamiento y tratamiento de datos de salud', 1)`, [pacienteId]);

  const created = get('SELECT * FROM pacientes WHERE id = ?', [pacienteId]);
  if (!created) {
    return res.status(500).json({ error: 'No se pudo recuperar el paciente recién creado.' });
  }
  const p = decryptPaciente(created);
  p.consultorios = consultorios || [];
  res.status(201).json(p);
});

/** PUT /api/pacientes/:id */
router.put('/:id', [...idParam, ...pacienteRules], handleValidation, (req, res) => {
  const { nombre, edad, telefono, email, fecha_nacimiento, fecha_registro, motivo, notas, activo, consentimiento, consultorios } = req.body;
  const id = Number(req.params.id);
  const key = ENC_KEY();

  const existing = get('SELECT * FROM pacientes WHERE id = ?', [id]);
  if (!existing) return res.status(404).json({ error: 'Paciente no encontrado.' });

  run(
    `UPDATE pacientes SET nombre_cifrado=?, edad=?, telefono_cifrado=?, email_cifrado=?, fecha_nacimiento=?, fecha_registro=?, motivo_cifrado=?, notas_cifrado=?, activo=?, updated_at=datetime('now','localtime') WHERE id=?`,
    [
      encrypt(nombre, key),
      edad || null,
      telefono ? encrypt(telefono, key) : null,
      email ? encrypt(email, key) : null,
      fecha_nacimiento || null,
      fecha_registro || null,
      motivo ? encrypt(motivo, key) : null,
      notas ? encrypt(notas, key) : null,
      activo !== false ? 1 : 0,
      id,
    ]
  );

  if (consultorios && Array.isArray(consultorios)) {
    run('DELETE FROM paciente_consultorio WHERE paciente_id = ?', [id]);
    for (const cId of consultorios) {
      run('INSERT OR IGNORE INTO paciente_consultorio (paciente_id, consultorio_id) VALUES (?, ?)', [id, cId]);
    }
  }

  const updated = get('SELECT * FROM pacientes WHERE id = ?', [id]);
  const out = decryptPaciente(updated);
  const rels = all('SELECT consultorio_id FROM paciente_consultorio WHERE paciente_id = ?', [id]);
  out.consultorios = rels.map(r => r.consultorio_id);
  res.json(out);
});

/** DELETE /api/pacientes/:id (soft delete — NOM-004 requires 5-year retention) */
router.delete('/:id', idParam, handleValidation, (req, res) => {
  const id = Number(req.params.id);
  const existing = get('SELECT * FROM pacientes WHERE id = ?', [id]);
  if (!existing) return res.status(404).json({ error: 'Paciente no encontrado.' });

  run('UPDATE pacientes SET activo = 0, updated_at = datetime("now","localtime") WHERE id = ?', [id]);
  res.json({ ok: true, message: 'Paciente desactivado (datos conservados por NOM-004-SSA3-2012).' });
});

module.exports = router;

/* ╔══════════════════════════════════════════════════════╗
   ║  validation.js — Input validation & sanitization     ║
   ║  Prevents XSS, SQL injection, and malformed data     ║
   ╚══════════════════════════════════════════════════════╝ */

'use strict';

const { body, param, query, validationResult } = require('express-validator');

/** Middleware: check for validation errors and return 400 */
function handleValidation(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Datos inválidos',
      details: errors.array().map(e => ({ campo: e.path, mensaje: e.msg })),
    });
  }
  next();
}

/** Sanitize a string: trim, escape HTML */
function sanitize(str) {
  if (!str) return '';
  return String(str).trim()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// ── Validation chains ──

const loginRules = [
  body('email').isEmail().withMessage('Email inválido').normalizeEmail(),
  body('password').isLength({ min: 8 }).withMessage('La contraseña debe tener al menos 8 caracteres'),
];

const pacienteRules = [
  body('nombre').notEmpty().withMessage('El nombre es obligatorio').isLength({ max: 200 }),
  body('fecha_nacimiento').optional({ checkFalsy: true }).isISO8601().withMessage('Fecha de nacimiento inválida'),
  body('fecha_registro').optional({ checkFalsy: true }).isISO8601().withMessage('Fecha de registro inválida'),
  body('edad').optional({ checkFalsy: true }).isInt({ min: 1, max: 150 }).withMessage('Edad inválida'),
  body('telefono').optional({ checkFalsy: true }).isLength({ max: 20 }),
  body('email').optional({ checkFalsy: true }).isEmail().withMessage('Email inválido'),
  body('motivo').optional({ checkFalsy: true }).isLength({ max: 2000 }),
  body('notas').optional({ checkFalsy: true }).isLength({ max: 5000 }),
  // strict: acepta boolean JSON (true/false); el flujo normal valida true en POST en el handler
  body('consentimiento').isBoolean({ strict: true }).withMessage('El consentimiento es obligatorio (LFPDPPP)'),
];

const consultorioRules = [
  body('nombre').notEmpty().withMessage('El nombre es obligatorio').isLength({ max: 200 }),
  body('direccion').optional({ checkFalsy: true }).isLength({ max: 500 }),
  body('telefono').optional({ checkFalsy: true }).isLength({ max: 20 }),
  body('horario').optional({ checkFalsy: true }).isLength({ max: 50 }),
  body('color').optional({ checkFalsy: true }).matches(/^#[0-9a-fA-F]{6}$/).withMessage('Color HEX inválido'),
];

const citaRules = [
  body('paciente_id').isInt().withMessage('Paciente inválido'),
  body('consultorio_id').isInt().withMessage('Consultorio inválido'),
  body('fecha').isDate().withMessage('Fecha inválida (YYYY-MM-DD)'),
  body('hora_inicio').matches(/^\d{2}:\d{2}$/).withMessage('Hora de inicio inválida (HH:MM)'),
  body('hora_fin').matches(/^\d{2}:\d{2}$/).withMessage('Hora de fin inválida (HH:MM)'),
  body('tipo').optional({ checkFalsy: true }).isIn(['Individual', 'Pareja', 'Familiar', 'Grupal', 'Evaluación', 'Seguimiento']),
  body('estado').optional({ checkFalsy: true }).isIn(['Confirmada', 'Pendiente', 'Cancelada', 'Lista de espera']),
];

const idParam = [
  param('id').isInt().withMessage('ID inválido'),
];

module.exports = {
  handleValidation, sanitize,
  loginRules, pacienteRules, consultorioRules, citaRules, idParam,
};

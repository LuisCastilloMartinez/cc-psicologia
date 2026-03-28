/* ╔══════════════════════════════════════════════════════╗
   ║  audit.js — Audit Trail Middleware                   ║
   ║  Cumple: NOM-024-SSA3-2012 (Trazabilidad)           ║
   ╚══════════════════════════════════════════════════════╝ */

'use strict';

const { run } = require('../db/database');

/**
 * Log an audit event
 */
function logAudit(opts) {
  try {
    run(
      `INSERT INTO audit_log (usuario_id, accion, tabla, registro_id, datos_anteriores, datos_nuevos, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        opts.usuario_id || null,
        opts.accion,
        opts.tabla,
        opts.registro_id || null,
        opts.datos_anteriores ? JSON.stringify(sanitizeForLog(opts.datos_anteriores)) : null,
        opts.datos_nuevos ? JSON.stringify(sanitizeForLog(opts.datos_nuevos)) : null,
        opts.ip_address || null,
        opts.user_agent || null,
      ]
    );
  } catch (err) {
    console.error('Audit log error:', err.message);
  }
}

/**
 * Remove sensitive fields before logging (ISO 27001)
 */
function sanitizeForLog(data) {
  if (!data || typeof data !== 'object') return data;
  const copy = { ...data };
  const sensitiveFields = [
    'password', 'password_hash', 'token', 'token_hash',
    'nombre_cifrado', 'telefono_cifrado', 'email_cifrado',
    'motivo_cifrado', 'notas_cifrado',
    'nombre', 'telefono', 'email', 'motivo', 'notas',
  ];
  for (const field of sensitiveFields) {
    if (copy[field]) copy[field] = '[REDACTADO]';
  }
  return copy;
}

/**
 * Express middleware to auto-log mutations
 */
function auditMiddleware(tabla) {
  return (req, res, next) => {
    const originalJson = res.json.bind(res);
    res.json = function(data) {
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && res.statusCode < 400) {
        const accion = req.method === 'POST' ? 'CREATE'
                     : req.method === 'DELETE' ? 'DELETE' : 'UPDATE';
        logAudit({
          usuario_id: req.user?.id,
          accion,
          tabla,
          registro_id: req.params?.id || data?.id,
          datos_nuevos: req.body,
          ip_address: req.ip,
          user_agent: req.get('user-agent'),
        });
      }
      return originalJson(data);
    };
    next();
  };
}

module.exports = { logAudit, auditMiddleware, sanitizeForLog };

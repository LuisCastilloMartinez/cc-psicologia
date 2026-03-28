/* ╔══════════════════════════════════════════════════════╗
   ║  database.js — SQLite via sql.js (pure JavaScript)   ║
   ║  Datos sensibles cifrados con AES-256-GCM            ║
   ╚══════════════════════════════════════════════════════╝ */

'use strict';

const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, '..', 'data', 'psicosoft.db');

let db = null;
let SQL = null;

/** Save DB to disk */
function saveDb() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

/** Auto-save every 30 seconds */
let saveInterval = null;
function startAutoSave() {
  if (saveInterval) return;
  saveInterval = setInterval(saveDb, 30000);
}

function getDb() {
  if (!db) throw new Error('Database not initialized. Call initializeDatabase() first.');
  return db;
}

/** Wrapper for db.prepare → run (like better-sqlite3 API) */
function run(sql, params = []) {
  db.run(sql, params);
  // Leer last_insert_rowid ANTES de saveDb(): db.export() en sql.js resetea el rowid de la conexión.
  const lidRow = db.exec('SELECT last_insert_rowid()');
  const lastInsertRowid = lidRow[0]?.values[0][0] ?? 0;
  saveDb();
  return { lastInsertRowid };
}

/** Wrapper for db.prepare → get (single row) */
function get(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  let result = null;
  if (stmt.step()) {
    const cols = stmt.getColumnNames();
    const vals = stmt.get();
    result = {};
    cols.forEach((col, i) => { result[col] = vals[i]; });
  }
  stmt.free();
  return result;
}

/** Wrapper for db.prepare → all (multiple rows) */
function all(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  const cols = stmt.getColumnNames();
  while (stmt.step()) {
    const vals = stmt.get();
    const row = {};
    cols.forEach((col, i) => { row[col] = vals[i]; });
    rows.push(row);
  }
  stmt.free();
  return rows;
}

async function initializeDatabase() {
  // Ensure data directory exists
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  SQL = await initSqlJs();

  // Load existing DB or create new one
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  // Performance + safety pragmas
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA foreign_keys = ON");

  db.run(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      nombre TEXT NOT NULL,
      rol TEXT DEFAULT 'terapeuta',
      activo INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS sesiones (
      id TEXT PRIMARY KEY,
      usuario_id INTEGER NOT NULL,
      token_hash TEXT NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      expires_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS consultorios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      direccion TEXT,
      telefono TEXT,
      horario TEXT,
      notas TEXT,
      color TEXT DEFAULT '#f9a8c9',
      activo INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS pacientes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre_cifrado TEXT NOT NULL,
      edad INTEGER,
      telefono_cifrado TEXT,
      email_cifrado TEXT,
      fecha_nacimiento TEXT,
      fecha_registro TEXT,
      motivo_cifrado TEXT,
      notas_cifrado TEXT,
      activo INTEGER DEFAULT 1,
      consentimiento INTEGER DEFAULT 0,
      fecha_consentimiento TEXT,
      aviso_privacidad_version TEXT DEFAULT '1.0',
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS paciente_consultorio (
      paciente_id INTEGER NOT NULL,
      consultorio_id INTEGER NOT NULL,
      PRIMARY KEY (paciente_id, consultorio_id),
      FOREIGN KEY (paciente_id) REFERENCES pacientes(id) ON DELETE CASCADE,
      FOREIGN KEY (consultorio_id) REFERENCES consultorios(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS citas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      paciente_id INTEGER NOT NULL,
      consultorio_id INTEGER NOT NULL,
      fecha TEXT NOT NULL,
      hora_inicio TEXT NOT NULL,
      hora_fin TEXT NOT NULL,
      tipo TEXT DEFAULT 'Individual',
      notas_cifrado TEXT,
      estado TEXT DEFAULT 'Confirmada',
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (paciente_id) REFERENCES pacientes(id) ON DELETE CASCADE,
      FOREIGN KEY (consultorio_id) REFERENCES consultorios(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER,
      accion TEXT NOT NULL,
      tabla TEXT NOT NULL,
      registro_id INTEGER,
      datos_anteriores TEXT,
      datos_nuevos TEXT,
      ip_address TEXT,
      user_agent TEXT,
      timestamp TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS consentimientos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      paciente_id INTEGER NOT NULL,
      tipo TEXT NOT NULL,
      descripcion TEXT,
      aceptado INTEGER NOT NULL,
      fecha TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (paciente_id) REFERENCES pacientes(id) ON DELETE CASCADE
    )
  `);

  // Migración: fecha de registro / alta del expediente (pacientes ya creados)
  try {
    const stmt = db.prepare('PRAGMA table_info(pacientes)');
    let hasFechaReg = false;
    while (stmt.step()) {
      const col = stmt.getAsObject();
      if (col.name === 'fecha_registro') hasFechaReg = true;
    }
    stmt.free();
    if (!hasFechaReg) db.run('ALTER TABLE pacientes ADD COLUMN fecha_registro TEXT');
  } catch (e) {
    console.warn('Migración pacientes.fecha_registro:', e.message);
  }

  // Indexes
  db.run("CREATE INDEX IF NOT EXISTS idx_citas_fecha ON citas(fecha)");
  db.run("CREATE INDEX IF NOT EXISTS idx_citas_consultorio ON citas(consultorio_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_citas_paciente ON citas(paciente_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp)");
  db.run("CREATE INDEX IF NOT EXISTS idx_audit_tabla ON audit_log(tabla)");
  db.run("CREATE INDEX IF NOT EXISTS idx_sesiones_usuario ON sesiones(usuario_id)");

  // Create default admin user if none exists
  const userCount = get('SELECT COUNT(*) as count FROM usuarios');
  if (!userCount || userCount.count === 0) {
    const defaultPassword = 'PsicoSoft2026!';
    const hash = bcrypt.hashSync(defaultPassword, 12);
    run(
      'INSERT INTO usuarios (email, password_hash, nombre, rol) VALUES (?, ?, ?, ?)',
      ['admin@psicosoft.local', hash, 'Administrador', 'admin']
    );

    console.log('');
    console.log('  ╔══════════════════════════════════════════════╗');
    console.log('  ║  🌸 USUARIO ADMINISTRADOR CREADO             ║');
    console.log('  ║                                              ║');
    console.log('  ║  Email:    admin@psicosoft.local              ║');
    console.log('  ║  Password: PsicoSoft2026!                    ║');
    console.log('  ║                                              ║');
    console.log('  ║  ⚠️  CAMBIA ESTA CONTRASEÑA INMEDIATAMENTE   ║');
    console.log('  ╚══════════════════════════════════════════════╝');
    console.log('');
  }

  saveDb();
  startAutoSave();

  return db;
}

function closeDb() {
  if (saveInterval) { clearInterval(saveInterval); saveInterval = null; }
  if (db) { saveDb(); db.close(); db = null; }
}

module.exports = { getDb, initializeDatabase, closeDb, run, get, all, saveDb };

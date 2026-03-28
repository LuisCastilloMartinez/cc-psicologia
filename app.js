/* ╔══════════════════════════════════════════════════════════╗
   ║  app.js — PsicoSoft Frontend Core                       ║
   ║  API Client + Auth + Real-time + Utilities              ║
   ║                                                         ║
   ║  MIGRADO: de LocalStorage → API REST con backend real   ║
   ╚══════════════════════════════════════════════════════════╝ */

'use strict';

const API_BASE = window.location.origin + '/api';

/* ══════════════════════════════════════════
   AUTH — Session management
══════════════════════════════════════════ */
const Auth = {
  getToken() {
    return sessionStorage.getItem('psicosoft_token');
  },
  getUser() {
    try { return JSON.parse(sessionStorage.getItem('psicosoft_user')); } catch { return null; }
  },
  isLoggedIn() {
    return !!this.getToken();
  },
  logout() {
    const token = this.getToken();
    if (token) {
      fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      }).catch(() => {});
    }
    sessionStorage.removeItem('psicosoft_token');
    sessionStorage.removeItem('psicosoft_user');
    window.location.href = '/login.html';
  },
  requireAuth() {
    if (!this.isLoggedIn()) {
      window.location.href = '/login.html';
      return false;
    }
    return true;
  },
  headers() {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.getToken()}`,
    };
  },
};

/* ══════════════════════════════════════════
   API — HTTP Client with auth
══════════════════════════════════════════ */
const API = {
  async _fetch(url, opts = {}) {
    try {
      const res = await fetch(`${API_BASE}${url}`, {
        ...opts,
        headers: Auth.headers(),
      });

      if (res.status === 401) {
        Auth.logout();
        return null;
      }

      const data = await res.json();
      if (!res.ok) {
        const detailMsg = Array.isArray(data.details) && data.details.length
          ? data.details.map(d => d.mensaje || d.msg || '').filter(Boolean).join(' · ')
          : '';
        throw new Error(detailMsg ? `${data.error || 'Error'}: ${detailMsg}` : (data.error || `Error ${res.status}`));
      }
      return data;
    } catch (err) {
      console.error(`API Error [${url}]:`, err.message);
      if (err.message !== 'Failed to fetch') {
        toast(`❌ ${err.message}`, 'error');
      }
      throw err;
    }
  },

  // ── Consultorios ──
  async getConsultorios() { const res = await this._fetch('/consultorios'); return res ? res.map(Mapping.consultorio) : []; },
  async createConsultorio(data) { return Mapping.consultorio(await this._fetch('/consultorios', { method: 'POST', body: JSON.stringify(data) })); },
  async updateConsultorio(id, data) { return Mapping.consultorio(await this._fetch(`/consultorios/${id}`, { method: 'PUT', body: JSON.stringify(data) })); },
  async deleteConsultorio(id) { return await this._fetch(`/consultorios/${id}`, { method: 'DELETE' }); },

  // ── Pacientes ──
  async getPacientes() { const res = await this._fetch('/pacientes'); return res ? res.map(Mapping.paciente) : []; },
  async getPaciente(id) { return Mapping.paciente(await this._fetch(`/pacientes/${id}`)); },
  async createPaciente(data) { return Mapping.paciente(await this._fetch('/pacientes', { method: 'POST', body: JSON.stringify(Mapping.pacienteIn(data)) })); },
  async updatePaciente(id, data) { return Mapping.paciente(await this._fetch(`/pacientes/${id}`, { method: 'PUT', body: JSON.stringify(Mapping.pacienteIn(data)) })); },
  async deletePaciente(id) { return await this._fetch(`/pacientes/${id}`, { method: 'DELETE' }); },

  // ── Citas ──
  async getCitas(fecha) {
    const url = fecha ? `/citas?fecha=${fecha}` : '/citas';
    const res = await this._fetch(url);
    return res ? res.map(Mapping.citaOut) : [];
  },
  async getConflicts() { return await this._fetch('/citas/conflicts'); },
  async createCita(data) { return Mapping.citaOut(await this._fetch('/citas', { method: 'POST', body: JSON.stringify(Mapping.citaIn(data)) })); },
  async updateCita(id, data) { return Mapping.citaOut(await this._fetch(`/citas/${id}`, { method: 'PUT', body: JSON.stringify(Mapping.citaIn(data)) })); },
  async deleteCita(id) { return await this._fetch(`/citas/${id}`, { method: 'DELETE' }); },

  // ── Audit ──
  async getAuditLog(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return await this._fetch(`/audit?${qs}`);
  },
  async getAuditStats() { return await this._fetch('/audit/stats'); },
};

/* ══════════════════════════════════════════
   Store — Compatibility layer
   (bridges old LocalStorage code to new API)
══════════════════════════════════════════ */
const Store = {
  _cache: { consultorios: null, pacientes: null, citas: null },
  _listeners: {},

  on(event, fn) {
    if (!Store._listeners[event]) Store._listeners[event] = [];
    Store._listeners[event].push(fn);
  },
  _emit(event, data) {
    (Store._listeners[event] || []).forEach(fn => fn(data));
  },

  // Synchronous getters (for compatibility — UI expects these to be sync)
  getConsultorios() { return Store._cache.consultorios || []; },
  getPacientes() { return Store._cache.pacientes || []; },
  getCitas() { return Store._cache.citas || []; },

  async loadAll() {
    Store._cache.consultorios = await API.getConsultorios();
    Store._cache.pacientes = await API.getPacientes();
    Store._cache.citas = await API.getCitas();
    Store._emit('consultorios', Store._cache.consultorios);
    Store._emit('pacientes', Store._cache.pacientes);
    Store._emit('citas', Store._cache.citas);
  },

  // Mutations (writes to API, updates cache, emits)
  async addPaciente(data) {
    const p = await API.createPaciente(data);
    if (!p) return;
    Store._cache.pacientes.push(p);
    Store._emit('pacientes', Store._cache.pacientes);
    return p;
  },
  async updatePaciente(id, data) {
    const nid = Number(id);
    const p = await API.updatePaciente(nid, data);
    if (!p) return;
    Store._cache.pacientes = Store._cache.pacientes.map(x => Number(x.id) === nid ? p : x);
    Store._emit('pacientes', Store._cache.pacientes);
    return p;
  },
  async addCita(data) {
    const c = await API.createCita(data);
    if (!c) return;
    Store._cache.citas.push(c);
    Store._emit('citas', Store._cache.citas);
    return c;
  },
  async updateCita(id, data) {
    const c = await API.updateCita(id, data);
    if (!c) return;
    Store._cache.citas = Store._cache.citas.map(x => x.id === id ? c : x);
    Store._emit('citas', Store._cache.citas);
    return c;
  },
  async cancelCita(id) {
    await API.deleteCita(id);
    const c = Store._cache.citas.find(x => x.id === id);
    if (c) c.estado = 'Cancelada';
    Store._emit('citas', Store._cache.citas);
  },
  async addConsultorio(data) {
    const c = await API.createConsultorio(data);
    if (!c) return;
    Store._cache.consultorios.push(c);
    Store._emit('consultorios', Store._cache.consultorios);
    return c;
  },
  async updateConsultorio(id, data) {
    const nid = Number(id);
    const c = await API.updateConsultorio(nid, data);
    if (!c) return;
    Store._cache.consultorios = Store._cache.consultorios.map(x => Number(x.id) === nid ? c : x);
    Store._emit('consultorios', Store._cache.consultorios);
    return c;
  },
  async deleteConsultorio(id) {
    const nid = Number(id);
    await API.deleteConsultorio(nid);
    Store._cache.consultorios = (Store._cache.consultorios || []).filter(x => Number(x.id) !== nid);
    Store._cache.citas = (Store._cache.citas || []).filter(x => Number(x.consultoId) !== nid);
    Store._emit('consultorios', Store._cache.consultorios);
    Store._emit('citas', Store._cache.citas);
  },

  async deletePaciente(id) {
    const nid = Number(id);
    await API.deletePaciente(nid);
    Store._cache.pacientes = (Store._cache.pacientes || []).filter(x => Number(x.id) !== nid);
    Store._emit('pacientes', Store._cache.pacientes);
  },

  // Invalidate cache and re-fetch
  async refresh(entity) {
    if (entity === 'consultorios' || !entity) {
      Store._cache.consultorios = await API.getConsultorios();
      Store._emit('consultorios', Store._cache.consultorios);
    }
    if (entity === 'pacientes' || !entity) {
      Store._cache.pacientes = await API.getPacientes();
      Store._emit('pacientes', Store._cache.pacientes);
    }
    if (entity === 'citas' || !entity) {
      Store._cache.citas = await API.getCitas();
      Store._emit('citas', Store._cache.citas);
    }
  },

  // Initial data load
  async loadAll() {
    try {
      const [c, p, ci] = await Promise.all([
        API.getConsultorios(),
        API.getPacientes(),
        API.getCitas(),
      ]);
      Store._cache.consultorios = c;
      Store._cache.pacientes = p;
      Store._cache.citas = ci;
      Store._emit('consultorios', c);
      Store._emit('pacientes', p);
      Store._emit('citas', ci);
    } catch (err) {
      console.error('Failed to load data:', err);
    }
  },
};

/* ══════════════════════════════════════════
   TOAST NOTIFICATIONS
══════════════════════════════════════════ */
function toast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = message;
  container.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 300);
  }, 3500);
}

/* ══════════════════════════════════════════
   UTILS & DATA MAPPING
══════════════════════════════════════════ */
const Mapping = {
  consultorio: c => c,
  pacienteIn: p => ({
    nombre: p.nombre,
    edad: p.edad,
    telefono: p.telefono,
    email: p.email,
    fecha_nacimiento: p.fechaNac || p.fecha_nacimiento || null,
    fecha_registro: p.fechaRegistro || p.fecha_registro || null,
    motivo: p.motivo,
    notas: p.notas,
    consultorios: Array.isArray(p.consultorios) ? p.consultorios : [],
    consentimiento: typeof p.consentimiento === 'boolean' ? p.consentimiento : false,
    activo: p.activo !== false,
  }),
  paciente: p => ({
    ...p,
    fechaNac: p.fecha_nacimiento,
    fechaRegistro: p.fecha_registro,
  }),
  citaIn: c => ({ ...c, paciente_id: c.pacienteId, consultorio_id: c.consultoId, hora_inicio: c.horaInicio, hora_fin: c.horaFin }),
  citaOut: c => ({ ...c, pacienteId: c.paciente_id, consultoId: c.consultorio_id, horaInicio: c.hora_inicio, horaFin: c.hora_fin }),
};

const Utils = {
  today() {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().split('T')[0];
  },
  weekDates(refDate) {
    const d = new Date(refDate);
    const day = d.getDay() || 7;
    d.setUTCDate(d.getUTCDate() + (1 - day));
    const dates = [];
    for(let i=0; i<7; i++) {
        const dt = new Date(d);
        dt.setUTCDate(dt.getUTCDate() + i);
        dates.push(dt.toISOString().split('T')[0]);
    }
    return dates;
  },
  fmtDate(dStr) {
    if (!dStr) return '';
    return new Date(dStr + 'T00:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
  },
  fmtDateFull(dStr) {
    if (!dStr) return '';
    return new Date(dStr + 'T00:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  },
  fmt12(tStr) {
    if (!tStr) return '';
    const [h, m] = tStr.split(':').map(Number);
    const ampm = h >= 12 ? 'pm' : 'am';
    return `${((h % 12) || 12)}:${String(m).padStart(2, '0')} ${ampm}`;
  },
  toMinutes(t) {
    if (!t) return 0;
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  },
  hexToRgba(hex, alpha) {
    if (!hex) return 'transparent';
    const r = parseInt(hex.slice(1,3), 16),
          g = parseInt(hex.slice(3,5), 16),
          b = parseInt(hex.slice(5,7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  },
  consultorioColors: [
    '#f9a8c9', '#a8e6cf', '#d4b5ff', '#ffd3a8', '#a8d4f0',
    '#f0c4d4', '#bfe6d0', '#c9b8e8', '#f5dfc5', '#b4d8f0',
  ],
};

/* ══════════════════════════════════════════
   NAV CLOCK
══════════════════════════════════════════ */
function startClock() {
  const el = document.getElementById('nav-clock');
  if (!el) return;
  const tick = () => {
    const now = new Date();
    el.textContent = now.toLocaleTimeString('es-MX', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
  };
  tick();
  setInterval(tick, 1000);
}

/* ══════════════════════════════════════════
   GLOBAL UI HELPERS
══════════════════════════════════════════ */
window.openModal = function(id) {
  const el = document.getElementById(id);
  if (el) {
    el.classList.add('open');
    el.classList.remove('active');
  }
};
window.closeModal = function(id) {
  const el = document.getElementById(id);
  if (el) {
    el.classList.remove('open');
    el.classList.remove('active');
  }
};
window.toast = function(msg, type = 'info', icon = '') {
  const container = document.getElementById('toast-container') || (() => {
    const c = document.createElement('div');
    c.id = 'toast-container';
    c.style.cssText = 'position:fixed;bottom:20px;right:20px;display:flex;flex-direction:column;gap:10px;z-index:9999;';
    document.body.appendChild(c);
    return c;
  })();
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.style.cssText = `
    background: ${type === 'error' ? '#fee2e2' : type === 'success' ? '#dcfce7' : '#fff'};
    color: ${type === 'error' ? '#991b1b' : type === 'success' ? '#166534' : '#1f2937'};
    border: 1px solid ${type === 'error' ? '#fca5a5' : type === 'success' ? '#86efac' : '#e5e7eb'};
    padding: 12px 20px; border-radius: 8px; font-weight: 500; font-size: 14px;
    box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); display: flex; align-items: center; gap: 8px;
    animation: slideIn 0.3s ease-out forwards;
  `;
  t.innerHTML = `${icon ? `<span>${icon}</span>` : ''}<span>${msg}</span>`;
  container.appendChild(t);
  setTimeout(() => {
    t.style.opacity = '0'; t.style.transform = 'translateY(10px)'; t.style.transition = 'all 0.3s';
    setTimeout(() => t.remove(), 300);
  }, 3000);
};

/* ══════════════════════════════════════════
   ACTIVE NAV LINK
══════════════════════════════════════════ */
function setActiveNav() {
  const page = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a').forEach(a => {
    const href = a.getAttribute('href') || '';
    a.classList.toggle('active', href.endsWith(page));
  });
}

/* ══════════════════════════════════════════
   USER DISPLAY + LOGOUT
══════════════════════════════════════════ */
function setupUserNav() {
  const user = Auth.getUser();
  const userEl = document.getElementById('nav-user-name');
  if (userEl && user) {
    userEl.textContent = user.nombre;
  }
  const logoutBtn = document.getElementById('nav-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      Auth.logout();
    });
  }
}

/* ══════════════════════════════════════════
   NOTIFICATION BELL (Conflict alerts)
══════════════════════════════════════════ */
async function updateNotificationBell() {
  const bell = document.getElementById('nav-bell');
  if (!bell) return;
  try {
    const conflicts = await API.getConflicts();
    const badge = bell.querySelector('.bell-badge');
    if (conflicts.length > 0) {
      bell.classList.add('has-alerts');
      if (badge) { badge.textContent = conflicts.length; badge.style.display = 'flex'; }
    } else {
      bell.classList.remove('has-alerts');
      if (badge) badge.style.display = 'none';
    }
  } catch (err) {
    // Silently fail
  }
}

/* ══════════════════════════════════════════
   REAL-TIME PULSE — auto-refresh every 30s
══════════════════════════════════════════ */
function startRealtimePulse() {
  setInterval(async () => {
    await updateNotificationBell();
    window.dispatchEvent(new CustomEvent('psicosoft:pulse'));
  }, 30000);
}

/* ══════════════════════════════════════════
   DOM READY
══════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', async () => {
  // Cerrar modales con el botón ✕ (.modal-close) — no llevaba onclick en el HTML
  document.body.addEventListener('click', (e) => {
    const closeBtn = e.target.closest('.modal-close');
    if (closeBtn) {
      const overlay = closeBtn.closest('.modal-overlay');
      if (overlay && overlay.id) {
        e.preventDefault();
        closeModal(overlay.id);
      }
      return;
    }
    if (e.target.classList && e.target.classList.contains('modal-overlay') && e.target.classList.contains('open')) {
      closeModal(e.target.id);
    }
  });

  // Skip auth check on login page
  if (location.pathname.endsWith('login.html')) return;

  // Require authentication
  if (!Auth.requireAuth()) return;

  // Initialize UI
  startClock();
  setActiveNav();
  setupUserNav();

  // Load data from API
  if (Store.loadAll) await Store.loadAll();

  // Signal to UI that data is loaded
  window.dispatchEvent(new CustomEvent('psicosoft:ready'));

  // Start real-time updates
  await updateNotificationBell();
  startRealtimePulse();

  // Listen for store changes
  Store.on('citas', () => updateNotificationBell());
  Store.on('consultorios', () => updateNotificationBell());
});

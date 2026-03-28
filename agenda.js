/* ╔══════════════════════════════════════════════════════╗
   ║  agenda.js — Lógica de agenda y detección de        ║
   ║  empalmes en tiempo real                            ║
   ╚══════════════════════════════════════════════════════╝ */

'use strict';

/* ══════════════════════════════════════════
   DETECTOR DE CONFLICTOS
══════════════════════════════════════════ */
const ConflictDetector = {
  /**
   * Detecta si dos citas se empalman en tiempo.
   * Considera que el terapeuta no puede estar en dos lugares a la vez.
   */
  overlap(a, b) {
    if (a.id === b.id) return false;
    if (a.fecha !== b.fecha) return false;

    const aStart = Utils.toMinutes(a.horaInicio);
    const aEnd   = Utils.toMinutes(a.horaFin);
    const bStart = Utils.toMinutes(b.horaInicio);
    const bEnd   = Utils.toMinutes(b.horaFin);

    // Empalme real: uno empieza antes de que el otro termine
    return aStart < bEnd && bStart < aEnd;
  },

  /**
   * Retorna lista de pares en conflicto: [{ a, b, tipo }]
   * tipo: 'mismo_consultorio' | 'diferente_consultorio'
   */
  getConflicts(citas) {
    const conflicts = [];
    const activas = citas.filter(c => c.estado !== 'Cancelada');

    for (let i = 0; i < activas.length; i++) {
      for (let j = i + 1; j < activas.length; j++) {
        const a = activas[i], b = activas[j];
        if (ConflictDetector.overlap(a, b)) {
          conflicts.push({
            a,
            b,
            tipo: a.consultoId === b.consultoId ? 'mismo_consultorio' : 'diferente_consultorio',
          });
        }
      }
    }
    return conflicts;
  },

  /**
   * Verifica si una cita nueva conflictúa con las existentes.
   * Retorna array de conflictos para esa cita.
   */
  checkNew(nuevaCita, citasExistentes) {
    return citasExistentes
      .filter(c => c.id !== nuevaCita.id && c.estado !== 'Cancelada')
      .filter(c => ConflictDetector.overlap(nuevaCita, c))
      .map(c => ({
        cita: c,
        tipo: c.consultoId === nuevaCita.consultoId ? 'mismo_consultorio' : 'diferente_consultorio',
      }));
  },

  /** IDs de citas que tienen al menos un conflicto */
  conflictIds(citas) {
    const ids = new Set();
    ConflictDetector.getConflicts(citas).forEach(({ a, b }) => {
      ids.add(a.id);
      ids.add(b.id);
    });
    return ids;
  },
};

/* ══════════════════════════════════════════
   RENDER — VISTA SEMANAL
══════════════════════════════════════════ */
const WeekView = {
  currentRef: new Date(),
  HOURS: Array.from({length: 14}, (_, i) => i + 7), // 07:00 – 20:00

  init(containerId) {
    this.container = document.getElementById(containerId);
    this.render();
  },

  prev() { this.currentRef.setDate(this.currentRef.getDate() - 7); this.render(); },
  next() { this.currentRef.setDate(this.currentRef.getDate() + 7); this.render(); },
  goToday() { this.currentRef = new Date(); this.render(); },

  render() {
    if (!this.container) return;
    const dates       = Utils.weekDates(this.currentRef);
    const citas       = Store.getCitas();
    const consultorios = Store.getConsultorios();
    const conflictIds = ConflictDetector.conflictIds(citas);

    const dayNames = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
    const todayStr = Utils.today();

    let html = `<div class="week-grid" style="min-width:660px">`;

    /* Header row */
    html += `<div class="wg-header" style="grid-column:1"></div>`;
    dates.forEach((date, i) => {
      const [,, d] = date.split('-');
      const isToday = date === todayStr;
      html += `<div class="wg-header${isToday?' today':''}">
        <div style="font-size:10px;color:var(--text-muted)">${dayNames[i]}</div>
        <div style="font-size:18px;font-family:var(--ff-display);font-weight:700">${parseInt(d)}</div>
      </div>`;
    });

    /* Hour rows */
    this.HOURS.forEach(hour => {
      html += `<div class="wg-time">${String(hour).padStart(2,'0')}:00</div>`;
      dates.forEach(date => {
        // Citas que empiezan en esta hora
        const slotCitas = citas.filter(c => {
          if (c.fecha !== date || c.estado === 'Cancelada') return false;
          const h = parseInt(c.horaInicio.split(':')[0]);
          return h === hour;
        });

        html += `<div class="wg-cell" data-date="${date}" data-hour="${hour}" onclick="WeekView.onCellClick('${date}',${hour})">`;
        slotCitas.forEach(cita => {
          const cons = consultorios.find(c => c.id === cita.consultoId);
          const color = cons?.color || '#f9a8c9';
          const isConflict = conflictIds.has(cita.id);
          const startM = Utils.toMinutes(cita.horaInicio) - hour * 60;
          const durM   = Utils.toMinutes(cita.horaFin) - Utils.toMinutes(cita.horaInicio);
          const top    = (startM / 60) * 100 + '%';
          const height = Math.min((durM / 60) * 100, 100) + '%';

          html += `
            <div class="wg-event${isConflict?' conflict':''}"
                 style="background:${Utils.hexToRgba(color,.25)};
                        border-left:3px solid ${color};
                        color:${color.replace(/^#/,'') < '888888' ? '#333' : '#5a3344'};
                        top:${top};height:${height}"
                 onclick="event.stopPropagation();AgendaPage.openCitaDetail('${cita.id}')"
                 title="${isConflict ? '⚠️ CONFLICTO — ' : ''}${cita.horaInicio}-${cita.horaFin}">
              ${isConflict ? '⚠️ ' : ''}${Utils.fmt12(cita.horaInicio)}
            </div>`;
        });
        html += `</div>`;
      });
    });

    html += `</div>`;
    this.container.innerHTML = html;

    /* Rango de semana para el encabezado */
    const rangeEl = document.getElementById('week-range');
    if (rangeEl) {
      rangeEl.textContent = `${Utils.fmtDate(dates[0])} — ${Utils.fmtDate(dates[6])}`;
    }

    /* Badge de conflictos */
    const badge = document.getElementById('conflict-count');
    if (badge) {
      const total = ConflictDetector.getConflicts(citas).length;
      badge.textContent = total;
      badge.style.display = total > 0 ? 'inline-flex' : 'none';
    }
  },

  onCellClick(date, hour) {
    // Pre-llenar formulario de nueva cita
    if (typeof openNuevaCita === 'function') {
      openNuevaCita(date, `${String(hour).padStart(2,'0')}:00`);
    }
  },
};

/* ══════════════════════════════════════════
   RENDER — LISTA DE CITAS DEL DÍA
══════════════════════════════════════════ */
const DayList = {
  render(date, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const citas       = Store.getCitas().filter(c => c.fecha === date && c.estado !== 'Cancelada');
    const consultorios = Store.getConsultorios();
    const pacientes   = Store.getPacientes();
    const conflictIds = ConflictDetector.conflictIds(Store.getCitas());

    citas.sort((a, b) => a.horaInicio.localeCompare(b.horaInicio));

    if (!citas.length) {
      container.innerHTML = `<div class="empty-state"><span class="ei">🌷</span><h3>Sin citas</h3><p>No hay citas programadas para este día.</p></div>`;
      return;
    }

    container.innerHTML = citas.map(cita => {
      const cons = consultorios.find(c => c.id === cita.consultoId);
      const pac  = pacientes.find(p => p.id === cita.pacienteId);
      const isConf = conflictIds.has(cita.id);

      return `
        <div class="cita-card${isConf?' cita-conflict':''}" data-id="${cita.id}">
          <div class="cc-time">
            <span>${Utils.fmt12(cita.horaInicio)}</span>
            <span class="cc-dash">—</span>
            <span>${Utils.fmt12(cita.horaFin)}</span>
          </div>
          <div class="cc-dot" style="background:${cons?.color || '#f9a8c9'}"></div>
          <div class="cc-info">
            <strong>${pac?.nombre || 'Paciente'}</strong>
            <span>${cons?.nombre || ''} · ${cita.tipo}</span>
            ${isConf ? `<span class="badge badge-warn" style="margin-top:4px">⚠️ Empalme detectado</span>` : ''}
          </div>
          <div class="cc-actions">
            <button class="btn btn-sm btn-ghost btn-icon" onclick="AgendaPage.openCitaDetail('${cita.id}')">👁</button>
            <button class="btn btn-sm btn-ghost btn-icon" onclick="AgendaPage.deleteCita('${cita.id}')">🗑</button>
          </div>
        </div>`;
    }).join('');
  },
};

/* ══════════════════════════════════════════
   VALIDACIÓN EN TIEMPO REAL (formulario)
══════════════════════════════════════════ */
const CitaValidator = {
  timeout: null,

  watch(fields, alertContainerId) {
    const check = () => {
      clearTimeout(CitaValidator.timeout);
      CitaValidator.timeout = setTimeout(() => {
        CitaValidator.validate(fields, alertContainerId);
      }, 300);
    };
    Object.values(fields).forEach(el => {
      if (el) el.addEventListener('change', check);
    });
  },

  validate({ fecha, horaInicio, horaFin, consultoId, citaId }, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return true;

    if (!fecha?.value || !horaInicio?.value || !horaFin?.value || !consultoId?.value) {
      container.innerHTML = '';
      return true;
    }

    if (Utils.toMinutes(horaInicio.value) >= Utils.toMinutes(horaFin.value)) {
      container.innerHTML = `<div class="conflict-banner">
        <span class="ci">⏰</span>
        <div><strong>Hora inválida</strong>
          <span>La hora de fin debe ser posterior a la de inicio.</span>
        </div></div>`;
      return false;
    }

    const nuevaCita = {
      id:         citaId || '__new__',
      fecha:      fecha.value,
      horaInicio: horaInicio.value,
      horaFin:    horaFin.value,
      consultoId: consultoId.value,
      estado:     'Confirmada',
    };

    const conflictos = ConflictDetector.checkNew(nuevaCita, Store.getCitas());

    if (!conflictos.length) {
      container.innerHTML = `<div style="color:#1a7a54;font-size:13px;display:flex;align-items:center;gap:6px;padding:10px 0">
        ✅ <span>Sin conflictos en este horario.</span></div>`;
      return true;
    }

    const consultorios = Store.getConsultorios();
    const pacientes    = Store.getPacientes();

    const lista = conflictos.map(({ cita, tipo }) => {
      const cons = consultorios.find(c => c.id === cita.consultoId);
      const pac  = pacientes.find(p => p.id === cita.pacienteId);
      return `<li style="margin-top:6px">
        <strong>${pac?.nombre || 'Paciente'}</strong> en <em>${cons?.nombre || 'Consultorio'}</em>
        · ${Utils.fmt12(cita.horaInicio)}–${Utils.fmt12(cita.horaFin)}
        ${tipo === 'diferente_consultorio' ? '· <span style="color:#8a6500">(⚠️ diferente consultorio)</span>' : ''}
      </li>`;
    }).join('');

    container.innerHTML = `<div class="conflict-banner">
      <span class="ci">⚠️</span>
      <div>
        <strong>¡Empalme detectado en ${conflictos.length} cita(s)!</strong>
        <ul style="margin-top:4px;padding-left:16px;font-size:13px">${lista}</ul>
        <span style="font-size:12px;color:#786040;margin-top:6px;display:block">
          Puedes guardar de todos modos o ajustar el horario.
        </span>
      </div>
    </div>`;
    return false; // hay conflictos pero no bloquea
  },
};

/* ══════════════════════════════════════════
   REAL-TIME: escuchar cambios del Store
══════════════════════════════════════════ */
Store.on('citas', () => {
  if (typeof WeekView !== 'undefined' && WeekView.container) WeekView.render();
  if (typeof AgendaPage !== 'undefined' && AgendaPage.refreshDay) AgendaPage.refreshDay();
  if (typeof updateConflictPanel !== 'undefined') updateConflictPanel();
});

/* Listen for the periodic pulse to re-render */
window.addEventListener('psicosoft:pulse', () => {
  if (typeof WeekView !== 'undefined' && WeekView.container) WeekView.render();
  if (typeof updateConflictPanel !== 'undefined') updateConflictPanel();
});


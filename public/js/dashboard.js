// ============================================================
// DASHBOARD — Owner Only
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  const user = requireOwner();
  if (!user) return;

  renderNavbar();
  renderBottomNav('dashboard');

  const dateInput = document.getElementById('filterDate');
  dateInput.value = getToday();
  document.getElementById('dashDate').textContent = formatDate(getToday());

  loadDivisionFilter();
  loadDashboard();

  dateInput.addEventListener('change', () => {
    document.getElementById('dashDate').textContent = formatDate(dateInput.value);
    loadDashboard();
  });
  document.getElementById('filterDivision').addEventListener('change', loadDashboard);
});

async function loadDivisionFilter() {
  try {
    const divisions = await api('/api/divisions');
    const sel = document.getElementById('filterDivision');
    divisions.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d.id;
      opt.textContent = d.name;
      sel.appendChild(opt);
    });
  } catch (err) {
    console.error(err);
  }
}

async function loadDashboard() {
  const date = document.getElementById('filterDate').value;
  const divId = document.getElementById('filterDivision').value;
  await Promise.all([loadStats(date), loadMissing(date), loadReports(date, divId)]);
}

async function loadStats(date) {
  try {
    const s = await api(`/api/dashboard/stats?date=${date}`);
    document.getElementById('statsGrid').innerHTML = `
      <div class="stat"><div class="stat-val">${s.total_users}</div><div class="stat-lbl">Total User</div></div>
      <div class="stat"><div class="stat-val">${s.submitted_today}</div><div class="stat-lbl">Submit</div></div>
      <div class="stat"><div class="stat-val ${s.missing_today > 0 ? 'bad' : ''}">${s.missing_today}</div><div class="stat-lbl">Belum</div></div>
      <div class="stat"><div class="stat-val">${s.total_divisions}</div><div class="stat-lbl">Divisi</div></div>
    `;
  } catch (err) {
    console.error(err);
  }
}

async function loadMissing(date) {
  try {
    const missing = await api(`/api/dashboard/missing?date=${date}`);
    const section = document.getElementById('missingSection');
    const list = document.getElementById('missingList');
    const count = document.getElementById('missingCount');

    if (missing.length === 0) { section.style.display = 'none'; return; }

    section.style.display = 'block';
    count.textContent = missing.length;
    list.innerHTML = missing.map(u => `
      <div class="missing-row">
        <div class="missing-indicator"></div>
        <div class="missing-name">${esc(u.name)}</div>
        <div class="missing-div">${esc(u.division_name || '—')}</div>
      </div>
    `).join('');
  } catch (err) {
    console.error(err);
  }
}

async function loadReports(date, divId) {
  const container = document.getElementById('reportsList');
  container.innerHTML = '<div class="loading-center"><div class="spinner"></div></div>';

  try {
    let url = `/api/dashboard?date=${date}`;
    if (divId) url += `&division_id=${divId}`;
    const reports = await api(url);

    if (reports.length === 0) {
      container.innerHTML = `
        <div class="empty">
          <div class="empty-icon">${ICONS.inbox}</div>
          <div class="empty-title">Belum ada report</div>
          <div class="empty-text">Belum ada yang submit untuk tanggal ini</div>
        </div>
      `;
      return;
    }

    container.innerHTML = reports.map(r => {
      const completed = r.items.filter(i => i.category === 'completed');
      const inProgress = r.items.filter(i => i.category === 'in_progress');
      const nextAction = r.items.filter(i => i.category === 'next_action');

      return `
        <div class="rpt-card">
          <div class="rpt-header">
            <div class="rpt-user">
              <div class="rpt-avatar">${getInitials(r.user_name)}</div>
              <div>
                <div class="rpt-name">${esc(r.user_name)}</div>
                <div class="rpt-div">${esc(r.division_name || '—')}</div>
              </div>
            </div>
            <button class="btn btn-ghost btn-sm" onclick="copyTeamReport(${r.id})" title="Copy">${ICONS.copy}</button>
          </div>
          <div class="rpt-body">
            ${renderSection('completed', 'Completed', completed)}
            ${renderSection('in-progress', 'In Progress', inProgress)}
            ${renderSection('next-action', 'Next Action', nextAction)}
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    container.innerHTML = `<div class="empty"><div class="empty-text" style="color:var(--red)">${err.message}</div></div>`;
  }
}

function renderSection(cls, title, items) {
  if (items.length === 0) return '';
  return `
    <div class="rpt-section">
      <div class="rpt-cat ${cls}">${title}</div>
      <ul class="rpt-list">${items.map(i => `<li>${esc(i.content)}</li>`).join('')}</ul>
    </div>
  `;
}

async function copyTeamReport(id) {
  try {
    const data = await api(`/api/reports/${id}`);
    copyToClipboard(generateWhatsAppText(data.report, data.items));
  } catch (err) {
    showToast(err.message, 'error');
  }
}

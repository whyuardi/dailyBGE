// ============================================================
// MY REPORTS — History
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  const user = requireAuth();
  if (!user) return;

  renderNavbar();
  renderBottomNav('my-reports');
  loadReports();
});

async function loadReports() {
  const from = document.getElementById('filterFrom').value;
  const to = document.getElementById('filterTo').value;

  let url = '/api/reports/mine?';
  if (from) url += `from=${from}&`;
  if (to) url += `to=${to}&`;

  const container = document.getElementById('reportsList');
  container.innerHTML = '<div class="loading-center"><div class="spinner"></div></div>';

  try {
    const reports = await api(url);

    if (reports.length === 0) {
      container.innerHTML = `
        <div class="empty">
          <div class="empty-icon">${ICONS.inbox}</div>
          <div class="empty-title">Belum ada report</div>
          <div class="empty-text">Submit daily report pertama Anda</div>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="card">
        ${reports.map(r => `
          <div class="history-item" onclick="viewReport(${r.id})">
            <div>
              <div class="history-date">${formatDate(r.report_date)}</div>
              <div class="history-sub">${formatDateShort(r.report_date)}</div>
            </div>
            <div class="history-badges">
              <span class="badge badge-green">${r.completed_count}</span>
              <span class="badge badge-blue">${r.in_progress_count}</span>
              <span class="badge badge-amber">${r.next_action_count}</span>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<div class="empty"><div class="empty-text" style="color:var(--red)">${err.message}</div></div>`;
  }
}

async function viewReport(reportId) {
  try {
    const data = await api(`/api/reports/${reportId}`);
    const { report, items } = data;

    const completed = items.filter(i => i.category === 'completed');
    const inProgress = items.filter(i => i.category === 'in_progress');
    const nextAction = items.filter(i => i.category === 'next_action');

    openModal(`
      <div class="modal-box">
        <div class="modal-head">
          <div class="modal-title">${formatDate(report.report_date)}</div>
          <button class="modal-x" onclick="closeModal()">${ICONS.x}</button>
        </div>

        ${renderSection('completed', 'Completed', completed)}
        ${renderSection('in-progress', 'In Progress', inProgress)}
        ${renderSection('next-action', 'Next Action', nextAction)}

        <div class="modal-foot">
          <button class="btn btn-secondary btn-sm" onclick="copyFromModal(${reportId})">Copy WhatsApp</button>
          <button class="btn btn-primary btn-sm" onclick="closeModal()">Tutup</button>
        </div>
      </div>
    `);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function renderSection(cls, title, items) {
  if (items.length === 0) return '';
  return `
    <div class="rpt-section" style="margin-bottom:12px">
      <div class="rpt-cat ${cls}">${title}</div>
      <ul class="rpt-list">${items.map(i => `<li>${esc(i.content)}</li>`).join('')}</ul>
    </div>
  `;
}

async function copyFromModal(reportId) {
  try {
    const data = await api(`/api/reports/${reportId}`);
    copyToClipboard(generateWhatsAppText(data.report, data.items));
  } catch (err) {
    showToast(err.message, 'error');
  }
}

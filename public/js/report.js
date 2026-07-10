// ============================================================
// REPORT FORM
// ============================================================

let currentReport = null;
let currentItems = [];

document.addEventListener('DOMContentLoaded', () => {
  const user = requireAuth();
  if (!user) return;

  renderNavbar();
  renderBottomNav('report');

  document.getElementById('reportDate').textContent = formatDate(getToday());
  loadTodayReport();
  document.getElementById('reportForm').addEventListener('submit', submitReport);
});

async function loadTodayReport() {
  try {
    const data = await api('/api/reports/today');

    if (data.report) {
      currentReport = data.report;
      currentItems = data.items;

      document.getElementById('reportStatus').style.display = 'block';
      document.getElementById('reportStatus').innerHTML = `
        <div class="banner banner-green">
          ${ICONS.check}
          Report sudah disubmit hari ini — edit di bawah
        </div>
      `;

      const completed = data.items.filter(i => i.category === 'completed');
      const inProgress = data.items.filter(i => i.category === 'in_progress');
      const nextAction = data.items.filter(i => i.category === 'next_action');

      completed.forEach(i => addItem('completed', i.content));
      inProgress.forEach(i => addItem('in_progress', i.content));
      nextAction.forEach(i => addItem('next_action', i.content));
    } else {
      addItem('completed');
      addItem('in_progress');
      addItem('next_action');
    }
  } catch (err) {
    showToast(err.message, 'error');
    addItem('completed');
    addItem('in_progress');
    addItem('next_action');
  }
}

function addItem(category, value = '') {
  const container = document.getElementById(`${category}Items`);
  const div = document.createElement('div');
  div.className = 'item-row';
  div.innerHTML = `
    <input type="text" class="field-input" placeholder="Tulis pekerjaan..." value="${esc(value)}" data-category="${category}">
    <button type="button" class="item-remove" onclick="removeItem(this)" title="Hapus">${ICONS.x}</button>
  `;
  container.appendChild(div);
  if (!value) div.querySelector('input').focus();
}

function removeItem(btn) {
  const row = btn.closest('.item-row');
  const container = row.parentElement;
  row.remove();
  if (container.children.length === 0) {
    const category = container.id.replace('Items', '');
    addItem(category);
  }
}

function collectItems() {
  const items = [];
  document.querySelectorAll('.item-row input').forEach(input => {
    const content = input.value.trim();
    if (content) {
      items.push({ category: input.dataset.category, content });
    }
  });
  return items;
}

async function submitReport(e) {
  e.preventDefault();
  const items = collectItems();

  if (items.length === 0) {
    showToast('Minimal isi satu item.', 'error');
    return;
  }

  const btn = document.getElementById('submitBtn');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner"></div>';

  try {
    const data = await api('/api/reports', {
      method: 'POST',
      body: JSON.stringify({ items })
    });

    showToast(data.isUpdate ? 'Report diupdate' : 'Report disubmit', 'success');

    document.getElementById('reportStatus').style.display = 'block';
    document.getElementById('reportStatus').innerHTML = `
      <div class="banner banner-green">
        ${ICONS.check}
        Report sudah disubmit hari ini — edit di bawah
      </div>
    `;

    currentReport = { id: data.id, report_date: getToday() };
    currentItems = items;
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Submit Report';
  }
}

function copyReport() {
  const items = collectItems();
  if (items.length === 0) {
    showToast('Tidak ada item untuk disalin.', 'error');
    return;
  }
  const report = currentReport || { report_date: getToday() };
  copyToClipboard(generateWhatsAppText(report, items));
}

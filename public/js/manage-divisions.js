// ============================================================
// MANAGE DIVISIONS — Owner Only
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  const user = requireOwner();
  if (!user) return;

  renderNavbar();
  renderBottomNav('manage-divisions');
  loadDivisions();
});

async function loadDivisions() {
  const container = document.getElementById('divisionsList');
  container.innerHTML = '<div class="loading-center"><div class="spinner"></div></div>';

  try {
    const divisions = await api('/api/divisions');

    if (divisions.length === 0) {
      container.innerHTML = `
        <div class="empty">
          <div class="empty-icon">${ICONS.building}</div>
          <div class="empty-title">Belum ada divisi</div>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="tbl-wrap">
        <table>
          <thead>
            <tr>
              <th>Nama Divisi</th>
              <th style="width:80px"></th>
            </tr>
          </thead>
          <tbody>
            ${divisions.map(d => `
              <tr>
                <td style="font-weight:500;color:var(--text-1)">${esc(d.name)}</td>
                <td>
                  <div style="display:flex;gap:2px;justify-content:flex-end">
                    <button class="btn btn-ghost btn-sm" data-edit-div="${d.id}" data-div-name="${esc(d.name)}" title="Edit">${ICONS.edit}</button>
                    <button class="btn btn-ghost btn-sm" data-delete-div="${d.id}" data-div-name="${esc(d.name)}" title="Hapus">${ICONS.trash}</button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    // M-03: Use event delegation instead of inline onclick with string interpolation
    container.addEventListener('click', (e) => {
      const editBtn = e.target.closest('[data-edit-div]');
      if (editBtn) {
        openEditModal(
          parseInt(editBtn.dataset.editDiv),
          editBtn.dataset.divName
        );
        return;
      }
      const deleteBtn = e.target.closest('[data-delete-div]');
      if (deleteBtn) {
        deleteDivision(
          parseInt(deleteBtn.dataset.deleteDiv),
          deleteBtn.dataset.divName
        );
      }
    });
  } catch (err) {
    container.innerHTML = `<div class="empty"><div class="empty-text" style="color:var(--red)">${esc(err.message)}</div></div>`;
  }
}

function openAddDivisionModal() {
  openModal(`
    <div class="modal-box">
      <div class="modal-head">
        <div class="modal-title">Tambah Divisi</div>
        <button class="modal-x" onclick="closeModal()">${ICONS.x}</button>
      </div>
      <form onsubmit="addDivision(event)">
        <div class="field">
          <label class="field-label">Nama Divisi</label>
          <input type="text" id="mDivName" class="field-input" placeholder="Contoh: IT Department" maxlength="100" required>
        </div>
        <div class="modal-foot">
          <button type="button" class="btn btn-secondary btn-sm" onclick="closeModal()">Batal</button>
          <button type="submit" class="btn btn-primary btn-sm">Simpan</button>
        </div>
      </form>
    </div>
  `);
}

async function addDivision(e) {
  e.preventDefault();
  const name = document.getElementById('mDivName').value.trim();
  if (!name) return;

  try {
    await api('/api/divisions', { method: 'POST', body: JSON.stringify({ name }) });
    showToast('Divisi ditambahkan', 'success');
    closeModal();
    loadDivisions();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function openEditModal(id, name) {
  openModal(`
    <div class="modal-box">
      <div class="modal-head">
        <div class="modal-title">Edit Divisi</div>
        <button class="modal-x" onclick="closeModal()">${ICONS.x}</button>
      </div>
      <form id="editDivForm">
        <div class="field">
          <label class="field-label">Nama Divisi</label>
          <input type="text" id="mDivName" class="field-input" value="${esc(name)}" maxlength="100" required>
        </div>
        <div class="modal-foot">
          <button type="button" class="btn btn-secondary btn-sm" onclick="closeModal()">Batal</button>
          <button type="submit" class="btn btn-primary btn-sm">Update</button>
        </div>
      </form>
    </div>
  `);

  // Use form submit event instead of inline onsubmit to avoid quote issues
  document.getElementById('editDivForm').addEventListener('submit', (e) => {
    e.preventDefault();
    editDivision(id);
  });
}

async function editDivision(id) {
  const name = document.getElementById('mDivName').value.trim();
  if (!name) return;

  try {
    await api(`/api/divisions/${id}`, { method: 'PUT', body: JSON.stringify({ name }) });
    showToast('Divisi diupdate', 'success');
    closeModal();
    loadDivisions();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteDivision(id, name) {
  if (!confirm(`Hapus divisi "${name}"?`)) return;
  try {
    await api(`/api/divisions/${id}`, { method: 'DELETE' });
    showToast('Divisi dihapus', 'info');
    loadDivisions();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

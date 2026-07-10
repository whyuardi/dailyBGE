// ============================================================
// MANAGE USERS — Owner Only
// ============================================================

let allDivisions = [];
let allUsersCache = [];

document.addEventListener('DOMContentLoaded', () => {
  const user = requireOwner();
  if (!user) return;

  renderNavbar();
  renderBottomNav('manage-users');
  loadData();
});

async function loadData() {
  try {
    allDivisions = await api('/api/divisions');
    await loadUsers();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function loadUsers() {
  const container = document.getElementById('usersList');
  container.innerHTML = '<div class="loading-center"><div class="spinner"></div></div>';

  try {
    const users = await api('/api/users');
    allUsersCache = users;

    if (users.length === 0) {
      container.innerHTML = `
        <div class="empty">
          <div class="empty-icon">${ICONS.users}</div>
          <div class="empty-title">Belum ada karyawan</div>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="tbl-wrap">
        <table>
          <thead>
            <tr>
              <th>Nama</th>
              <th>No. HP</th>
              <th>Divisi</th>
              <th>Role</th>
              <th>Status</th>
              <th style="width:80px"></th>
            </tr>
          </thead>
          <tbody>
            ${users.map(u => `
              <tr style="opacity:${u.is_active ? 1 : 0.45}">
                <td style="font-weight:500;color:var(--text-1)">${esc(u.name)}</td>
                <td>${esc(u.phone)}</td>
                <td>${esc(u.division_name || '—')}</td>
                <td><span class="badge ${u.role === 'owner' ? 'badge-amber' : 'badge-blue'}">${u.role === 'owner' ? 'Owner' : 'Karyawan'}</span></td>
                <td><span class="badge ${u.is_active ? 'badge-green' : 'badge-red'}">${u.is_active ? 'Aktif' : 'Nonaktif'}</span></td>
                <td>
                  <div style="display:flex;gap:2px;justify-content:flex-end">
                    <button class="btn btn-ghost btn-sm" data-edit-user="${u.id}" title="Edit">${ICONS.edit}</button>
                    ${u.is_active
                      ? `<button class="btn btn-ghost btn-sm" data-deactivate-user="${u.id}" title="Nonaktifkan">${ICONS.ban}</button>`
                      : `<button class="btn btn-ghost btn-sm" data-reactivate-user="${u.id}" title="Aktifkan">${ICONS.check}</button>`
                    }
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    // M-04: Use event delegation instead of inline onclick to avoid quote injection
    container.addEventListener('click', (e) => {
      const editBtn = e.target.closest('[data-edit-user]');
      if (editBtn) {
        const userId = parseInt(editBtn.dataset.editUser);
        const userData = allUsersCache.find(u => u.id === userId);
        if (userData) openEditUserModal(userData);
        return;
      }
      const deactivateBtn = e.target.closest('[data-deactivate-user]');
      if (deactivateBtn) {
        const userId = parseInt(deactivateBtn.dataset.deactivateUser);
        const userData = allUsersCache.find(u => u.id === userId);
        if (userData) deactivateUser(userId, userData.name);
        return;
      }
      const reactivateBtn = e.target.closest('[data-reactivate-user]');
      if (reactivateBtn) {
        reactivateUser(parseInt(reactivateBtn.dataset.reactivateUser));
      }
    });
  } catch (err) {
    container.innerHTML = `<div class="empty"><div class="empty-text" style="color:var(--red)">${esc(err.message)}</div></div>`;
  }
}

function divOpts(selected = '') {
  return allDivisions.map(d =>
    `<option value="${d.id}" ${d.id == selected ? 'selected' : ''}>${esc(d.name)}</option>`
  ).join('');
}

function openAddUserModal() {
  openModal(`
    <div class="modal-box">
      <div class="modal-head">
        <div class="modal-title">Tambah Karyawan</div>
        <button class="modal-x" onclick="closeModal()">${ICONS.x}</button>
      </div>
      <form onsubmit="addUser(event)">
        <div class="field">
          <label class="field-label">Nama</label>
          <input type="text" id="mName" class="field-input" placeholder="Nama lengkap" maxlength="100" required>
        </div>
        <div class="field">
          <label class="field-label">Nomor HP</label>
          <input type="tel" id="mPhone" class="field-input" placeholder="08123456789" maxlength="20" required>
        </div>
        <div class="field">
          <label class="field-label">Divisi</label>
          <select id="mDiv" class="field-select" required><option value="">Pilih</option>${divOpts()}</select>
        </div>
        <div class="field">
          <label class="field-label">Role</label>
          <select id="mRole" class="field-select">
            <option value="karyawan">Karyawan</option>
            <option value="owner">Owner</option>
          </select>
        </div>
        <div class="field">
          <label class="field-label">PIN (4 digit)</label>
          <input type="text" id="mPin" class="field-input" placeholder="1234" maxlength="4" inputmode="numeric" pattern="[0-9]{4}" required>
          <div class="field-hint">PIN awal untuk login</div>
        </div>
        <div class="modal-foot">
          <button type="button" class="btn btn-secondary btn-sm" onclick="closeModal()">Batal</button>
          <button type="submit" class="btn btn-primary btn-sm">Simpan</button>
        </div>
      </form>
    </div>
  `);
}

async function addUser(e) {
  e.preventDefault();
  try {
    await api('/api/users', {
      method: 'POST',
      body: JSON.stringify({
        name: document.getElementById('mName').value.trim(),
        phone: document.getElementById('mPhone').value.trim(),
        division_id: parseInt(document.getElementById('mDiv').value),
        role: document.getElementById('mRole').value,
        pin: document.getElementById('mPin').value.trim()
      })
    });
    showToast('Karyawan ditambahkan', 'success');
    closeModal();
    loadUsers();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function openEditUserModal(u) {
  openModal(`
    <div class="modal-box">
      <div class="modal-head">
        <div class="modal-title">Edit Karyawan</div>
        <button class="modal-x" onclick="closeModal()">${ICONS.x}</button>
      </div>
      <form id="editUserForm">
        <div class="field">
          <label class="field-label">Nama</label>
          <input type="text" id="mName" class="field-input" value="${esc(u.name)}" maxlength="100" required>
        </div>
        <div class="field">
          <label class="field-label">Nomor HP</label>
          <input type="tel" id="mPhone" class="field-input" value="${esc(u.phone)}" maxlength="20" required>
        </div>
        <div class="field">
          <label class="field-label">Divisi</label>
          <select id="mDiv" class="field-select" required>${divOpts(u.division_id)}</select>
        </div>
        <div class="field">
          <label class="field-label">Role</label>
          <select id="mRole" class="field-select">
            <option value="karyawan" ${u.role === 'karyawan' ? 'selected' : ''}>Karyawan</option>
            <option value="owner" ${u.role === 'owner' ? 'selected' : ''}>Owner</option>
          </select>
        </div>
        <div class="field">
          <label class="field-label">PIN baru (kosongkan jika tidak diubah)</label>
          <input type="text" id="mPin" class="field-input" placeholder="••••" maxlength="4" inputmode="numeric" pattern="[0-9]{4}">
        </div>
        <div class="modal-foot">
          <button type="button" class="btn btn-secondary btn-sm" onclick="closeModal()">Batal</button>
          <button type="submit" class="btn btn-primary btn-sm">Update</button>
        </div>
      </form>
    </div>
  `);

  // Use addEventListener to avoid quote injection in inline onsubmit
  document.getElementById('editUserForm').addEventListener('submit', (e) => {
    e.preventDefault();
    editUser(u.id);
  });
}

async function editUser(id) {
  const data = {
    name: document.getElementById('mName').value.trim(),
    phone: document.getElementById('mPhone').value.trim(),
    division_id: parseInt(document.getElementById('mDiv').value),
    role: document.getElementById('mRole').value,
  };
  const pin = document.getElementById('mPin').value.trim();
  if (pin) data.pin = pin;

  try {
    await api(`/api/users/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    showToast('Data diupdate', 'success');
    closeModal();
    loadUsers();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deactivateUser(id, name) {
  if (!confirm(`Nonaktifkan ${name}?`)) return;
  try {
    await api(`/api/users/${id}`, { method: 'DELETE' });
    showToast('Karyawan dinonaktifkan', 'info');
    loadUsers();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function reactivateUser(id) {
  try {
    await api(`/api/users/${id}`, { method: 'PUT', body: JSON.stringify({ is_active: true }) });
    showToast('Karyawan diaktifkan', 'success');
    loadUsers();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ============================================================
// SHARED UTILITIES — Benua Green Energy Daily Report
// ============================================================

const API_BASE = '';

// --- SVG Icons ---
const ICONS = {
  zap: '<svg viewBox="0 0 24 24"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>',
  logout: '<svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
  check: '<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>',
  x: '<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  clipboard: '<svg viewBox="0 0 24 24"><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>',
  barChart: '<svg viewBox="0 0 24 24"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
  fileText: '<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
  users: '<svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>',
  building: '<svg viewBox="0 0 24 24"><rect x="4" y="2" width="16" height="20" rx="2" ry="2"/><line x1="9" y1="22" x2="9" y2="2"/><line x1="15" y1="22" x2="15" y2="2"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="17" x2="20" y2="17"/></svg>',
  clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  save: '<svg viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>',
  copy: '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>',
  alert: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
  inbox: '<svg viewBox="0 0 24 24"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/></svg>',
  ban: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>',
};

// --- Auth Helpers ---
function getUser() {
  const data = localStorage.getItem('bge_user');
  return data ? JSON.parse(data) : null;
}

function getToken() {
  return localStorage.getItem('bge_token') || '';
}

function setUser(user, token) {
  localStorage.setItem('bge_user', JSON.stringify(user));
  if (token) {
    localStorage.setItem('bge_token', token);
  }
}

function logout() {
  localStorage.removeItem('bge_user');
  localStorage.removeItem('bge_token');
  window.location.href = '/';
}

function requireAuth() {
  const user = getUser();
  if (!user) {
    window.location.href = '/';
    return null;
  }
  return user;
}

function requireOwner() {
  const user = requireAuth();
  if (user && user.role !== 'owner') {
    window.location.href = '/report.html';
    return null;
  }
  return user;
}

// --- API Helper ---
async function api(endpoint, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...options.headers
  };

  const res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
  const data = await res.json();

  if (!res.ok) {
    // If unauthorized, clear session and redirect
    if (res.status === 401) {
      localStorage.removeItem('bge_user');
      localStorage.removeItem('bge_token');
      window.location.href = '/';
      return;
    }
    throw new Error(data.error || 'Terjadi kesalahan.');
  }

  return data;
}

// --- Toast (C-05: XSS fix — use textContent for message) ---
function showToast(message, type = 'success') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const iconMap = {
    success: ICONS.check,
    error: ICONS.x,
    info: ICONS.alert
  };

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  // Build toast safely: icon via innerHTML (trusted), message via textContent
  const iconSpan = document.createElement('span');
  iconSpan.innerHTML = iconMap[type] || '';
  const msgSpan = document.createElement('span');
  msgSpan.textContent = message;

  toast.appendChild(iconSpan);
  toast.appendChild(msgSpan);
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-8px)';
    toast.style.transition = 'all 0.2s';
    setTimeout(() => toast.remove(), 200);
  }, 3000);
}

// --- Navbar ---
function renderNavbar() {
  const user = getUser();
  if (!user) return;

  const el = document.getElementById('topbar');
  if (!el) return;

  el.innerHTML = `
    <div class="topbar-left">
      <div class="topbar-mark">${ICONS.zap}</div>
      <span class="topbar-name">BGE Daily Report</span>
    </div>
    <div class="topbar-right">
      <span class="topbar-user">${esc(user.name)}</span>
      <span class="topbar-badge ${user.role}">${user.role === 'owner' ? 'Owner' : 'Karyawan'}</span>
      <button class="topbar-logout" onclick="logout()" title="Keluar">${ICONS.logout}</button>
    </div>
  `;
}

// --- Bottom Nav ---
function renderBottomNav(active) {
  const user = getUser();
  if (!user) return;

  const el = document.getElementById('bottomnav');
  if (!el) return;

  const isOwner = user.role === 'owner';

  const items = isOwner ? [
    { href: '/dashboard.html', icon: ICONS.barChart, label: 'Dashboard', id: 'dashboard' },
    { href: '/report.html', icon: ICONS.edit, label: 'Report', id: 'report' },
    { href: '/my-reports.html', icon: ICONS.clock, label: 'Riwayat', id: 'my-reports' },
    { href: '/manage-users.html', icon: ICONS.users, label: 'Karyawan', id: 'manage-users' },
    { href: '/manage-divisions.html', icon: ICONS.building, label: 'Divisi', id: 'manage-divisions' },
  ] : [
    { href: '/report.html', icon: ICONS.edit, label: 'Report', id: 'report' },
    { href: '/my-reports.html', icon: ICONS.clock, label: 'Riwayat', id: 'my-reports' },
  ];

  el.innerHTML = `
    <div class="bottomnav-inner">
      ${items.map(i => `
        <a href="${i.href}" class="bottomnav-item ${active === i.id ? 'active' : ''}">
          ${i.icon}
          <span>${i.label}</span>
        </a>
      `).join('')}
    </div>
  `;
}

// --- Date Formatting ---
function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function formatDateShort(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

// --- L-04: Fix getToday() to use local timezone instead of UTC ---
function getToday() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getInitials(name) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

// --- WhatsApp Text ---
function generateWhatsAppText(report, items) {
  const date = formatDate(report.report_date);
  let text = `*Daily Report - ${date}*\n\n`;

  const cats = [
    { key: 'completed', title: 'Completed', marker: '✓' },
    { key: 'in_progress', title: 'In Progress', marker: '·' },
    { key: 'next_action', title: 'Next Action', marker: '·' },
  ];

  for (const cat of cats) {
    const list = items.filter(i => i.category === cat.key);
    if (list.length > 0) {
      text += `*${cat.title}*\n`;
      list.forEach(i => { text += `${cat.marker} ${i.content}\n`; });
      text += '\n';
    }
  }

  return text.trim();
}

// --- Clipboard ---
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast('Tersalin ke clipboard', 'success');
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast('Tersalin ke clipboard', 'success');
  }
}

// --- Modal ---
function openModal(html) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-bg';
  overlay.innerHTML = html;
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });
  document.body.appendChild(overlay);
}

function closeModal() {
  const overlay = document.querySelector('.modal-bg');
  if (overlay) {
    overlay.style.opacity = '0';
    setTimeout(() => overlay.remove(), 150);
  }
}

// --- Escape HTML ---
function esc(text) {
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}

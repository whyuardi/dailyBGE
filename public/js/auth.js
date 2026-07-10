// ============================================================
// AUTH — Login Logic
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  // If already logged in, redirect
  const user = getUser();
  if (user) {
    if (user.role === 'owner') {
      window.location.href = '/dashboard.html';
    } else {
      window.location.href = '/report.html';
    }
    return;
  }

  const form = document.getElementById('loginForm');
  const loginBtn = document.getElementById('loginBtn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const phone = document.getElementById('phone').value.trim();
    const pin = document.getElementById('pin').value.trim();

    if (!phone || !pin) {
      showToast('Nomor HP dan PIN wajib diisi.', 'error');
      return;
    }

    if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      showToast('PIN harus 4 digit angka.', 'error');
      return;
    }

    loginBtn.disabled = true;
    loginBtn.innerHTML = '<div class="spinner"></div> Memproses...';

    try {
      const data = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ phone, pin })
      });

      // C-01: Store JWT token alongside user data
      setUser(data.user, data.token);
      showToast(`Selamat datang, ${data.user.name}!`, 'success');

      setTimeout(() => {
        if (data.user.role === 'owner') {
          window.location.href = '/dashboard.html';
        } else {
          window.location.href = '/report.html';
        }
      }, 500);
    } catch (err) {
      showToast(err.message, 'error');
      loginBtn.disabled = false;
      loginBtn.textContent = 'Masuk';
    }
  });
});

const AUTH_STORAGE_KEY = 'cpa-review-schedule-authenticated';
const AUTH_PASSWORD_HASH_KEY = 'cpa-review-schedule-password-hash';

// 初期パスワード: cpa2024
const DEFAULT_PASSWORD_HASH = '9b0e77f85b0fc812ed69632c19fcc146d1e575c236b8b7a365cf538c0884d20d';

function isAppAuthenticated() {
  return localStorage.getItem(AUTH_STORAGE_KEY) === '1';
}

function setAppAuthenticated() {
  localStorage.setItem(AUTH_STORAGE_KEY, '1');
}

function clearAppAuthentication() {
  localStorage.removeItem(AUTH_STORAGE_KEY);
}

function getStoredPasswordHash() {
  return localStorage.getItem(AUTH_PASSWORD_HASH_KEY) || DEFAULT_PASSWORD_HASH;
}

function setStoredPasswordHash(hash) {
  localStorage.setItem(AUTH_PASSWORD_HASH_KEY, hash);
}

async function hashText(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function verifyAppPassword(password) {
  if (!password) return false;
  const hash = await hashText(password);
  return hash === getStoredPasswordHash();
}

async function changeAppPassword(currentPassword, newPassword, confirmPassword) {
  if (!newPassword) {
    return { ok: false, error: '新しいパスワードを入力してください' };
  }
  if (newPassword !== confirmPassword) {
    return { ok: false, error: '新しいパスワードと確認用パスワードが一致しません' };
  }
  const currentOk = await verifyAppPassword(currentPassword);
  if (!currentOk) {
    return { ok: false, error: '現在のパスワードが正しくありません' };
  }
  const newHash = await hashText(newPassword);
  setStoredPasswordHash(newHash);
  return { ok: true };
}

function showAuthLock() {
  const lock = document.getElementById('auth-lock');
  if (lock) lock.hidden = false;
}

function hideAuthLock() {
  const lock = document.getElementById('auth-lock');
  if (lock) lock.hidden = true;
}

function bindAuthLockEvents(onAuthenticated) {
  const form = document.getElementById('auth-form');
  const passwordInput = document.getElementById('auth-password');
  const errorEl = document.getElementById('auth-error');
  if (!form || !passwordInput) return;

  const submit = async () => {
    const ok = await verifyAppPassword(passwordInput.value);
    if (!ok) {
      if (errorEl) errorEl.hidden = false;
      passwordInput.select();
      return;
    }
    if (errorEl) errorEl.hidden = true;
    setAppAuthenticated();
    hideAuthLock();
    passwordInput.value = '';
    onAuthenticated();
  };

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submit();
  });

  passwordInput.addEventListener('input', () => {
    if (errorEl) errorEl.hidden = true;
  });
}

function initAuth(onAuthenticated) {
  if (isAppAuthenticated()) {
    hideAuthLock();
    onAuthenticated();
    return;
  }

  showAuthLock();
  bindAuthLockEvents(onAuthenticated);
}

function logoutApp() {
  clearAppAuthentication();
  location.reload();
}

function initAuthLogoutButton() {
  const btn = document.getElementById('auth-logout-btn');
  if (!btn || btn.dataset.bound) return;
  btn.dataset.bound = '1';
  btn.addEventListener('click', () => {
    if (confirm('ログアウトしますか？次回起動時にパスワード入力が必要になります。')) {
      logoutApp();
    }
  });
}

function openPasswordChangeModal() {
  const overlay = document.getElementById('password-modal-overlay');
  const form = document.getElementById('password-change-form');
  const errorEl = document.getElementById('password-change-error');
  if (!overlay || !form) return;

  form.reset();
  if (errorEl) {
    errorEl.hidden = true;
    errorEl.textContent = '';
  }
  overlay.hidden = false;
  const currentInput = document.getElementById('password-current');
  if (currentInput) setTimeout(() => currentInput.focus(), 100);
}

function closePasswordChangeModal() {
  const overlay = document.getElementById('password-modal-overlay');
  const form = document.getElementById('password-change-form');
  if (overlay) overlay.hidden = true;
  if (form) form.reset();
}

function initPasswordChangeUI(showToastMessage) {
  const openBtn = document.getElementById('open-password-change-btn');
  const overlay = document.getElementById('password-modal-overlay');
  const form = document.getElementById('password-change-form');
  const cancelBtn = document.getElementById('password-change-cancel');
  const errorEl = document.getElementById('password-change-error');

  if (!openBtn || !overlay || !form || openBtn.dataset.bound) return;
  openBtn.dataset.bound = '1';

  openBtn.addEventListener('click', () => {
    openPasswordChangeModal();
  });

  cancelBtn?.addEventListener('click', () => {
    closePasswordChangeModal();
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closePasswordChangeModal();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const current = document.getElementById('password-current')?.value || '';
    const next = document.getElementById('password-new')?.value || '';
    const confirm = document.getElementById('password-confirm')?.value || '';

    const result = await changeAppPassword(current, next, confirm);
    if (!result.ok) {
      if (errorEl) {
        errorEl.textContent = result.error;
        errorEl.hidden = false;
      }
      return;
    }

    closePasswordChangeModal();
    if (typeof showToastMessage === 'function') {
      showToastMessage('パスワードを変更しました');
    }
  });

  ['password-current', 'password-new', 'password-confirm'].forEach((id) => {
    document.getElementById(id)?.addEventListener('input', () => {
      if (errorEl) errorEl.hidden = true;
    });
  });
}

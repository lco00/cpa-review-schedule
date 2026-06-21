const AUTH_STORAGE_KEY = 'cpa-review-schedule-authenticated';

// 初期パスワード: cpa2024
// 変更する場合はこのハッシュを書き換えてください（SHA-256）
const EXPECTED_PASSWORD_HASH = '9b0e77f85b0fc812ed69632c19fcc146d1e575c236b8b7a365cf538c0884d20d';

function isAppAuthenticated() {
  return localStorage.getItem(AUTH_STORAGE_KEY) === '1';
}

function setAppAuthenticated() {
  localStorage.setItem(AUTH_STORAGE_KEY, '1');
}

function clearAppAuthentication() {
  localStorage.removeItem(AUTH_STORAGE_KEY);
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
  return hash === EXPECTED_PASSWORD_HASH;
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

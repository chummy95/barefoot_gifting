/* Shared helper for the admin dashboard: auth + fetch wrapper */
const AdminAPI = {
  tokenKey: 'bfg_admin_token',
  userKey: 'bfg_admin_user',

  getToken() { return localStorage.getItem(this.tokenKey); },
  getUser() { try { return JSON.parse(localStorage.getItem(this.userKey) || 'null'); } catch { return null; } },

  login(token, user) {
    localStorage.setItem(this.tokenKey, token);
    localStorage.setItem(this.userKey, JSON.stringify(user));
  },

  logout() {
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.userKey);
    location.href = './index.html';
  },

  requireAuth() {
    const token = this.getToken();
    const user = this.getUser();
    if (!token || !user || user.role !== 'admin') {
      location.href = './index.html';
      return false;
    }
    return true;
  },

  async request(path, options = {}) {
    const res = await fetch(`/api${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.getToken()}`,
        ...(options.headers || {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    if (res.status === 401) { this.logout(); return; }
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || 'Request failed');
    }
    if (res.status === 204) return null;
    return res.json();
  },

  get(path) { return this.request(path); },
  post(path, body) { return this.request(path, { method: 'POST', body }); },
  put(path, body) { return this.request(path, { method: 'PUT', body }); },
  patch(path, body) { return this.request(path, { method: 'PATCH', body }); },
  del(path) { return this.request(path, { method: 'DELETE' }); },

  money(n) { return '₦' + Number(n || 0).toLocaleString(); },
  date(s) { return new Date(s).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }); },

  /* Reads a File as base64 for the simple media-upload endpoint */
  fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  },

  async uploadFile(file, alt) {
    const dataBase64 = await this.fileToBase64(file);
    return this.post('/media', { filename: file.name, contentType: file.type, dataBase64, alt });
  },
};

/* Renders the sidebar nav + wires the logout button. Call on every page. */
function renderAdminShell(active) {
  const user = AdminAPI.getUser();
  const brand = document.querySelector('.brand');
  if (brand) {
    brand.innerHTML = '<img src="../Png Files/Artboard 1 copy 10@2x.png" alt="Barefoot Gifting">';
  }
  const nav = document.querySelector('.sidebar nav');
  if (nav && !nav.querySelector('[data-nav="posts"]')) {
    const mediaLink = nav.querySelector('[data-nav="media"]');
    const postsLink = document.createElement('a');
    postsLink.href = './posts.html';
    postsLink.dataset.nav = 'posts';
    postsLink.textContent = '📝 Keepsake Edit';
    if (mediaLink) nav.insertBefore(postsLink, mediaLink);
    else nav.appendChild(postsLink);
  }
  document.querySelectorAll('[data-nav]').forEach(a => {
    if (a.dataset.nav === active) a.classList.add('active');
  });
  const who = document.querySelector('[data-who]');
  if (who && user) who.textContent = `${user.name} (${user.email})`;
  const logoutBtn = document.querySelector('[data-logout]');
  if (logoutBtn) logoutBtn.addEventListener('click', () => AdminAPI.logout());
}

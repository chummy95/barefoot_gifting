/* Shared helper for the customer account dashboard */
const AccountAPI = {
  tokenKey: 'bfg_account_token',
  userKey: 'bfg_account_user',

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
    if (!token || !user) { location.href = './index.html'; return false; }
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

  money(n) { return '₦' + Number(n || 0).toLocaleString(); },
  date(s) { return new Date(s).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }); },
};

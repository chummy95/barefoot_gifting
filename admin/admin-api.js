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
    const hasBody = options.body !== undefined;
    const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
    const headers = {
      Authorization: `Bearer ${this.getToken()}`,
      ...(options.headers || {}),
    };
    if (hasBody && !isFormData && !headers['Content-Type'] && !headers['content-type']) {
      headers['Content-Type'] = 'application/json';
    }

    let res;
    try {
      res = await fetch(`/api${path}`, {
        ...options,
        headers,
        body: hasBody ? (isFormData ? options.body : JSON.stringify(options.body)) : undefined,
      });
    } catch (error) {
      throw new Error(error?.message || 'Network request failed');
    }

    if (res.status === 401) { this.logout(); return; }
    if (!res.ok) {
      const raw = await res.text().catch(() => '');
      let message = '';
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          message = parsed.error || parsed.message || '';
        } catch {
          message = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        }
      }
      if (!message) message = res.status ? `HTTP ${res.status}` : 'Request failed';
      if (message.length > 220) message = `${message.slice(0, 217)}...`;
      throw new Error(message);
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

  blobToBase64(blob) {
    return this.fileToBase64(blob);
  },

  loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Could not read image'));
      };
      image.src = url;
    });
  },

  canvasToBlob(canvas, type, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Could not process image'));
      }, type, quality);
    });
  },

  renameForMimeType(filename, mimeType) {
    const base = String(filename || 'upload')
      .replace(/\.[^.]+$/, '')
      .trim() || 'upload';
    const ext = mimeType === 'image/webp'
      ? '.webp'
      : mimeType === 'image/jpeg'
        ? '.jpg'
        : mimeType === 'image/png'
          ? '.png'
          : '';
    return `${base}${ext}`;
  },

  async prepareImageForUpload(file) {
    const originalType = String(file?.type || '');
    const isImage = originalType.startsWith('image/');
    const shouldOptimize = isImage && !['image/svg+xml', 'image/gif'].includes(originalType);
    const targetMaxBytes = 1.5 * 1024 * 1024;

    if (!shouldOptimize) {
      return {
        file,
        filename: file.name,
        contentType: file.type || 'application/octet-stream',
        size: file.size,
      };
    }

    if (file.size <= targetMaxBytes && originalType !== 'image/png') {
      return {
        file,
        filename: file.name,
        contentType: file.type || 'application/octet-stream',
        size: file.size,
      };
    }

    try {
      const image = await this.loadImage(file);
      let width = image.naturalWidth || image.width;
      let height = image.naturalHeight || image.height;
      const maxDimension = 1800;
      const scale = Math.min(1, maxDimension / Math.max(width, height));
      width = Math.max(1, Math.round(width * scale));
      height = Math.max(1, Math.round(height * scale));

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas not supported');

      let outputType = originalType === 'image/png' || originalType === 'image/webp'
        ? 'image/webp'
        : 'image/jpeg';
      let quality = outputType === 'image/jpeg' ? 0.84 : 0.82;
      let bestBlob = null;

      for (let attempt = 0; attempt < 7; attempt += 1) {
        canvas.width = width;
        canvas.height = height;
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(image, 0, 0, width, height);

        const blob = await this.canvasToBlob(canvas, outputType, quality);
        bestBlob = blob;
        if (blob.size <= targetMaxBytes) break;

        if (quality > 0.58) {
          quality -= 0.08;
        } else {
          width = Math.max(320, Math.round(width * 0.85));
          height = Math.max(320, Math.round(height * 0.85));
          quality = outputType === 'image/jpeg' ? 0.8 : 0.78;
        }
      }

      if (!bestBlob || bestBlob.size >= file.size) {
        return {
          file,
          filename: file.name,
          contentType: file.type || 'application/octet-stream',
          size: file.size,
        };
      }

      return {
        file: bestBlob,
        filename: this.renameForMimeType(file.name, bestBlob.type || outputType),
        contentType: bestBlob.type || outputType,
        size: bestBlob.size,
      };
    } catch {
      return {
        file,
        filename: file.name,
        contentType: file.type || 'application/octet-stream',
        size: file.size,
      };
    }
  },

  async uploadFile(file, alt) {
    const prepared = await this.prepareImageForUpload(file);
    const dataBase64 = await this.blobToBase64(prepared.file);
    return this.post('/media', {
      filename: prepared.filename,
      contentType: prepared.contentType,
      dataBase64,
      alt,
      originalFilename: file.name,
      originalSize: file.size,
      processedSize: prepared.size,
    });
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

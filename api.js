// FoodConnect API Client Helper

const API_BASE = '/api';

var api = {
  getToken() {
    try {
      return localStorage.getItem('fc_token');
    } catch (e) {
      return null;
    }
  },

  setToken(token) {
    try {
      if (token) localStorage.setItem('fc_token', token);
      else localStorage.removeItem('fc_token');
    } catch (e) {}
  },

  getUser() {
    try {
      const raw = localStorage.getItem('fc_user');
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  },

  setUser(user) {
    try {
      if (user) localStorage.setItem('fc_user', JSON.stringify(user));
      else localStorage.removeItem('fc_user');
    } catch (e) {}
  },

  logout() {
    this.setToken(null);
    this.setUser(null);
    if (typeof window !== 'undefined' && typeof window.onAuthRequired === 'function') {
      window.onAuthRequired();
    }
  },

  async request(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };

    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const config = {
      ...options,
      headers
    };

    try {
      const res = await fetch(url, config);

      if (res.status === 401) {
        // Do not trigger global auth redirect if the 401 is from the login endpoint itself
        const isLoginEndpoint = endpoint === '/auth/login' || endpoint.startsWith('/auth/login');
        if (!isLoginEndpoint) {
          this.logout();
        }
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || (isLoginEndpoint ? 'Invalid credentials.' : 'Session expired. Please log in again.'));
      }

      // Check for file downloads (like CSV)
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('text/csv')) {
        return res.blob();
      }

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Request failed with status ${res.status}`);
      }

      return data;
    } catch (err) {
      throw err;
    }
  },

  get(endpoint) {
    return this.request(endpoint, { method: 'GET' });
  },

  post(endpoint, body) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(body)
    });
  },

  put(endpoint, body) {
    return this.request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(body)
    });
  },

  patch(endpoint, body) {
    return this.request(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(body)
    });
  },

  delete(endpoint) {
    return this.request(endpoint, { method: 'DELETE' });
  },

  // Auth helper
  async login(email, password, role) {
    const data = await this.post('/auth/login', { email, password, role });
    this.setToken(data.token);
    this.setUser(data.user);
    return data;
  }
};

// Expose globally
if (typeof window !== 'undefined') {
  window.api = api;
}
if (typeof globalThis !== 'undefined') {
  globalThis.api = api;
}

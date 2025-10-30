// API Configuration
const API_URL = 'http://localhost:5000/api';
const SOCKET_URL = 'http://localhost:5000';

// API Client Class
class DisputeAPI {
  constructor() {
    this.token = localStorage.getItem('auth_token');
  }

  // Helper method for API calls
  async request(endpoint, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    if (this.token && !options.skipAuth) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const config = {
      ...options,
      headers
    };

    try {
      const response = await fetch(`${API_URL}${endpoint}`, config);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Request failed');
      }

      return data;
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  }

  // Auth Methods
  async login(email, password) {
    const data = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
      skipAuth: true
    });

    if (data.success && data.data.token) {
      this.token = data.data.token;
      localStorage.setItem('auth_token', this.token);
      localStorage.setItem('user', JSON.stringify(data.data.user));
    }

    return data;
  }

  async logout() {
    this.token = null;
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user');
  }

  async getCurrentUser() {
    return this.request('/auth/me');
  }

  // Dispute Methods
  async submitDispute(formData) {
    // formData is FormData object with files
    const response = await fetch(`${API_URL}/disputes`, {
      method: 'POST',
      body: formData // Don't set Content-Type for FormData
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to submit dispute');
    }

    return data;
  }

  async getDisputes(filters = {}) {
    const params = new URLSearchParams(filters);
    return this.request(`/disputes?${params}`);
  }

  async getDispute(id) {
    return this.request(`/disputes/${id}`);
  }

  async updateDispute(id, updates) {
    return this.request(`/disputes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates)
    });
  }

  async getDashboardStats() {
    return this.request('/disputes/stats/dashboard');
  }

  // Email Template Methods
  async getEmailTemplates() {
    return this.request('/email/templates');
  }

  async createEmailTemplate(template) {
    return this.request('/email/templates', {
      method: 'POST',
      body: JSON.stringify(template)
    });
  }

  async updateEmailTemplate(id, updates) {
    return this.request(`/email/templates/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates)
    });
  }

  async deleteEmailTemplate(id) {
    return this.request(`/email/templates/${id}`, {
      method: 'DELETE'
    });
  }

  // Email Thread Methods
  async getEmailThreads(filters = {}) {
    const params = new URLSearchParams(filters);
    return this.request(`/email/threads?${params}`);
  }

  async getEmailThread(id) {
    return this.request(`/email/threads/${id}`);
  }

  async sendEmail(emailData) {
    return this.request('/email/send', {
      method: 'POST',
      body: JSON.stringify(emailData)
    });
  }

  // Public website email (no auth)
  async sendPublicEmail(emailData) {
    return this.request('/email/incoming', {
      method: 'POST',
      body: JSON.stringify(emailData),
      skipAuth: true
    });
  }

  async updateEmailThread(id, updates) {
    return this.request(`/email/threads/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates)
    });
  }

  // Chat Methods
  async getChatSessions(filters = {}) {
    const params = new URLSearchParams(filters);
    return this.request(`/chat/sessions?${params}`);
  }

  async getChatSession(id) {
    return this.request(`/chat/sessions/${id}`);
  }

  async updateChatSession(id, updates) {
    return this.request(`/chat/sessions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates)
    });
  }

  async getChatStats() {
    return this.request('/chat/stats');
  }
}

// Export singleton instance
const api = new DisputeAPI();

// Make available globally for easy access
window.api = api;

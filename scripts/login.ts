export {};

type LoginRole = 'super_admin' | 'admin' | 'agent' | 'customer' | string;

type StoredUser = {
  role?: LoginRole;
};

const LOGIN_REDIRECT_DELAY = 900;

function redirectForRole(role?: LoginRole) {
  if (!role) {
    window.location.href = '/track';
    return;
  }

  const normalized = role.toLowerCase();
  if (normalized.includes('admin')) {
    window.location.href = '/admin';
    return;
  }

  window.location.href = '/track';
}

function setMessage(element: HTMLElement | null, message: string, tone: 'error' | 'success') {
  if (!element) return;
  element.textContent = message;
  element.setAttribute('data-tone', tone);
  element.style.display = message ? 'block' : 'none';
}

function setFormDisabled(form: HTMLFormElement, disabled: boolean) {
  const elements = Array.from(form.elements) as HTMLElement[];
  elements.forEach((el) => {
    if ('disabled' in el) {
      (el as HTMLInputElement | HTMLButtonElement).disabled = disabled;
    }
  });
}

function checkExistingSession() {
  const token = localStorage.getItem('auth_token');
  if (!token) return false;

  try {
    const userRaw = localStorage.getItem('user');
    if (!userRaw) return false;
    const user = JSON.parse(userRaw) as StoredUser;
    redirectForRole(user.role);
    return true;
  } catch (error) {
    console.warn('Unable to parse stored user, clearing session.', error);
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user');
    return false;
  }
}

(function initLoginPage() {
  document.addEventListener('DOMContentLoaded', () => {
    if (checkExistingSession()) {
      return;
    }

    const form = document.getElementById('loginForm') as HTMLFormElement | null;
    const messageEl = document.getElementById('loginMessage');
    const passwordInput = document.getElementById('password') as HTMLInputElement | null;
    const emailInput = document.getElementById('email') as HTMLInputElement | null;

    if (!form || !emailInput || !passwordInput) {
      return;
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      setMessage(messageEl, '', 'error');

      const email = emailInput.value.trim();
      const password = passwordInput.value;

      if (!email || !password) {
        setMessage(messageEl, 'Please enter both email and password.', 'error');
        return;
      }

      const apiClient = (window as any).api;

      try {
        setFormDisabled(form, true);
        setMessage(messageEl, 'Signing you in…', 'success');

        const response = await apiClient.login(email, password);
        if (response?.success && response?.data?.user) {
          setMessage(messageEl, 'Login successful. Redirecting…', 'success');
          setTimeout(() => {
            redirectForRole(response.data.user.role as LoginRole);
          }, LOGIN_REDIRECT_DELAY);
          return;
        }

        const errorMessage = response?.error || 'Unable to sign in with those credentials.';
        setMessage(messageEl, errorMessage, 'error');
      } catch (error: any) {
        const message = error?.message || 'Unexpected error while signing in.';
        setMessage(messageEl, message, 'error');
      } finally {
        setFormDisabled(form, false);
      }
    });
  });
})();

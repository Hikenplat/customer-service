export {};

type RegistrationPayload = {
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
  phone?: string;
};

const REDIRECT_DELAY = 1000;

function passwordsMatch(payload: RegistrationPayload) {
  return payload.password && payload.password === payload.confirmPassword;
}

function strongPassword(password: string) {
  if (!password || password.length < 8) return false;
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /\d/.test(password);
  return hasLetter && hasNumber;
}

function setFormDisabled(form: HTMLFormElement, disabled: boolean) {
  const elements = Array.from(form.elements) as HTMLElement[];
  elements.forEach((el) => {
    if ('disabled' in el) {
      (el as HTMLInputElement | HTMLButtonElement).disabled = disabled;
    }
  });
}

function setMessage(element: HTMLElement | null, message: string, tone: 'error' | 'success') {
  if (!element) return;
  element.textContent = message;
  element.setAttribute('data-tone', tone);
  element.style.display = message ? 'block' : 'none';
}

function redirectToDashboard(role?: string) {
  if (role && role.toLowerCase().includes('admin')) {
    window.location.href = '/admin';
    return;
  }
  window.location.href = '/track';
}

(function initRegistrationPage() {
  document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('registrationForm') as HTMLFormElement | null;
    const messageEl = document.getElementById('registerMessage');
    const fullNameInput = document.getElementById('fullName') as HTMLInputElement | null;
    const emailInput = document.getElementById('email') as HTMLInputElement | null;
    const phoneInput = document.getElementById('phone') as HTMLInputElement | null;
    const passwordInput = document.getElementById('password') as HTMLInputElement | null;
    const confirmInput = document.getElementById('confirmPassword') as HTMLInputElement | null;

    if (!form || !fullNameInput || !emailInput || !passwordInput || !confirmInput) {
      return;
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      setMessage(messageEl, '', 'error');

      const payload: RegistrationPayload = {
        fullName: fullNameInput.value.trim(),
        email: emailInput.value.trim().toLowerCase(),
        password: passwordInput.value,
        confirmPassword: confirmInput.value,
        phone: phoneInput?.value.trim() || undefined
      };

      if (!payload.fullName) {
        setMessage(messageEl, 'Please enter your full name.', 'error');
        fullNameInput.focus();
        return;
      }

      if (!payload.email) {
        setMessage(messageEl, 'Please enter a valid email address.', 'error');
        emailInput.focus();
        return;
      }

      if (!passwordsMatch(payload)) {
        setMessage(messageEl, 'Passwords do not match. Please re-enter.', 'error');
        confirmInput.focus();
        return;
      }

      if (!strongPassword(payload.password)) {
        setMessage(messageEl, 'Password must be at least 8 characters and include letters and numbers.', 'error');
        passwordInput.focus();
        return;
      }

      const apiClient = (window as any).api;

      try {
        setFormDisabled(form, true);
        setMessage(messageEl, 'Creating your account…', 'success');

        const response = await apiClient.register({
          fullName: payload.fullName,
          email: payload.email,
          password: payload.password,
          phone: payload.phone
        });

        if (response?.success && response?.data?.user) {
          setMessage(messageEl, 'Account created successfully. Redirecting…', 'success');
          setTimeout(() => redirectToDashboard(response.data.user.role || 'customer'), REDIRECT_DELAY);
          return;
        }

        const errorMessage = response?.error || 'Unable to create your account right now.';
        setMessage(messageEl, errorMessage, 'error');
      } catch (error: any) {
        const message = error?.message || 'Unexpected error while creating your account.';
        setMessage(messageEl, message, 'error');
      } finally {
        setFormDisabled(form, false);
      }
    });
  });
})();

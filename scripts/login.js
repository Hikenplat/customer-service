const LOGIN_REDIRECT_DELAY = 900;
function redirectForRole(role) {
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
function setMessage(element, message, tone) {
    if (!element)
        return;
    element.textContent = message;
    element.setAttribute('data-tone', tone);
    element.style.display = message ? 'block' : 'none';
}
function setFormDisabled(form, disabled) {
    const elements = Array.from(form.elements);
    elements.forEach((el) => {
        if ('disabled' in el) {
            el.disabled = disabled;
        }
    });
}
function checkExistingSession() {
    const token = localStorage.getItem('auth_token');
    if (!token)
        return false;
    try {
        const userRaw = localStorage.getItem('user');
        if (!userRaw)
            return false;
        const user = JSON.parse(userRaw);
        redirectForRole(user.role);
        return true;
    }
    catch (error) {
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
        const form = document.getElementById('loginForm');
        const messageEl = document.getElementById('loginMessage');
        const passwordInput = document.getElementById('password');
        const emailInput = document.getElementById('email');
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
            const apiClient = window.api;
            try {
                setFormDisabled(form, true);
                setMessage(messageEl, 'Signing you in…', 'success');
                const response = await apiClient.login(email, password);
                if (response?.success && response?.data?.user) {
                    setMessage(messageEl, 'Login successful. Redirecting…', 'success');
                    setTimeout(() => {
                        redirectForRole(response.data.user.role);
                    }, LOGIN_REDIRECT_DELAY);
                    return;
                }
                const errorMessage = response?.error || 'Unable to sign in with those credentials.';
                setMessage(messageEl, errorMessage, 'error');
            }
            catch (error) {
                const message = error?.message || 'Unexpected error while signing in.';
                setMessage(messageEl, message, 'error');
            }
            finally {
                setFormDisabled(form, false);
            }
        });
    });
})();
export {};
//# sourceMappingURL=login.js.map
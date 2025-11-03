const REDIRECT_DELAY = 1000;
function passwordsMatch(payload) {
    return payload.password && payload.password === payload.confirmPassword;
}
function strongPassword(password) {
    if (!password || password.length < 8)
        return false;
    const hasLetter = /[a-zA-Z]/.test(password);
    const hasNumber = /\d/.test(password);
    return hasLetter && hasNumber;
}
function setFormDisabled(form, disabled) {
    const elements = Array.from(form.elements);
    elements.forEach((el) => {
        if ('disabled' in el) {
            el.disabled = disabled;
        }
    });
}
function setMessage(element, message, tone) {
    if (!element)
        return;
    element.textContent = message;
    element.setAttribute('data-tone', tone);
    element.style.display = message ? 'block' : 'none';
}
function redirectToDashboard(role) {
    if (role && role.toLowerCase().includes('admin')) {
        window.location.href = '/admin';
        return;
    }
    window.location.href = '/track';
}
(function initRegistrationPage() {
    document.addEventListener('DOMContentLoaded', () => {
        const form = document.getElementById('registrationForm');
        const messageEl = document.getElementById('registerMessage');
        const fullNameInput = document.getElementById('fullName');
        const emailInput = document.getElementById('email');
        const phoneInput = document.getElementById('phone');
        const passwordInput = document.getElementById('password');
        const confirmInput = document.getElementById('confirmPassword');
        if (!form || !fullNameInput || !emailInput || !passwordInput || !confirmInput) {
            return;
        }
        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            setMessage(messageEl, '', 'error');
            const payload = {
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
            const apiClient = window.api;
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
            }
            catch (error) {
                const message = error?.message || 'Unexpected error while creating your account.';
                setMessage(messageEl, message, 'error');
            }
            finally {
                setFormDisabled(form, false);
            }
        });
    });
})();
export {};
//# sourceMappingURL=register.js.map
// Header authentication utility
// Replaces Register/Log on with a welcome message when user is logged in

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function initAuthenticatedHeader() {
  try {
    const userStr = localStorage.getItem('user');
    const headerWrapper = document.querySelector('.header-user-wrapper');
    if (!headerWrapper) return;

    if (userStr) {
      const user = JSON.parse(userStr);
      const name = user.fullName || user.full_name || user.name || '';

      headerWrapper.innerHTML = `
        <div class="header-welcome">
          <span class="welcome-text">Welcome, <strong>${escapeHtml(name)}</strong></span>
          <a class="logout-button btn btn-link" href="#" id="logoutBtn">Logout</a>
        </div>
      `;

      const logoutBtn = document.getElementById('logoutBtn');
      logoutBtn?.addEventListener('click', function(e) {
        e.preventDefault();
        // Clear auth tokens and user
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user');
        // Reload to update UI
        window.location.reload();
      });
    }
  } catch (err) {
    console.error('Error initializing authenticated header:', err);
  }
}

// Expose globally
window.initAuthenticatedHeader = initAuthenticatedHeader;

// Run immediately to update header on page load
try {
  document.addEventListener('DOMContentLoaded', () => {
    initAuthenticatedHeader();
  });
} catch (err) {
  // ignore
}

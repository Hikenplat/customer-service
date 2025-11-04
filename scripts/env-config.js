(function() {
    function normalizeBase(url) {
        if (!url) {
            return null;
        }
        return url.replace(/\/$/, '');
    }

    function detectBackendBase() {
        if (window.DISPUTE_BACKEND_URL) {
            return normalizeBase(window.DISPUTE_BACKEND_URL);
        }

        var origin = window.location.origin;
        var isLocalFrontend = /localhost:8080|127\.0\.0\.1:8080/i.test(origin);
        var fallback = isLocalFrontend ? 'http://localhost:5000' : origin;
        return normalizeBase(fallback);
    }

    var backendBase = detectBackendBase();
    if (!backendBase) {
        return;
    }

    var socketBase = normalizeBase(window.DISPUTE_SOCKET_URL) || backendBase;
    var apiBase = normalizeBase(window.DISPUTE_API_BASE_URL) || backendBase + '/api';

    window.DISPUTE_BACKEND_URL = backendBase;
    window.DISPUTE_SOCKET_URL = socketBase;
    window.DISPUTE_API_BASE_URL = apiBase;
    window.CHAT_SOCKET_URL = window.CHAT_SOCKET_URL || socketBase;

    if (typeof window.io !== 'function') {
        var socketSrc = socketBase + '/socket.io/socket.io.js';
        // document.write keeps script evaluation order the same as static script tags
        document.write('<script src="' + socketSrc + '"><\/script>');
    }
})();

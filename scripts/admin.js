"use strict";
(() => {
    /* Admin Dashboard Script - uses window.api from scripts/api-client.js */
    // Access Socket.IO client via window to avoid ambient redeclarations
    const resolveBackendBaseUrl = () => {
        const configured = window.DISPUTE_BACKEND_URL;
        if (configured) {
            return configured;
        }
        const origin = window.location.origin;
        const isLocalFrontend = /localhost:8080|127\.0\.0\.1:8080/i.test(origin);
        const fallback = isLocalFrontend ? 'http://localhost:5000' : origin;
        return fallback.replace(/\/$/, '');
    };
    const resolveSocketBaseUrl = () => {
        const configured = window.DISPUTE_SOCKET_URL;
        if (configured) {
            return configured.replace(/\/$/, '');
        }
        return resolveBackendBaseUrl();
    };
    const resolveApiBaseUrl = () => {
        const configured = window.DISPUTE_API_BASE_URL;
        if (configured) {
            return configured;
        }
        return `${resolveBackendBaseUrl()}/api`;
    };
    document.addEventListener('DOMContentLoaded', () => {
        const api = window.api;
        const qs = (sel) => document.querySelector(sel);
        const qsa = (sel) => Array.from(document.querySelectorAll(sel));
        const byId = (id) => document.getElementById(id);
        const showToast = (msg) => {
            const t = document.getElementById('toast');
            if (!t)
                return;
            t.innerHTML = `<div class="card" style="min-width:280px;">${msg}</div>`;
            t.style.display = 'block';
            setTimeout(() => { t.style.display = 'none'; }, 4000);
        };
        const runWithButtonState = async (button, loadingLabel, action) => {
            if (!button) {
                await action();
                return;
            }
            const originalLabel = button.textContent ?? '';
            button.disabled = true;
            button.setAttribute('data-loading', 'true');
            button.textContent = loadingLabel;
            try {
                await action();
            }
            finally {
                button.disabled = false;
                button.removeAttribute('data-loading');
                button.textContent = originalLabel;
            }
        };
        const formatBytes = (bytes) => {
            if (!bytes || bytes <= 0)
                return '';
            const units = ['B', 'KB', 'MB', 'GB'];
            let value = bytes;
            let unitIndex = 0;
            while (value >= 1024 && unitIndex < units.length - 1) {
                value /= 1024;
                unitIndex += 1;
            }
            const formatted = unitIndex === 0 ? value.toFixed(0) : value.toFixed(1);
            return `${formatted} ${units[unitIndex]}`;
        };
        const getAttachmentIcon = (mimeType) => {
            if (!mimeType)
                return '📎';
            if (mimeType.includes('pdf'))
                return '📄';
            if (mimeType.includes('word') || mimeType.includes('msword'))
                return '📝';
            if (mimeType.includes('excel') || mimeType.includes('spreadsheet'))
                return '📊';
            if (mimeType.startsWith('text/'))
                return '📑';
            return '📁';
        };
        const normalizeAttachments = (dispute) => {
            const pools = [dispute?.attachments, dispute?.file_uploads, dispute?.fileUploads];
            const sources = pools.filter(Array.isArray).flat();
            const seen = new Set();
            const normalized = [];
            sources.forEach((file) => {
                if (!file)
                    return;
                let attachment = null;
                if (typeof file === 'string') {
                    const url = file;
                    const name = url.split('/').pop() || 'Document';
                    attachment = { name, url, mimeType: '', size: undefined };
                }
                else {
                    const url = file.url || file.secureUrl || file.filePath || file.path;
                    if (!url)
                        return;
                    attachment = {
                        name: file.name || file.originalName || file.fileName || 'Document',
                        url,
                        mimeType: file.mimeType || file.mimetype || '',
                        size: typeof file.size === 'number' ? file.size : undefined
                    };
                }
                if (attachment && !seen.has(attachment.url)) {
                    normalized.push(attachment);
                    seen.add(attachment.url);
                }
            });
            return normalized;
        };
        // Browser notifications helper
        const requestNotificationPermission = async () => {
            if ('Notification' in window && Notification.permission === 'default') {
                const permission = await Notification.requestPermission();
                console.log('Notification permission:', permission);
            }
        };
        const showBrowserNotification = (title, body, tag) => {
            if ('Notification' in window && Notification.permission === 'granted') {
                const notification = new Notification(title, {
                    body,
                    icon: '/favicon.ico',
                    badge: '/favicon.ico',
                    tag: tag || 'dispute-portal',
                    requireInteraction: false
                });
                // Play notification sound
                const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBCN6xPDTgjMGHm7A7+OZURE');
                audio.volume = 0.3;
                audio.play().catch(() => { }); // Ignore errors if audio doesn't play
                // Auto-close after 5 seconds
                setTimeout(() => notification.close(), 5000);
                // Click handler to focus window
                notification.onclick = () => {
                    window.focus();
                    notification.close();
                };
            }
        };
        const loginSection = byId('loginSection');
        const dashboardSection = byId('dashboardSection');
        const loginForm = byId('loginForm');
        const adminEmail = byId('adminEmail');
        const adminPassword = byId('adminPassword');
        const loginError = byId('loginError');
        const logoutBtn = byId('logoutBtn');
        const userBadge = byId('userBadge');
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker
                .getRegistrations()
                .then(regs => regs.forEach(reg => reg.unregister()))
                .catch(() => undefined);
        }
        window.addEventListener('error', (event) => {
            console.error('Admin page error:', event.message, 'at', `${event.filename}:${event.lineno}:${event.colno}`);
            if (loginError && event?.message) {
                loginError.textContent = `Error: ${event.message}${event.filename ? ` (${event.filename})` : ''}`;
                loginError.style.display = 'block';
                loginError.style.color = '#b91c1c';
            }
        });
        // Tabs
        const tabs = qsa('.tab-btn');
        const tabPanels = ['disputesTab', 'emailsTab', 'threadsTab', 'chatTab', 'statsTab']
            .map(id => byId(id))
            .filter(Boolean);
        // Disputes elements
        const disputesTbody = byId('disputesTableBody');
        const filterStatus = byId('filterStatus');
        const filterSearch = byId('filterSearch');
        const refreshDisputes = byId('refreshDisputes');
        // Templates
        const templatesList = byId('templatesList');
        const templateForm = byId('templateForm');
        const tplName = byId('tplName');
        const tplSubject = byId('tplSubject');
        const tplBody = byId('tplBody');
        const emailConfigStatus = byId('emailConfigStatus');
        const emailConfigProvider = byId('emailConfigProvider');
        const emailConfigFrom = byId('emailConfigFrom');
        const emailConfigHost = byId('emailConfigHost');
        const emailConfigSecure = byId('emailConfigSecure');
        const emailConfigError = byId('emailConfigError');
        const emailConfigLastChecked = byId('emailConfigLastChecked');
        const testEmailConnectionBtn = byId('testEmailConnection');
        const testEmailForm = byId('testEmailForm');
        const testEmailRecipient = byId('testEmailRecipient');
        const sendTestEmailBtn = byId('sendTestEmailBtn');
        // Threads
        const threadsSearch = byId('threadsSearch');
        const refreshThreads = byId('refreshThreads');
        const threadsTbody = byId('threadsTableBody');
        // Chat
        const chatFilter = byId('chatFilter');
        const refreshChats = byId('refreshChats');
        const chatTbody = byId('chatTableBody');
        const chatDetail = byId('chatDetail');
        const chatMessagesAdmin = byId('chatMessagesAdmin');
        const adminReplyInput = byId('adminReplyInput');
        const sendAdminReply = byId('sendAdminReply');
        const joinChatBtn = byId('joinChatBtn');
        const closeChatBtn = byId('closeChatBtn');
        const emailTranscriptBtn = byId('emailTranscriptBtn');
        let selectedSessionId = null;
        let adminSocket = null;
        // Stats
        const statTotalDisputes = byId('statTotalDisputes');
        const statOpenDisputes = byId('statOpenDisputes');
        const statResolvedDisputes = byId('statResolvedDisputes');
        const statActiveChats = byId('statActiveChats');
        const statOpenThreads = byId('statOpenThreads');
        const statClosedThreads = byId('statClosedThreads');
        const setHidden = (el, hide) => {
            if (!el)
                return;
            el.classList.toggle('hidden', hide);
        };
        const switchTab = (panelId) => {
            tabs.forEach(t => t.classList.toggle('active', t.getAttribute('data-tab') === panelId));
            tabPanels.forEach(p => setHidden(p, p.id !== panelId));
            // On switch, refresh that tab
            if (panelId === 'disputesTab')
                loadDisputes();
            if (panelId === 'emailsTab') {
                loadTemplates();
                loadEmailConfig();
            }
            if (panelId === 'threadsTab')
                loadThreads();
            if (panelId === 'chatTab')
                loadChats();
            if (panelId === 'statsTab')
                loadStats();
        };
        tabs.forEach(btn => {
            btn.addEventListener('click', () => switchTab(btn.getAttribute('data-tab')));
        });
        // Auth state init
        const init = async () => {
            try {
                if (api?.token) {
                    const me = await api.getCurrentUser();
                    userBadge.textContent = `Signed in as ${me?.data?.email || 'admin'}`;
                    setHidden(loginSection, true);
                    setHidden(dashboardSection, false);
                    setHidden(logoutBtn, false);
                    switchTab('disputesTab');
                    // Connect socket for admin notifications
                    try {
                        // Use long-polling to avoid websocket upgrade issues in restricted environments
                        const socketBase = resolveSocketBaseUrl();
                        adminSocket = window.io(socketBase, {
                            transports: ['polling'],
                            upgrade: false,
                            withCredentials: true,
                            reconnection: true,
                            reconnectionAttempts: 5,
                            reconnectionDelay: 1000
                        });
                        adminSocket.on('connect_error', (err) => {
                            console.warn('Admin socket connect_error:', err?.message || err);
                        });
                        adminSocket.emit('join_admin', { adminId: me?.data?.id || 'admin' });
                        adminSocket.on('chat_update', (p) => {
                            showToast(`New chat session from ${p.customerName || 'Customer'}`);
                            showBrowserNotification('New Chat Session', `${p.customerName || 'A customer'} started a chat`, 'chat-new');
                            // Auto-refresh chat list if chat tab visible
                            if (!document.getElementById('chatTab').classList.contains('hidden')) {
                                loadChats();
                            }
                        });
                        adminSocket.on('customer_message', (p) => {
                            showToast(`New chat message in session ${String(p.sessionId).slice(0, 8)}`);
                            showBrowserNotification('New Chat Message', p.text || 'You have a new message', `chat-${p.sessionId}`);
                            if (!document.getElementById('chatTab').classList.contains('hidden')) {
                                loadChats();
                            }
                            // If viewing this session, append message
                            if (selectedSessionId && p.sessionId === selectedSessionId) {
                                const wrap = document.createElement('div');
                                wrap.className = 'chat-message user';
                                const inner = document.createElement('div');
                                inner.className = 'message-content';
                                const pEl = document.createElement('p');
                                pEl.textContent = p.text;
                                const ts = document.createElement('span');
                                ts.className = 'muted';
                                ts.style.fontSize = '.8rem';
                                ts.textContent = new Date().toLocaleString();
                                inner.appendChild(pEl);
                                inner.appendChild(ts);
                                wrap.appendChild(inner);
                                chatMessagesAdmin.appendChild(wrap);
                                chatMessagesAdmin.scrollTop = chatMessagesAdmin.scrollHeight;
                            }
                        });
                        adminSocket.on('email_received', (p) => {
                            showToast(`New email from ${p.from}: ${p.subject}`);
                            showBrowserNotification('New Email Received', `From: ${p.from} - ${p.subject}`, 'email-new');
                            if (!document.getElementById('threadsTab').classList.contains('hidden')) {
                                loadThreads();
                            }
                        });
                        // Request notification permission after socket connects
                        requestNotificationPermission();
                    }
                    catch (e) {
                        console.warn('Admin socket connection failed');
                    }
                    return;
                }
            }
            catch (e) {
                console.warn('Token invalid, please login');
            }
            setHidden(loginSection, false);
            setHidden(dashboardSection, true);
            setHidden(logoutBtn, true);
        };
        // Login handler
        loginForm?.addEventListener('submit', async (e) => {
            e.preventDefault();
            loginError.setAttribute('style', 'display:none;');
            try {
                const email = adminEmail.value.trim();
                const password = adminPassword.value;
                const res = await api.login(email, password);
                if (res?.success) {
                    userBadge.textContent = `Signed in as ${res.data.user.email}`;
                    setHidden(loginSection, true);
                    setHidden(dashboardSection, false);
                    setHidden(logoutBtn, false);
                    switchTab('disputesTab');
                }
                else {
                    loginError.textContent = res?.error || 'Login failed';
                    loginError.setAttribute('style', 'display:block; color:#b91c1c;');
                }
            }
            catch (err) {
                loginError.textContent = err?.message || 'Login failed';
                loginError.setAttribute('style', 'display:block; color:#b91c1c;');
            }
        });
        logoutBtn?.addEventListener('click', async () => {
            await api.logout();
            setHidden(dashboardSection, true);
            setHidden(loginSection, false);
            setHidden(logoutBtn, true);
        });
        // Disputes
        let currentDisputeId = null;
        const renderDisputes = (items) => {
            disputesTbody.innerHTML = '';
            items.forEach(d => {
                const tr = document.createElement('tr');
                const ref = d.referenceNumber || d.id.slice(0, 8);
                const amt = typeof d.transactionAmount === 'number' ? `$${d.transactionAmount.toFixed(2)}` : '-';
                const date = d.transactionDate || d.createdAt || '';
                const status = d.status || 'pending';
                const fullName = d.full_name || '-';
                tr.innerHTML = `
        <td>${ref}</td>
        <td>${fullName}</td>
        <td>${d.email || '-'}</td>
        <td>
          <select data-id="${d.id}" class="status-select">
            ${['pending', 'in_review', 'resolved', 'rejected'].map(s => `<option value="${s}" ${s === status ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </td>
        <td>${amt}</td>
        <td>${date ? new Date(date).toLocaleString() : '-'}</td>
        <td>
          <button class="btn btn-small btn-primary" data-action="view" data-id="${d.id}">View</button>
          <button class="btn btn-small" data-action="save" data-id="${d.id}">Save</button>
        </td>
      `;
                disputesTbody.appendChild(tr);
            });
            // Add view button handlers
            disputesTbody.querySelectorAll('button[data-action="view"]').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const id = btn.getAttribute('data-id');
                    await openDisputeDetail(id);
                });
            });
            // Add save button handlers
            disputesTbody.querySelectorAll('button[data-action="save"]').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const id = btn.getAttribute('data-id');
                    const select = disputesTbody.querySelector(`select.status-select[data-id="${id}"]`);
                    try {
                        await api.updateDispute(id, { status: select.value });
                        btn.textContent = 'Saved';
                        setTimeout(() => (btn.textContent = 'Save'), 1500);
                    }
                    catch (e) {
                        btn.textContent = 'Error';
                        setTimeout(() => (btn.textContent = 'Save'), 2000);
                    }
                });
            });
        };
        // Dispute Detail Panel
        const disputeDetail = byId('disputeDetail');
        const closeDisputeDetailBtn = byId('closeDisputeDetail');
        const saveDisputeChangesBtn = byId('saveDisputeChanges');
        const viewEmailThreadBtn = byId('viewEmailThread');
        const viewChatSessionBtn = byId('viewChatSession');
        const openDisputeDetail = async (disputeId) => {
            try {
                const res = await api.getDispute(disputeId);
                if (!res?.success || !res?.data) {
                    alert('Failed to load dispute details');
                    return;
                }
                const dispute = res.data;
                currentDisputeId = dispute.id;
                // Populate detail panel
                byId('disputeDetailTitle').textContent = `Dispute: ${dispute.reference_number || dispute.id.slice(0, 8)}`;
                byId('detailCustomerName').textContent = dispute.full_name || '-';
                byId('detailCustomerEmail').textContent = dispute.email || '-';
                byId('detailCustomerPhone').textContent = dispute.phone || 'Not provided';
                byId('detailAmount').textContent = dispute.transaction_amount ? `$${dispute.transaction_amount}` : '-';
                byId('detailCurrency').textContent = dispute.currency || '-';
                byId('detailTransactionDate').textContent = dispute.transaction_date || '-';
                byId('detailRole').textContent = dispute.role || '-';
                byId('detailAuthStatus').textContent = dispute.authorization_status || '-';
                byId('detailDescription').textContent = dispute.dispute_description || 'No description provided';
                // Attachments
                const attachmentsDiv = byId('detailAttachments');
                const attachments = normalizeAttachments(dispute);
                if (attachments.length > 0) {
                    attachmentsDiv.classList.add('attachment-grid');
                    attachmentsDiv.innerHTML = attachments.map((file) => {
                        const isImage = file.mimeType?.startsWith('image/');
                        const preview = isImage
                            ? `<img class="attachment-thumb" src="${file.url}" alt="${file.name} preview" loading="lazy" />`
                            : `<span class="attachment-icon" aria-hidden="true">${getAttachmentIcon(file.mimeType)}</span>`;
                        const sizeLabel = formatBytes(file.size);
                        const sizeMarkup = sizeLabel ? `<span class="attachment-size">${sizeLabel}</span>` : '';
                        return `
            <a class="attachment-card" href="${file.url}" target="_blank" rel="noopener noreferrer">
              ${preview}
              <span class="attachment-meta">
                <span class="attachment-name">${file.name}</span>
                ${sizeMarkup}
              </span>
            </a>
          `;
                    }).join('');
                }
                else {
                    attachmentsDiv.classList.remove('attachment-grid');
                    attachmentsDiv.innerHTML = '<p>No attachments</p>';
                }
                // Status and priority
                byId('updateDisputeStatus').value = dispute.status || 'pending';
                byId('updateDisputePriority').value = dispute.priority || 'medium';
                byId('disputeResolution').value = dispute.resolution || '';
                // Email thread link
                const emailThreadText = byId('detailEmailThread');
                emailThreadText.textContent = 'Loading...';
                try {
                    const threadsRes = await api.getEmailThreads();
                    const thread = threadsRes?.data?.find((t) => t.dispute_id === dispute.id);
                    if (thread) {
                        emailThreadText.textContent = thread.subject || 'Email thread found';
                        viewEmailThreadBtn.style.display = 'block';
                        viewEmailThreadBtn.onclick = () => {
                            switchTab('threadsTab');
                            setHidden(disputeDetail, true);
                        };
                    }
                    else {
                        emailThreadText.textContent = 'No email thread';
                        viewEmailThreadBtn.style.display = 'none';
                    }
                }
                catch (e) {
                    emailThreadText.textContent = 'Error loading';
                }
                // Chat session link
                const chatSessionText = byId('detailChatSession');
                chatSessionText.textContent = 'Loading...';
                try {
                    const chatsRes = await api.getChatSessions();
                    const session = chatsRes?.data?.find((s) => s.dispute_id === dispute.id || s.customer_email === dispute.email);
                    if (session) {
                        chatSessionText.textContent = `Chat session (${session.customer_name || 'Customer'})`;
                        viewChatSessionBtn.style.display = 'block';
                        viewChatSessionBtn.onclick = () => {
                            switchTab('chatTab');
                            setHidden(disputeDetail, true);
                            setTimeout(() => openChatDetail(session.id), 300);
                        };
                    }
                    else {
                        chatSessionText.textContent = 'No chat session';
                        viewChatSessionBtn.style.display = 'none';
                    }
                }
                catch (e) {
                    chatSessionText.textContent = 'Error loading';
                }
                // Show detail panel
                setHidden(disputeDetail, false);
                disputeDetail.scrollIntoView({ behavior: 'smooth' });
            }
            catch (err) {
                console.error('Error loading dispute detail:', err);
                alert('Failed to load dispute details');
            }
        };
        closeDisputeDetailBtn?.addEventListener('click', () => {
            setHidden(disputeDetail, true);
            currentDisputeId = null;
        });
        saveDisputeChangesBtn?.addEventListener('click', async () => {
            if (!currentDisputeId)
                return;
            try {
                const status = byId('updateDisputeStatus').value;
                const priority = byId('updateDisputePriority').value;
                const resolution = byId('disputeResolution').value.trim();
                await api.updateDispute(currentDisputeId, { status, priority, resolution: resolution || null });
                showToast('Dispute updated successfully');
                loadDisputes(); // Refresh list
            }
            catch (err) {
                console.error('Error updating dispute:', err);
                alert('Failed to update dispute');
            }
        });
        const loadDisputes = async () => {
            try {
                const filters = {};
                if (filterStatus.value)
                    filters.status = filterStatus.value;
                if (filterSearch.value)
                    filters.search = filterSearch.value;
                const res = await api.getDisputes(filters);
                renderDisputes(res?.data?.items || res?.data || []);
            }
            catch (e) {
                disputesTbody.innerHTML = '<tr><td colspan="6">Failed to load disputes</td></tr>';
            }
        };
        refreshDisputes?.addEventListener('click', loadDisputes);
        filterStatus?.addEventListener('change', loadDisputes);
        filterSearch?.addEventListener('input', () => {
            // simple debounce
            window.setTimeout(() => loadDisputes(), 300);
        });
        const hideEmailConfigError = () => {
            if (!emailConfigError)
                return;
            emailConfigError.textContent = '';
            emailConfigError.style.display = 'none';
            emailConfigError.style.removeProperty('color');
        };
        const showEmailConfigError = (message) => {
            if (!emailConfigError)
                return;
            emailConfigError.textContent = message;
            emailConfigError.style.display = 'block';
            emailConfigError.style.color = '#b91c1c';
        };
        const applyEmailConfigDetails = (payload) => {
            const provider = payload?.provider;
            const config = payload?.config;
            if (emailConfigProvider) {
                emailConfigProvider.textContent = provider ? provider.toUpperCase() : 'Unknown';
            }
            if (emailConfigFrom) {
                emailConfigFrom.textContent = config?.from || '—';
            }
            if (emailConfigHost) {
                const host = config?.host || '';
                const port = config?.port;
                emailConfigHost.textContent = host ? (port ? `${host}:${port}` : host) : '—';
            }
            if (emailConfigSecure) {
                const secure = config?.secure;
                if (secure === true) {
                    emailConfigSecure.textContent = 'TLS/SSL';
                }
                else if (secure === false) {
                    emailConfigSecure.textContent = 'STARTTLS';
                }
                else {
                    emailConfigSecure.textContent = 'Not set';
                }
            }
        };
        const loadEmailConfig = async () => {
            if (!emailConfigStatus)
                return;
            emailConfigStatus.textContent = 'Checking configuration…';
            hideEmailConfigError();
            try {
                const result = await api.getEmailConfigStatus();
                if (!result?.success) {
                    emailConfigStatus.textContent = 'Unable to load configuration.';
                    showEmailConfigError(result?.error || 'Request failed');
                    if (emailConfigLastChecked) {
                        emailConfigLastChecked.textContent = '';
                        emailConfigLastChecked.style.display = 'none';
                    }
                    return;
                }
                const configured = Boolean(result.data?.configured);
                emailConfigStatus.textContent = configured
                    ? 'Email service is connected and ready.'
                    : 'Email service is not fully configured yet.';
                applyEmailConfigDetails(result.data);
                if (emailConfigLastChecked) {
                    emailConfigLastChecked.textContent = `Last checked ${new Date().toLocaleString()}`;
                    emailConfigLastChecked.style.display = 'block';
                }
            }
            catch (error) {
                emailConfigStatus.textContent = 'Unable to load configuration.';
                showEmailConfigError(error?.message || 'Request failed');
                if (emailConfigLastChecked) {
                    emailConfigLastChecked.textContent = '';
                    emailConfigLastChecked.style.display = 'none';
                }
            }
        };
        // Templates
        const renderTemplates = (items) => {
            templatesList.innerHTML = '';
            if (!items?.length) {
                templatesList.innerHTML = '<p class="muted">No templates</p>';
                return;
            }
            items.forEach(t => {
                const div = document.createElement('div');
                div.className = 'card';
                div.innerHTML = `
        <div style="display:flex; justify-content:space-between; gap:.5rem; align-items:center;">
          <div>
            <strong>${t.name}</strong><br />
            <span class="muted">${t.subject}</span>
          </div>
          <div>
            <button class="btn btn-secondary btn-small" data-action="copy-subject" data-id="${t.id}">Copy Subject</button>
            <button class="btn btn-secondary btn-small" data-action="copy-body" data-id="${t.id}">Copy Body</button>
          </div>
        </div>
        <pre style="white-space:pre-wrap; background:#f9fafb; padding:.75rem; border-radius:8px;">${t.body}</pre>
      `;
                templatesList.appendChild(div);
            });
            templatesList.querySelectorAll('button[data-action^="copy-"]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const id = btn.getAttribute('data-id');
                    const isSubject = btn.getAttribute('data-action') === 'copy-subject';
                    // find content in DOM near button
                    const card = btn.closest('.card');
                    const pre = card.querySelector('pre').textContent || '';
                    const subject = card.querySelector('.muted').textContent || '';
                    navigator.clipboard.writeText(isSubject ? subject : pre);
                    btn.textContent = 'Copied';
                    setTimeout(() => (btn.textContent = isSubject ? 'Copy Subject' : 'Copy Body'), 1500);
                });
            });
        };
        const loadTemplates = async () => {
            try {
                const res = await api.getEmailTemplates();
                renderTemplates(res?.data || []);
            }
            catch (e) {
                templatesList.innerHTML = '<p class="muted">Failed to load templates</p>';
            }
        };
        templateForm?.addEventListener('submit', async (e) => {
            e.preventDefault();
            try {
                const payload = { name: tplName.value.trim(), subject: tplSubject.value.trim(), body: tplBody.value };
                if (!payload.name || !payload.subject || !payload.body)
                    return;
                await api.createEmailTemplate(payload);
                tplName.value = '';
                tplSubject.value = '';
                tplBody.value = '';
                await loadTemplates();
            }
            catch (e) {
                alert('Failed to save template');
            }
        });
        testEmailConnectionBtn?.addEventListener('click', async () => {
            await runWithButtonState(testEmailConnectionBtn, 'Testing…', async () => {
                try {
                    const result = await api.testEmailConnection();
                    if (result?.success) {
                        showToast(result.message || 'Connection successful');
                        hideEmailConfigError();
                    }
                    else {
                        const message = result?.message || 'Connection failed';
                        showToast(message);
                        showEmailConfigError(message);
                    }
                }
                catch (error) {
                    const message = error?.message || 'Connection failed';
                    showToast(message);
                    showEmailConfigError(message);
                }
            });
            await loadEmailConfig();
        });
        testEmailForm?.addEventListener('submit', async (event) => {
            event.preventDefault();
            const recipient = testEmailRecipient?.value.trim();
            if (!recipient) {
                showEmailConfigError('Enter a recipient email address before sending a test message.');
                return;
            }
            hideEmailConfigError();
            await runWithButtonState(sendTestEmailBtn, 'Sending…', async () => {
                try {
                    const result = await api.sendEmailTest(recipient);
                    if (result?.success) {
                        showToast(result.message || `Test email sent to ${recipient}`);
                        if (testEmailRecipient) {
                            testEmailRecipient.value = '';
                        }
                    }
                    else {
                        const message = result?.message || 'Failed to send test email';
                        showToast(message);
                        showEmailConfigError(message);
                    }
                }
                catch (error) {
                    const message = error?.message || 'Failed to send test email';
                    showToast(message);
                    showEmailConfigError(message);
                }
            });
            await loadEmailConfig();
        });
        // Threads
        let selectedThreadId = null;
        const renderThreads = (items) => {
            threadsTbody.innerHTML = '';
            if (!items?.length) {
                threadsTbody.innerHTML = '<tr><td colspan="6" class="muted">No threads</td></tr>';
                return;
            }
            console.log('📧 Rendering', items.length, 'email threads with click handlers');
            items.forEach(th => {
                const tr = document.createElement('tr');
                tr.setAttribute('data-id', th.id);
                tr.style.cursor = 'pointer';
                tr.style.transition = 'background-color 0.2s';
                const disputeRef = th.dispute_id ? `<span style="background:#dbeafe;padding:2px 6px;border-radius:4px;font-size:.85rem;">Dispute Linked</span>` : '';
                // Count messages (placeholder - will be loaded dynamically)
                const messageCount = '<span style="color:#6b7280;">-</span>';
                tr.innerHTML = `
        <td>${th.subject || '-'}</td>
        <td>${th.customer_email || th.from || th.email || '-'}</td>
        <td>${th.status || '-'}</td>
        <td>${disputeRef}</td>
        <td>${th.last_message_at ? new Date(th.last_message_at).toLocaleString() : (th.updatedAt ? new Date(th.updatedAt).toLocaleString() : '-')}</td>
        <td>${messageCount}</td>
      `;
                // Add hover effect
                tr.addEventListener('mouseenter', () => {
                    tr.style.backgroundColor = '#f3f4f6';
                });
                tr.addEventListener('mouseleave', () => {
                    tr.style.backgroundColor = '';
                });
                tr.addEventListener('click', async () => {
                    console.log('🖱️ Email thread clicked:', th.id);
                    selectedThreadId = th.id;
                    await openEmailThreadDetail(th.id);
                });
                threadsTbody.appendChild(tr);
            });
        };
        const openEmailThreadDetail = async (threadId) => {
            try {
                console.log('📧 Opening email thread detail:', threadId);
                const emailThreadDetail = byId('emailThreadDetail');
                const emailThreadDetailTitle = byId('emailThreadDetailTitle');
                const emailThreadDetailSubject = byId('emailThreadDetailSubject');
                const threadCustomerName = byId('threadCustomerName');
                const threadCustomerEmail = byId('threadCustomerEmail');
                const threadStatus = byId('threadStatus');
                const threadCreated = byId('threadCreated');
                const updateThreadStatus = byId('updateThreadStatus');
                const emailMessagesContainer = byId('emailMessagesContainer');
                const noEmailMessages = byId('noEmailMessages');
                const threadDisputeLink = byId('threadDisputeLink');
                const linkedDisputeRef = byId('linkedDisputeRef');
                // Show loading state
                emailMessagesContainer.innerHTML = '<p class="muted" style="text-align:center;">Loading messages...</p>';
                emailThreadDetail.classList.remove('hidden');
                // Fetch thread with messages
                const response = await fetch(`${resolveApiBaseUrl()}/email/threads/${threadId}`, {
                    headers: {
                        'Authorization': `Bearer ${api.token}`
                    }
                });
                if (!response.ok)
                    throw new Error('Failed to load thread');
                const result = await response.json();
                const thread = result.data;
                console.log('📧 Thread data:', thread);
                // Populate thread details
                emailThreadDetailTitle.textContent = `Thread: ${thread.customer_name || thread.customer_email}`;
                emailThreadDetailSubject.textContent = thread.subject || '-';
                threadCustomerName.textContent = thread.customer_name || '-';
                threadCustomerEmail.textContent = thread.customer_email || '-';
                threadStatus.textContent = thread.status || '-';
                threadCreated.textContent = thread.created_at ? new Date(thread.created_at).toLocaleString() : '-';
                updateThreadStatus.value = thread.status || 'open';
                // Show dispute link if exists
                if (thread.dispute_id) {
                    const disputes = await api.getDisputes({});
                    const linkedDispute = (disputes?.data?.items || disputes?.data || []).find((d) => d.id === thread.dispute_id);
                    if (linkedDispute) {
                        linkedDisputeRef.textContent = linkedDispute.reference_number || linkedDispute.referenceNumber || thread.dispute_id;
                        threadDisputeLink.classList.remove('hidden');
                        // Add click handler to view dispute
                        const viewLinkedDispute = byId('viewLinkedDispute');
                        if (viewLinkedDispute) {
                            viewLinkedDispute.onclick = async () => {
                                switchTab('disputesTab');
                                await openDisputeDetail(linkedDispute.id);
                            };
                        }
                    }
                }
                else {
                    threadDisputeLink.classList.add('hidden');
                }
                // Render messages
                const messages = thread.messages || [];
                if (messages.length === 0) {
                    emailMessagesContainer.innerHTML = '';
                    noEmailMessages.classList.remove('hidden');
                }
                else {
                    noEmailMessages.classList.add('hidden');
                    renderEmailMessages(messages);
                }
            }
            catch (error) {
                console.error('❌ Error loading email thread:', error);
                showToast('Failed to load email thread');
            }
        };
        const renderEmailMessages = (messages) => {
            const emailMessagesContainer = byId('emailMessagesContainer');
            emailMessagesContainer.innerHTML = '';
            messages.forEach(msg => {
                const isFromCustomer = msg.is_from_customer;
                const messageDiv = document.createElement('div');
                messageDiv.style.cssText = `
        background: ${isFromCustomer ? '#ffffff' : '#eff6ff'};
        border-left: 4px solid ${isFromCustomer ? '#f59e0b' : '#3b82f6'};
        padding: 1rem;
        border-radius: 8px;
        margin-bottom: 0.5rem;
      `;
                const sender = isFromCustomer ? msg.from_address : (msg.from_address || 'Support Team');
                const timestamp = msg.sent_at ? new Date(msg.sent_at).toLocaleString() : '-';
                const readStatus = msg.read_at ? '✓ Read' : '○ Unread';
                messageDiv.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;">
          <div>
            <strong style="color:#111827;">${isFromCustomer ? '👤' : '🎧'} ${sender}</strong>
            <span style="color:#6b7280; font-size:0.85rem; margin-left:0.5rem;">${timestamp}</span>
          </div>
          <span style="color:#6b7280; font-size:0.85rem;">${readStatus}</span>
        </div>
        <div style="color:#374151; white-space:pre-wrap; line-height:1.5;">${msg.body || msg.message || '-'}</div>
      `;
                emailMessagesContainer.appendChild(messageDiv);
            });
            // Scroll to bottom
            emailMessagesContainer.scrollTop = emailMessagesContainer.scrollHeight;
        };
        const loadThreads = async () => {
            try {
                const filters = {};
                if (threadsSearch.value)
                    filters.search = threadsSearch.value;
                const res = await api.getEmailThreads(filters);
                renderThreads(res?.data?.items || res?.data || []);
            }
            catch (e) {
                threadsTbody.innerHTML = '<tr><td colspan="6">Failed to load threads</td></tr>';
            }
        };
        refreshThreads?.addEventListener('click', loadThreads);
        // Close email thread detail
        const closeEmailThreadDetail = byId('closeEmailThreadDetail');
        if (closeEmailThreadDetail) {
            closeEmailThreadDetail.addEventListener('click', () => {
                byId('emailThreadDetail').classList.add('hidden');
                selectedThreadId = null;
            });
        }
        // Save thread status
        const saveThreadStatus = byId('saveThreadStatus');
        const updateThreadStatus = byId('updateThreadStatus');
        if (saveThreadStatus && updateThreadStatus) {
            saveThreadStatus.addEventListener('click', async () => {
                if (!selectedThreadId)
                    return;
                try {
                    const response = await fetch(`${resolveApiBaseUrl()}/email/threads/${selectedThreadId}`, {
                        method: 'PATCH',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${api.token}`
                        },
                        body: JSON.stringify({
                            status: updateThreadStatus.value
                        })
                    });
                    if (!response.ok)
                        throw new Error('Failed to update status');
                    showToast('Thread status updated');
                    await loadThreads();
                    await openEmailThreadDetail(selectedThreadId);
                }
                catch (error) {
                    console.error('❌ Error updating thread status:', error);
                    showToast('Failed to update status');
                }
            });
        }
        // Send email reply
        const sendEmailReply = byId('sendEmailReply');
        const replyBody = byId('replyBody');
        if (sendEmailReply && replyBody) {
            sendEmailReply.addEventListener('click', async () => {
                if (!selectedThreadId)
                    return;
                const body = replyBody.value.trim();
                if (!body) {
                    showToast('Please enter a message');
                    return;
                }
                try {
                    // Get thread details to get customer email
                    const threadResponse = await fetch(`${resolveApiBaseUrl()}/email/threads/${selectedThreadId}`, {
                        headers: {
                            'Authorization': `Bearer ${api.token}`
                        }
                    });
                    if (!threadResponse.ok)
                        throw new Error('Failed to load thread');
                    const threadResult = await threadResponse.json();
                    const thread = threadResult.data;
                    // Send email
                    const response = await fetch(`${resolveApiBaseUrl()}/email/send`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${api.token}`
                        },
                        body: JSON.stringify({
                            to: thread.customer_email,
                            subject: `Re: ${thread.subject}`,
                            body: body,
                            threadId: selectedThreadId,
                            disputeId: thread.dispute_id
                        })
                    });
                    if (!response.ok)
                        throw new Error('Failed to send email');
                    showToast('Email sent successfully');
                    replyBody.value = '';
                    await openEmailThreadDetail(selectedThreadId);
                }
                catch (error) {
                    console.error('❌ Error sending email:', error);
                    showToast('Failed to send email');
                }
            });
        }
        // Chat
        const renderChats = (items) => {
            chatTbody.innerHTML = '';
            if (!items?.length) {
                chatTbody.innerHTML = '<tr><td colspan="4" class="muted">No chat sessions</td></tr>';
                return;
            }
            console.log('📋 Rendering', items.length, 'chat sessions with click handlers');
            items.forEach(cs => {
                const tr = document.createElement('tr');
                tr.setAttribute('data-id', cs.id);
                tr.style.cursor = 'pointer';
                tr.style.transition = 'background-color 0.2s';
                tr.innerHTML = `
        <td>${cs.id ? String(cs.id).slice(0, 8) : '-'}</td>
        <td>${cs.user?.email || cs.customer_email || cs.userId || '-'}</td>
        <td>${cs.status || '-'}</td>
        <td>${cs.updatedAt ? new Date(cs.updatedAt).toLocaleString() : (cs.last_message_at ? new Date(cs.last_message_at).toLocaleString() : '-')}</td>
      `;
                chatTbody.appendChild(tr);
                // Add hover effect
                tr.addEventListener('mouseenter', () => {
                    tr.style.backgroundColor = '#f3f4f6';
                });
                tr.addEventListener('mouseleave', () => {
                    tr.style.backgroundColor = '';
                });
                tr.addEventListener('click', async () => {
                    console.log('🖱️ Chat session clicked:', cs.id);
                    selectedSessionId = cs.id;
                    await openChatDetail(cs.id);
                });
            });
        };
        const loadChats = async () => {
            try {
                const filters = {};
                if (chatFilter.value)
                    filters.status = chatFilter.value;
                const res = await api.getChatSessions(filters);
                renderChats(res?.data?.items || res?.data || []);
            }
            catch (e) {
                chatTbody.innerHTML = '<tr><td colspan="4">Failed to load chat sessions</td></tr>';
            }
        };
        refreshChats?.addEventListener('click', loadChats);
        const openChatDetail = async (sessionId) => {
            console.log('📂 Opening chat detail for session:', sessionId);
            try {
                const res = await api.getChatSession(sessionId);
                const sess = res?.data;
                console.log('💬 Session data loaded:', sess);
                chatMessagesAdmin.innerHTML = '';
                const msgs = (sess?.messages || []);
                console.log('📨 Rendering', msgs.length, 'messages');
                msgs.forEach((m) => {
                    const wrap = document.createElement('div');
                    wrap.className = 'chat-message ' + (m.is_user ? 'user' : 'bot');
                    const inner = document.createElement('div');
                    inner.className = 'message-content';
                    const pEl = document.createElement('p');
                    pEl.textContent = m.text;
                    const ts = document.createElement('span');
                    ts.className = 'muted';
                    ts.style.fontSize = '.8rem';
                    ts.textContent = m.timestamp ? new Date(m.timestamp).toLocaleString() : '';
                    inner.appendChild(pEl);
                    inner.appendChild(ts);
                    wrap.appendChild(inner);
                    chatMessagesAdmin.appendChild(wrap);
                });
                chatMessagesAdmin.scrollTop = chatMessagesAdmin.scrollHeight;
                console.log('👁️ Showing chat detail panel');
                setHidden(chatDetail, false);
                console.log('✅ Chat detail panel should now be visible');
            }
            catch (e) {
                console.error('❌ Failed to load chat detail:', e);
                showToast('Failed to load chat detail');
            }
        };
        joinChatBtn?.addEventListener('click', async () => {
            if (!selectedSessionId)
                return;
            try {
                const me = await api.getCurrentUser();
                adminSocket?.emit('admin_join_session', { sessionId: selectedSessionId, adminId: me?.data?.id || 'admin' });
                showToast('Joined session');
            }
            catch (e) { /* noop */ }
        });
        sendAdminReply?.addEventListener('click', async () => {
            if (!selectedSessionId)
                return;
            const text = adminReplyInput.value.trim();
            if (!text)
                return;
            try {
                const me = await api.getCurrentUser();
                adminSocket?.emit('send_message', { sessionId: selectedSessionId, text, isUser: false, adminId: me?.data?.id });
                // Append locally
                const wrap = document.createElement('div');
                wrap.className = 'chat-message bot';
                const inner = document.createElement('div');
                inner.className = 'message-content';
                const pEl = document.createElement('p');
                pEl.textContent = text;
                const ts = document.createElement('span');
                ts.className = 'muted';
                ts.style.fontSize = '.8rem';
                ts.textContent = new Date().toLocaleString();
                inner.appendChild(pEl);
                inner.appendChild(ts);
                wrap.appendChild(inner);
                chatMessagesAdmin.appendChild(wrap);
                chatMessagesAdmin.scrollTop = chatMessagesAdmin.scrollHeight;
                adminReplyInput.value = '';
            }
            catch (e) { /* noop */ }
        });
        closeChatBtn?.addEventListener('click', async () => {
            if (!selectedSessionId)
                return;
            try {
                await api.updateChatSession(selectedSessionId, { status: 'closed' });
                showToast('Chat closed');
                loadChats();
            }
            catch (e) {
                showToast('Failed to close chat');
            }
        });
        emailTranscriptBtn?.addEventListener('click', async () => {
            if (!selectedSessionId)
                return;
            try {
                await api.request(`/chat/sessions/${selectedSessionId}/transcript`, { method: 'POST', body: JSON.stringify({ close: false }) });
                showToast('Transcript sent');
            }
            catch (e) {
                showToast('Failed to send transcript');
            }
        });
        // Stats
        const loadStats = async () => {
            try {
                const res = await api.getDashboardStats();
                const stats = res?.data || {};
                statTotalDisputes.textContent = String(stats.totalDisputes || '-');
                statOpenDisputes.textContent = String(stats.openDisputes || '-');
                statResolvedDisputes.textContent = String(stats.closedDisputes || '-');
                statActiveChats.textContent = String(stats.activeChats || '-');
                statOpenThreads.textContent = String(stats.openEmailThreads || '-');
                statClosedThreads.textContent = String(stats.closedEmailThreads || '-');
            }
            catch (e) {
                statTotalDisputes.textContent = statOpenDisputes.textContent = statResolvedDisputes.textContent = '-';
                statActiveChats.textContent = statOpenThreads.textContent = statClosedThreads.textContent = '-';
            }
        };
        // boot
        init();
    });
})();
//# sourceMappingURL=admin.js.map
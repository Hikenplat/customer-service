(function () {
  if (window.__disputePortalFloatingChatInitialized) {
    return;
  }
  window.__disputePortalFloatingChatInitialized = true;

  const SOCKET_URL = window.CHAT_SOCKET_URL || 'http://localhost:5000';
  let sessionManager = null;
  let socket = null;
  let overlay = null;
  let backdrop = null;
  let messagesWrapper = null;
  let messageList = null;
  let emptyState = null;
  let welcomeSection = null;
  let inputSection = null;
  let nameInput = null;
  let emailInput = null;
  let startButton = null;
  let messageInput = null;
  let sendButton = null;
  let closeButton = null;
  let floatingButton = null;
  let chatPrompt = null;

  document.addEventListener('DOMContentLoaded', initializeFloatingChat);

  function initializeFloatingChat() {
    floatingButton = document.querySelector('.floating-chat-btn');
    chatPrompt = document.querySelector('.chat-prompt');
    sessionManager = window.chatSessionManager;

    if (!floatingButton || !sessionManager) {
      return;
    }

    ensureOverlay();
    attachFloatingButton();
    attachOverlayListeners();
    prefillWelcomeForm();
    attachSocket();
    updatePrompt();

    if (sessionManager.hasActiveSession()) {
      enterChatMode();
      renderSavedMessages();
    }
  }

  function ensureOverlay() {
    overlay = document.getElementById('globalChatOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'globalChatOverlay';
      overlay.className = 'chat-overlay';
      overlay.setAttribute('aria-hidden', 'true');

      overlay.innerHTML = `
        <div class="chat-overlay-backdrop" data-chat-backdrop></div>
        <section class="chat-overlay-panel" role="dialog" aria-modal="true" aria-labelledby="chatOverlayTitle">
          <header class="chat-overlay-header">
            <div class="chat-overlay-heading">
              <p class="chat-overlay-kicker">Need help?</p>
              <h3 id="chatOverlayTitle">Chat with our team</h3>
              <p class="chat-overlay-subtitle">Typically replies in under 2 minutes</p>
            </div>
            <button type="button" class="chat-overlay-close" aria-label="Close chat" data-chat-close>&times;</button>
          </header>
          <div class="chat-overlay-body">
            <div class="chat-overlay-welcome" data-chat-welcome>
              <p class="chat-overlay-intro">Start a secure conversation with our dispute specialists.</p>
              <div class="chat-overlay-form">
                <label class="chat-overlay-label" for="chatOverlayName">Full name</label>
                <input type="text" id="chatOverlayName" class="chat-overlay-input" data-chat-name placeholder="Jane Smith" autocomplete="name" required>
                <label class="chat-overlay-label" for="chatOverlayEmail">Email address</label>
                <input type="email" id="chatOverlayEmail" class="chat-overlay-input" data-chat-email placeholder="you@example.com" autocomplete="email" required>
                <button type="button" class="chat-overlay-start" data-chat-start>Start chat</button>
              </div>
            </div>
            <div class="chat-overlay-messages chat-messages" data-chat-messages hidden>
              <div class="chat-overlay-empty" data-chat-empty>Say hello – we're here to help.</div>
              <div class="chat-overlay-messages-list"></div>
            </div>
          </div>
          <footer class="chat-overlay-footer chat-input-container" data-chat-input hidden>
            <input type="text" class="chat-overlay-message-input" data-chat-input-field placeholder="Type your message" autocomplete="off">
            <button type="button" class="send-btn" data-chat-send>Send</button>
          </footer>
        </section>
      `;

      document.body.appendChild(overlay);
    }

    backdrop = overlay.querySelector('[data-chat-backdrop]');
    messagesWrapper = overlay.querySelector('[data-chat-messages]');
    messageList = overlay.querySelector('.chat-overlay-messages-list');
    emptyState = overlay.querySelector('[data-chat-empty]');
    welcomeSection = overlay.querySelector('[data-chat-welcome]');
    inputSection = overlay.querySelector('[data-chat-input]');
    nameInput = overlay.querySelector('[data-chat-name]');
    emailInput = overlay.querySelector('[data-chat-email]');
    startButton = overlay.querySelector('[data-chat-start]');
    messageInput = overlay.querySelector('[data-chat-input-field]');
    sendButton = overlay.querySelector('[data-chat-send]');
    closeButton = overlay.querySelector('[data-chat-close]');
  }

  function attachFloatingButton() {
    floatingButton.addEventListener('click', (event) => {
      event.preventDefault();
      openOverlay();
    });
  }

  function attachOverlayListeners() {
    closeButton?.addEventListener('click', closeOverlay);
    backdrop?.addEventListener('click', closeOverlay);

    startButton?.addEventListener('click', startChatSession);

    messageInput?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        sendCurrentMessage();
      }
    });

    sendButton?.addEventListener('click', sendCurrentMessage);

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && overlay.classList.contains('is-open')) {
        closeOverlay();
      }
    });
  }

  function prefillWelcomeForm() {
    if (!sessionManager?.isAuthenticated()) {
      return;
    }

    const authUser = sessionManager.getAuthenticatedUser();
    if (!authUser) {
      return;
    }

    if (nameInput) {
      nameInput.value = authUser.name || '';
      nameInput.readOnly = true;
    }

    if (emailInput) {
      emailInput.value = authUser.email || '';
      emailInput.readOnly = true;
    }
  }

  function attachSocket() {
    socket = sessionManager.connectSocket(SOCKET_URL);
    if (!socket || socket.__disputePortalChatOverlayBound) {
      return;
    }

    socket.__disputePortalChatOverlayBound = true;

    socket.on('new_message', (message) => {
      if (!message) {
        return;
      }

      if (!message.isUser) {
        appendMessage(message.text, false, message.timestamp);
        sessionManager.addMessage({
          text: message.text,
          isUser: false,
          timestamp: message.timestamp || new Date().toISOString()
        });
        updatePrompt();
      }
    });

    socket.on('session_created', () => {
      updatePrompt();
    });
  }

  function openOverlay() {
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('chat-overlay-open');

    if (sessionManager.hasActiveSession()) {
      enterChatMode();
      renderSavedMessages();
      focusMessageInput();
    } else {
      showWelcome();
      focusWelcomeForm();
    }
  }

  function closeOverlay() {
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('chat-overlay-open');
    floatingButton?.focus({ preventScroll: true });
  }

  function showWelcome() {
    welcomeSection?.removeAttribute('hidden');
    messagesWrapper?.setAttribute('hidden', '');
    inputSection?.setAttribute('hidden', '');
  }

  function enterChatMode() {
    welcomeSection?.setAttribute('hidden', '');
    messagesWrapper?.removeAttribute('hidden');
    inputSection?.removeAttribute('hidden');
    updatePrompt();
  }

  function renderSavedMessages() {
    if (!messageList) {
      return;
    }

    const savedMessages = sessionManager.getMessages();
    messageList.innerHTML = '';

    savedMessages.forEach((msg) => {
      appendMessage(msg.text, msg.isUser, msg.timestamp, true);
    });

    toggleEmptyState(savedMessages.length === 0);
    scrollMessagesToEnd();
  }

  function startChatSession() {
    if (!nameInput || !emailInput || !startButton) {
      return;
    }

    const name = nameInput.value.trim();
    const email = emailInput.value.trim();
    const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

    if (!name) {
      nameInput.focus();
      return;
    }

    if (!emailValid) {
      emailInput.focus();
      return;
    }

    sessionManager.startNewSession(name, email);
    enterChatMode();
    renderSavedMessages();
    focusMessageInput();
  }

  function sendCurrentMessage() {
    if (!messageInput) {
      return;
    }

    const text = messageInput.value.trim();
    if (!text) {
      return;
    }

    if (!sessionManager.hasActiveSession()) {
      startChatSession();
      if (!sessionManager.hasActiveSession()) {
        return;
      }
    }

    const sent = sessionManager.sendMessage(text);
    if (sent) {
      appendMessage(text, true, new Date().toISOString());
      messageInput.value = '';
      toggleEmptyState(false);
      scrollMessagesToEnd();
    }
  }

  function appendMessage(text, isUser, timestamp, skipScroll) {
    if (!messageList) {
      return;
    }

    const messageItem = document.createElement('div');
    messageItem.className = `chat-message${isUser ? ' user' : ''}`;

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4z"></path>
        <path d="M4.93 19.07a10 10 0 0 1 14.14 0"></path>
      </svg>
    `;

    const content = document.createElement('div');
    content.className = 'message-content';

    const paragraph = document.createElement('p');
    paragraph.innerHTML = escapeHtml(text);
    content.appendChild(paragraph);

    if (timestamp) {
      const meta = document.createElement('span');
      meta.className = 'chat-message-meta';
      meta.textContent = formatTimestamp(timestamp);
      content.appendChild(meta);
    }

    messageItem.appendChild(avatar);
    messageItem.appendChild(content);
    messageList.appendChild(messageItem);

    toggleEmptyState(false);

    if (!skipScroll) {
      scrollMessagesToEnd();
    }
  }

  function toggleEmptyState(isEmpty) {
    if (!emptyState) {
      return;
    }

    emptyState.style.display = isEmpty ? 'block' : 'none';
  }

  function scrollMessagesToEnd() {
    if (!messagesWrapper) {
      return;
    }

    messagesWrapper.scrollTop = messagesWrapper.scrollHeight;
  }

  function focusMessageInput() {
    if (messageInput) {
      requestAnimationFrame(() => messageInput.focus());
    }
  }

  function focusWelcomeForm() {
    if (nameInput && !nameInput.readOnly) {
      requestAnimationFrame(() => nameInput.focus());
    } else if (emailInput && !emailInput.readOnly) {
      requestAnimationFrame(() => emailInput.focus());
    } else {
      requestAnimationFrame(() => startButton?.focus());
    }
  }

  function updatePrompt() {
    if (!chatPrompt) {
      return;
    }

    if (!chatPrompt.dataset.defaultText) {
      chatPrompt.dataset.defaultText = chatPrompt.innerHTML;
    }

    if (sessionManager.hasActiveSession()) {
      chatPrompt.innerHTML = 'Resume Chat<br><span class="chat-subtext">Continue your conversation</span>';
    } else {
      chatPrompt.innerHTML = chatPrompt.dataset.defaultText;
    }
  }

  function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = value;
    return div.innerHTML;
  }

  function formatTimestamp(value) {
    try {
      const date = value ? new Date(value) : new Date();
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (error) {
      return '';
    }
  }
})();

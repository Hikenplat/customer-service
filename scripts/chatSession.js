/**
 * Chat Session Manager
 * Handles persistent chat sessions across pages using localStorage
 */

class ChatSessionManager {
    constructor() {
        this.storageKey = 'disputePortal_chatSession';
        this.socket = null;
        this.currentSession = this.loadSession();
        this.authenticatedUser = this.getAuthenticatedUser();
    }

    /**
     * Get authenticated user information from localStorage
     */
    getAuthenticatedUser() {
        try {
            const token = localStorage.getItem('auth_token');
            const userStr = localStorage.getItem('user');
            
            if (token && userStr) {
                const user = JSON.parse(userStr);
                console.log('👤 Authenticated user detected:', user.email);
                return {
                    name: user.fullName || user.full_name || user.name || '',
                    email: user.email || '',
                    isAuthenticated: true
                };
            }
        } catch (error) {
            console.error('Error getting authenticated user:', error);
        }
        return null;
    }

    /**
     * Check if user is authenticated
     */
    isAuthenticated() {
        return this.authenticatedUser !== null && this.authenticatedUser.isAuthenticated;
    }

    /**
     * Load existing session from localStorage
     */
    loadSession() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            if (stored) {
                const session = JSON.parse(stored);
                // Check if session is still valid (less than 24 hours old)
                const sessionAge = Date.now() - session.timestamp;
                const maxAge = 24 * 60 * 60 * 1000; // 24 hours
                
                if (sessionAge < maxAge) {
                    console.log('✅ Loaded existing chat session:', session.sessionId);
                    return session;
                } else {
                    console.log('⏰ Chat session expired, clearing...');
                    this.clearSession();
                }
            }
        } catch (error) {
            console.error('Error loading chat session:', error);
        }
        return null;
    }

    /**
     * Save session to localStorage
     */
    saveSession(sessionData) {
        try {
            const session = {
                sessionId: sessionData.sessionId,
                customerName: sessionData.customerName,
                customerEmail: sessionData.customerEmail,
                timestamp: Date.now(),
                messages: sessionData.messages || []
            };
            localStorage.setItem(this.storageKey, JSON.stringify(session));
            this.currentSession = session;
            console.log('💾 Chat session saved:', session.sessionId);
        } catch (error) {
            console.error('Error saving chat session:', error);
        }
    }

    /**
     * Update session with new message
     */
    addMessage(message) {
        if (this.currentSession) {
            if (!this.currentSession.messages) {
                this.currentSession.messages = [];
            }
            this.currentSession.messages.push({
                text: message.text,
                isUser: message.isUser,
                timestamp: message.timestamp || new Date().toISOString()
            });
            this.saveSession(this.currentSession);
        }
    }

    /**
     * Get current session
     */
    getSession() {
        return this.currentSession;
    }

    /**
     * Check if there's an active session
     */
    hasActiveSession() {
        return this.currentSession !== null && this.currentSession.sessionId;
    }

    /**
     * Get session ID
     */
    getSessionId() {
        return this.currentSession ? this.currentSession.sessionId : null;
    }

    /**
     * Get customer info
     */
    getCustomerInfo() {
        if (this.currentSession) {
            return {
                name: this.currentSession.customerName,
                email: this.currentSession.customerEmail
            };
        }
        return null;
    }

    /**
     * Get all messages
     */
    getMessages() {
        return this.currentSession ? (this.currentSession.messages || []) : [];
    }

    /**
     * Clear session (logout/end chat)
     */
    clearSession() {
        try {
            localStorage.removeItem(this.storageKey);
            this.currentSession = null;
            console.log('🗑️ Chat session cleared');
        } catch (error) {
            console.error('Error clearing chat session:', error);
        }
    }

    /**
     * Connect to Socket.IO with existing session
     */
    connectSocket(serverUrl = null) {
        if (this.socket && this.socket.connected) {
            console.log('Socket already connected');
            return this.socket;
        }

        const targetUrl = (serverUrl || window.DISPUTE_SOCKET_URL || (() => {
            const origin = window.location.origin;
            const isLocalFrontend = /localhost:8080|127\.0\.0\.1:8080/i.test(origin);
            const fallback = isLocalFrontend ? 'http://localhost:5000' : origin;
            return fallback;
        })()).replace(/\/$/, '');

        if (typeof io !== 'function') {
            console.warn('Socket.IO client library is not available');
            this.socket = null;
            return null;
        }

        this.socket = io(targetUrl);

        this.socket.on('connect', () => {
            console.log('🔌 Socket connected');
            
            // If we have an existing session, rejoin it
            if (this.hasActiveSession()) {
                const info = this.getCustomerInfo();
                this.socket.emit('join_chat', {
                    sessionId: this.getSessionId(),
                    customerName: info.name,
                    customerEmail: info.email
                });
                console.log('↩️ Rejoined existing chat session');
            }
        });

        this.socket.on('session_created', (data) => {
            console.log('📝 Session created:', data.sessionId);
            // Update session ID if it's new
            if (this.currentSession) {
                this.currentSession.sessionId = data.sessionId;
                this.saveSession(this.currentSession);
            }
        });

        this.socket.on('disconnect', () => {
            console.log('🔌 Socket disconnected');
        });

        return this.socket;
    }

    /**
     * Initialize new chat session
     * If user is authenticated, use their info automatically
     */
    startNewSession(customerName = null, customerEmail = null) {
        // Use authenticated user info if available and no override provided
        if (this.isAuthenticated() && (!customerName || !customerEmail)) {
            customerName = customerName || this.authenticatedUser.name;
            customerEmail = customerEmail || this.authenticatedUser.email;
            console.log('🔐 Using authenticated user info for chat');
        }

        const sessionData = {
            sessionId: null, // Will be set by server
            customerName,
            customerEmail,
            messages: []
        };
        this.saveSession(sessionData);
        
        // Connect socket and join chat
        if (!this.socket || !this.socket.connected) {
            this.connectSocket();
        }

        if (!this.socket) {
            console.warn('Unable to establish chat socket connection');
            return;
        }

        // Wait for connection then join
        if (this.socket.connected) {
            this.socket.emit('join_chat', {
                sessionId: null,
                customerName,
                customerEmail
            });
        } else {
            this.socket.once('connect', () => {
                this.socket.emit('join_chat', {
                    sessionId: null,
                    customerName,
                    customerEmail
                });
            });
        }
    }

    /**
     * Send a message
     */
    sendMessage(text, isUser = true) {
        if (!this.socket || !this.socket.connected) {
            console.error('Socket not connected');
            return false;
        }

        if (!this.hasActiveSession()) {
            console.error('No active session');
            return false;
        }

        const message = {
            sessionId: this.getSessionId(),
            text,
            isUser,
            timestamp: new Date().toISOString()
        };

        this.socket.emit('send_message', message);
        this.addMessage(message);
        return true;
    }
}

// Create global instance
window.chatSessionManager = new ChatSessionManager();

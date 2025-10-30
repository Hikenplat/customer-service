// Types
interface DisputeFormData {
    transactionDate: string;
    transactionAmount: number;
    currency: string;
    role: string;
    referenceNumber?: string;
    authorizationStatus: string;
    disputeDescription: string;
    accountStatement?: string;
    fullName: string;
    email: string;
    phone?: string;
    documents?: File[];
    statementUpload?: File;
}

interface ChatMessage {
    text: string;
    isUser: boolean;
    timestamp: Date;
}

// Access Socket.IO client via window to avoid ambient redeclarations

// Main App Class
class DisputePortalApp {
    private form: HTMLFormElement;
    private chatMessages: ChatMessage[] = [];
    private socket: any = null;
    private chatSessionId: string | null = null;
    
    constructor() {
        this.form = document.getElementById('disputeForm') as HTMLFormElement;
        this.initializeEventListeners();
        this.initializeFileUploads();
        this.initializeChat();
        this.initializeEmailForm();
    }

    private initializeEventListeners(): void {
        // Form submission
        this.form.addEventListener('submit', (e) => this.handleFormSubmit(e));
        
        // Save draft button
        const saveDraftBtn = document.getElementById('saveDraftBtn');
        saveDraftBtn?.addEventListener('click', () => this.saveDraft());
        
        // Navigation
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
                (e.target as HTMLElement).classList.add('active');
            });
        });
    }

    private initializeFileUploads(): void {
        // Main documents upload
        const fileUploadArea = document.getElementById('fileUploadArea');
        const fileInput = document.getElementById('documents') as HTMLInputElement;
        const fileList = document.getElementById('fileList');

        fileUploadArea?.addEventListener('click', () => fileInput?.click());
        
        fileUploadArea?.addEventListener('dragover', (e) => {
            e.preventDefault();
            fileUploadArea.style.borderColor = 'var(--primary-red)';
            fileUploadArea.style.background = 'rgba(220, 20, 60, 0.05)';
        });
        
        fileUploadArea?.addEventListener('dragleave', () => {
            fileUploadArea.style.borderColor = '';
            fileUploadArea.style.background = '';
        });
        
        fileUploadArea?.addEventListener('drop', (e) => {
            e.preventDefault();
            fileUploadArea.style.borderColor = '';
            fileUploadArea.style.background = '';
            
            const files = e.dataTransfer?.files;
            if (files) {
                this.handleFiles(files, fileList as HTMLElement);
            }
        });

        fileInput?.addEventListener('change', (e) => {
            const files = (e.target as HTMLInputElement).files;
            if (files) {
                this.handleFiles(files, fileList as HTMLElement);
            }
        });

        // Statement upload
        const statementUploadArea = document.getElementById('statementUploadArea');
        const statementInput = document.getElementById('statementUpload') as HTMLInputElement;
        const statementFileList = document.getElementById('statementFileList');

        statementUploadArea?.addEventListener('click', () => statementInput?.click());

        statementInput?.addEventListener('change', (e) => {
            const files = (e.target as HTMLInputElement).files;
            if (files) {
                this.handleFiles(files, statementFileList as HTMLElement);
            }
        });
    }

    private handleFiles(files: FileList, container: HTMLElement): void {
        Array.from(files).forEach(file => {
            // Check file size (10MB limit)
            if (file.size > 10 * 1024 * 1024) {
                alert(`File ${file.name} is too large. Maximum size is 10MB.`);
                return;
            }

            const fileItem = document.createElement('div');
            fileItem.className = 'file-item';
            fileItem.innerHTML = `
                <div class="file-info">
                    <span class="file-name">${file.name}</span>
                    <span class="file-size">(${this.formatFileSize(file.size)})</span>
                </div>
                <button type="button" class="remove-file" aria-label="Remove file">×</button>
            `;

            const removeBtn = fileItem.querySelector('.remove-file');
            removeBtn?.addEventListener('click', () => fileItem.remove());

            container.appendChild(fileItem);
        });
    }

    private formatFileSize(bytes: number): string {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    private initializeChat(): void {
        const chatInput = document.getElementById('chatInput') as HTMLInputElement;
        const sendBtn = document.getElementById('sendChatBtn');
        const startChatBtn = document.getElementById('startChatBtn');
        const chatWelcomeForm = document.getElementById('chatWelcomeForm');
        const chatMessages = document.getElementById('chatMessages');
        const chatInputContainer = document.getElementById('chatInputContainer');

        // Initialize socket connection
        try {
            // Prefer long-polling to avoid environments that block WebSocket upgrades
            this.socket = (window as any).io('http://localhost:5000', {
                transports: ['polling'],
                upgrade: false,
                withCredentials: true,
                reconnection: true,
                reconnectionAttempts: 5,
                reconnectionDelay: 1000
            });
            this.socket.on('connect_error', (err: any) => {
                console.warn('Chat socket connect_error:', err?.message || err);
            });
            
            this.socket.on('connect', () => {
                console.log('✅ Socket connected:', this.socket?.id);
            });

            this.socket.on('new_message', (msg: any) => {
                console.log('📨 Received new_message:', msg);
                // Render admin/bot messages (don't render user's own messages again)
                if (!msg.isUser) {
                    this.addChatMessage(msg.text, false);
                }
            });

            this.socket.on('session_created', (data: any) => {
                console.log('🆕 Session created:', data.sessionId);
                this.chatSessionId = data.sessionId;
                if (this.chatSessionId) {
                    localStorage.setItem('chat_session_id', this.chatSessionId);
                }
            });

        } catch (e) {
            console.warn('Socket.IO unavailable, chat will be local only');
        }

        // Handle "Start Chat" button click
        startChatBtn?.addEventListener('click', () => {
            const chatNameInput = document.getElementById('chatNameInput') as HTMLInputElement;
            const chatEmailInput = document.getElementById('chatEmailInput') as HTMLInputElement;
            const name = chatNameInput?.value?.trim() || '';
            const email = chatEmailInput?.value?.trim() || '';
            const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

            if (!name) {
                alert('Please enter your name to start the chat.');
                chatNameInput?.focus();
                return;
            }

            if (!emailOk) {
                alert('Please enter a valid email address.');
                chatEmailInput?.focus();
                return;
            }

            // Join chat session with name and email
            if (this.socket) {
                const stored = localStorage.getItem('chat_session_id');
                const sessionId = stored && stored !== 'null' && stored !== 'undefined' && stored.length > 8 ? stored : null;
                
                console.log('🔗 Starting chat session with name:', name, 'email:', email);
                this.socket.emit('join_chat', { 
                    sessionId: sessionId || undefined, 
                    customerName: name, 
                    customerEmail: email 
                });

                // Hide welcome form, show chat interface
                if (chatWelcomeForm) chatWelcomeForm.style.display = 'none';
                if (chatMessages) chatMessages.style.display = 'block';
                if (chatInputContainer) chatInputContainer.style.display = 'flex';
            }
        });

        // Handle message sending
        sendBtn?.addEventListener('click', () => this.sendChatMessage());
        
        chatInput?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendChatMessage();
            }
        });

        // Check if user already has a session - if so, skip welcome form
        const existingSession = localStorage.getItem('chat_session_id');
        if (existingSession && existingSession !== 'null' && existingSession !== 'undefined' && existingSession.length > 8) {
            this.chatSessionId = existingSession;
            if (chatWelcomeForm) chatWelcomeForm.style.display = 'none';
            if (chatMessages) chatMessages.style.display = 'block';
            if (chatInputContainer) chatInputContainer.style.display = 'flex';
            console.log('📋 Restored existing session:', existingSession);
        }
    }

    private sendChatMessage(): void {
        const chatInput = document.getElementById('chatInput') as HTMLInputElement;
        const message = chatInput.value.trim();

        if (!message) return;

        // Session should already be created by "Start Chat" button
        if (!this.chatSessionId) {
            alert('Please start the chat session first.');
            return;
        }

        this.sendMessageToSocket(message, chatInput);
    }

    private sendMessageToSocket(message: string, chatInput: HTMLInputElement): void {
        // Add user message to UI
        this.addChatMessage(message, true);
        chatInput.value = '';

        // Send to server if socket is connected
        if (this.socket && this.chatSessionId) {
            console.log('📤 Sending message to session:', this.chatSessionId);
            this.socket.emit('send_message', { sessionId: this.chatSessionId, text: message, isUser: true });
        } else if (this.socket) {
            console.warn('⚠️ No session ID yet, waiting for session_created event');
        } else {
            // Fallback local bot response
            setTimeout(() => {
                const botResponse = this.getBotResponse(message);
                this.addChatMessage(botResponse, false);
            }, 1000);
        }
    }

    private addChatMessage(text: string, isUser: boolean): void {
        const chatMessages = document.getElementById('chatMessages');
        
        const messageDiv = document.createElement('div');
        messageDiv.className = `chat-message ${isUser ? 'user' : 'bot'}`;
        
        messageDiv.innerHTML = `
            <div class="message-avatar">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
                </svg>
            </div>
            <div class="message-content">
                <p>${this.escapeHtml(text)}</p>
            </div>
        `;

        chatMessages?.appendChild(messageDiv);
        chatMessages?.scrollTo({
            top: chatMessages.scrollHeight,
            behavior: 'smooth'
        });

        this.chatMessages.push({ text, isUser, timestamp: new Date() });
    }

    private getBotResponse(message: string): string {
        const lowerMessage = message.toLowerCase();
        
        if (lowerMessage.includes('help') || lowerMessage.includes('how')) {
            return "I'm here to help! You can fill out the dispute form on this page, and our team will review your case within 3-5 business days. What specific question do you have?";
        }
        if (lowerMessage.includes('document') || lowerMessage.includes('proof')) {
            return "You'll need to provide: transaction receipts, bank statements, emails, contracts, or any other relevant documentation that supports your dispute claim.";
        }
        if (lowerMessage.includes('time') || lowerMessage.includes('long')) {
            return "Most disputes are resolved within 3-5 business days. Complex cases may take up to 10 business days. You'll receive regular updates via email.";
        }
        if (lowerMessage.includes('status') || lowerMessage.includes('check')) {
            return "You can check your dispute status by using the reference number we'll send to your email after submission. Would you like me to help with anything else?";
        }
        if (lowerMessage.includes('thank')) {
            return "You're welcome! If you have any other questions, feel free to ask. We're here to help!";
        }
        
        return "Thank you for your message. A support representative will review your inquiry and respond shortly. In the meantime, please feel free to submit your dispute using the form.";
    }

    private initializeEmailForm(): void {
        const emailForm = document.getElementById('emailForm') as HTMLFormElement;
        
        emailForm?.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const subject = (document.getElementById('emailSubject') as HTMLInputElement).value;
            const message = (document.getElementById('emailMessage') as HTMLTextAreaElement).value;
            const fullName = (document.getElementById('fullName') as HTMLInputElement)?.value || 'Guest';
            const email = (document.getElementById('email') as HTMLInputElement)?.value || '';

            const anyWindow = window as any;
            try {
                if (anyWindow.api && typeof anyWindow.api.sendPublicEmail === 'function') {
                    await anyWindow.api.sendPublicEmail({ email, subject, message, fullName });
                    this.notifyEmailSent();
                } else {
                    await this.sendEmail(subject, message);
                }
            } catch (err) {
                console.error('Email send failed:', err);
                alert('Failed to send message. Please try again.');
            }
        });
    }

    private sendEmail(subject: string, message: string): void {
        // Simulate email sending
        console.log('Sending email:', { subject, message });
        
        this.notifyEmailSent();
        
        // Reset form
        const emailForm = document.getElementById('emailForm') as HTMLFormElement;
        emailForm.reset();
    }

    private notifyEmailSent(): void {
        alert('Email sent successfully! We\'ll respond within 24 hours.');
    }

    private handleFormSubmit(e: Event): void {
        e.preventDefault();
        
        if (!this.form.checkValidity()) {
            this.form.reportValidity();
            return;
        }

        // Build multipart form data to submit to backend
        const fd = new FormData(this.form);
        // Append files explicitly to ensure they're included
        const docsInput = document.getElementById('documents') as HTMLInputElement | null;
        if (docsInput && docsInput.files && docsInput.files.length > 0) {
            Array.from(docsInput.files).forEach((file) => fd.append('documents', file));
        }
        const statementInput = document.getElementById('statementUpload') as HTMLInputElement | null;
        if (statementInput && statementInput.files && statementInput.files.length > 0) {
            // Backend currently expects generic 'documents' array; include statement as a document as well
            Array.from(statementInput.files).forEach((file) => fd.append('documents', file));
        }

        this.submitDispute(fd);
    }

    private collectFormData(): DisputeFormData {
        const formData = new FormData(this.form);
        return {
            transactionDate: formData.get('transactionDate') as string,
            transactionAmount: parseFloat(formData.get('transactionAmount') as string),
            currency: formData.get('currency') as string,
            role: formData.get('role') as string,
            referenceNumber: formData.get('referenceNumber') as string,
            authorizationStatus: formData.get('authorizationStatus') as string,
            disputeDescription: formData.get('disputeDescription') as string,
            accountStatement: formData.get('accountStatement') as string,
            fullName: formData.get('fullName') as string,
            email: formData.get('email') as string,
            phone: formData.get('phone') as string
        };
    }

    private async submitDispute(fd: FormData | DisputeFormData): Promise<void> {
        try {
            // If we received a typed object (legacy path), convert to FormData
            let formData: FormData;
            if (fd instanceof FormData) {
                formData = fd;
            } else {
                formData = new FormData();
                Object.entries(fd).forEach(([k, v]) => {
                    if (v !== undefined && v !== null) formData.append(k, String(v));
                });
            }

            // Use global API client if available
            const anyWindow = window as any;
            if (!anyWindow.api || typeof anyWindow.api.submitDispute !== 'function') {
                console.warn('API client not available. Falling back to direct fetch.');
                const resp = await fetch('http://localhost:5000/api/disputes', {
                    method: 'POST',
                    body: formData
                });
                const data = await resp.json();
                if (!resp.ok || !data.success) throw new Error(data.error || 'Submission failed');
                const reference = data.data?.referenceNumber || data.data?.reference_number || 'DSP-' + Date.now().toString().slice(-8);
                this.onSubmitSuccess(reference);
                return;
            }

            const result = await anyWindow.api.submitDispute(formData);
            const reference = result?.data?.referenceNumber || result?.data?.reference_number || 'DSP-' + Date.now().toString().slice(-8);
            this.onSubmitSuccess(reference);
        } catch (err) {
            console.error('Submit dispute failed:', err);
            alert('Failed to submit dispute. Please try again.');
        }
    }

    private onSubmitSuccess(refNumber: string): void {
        // Show success modal
        this.showSuccessModal(refNumber);
        
        // Reset form
        this.form.reset();
        
        // Clear file lists
        const fileList = document.getElementById('fileList');
        const statementFileList = document.getElementById('statementFileList');
        if (fileList) fileList.innerHTML = '';
        if (statementFileList) statementFileList.innerHTML = '';
    }

    private showSuccessModal(refNumber: string): void {
        const modal = document.getElementById('successModal');
        const refNumberElement = document.getElementById('disputeRefNumber');
        
        if (refNumberElement) {
            refNumberElement.textContent = refNumber;
        }
        
        modal?.classList.add('active');
        
        // Store reference in localStorage
        this.saveToLocalStorage('lastDisputeRef', refNumber);
    }

    private saveDraft(): void {
        const formData = new FormData(this.form);
        const draftData: any = {};
        
        formData.forEach((value, key) => {
            draftData[key] = value;
        });
        
        this.saveToLocalStorage('disputeDraft', JSON.stringify(draftData));
        
        alert('Draft saved successfully!');
    }

    private saveToLocalStorage(key: string, value: string): void {
        try {
            localStorage.setItem(key, value);
        } catch (e) {
            console.error('Error saving to localStorage:', e);
        }
    }

    private escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Close modal function (global scope for inline onclick)
function closeModal(): void {
    const modal = document.getElementById('successModal');
    modal?.classList.remove('active');
}

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new DisputePortalApp());
} else {
    new DisputePortalApp();
}

// Intentionally not exporting anything to keep this a classic script (non-module)

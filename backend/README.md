# Dispute Portal Backend API

A comprehensive TypeScript-based backend for the Payment Dispute Portal with advanced admin control features.

## 🚀 Features

### Core Functionality
- ✅ **Dispute Management** - Full CRUD operations for payment disputes
- ✅ **Real-time Chat** - Socket.IO powered live chat with admin assignment
- ✅ **Email System** - Complete email management with threading
- ✅ **Email Templates** - WYSIWYG template management with variable substitution
- ✅ **File Uploads** - Secure multi-file upload with validation
- ✅ **Admin Authentication** - JWT-based secure authentication
- ✅ **Role-based Permissions** - Granular permission control
- ✅ **Dashboard Statistics** - Real-time analytics and metrics

### Admin Control Hub
- 📧 **Email Template Editor** - Create and manage email templates with variables
- 💬 **Chat Management** - View, assign, and respond to customer chats
- 📨 **Email Inbox** - Threaded email conversations with customers
- 👥 **User Management** - Admin user roles and permissions
- 📊 **Analytics Dashboard** - Comprehensive statistics and reporting
- 🔔 **Notifications** - Real-time alerts for new disputes, chats, emails

## 🛠️ Technology Stack

- **Runtime:** Node.js
- **Language:** TypeScript
- **Framework:** Express.js
- **Database:** SQLite (better-sqlite3)
- **Real-time:** Socket.IO
- **Authentication:** JWT (jsonwebtoken)
- **Email:** Nodemailer
- **File Upload:** Multer
- **Security:** Helmet, CORS, Rate Limiting

## 📋 Prerequisites

- Node.js 16+ installed
- npm or yarn package manager

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Environment Configuration

The `.env` file is already configured with defaults. Update these settings:

```env
# Email Configuration (for production)
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-specific-password
EMAIL_FROM=DisputePortal <your-email@gmail.com>

# JWT Secret (change in production!)
JWT_SECRET=your-super-secret-jwt-key-change-in-production-please
```

### 3. Build TypeScript

```bash
npm run build
```

### 4. Seed Database

```bash
npm run seed
```

This will create:
- Default admin user
- Sample email templates
- Database schema

### 5. Start Development Server

```bash
npm run dev
```

The server will start on **http://localhost:5000**

### 6. Start Production Server

```bash
npm start
```

## 📚 API Documentation

### Authentication

#### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "admin@disputeportal.com",
  "password": "Admin@SecurePass123"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": 86400,
    "user": {
      "id": "uuid",
      "email": "admin@disputeportal.com",
      "fullName": "System Administrator",
      "role": "super_admin",
      "permissions": ["view_disputes", "manage_disputes", ...]
    }
  }
}
```

#### Get Current User
```http
GET /api/auth/me
Authorization: Bearer {token}
```

### Disputes

#### Submit Dispute (Public - No Auth)
```http
POST /api/disputes
Content-Type: multipart/form-data

{
  "transactionDate": "2024-01-15",
  "transactionAmount": "500.00",
  "currency": "USD",
  "role": "cardholder",
  "authorizationStatus": "authorized",
  "disputeDescription": "Unauthorized transaction...",
  "fullName": "John Doe",
  "email": "john@example.com",
  "phone": "+1234567890",
  "documents": [File, File]
}
```

#### Get All Disputes (Admin)
```http
GET /api/disputes?page=1&limit=20&status=pending&priority=high
Authorization: Bearer {token}
```

**Query Parameters:**
- `page` (number): Page number
- `limit` (number): Items per page
- `status`: pending | under_review | resolved | rejected | escalated
- `priority`: low | medium | high | urgent
- `assignedTo` (string): Admin ID
- `dateFrom` (string): ISO date
- `dateTo` (string): ISO date
- `searchTerm` (string): Search in reference, name, email

#### Get Single Dispute
```http
GET /api/disputes/:id
Authorization: Bearer {token}
```

#### Update Dispute
```http
PATCH /api/disputes/:id
Authorization: Bearer {token}
Content-Type: application/json

{
  "status": "under_review",
  "priority": "high",
  "assignedTo": "admin-id",
  "resolution": "Resolution details..."
}
```

#### Get Dashboard Statistics
```http
GET /api/disputes/stats/dashboard
Authorization: Bearer {token}
```

### Email Templates

#### Get All Templates
```http
GET /api/email/templates
Authorization: Bearer {token}
```

#### Create Template
```http
POST /api/email/templates
Authorization: Bearer {token}
Content-Type: application/json

{
  "name": "Welcome Email",
  "subject": "Welcome {{customerName}}!",
  "body": "Dear {{customerName}},\n\nThank you for contacting us...",
  "variables": ["customerName", "referenceNumber"],
  "category": "custom"
}
```

**Categories:** `dispute_confirmation` | `status_update` | `resolution` | `follow_up` | `custom`

#### Update Template
```http
PATCH /api/email/templates/:id
Authorization: Bearer {token}
Content-Type: application/json

{
  "subject": "Updated subject with {{variable}}",
  "isActive": true
}
```

#### Delete Template
```http
DELETE /api/email/templates/:id
Authorization: Bearer {token}
```

### Email Threads & Messages

#### Get All Email Threads
```http
GET /api/email/threads?page=1&status=open&priority=high
Authorization: Bearer {token}
```

#### Get Thread with Messages
```http
GET /api/email/threads/:id
Authorization: Bearer {token}
```

#### Send Email (New Thread or Reply)
```http
POST /api/email/send
Authorization: Bearer {token}
Content-Type: application/json

{
  "to": "customer@example.com",
  "subject": "Re: Your Dispute",
  "body": "Thank you for your inquiry...",
  "threadId": "existing-thread-id",  // Optional
  "disputeId": "dispute-id"           // Optional
}
```

#### Update Email Thread
```http
PATCH /api/email/threads/:id
Authorization: Bearer {token}
Content-Type: application/json

{
  "status": "closed",
  "priority": "low",
  "assignedTo": "admin-id"
}
```

### Chat Sessions

#### Get All Chat Sessions
```http
GET /api/chat/sessions?page=1&status=active
Authorization: Bearer {token}
```

#### Get Session with Messages
```http
GET /api/chat/sessions/:id
Authorization: Bearer {token}
```

#### Update Chat Session
```http
PATCH /api/chat/sessions/:id
Authorization: Bearer {token}
Content-Type: application/json

{
  "status": "closed",
  "assignedTo": "admin-id"
}
```

#### Get Chat Statistics
```http
GET /api/chat/stats
Authorization: Bearer {token}
```

## 🔌 WebSocket Events (Socket.IO)

### Client → Server

#### Join Chat
```javascript
socket.emit('join_chat', {
  sessionId: 'optional-existing-session-id',
  customerName: 'John Doe',
  customerEmail: 'john@example.com'
});
```

#### Send Message
```javascript
socket.emit('send_message', {
  sessionId: 'session-id',
  text: 'Hello, I need help',
  isUser: true
});
```

#### Admin Join
```javascript
socket.emit('join_admin', {
  adminId: 'admin-id'
});
```

#### Admin Join Session
```javascript
socket.emit('admin_join_session', {
  sessionId: 'session-id',
  adminId: 'admin-id'
});
```

#### Typing Indicator
```javascript
socket.emit('typing', {
  sessionId: 'session-id',
  isTyping: true,
  isAdmin: false
});
```

#### Close Chat
```javascript
socket.emit('close_chat', {
  sessionId: 'session-id'
});
```

### Server → Client

#### Session Created
```javascript
socket.on('session_created', (data) => {
  console.log('Session ID:', data.sessionId);
});
```

#### New Message
```javascript
socket.on('new_message', (message) => {
  console.log('Message:', message);
});
```

#### Admin Joined
```javascript
socket.on('admin_joined', (data) => {
  console.log('Admin joined:', data.adminId);
});
```

#### Typing Indicator
```javascript
socket.on('typing_indicator', (data) => {
  console.log('Typing:', data.isTyping, 'Is Admin:', data.isAdmin);
});
```

## 🗄️ Database Schema

### Tables

1. **admin_users** - Admin user accounts
2. **disputes** - Payment dispute records
3. **email_templates** - Email template library
4. **email_threads** - Email conversation threads
5. **email_messages** - Individual email messages
6. **chat_sessions** - Live chat sessions
7. **chat_messages** - Chat messages
8. **file_uploads** - Uploaded file records
9. **notifications** - System notifications

## 🔐 Admin Permissions

- `view_disputes` - View dispute records
- `manage_disputes` - Update/assign disputes
- `view_chats` - View chat sessions
- `respond_chats` - Respond to chats
- `view_emails` - View email threads
- `send_emails` - Send/reply to emails
- `manage_templates` - Create/edit email templates
- `manage_users` - Manage admin users
- `view_analytics` - View dashboard statistics

## 🔒 Security Features

- ✅ JWT authentication with expiration
- ✅ Password hashing (bcrypt)
- ✅ CORS protection
- ✅ Helmet security headers
- ✅ Rate limiting
- ✅ File upload validation
- ✅ SQL injection prevention (parameterized queries)
- ✅ Role-based access control

## 📊 Default Admin Credentials

```
Email: admin@disputeportal.com
Password: Admin@SecurePass123
```

**⚠️ IMPORTANT:** Change these credentials in production!

## 🎯 Integration with Frontend

The backend is designed to work with the root `/dispute` frontend application.

### Frontend Configuration

Update your frontend to point to the backend:

```javascript
const API_URL = 'http://localhost:5000/api';
const SOCKET_URL = 'http://localhost:5000';

// Socket.IO connection
const socket = io(SOCKET_URL);

// API calls
fetch(`${API_URL}/disputes`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify(disputeData)
});
```

## 📝 Development Scripts

```bash
npm run build      # Compile TypeScript
npm run dev        # Start development server with auto-reload
npm run start      # Start production server
npm run watch      # Watch TypeScript changes
npm run seed       # Seed database with initial data
```

## 🐛 Troubleshooting

### Email not sending
- Check `.env` EMAIL_USER and EMAIL_PASSWORD
- For Gmail, use App-Specific Password
- Email service is optional - app works without it

### Database locked
- Close any SQLite browser/viewer
- Restart the server

### Port already in use
- Change PORT in `.env` file
- Kill process using port: `netstat -ano | findstr :5000`

## 📦 Production Deployment

1. Set `NODE_ENV=production` in `.env`
2. Update `JWT_SECRET` with secure random string
3. Configure email service credentials
4. Build TypeScript: `npm run build`
5. Start server: `npm start`
6. Use process manager (PM2): `pm2 start dist/server.js`

## 🤝 Support

For issues or questions, check the documentation or contact the development team.

---

**Built with ❤️ using TypeScript + Express + Socket.IO**

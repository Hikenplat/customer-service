import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import path from 'path';
import fs from 'fs';

// Load environment variables
dotenv.config();

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('📁 Created uploads directory');
}

// Import database and socket
import { initializeDatabase } from './database/db';
import { initializeSocketIO } from './socket/chatSocket';

// Import routes
import authRoutes from './routes/auth';
import disputeRoutes from './routes/disputes';
import emailRoutes from './routes/email';
import chatRoutes from './routes/chat';

const app = express();
const httpServer = createServer(app);

// Initialize Socket.IO
const io = initializeSocketIO(httpServer);

// Security middleware
app.use(helmet());

// CORS configuration
// When serving frontend from same server, we still need CORS for Socket.IO and development
const defaultOrigins = [
  'http://localhost:5000',      // Same-origin (backend serves frontend)
  'http://127.0.0.1:5000',      // Same-origin (alternative localhost)
  'http://localhost:8080',      // Development frontend server
  'http://127.0.0.1:8080'       // Development frontend server
];
const envOrigin = process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : [];
const envOrigins = process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',').map(o => o.trim()).filter(Boolean) : [];
const allowedOrigins = Array.from(new Set([...defaultOrigins, ...envOrigin, ...envOrigins]));

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, Postman, or same-origin)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200
}));

// Compression
app.use(compression());

// Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});

app.use('/api/', limiter);

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Serve static frontend files (HTML, CSS, JS)
const frontendPath = path.join(__dirname, '../../');
app.use('/styles', express.static(path.join(frontendPath, 'styles')));
app.use('/scripts', express.static(path.join(frontendPath, 'scripts')));

// API Routes (must come before static file serving)
app.use('/api/auth', authRoutes);
app.use('/api/disputes', disputeRoutes);
app.use('/api/email', emailRoutes);
app.use('/api/chat', chatRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    success: true,
    message: 'Dispute Portal API is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Serve frontend HTML pages
app.get('/', (_req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

app.get('/admin', (_req, res) => {
  res.sendFile(path.join(frontendPath, 'admin.html'));
});

app.get('/track', (_req, res) => {
  res.sendFile(path.join(frontendPath, 'track.html'));
});

// 404 handler for other routes - serve a simple 404 page
app.use((_req, res) => {
  res.status(404).send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>404 - Page Not Found</title>
      <style>
        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
        h1 { color: #333; }
        a { color: #3b82f6; text-decoration: none; }
      </style>
    </head>
    <body>
      <h1>404 - Page Not Found</h1>
      <p>The page you're looking for doesn't exist.</p>
      <p><a href="/">Go to Home</a> | <a href="/admin">Admin Panel</a> | <a href="/track">Track Dispute</a></p>
    </body>
    </html>
  `);
});

// Error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Error:', err);
  
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal server error'
  });
});

// Initialize database and start server
const PORT = process.env.PORT || 5000;

initializeDatabase().then(() => {
  httpServer.listen(PORT, () => {
    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║                                                           ║');
    console.log('║         🚀  DISPUTE PORTAL APPLICATION STARTED  🚀        ║');
    console.log('║                                                           ║');
    console.log('╠═══════════════════════════════════════════════════════════╣');
    console.log(`║  Server:         http://localhost:${PORT}                    ║`);
    console.log('║  WebSocket:      ✅ Socket.IO Connected                    ║');
    console.log('║  Database:       ✅ lowdb JSON Database                   ║');
    console.log('╠═══════════════════════════════════════════════════════════╣');
    console.log('║  PAGES:                                                   ║');
    console.log(`║  • Home:         http://localhost:${PORT}/                   ║`);
    console.log(`║  • Admin Panel:  http://localhost:${PORT}/admin              ║`);
    console.log(`║  • Track:        http://localhost:${PORT}/track              ║`);
    console.log('╠═══════════════════════════════════════════════════════════╣');
    console.log('║  API ENDPOINTS:                                           ║');
    console.log('║  • POST   /api/auth/login                                 ║');
    console.log('║  • GET    /api/auth/me                                    ║');
    console.log('║  • POST   /api/disputes                                   ║');
    console.log('║  • GET    /api/disputes                                   ║');
    console.log('║  • PATCH  /api/disputes/:id                               ║');
    console.log('║  • POST   /api/disputes/track                             ║');
    console.log('║  • GET    /api/disputes/stats/dashboard                   ║');
    console.log('║  • GET    /api/email/templates                            ║');
    console.log('║  • GET    /api/email/threads                              ║');
    console.log('║  • POST   /api/email/send                                 ║');
    console.log('║  • GET    /api/chat/sessions                              ║');
    console.log('║  • PATCH  /api/chat/sessions/:id                          ║');
    console.log(`║  • GET    /api/health                                     ║`);
    console.log('╚═══════════════════════════════════════════════════════════╝');
    console.log('');
    console.log('📝 Admin credentials are shown above during database initialization');
  });
});

export { app, httpServer, io };

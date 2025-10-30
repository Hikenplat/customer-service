import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import path from 'path';

// Load environment variables
dotenv.config();

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

// CORS configuration - allow localhost and 127.0.0.1 by default, plus optional env overrides
const defaultOrigins = ['http://localhost:8080', 'http://127.0.0.1:8080'];
const envOrigin = process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : [];
const envOrigins = process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',').map(o => o.trim()).filter(Boolean) : [];
const allowedOrigins = Array.from(new Set([...defaultOrigins, ...envOrigin, ...envOrigins]));

app.use(cors({
  origin: (origin, callback) => {
    // allow REST tools or same-origin requests with no origin
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

// API Routes
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

// 404 handler
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  });
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
    console.log('║       🚀  DISPUTE PORTAL BACKEND API STARTED  🚀         ║');
    console.log('║                                                           ║');
    console.log('╠═══════════════════════════════════════════════════════════╣');
    console.log(`║  Server:         http://localhost:${PORT}                    ║`);
    console.log(`║  API Health:     http://localhost:${PORT}/api/health         ║`);
    console.log('║  WebSocket:      ✅ Socket.IO Connected                    ║');
    console.log('║  Database:       ✅ lowdb JSON Database                   ║');
    console.log('╠═══════════════════════════════════════════════════════════╣');
    console.log('║  ENDPOINTS:                                               ║');
    console.log('║  • POST   /api/auth/login                                 ║');
    console.log('║  • GET    /api/auth/me                                    ║');
    console.log('║  • POST   /api/disputes                                   ║');
    console.log('║  • GET    /api/disputes                                   ║');
    console.log('║  • GET    /api/disputes/:id                               ║');
    console.log('║  • PATCH  /api/disputes/:id                               ║');
    console.log('║  • GET    /api/disputes/stats/dashboard                   ║');
    console.log('║  • GET    /api/email/templates                            ║');
    console.log('║  • POST   /api/email/templates                            ║');
    console.log('║  • GET    /api/email/threads                              ║');
    console.log('║  • POST   /api/email/send                                 ║');
    console.log('║  • GET    /api/chat/sessions                              ║');
    console.log('║  • GET    /api/chat/sessions/:id                          ║');
    console.log('║  • PATCH  /api/chat/sessions/:id                          ║');
    console.log('╠═══════════════════════════════════════════════════════════╣');
    console.log('║  ADMIN CREDENTIALS:                                       ║');
    console.log('║  Email:    admin@disputeportal.com                        ║');
    console.log('║  Password: Admin@SecurePass123                            ║');
    console.log('╚═══════════════════════════════════════════════════════════╝');
  });
});

export { app, httpServer, io };

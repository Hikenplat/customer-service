import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { getDb } from '../database/db';
import { v4 as uuidv4 } from 'uuid';
import { ChatMessage } from '../types';

let ioInstance: SocketIOServer | null = null;

export function initializeSocketIO(httpServer: HTTPServer): SocketIOServer {
  const defaultOrigins = ['http://localhost:8080', 'http://127.0.0.1:8080'];
  const envOrigin = process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : [];
  const envOrigins = process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',').map(o => o.trim()).filter(Boolean) : [];
  const allowedOrigins = Array.from(new Set([...defaultOrigins, ...envOrigin, ...envOrigins]));

  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        return callback(null, false);
      },
      methods: ['GET', 'POST'],
      credentials: true
    }
  });

  ioInstance = io;

  io.on('connection', (socket: Socket) => {
    console.log('🔌 Client connected:', socket.id);

    // Join chat session
    socket.on('join_chat', async (data: { sessionId?: string | null; customerName: string; customerEmail?: string }) => {
      const db = await getDb();
      let sessionId = (data.sessionId && data.sessionId !== 'null' && data.sessionId !== 'undefined') ? data.sessionId : undefined;

      const ensureSession = () => {
        const existing = sessionId ? db.data.chat_sessions.find((s: any) => s.id === sessionId) : null;
        if (existing) {
          existing.last_message_at = new Date().toISOString();
          return existing.id;
        }
        const newId = uuidv4();
        const customerId = socket.id;
        const now = new Date().toISOString();
        const newSession: any = {
          id: newId,
          customer_id: customerId,
          customer_name: data.customerName,
          customer_email: data.customerEmail || null,
          status: 'active',
          assigned_to: null,
          started_at: now,
          ended_at: null,
          last_message_at: now,
          unread_count: 0
        };
        db.data.chat_sessions.push(newSession);
        return newId;
      };

      sessionId = ensureSession();
      await db.write();
      console.log(`✅ Chat session ready: ${sessionId}`);

      if (sessionId) {
        socket.join(sessionId);
        socket.emit('session_created', { sessionId });
      }

      // Notify admins of new/active chat
      io.to('admin_room').emit('chat_update', {
        type: 'new_session',
        sessionId,
        customerName: data.customerName
      });
    });

    // Send chat message
    socket.on('send_message', async (data: { sessionId: string; text: string; isUser: boolean; adminId?: string }) => {
      const db = await getDb();
      const messageId = uuidv4();
      const timestamp = new Date().toISOString();

      const message: ChatMessage = {
        id: messageId,
        sessionId: data.sessionId,
        text: data.text,
        isUser: data.isUser,
        timestamp,
        status: 'sent'
      };

      // Save to database
      const dbMessage: any = {
        id: messageId,
        session_id: data.sessionId,
        text: data.text,
        is_user: data.isUser,
        timestamp,
        status: 'sent',
        user_id: data.isUser ? socket.id : null,
        admin_id: data.isUser ? null : (data.adminId || null)
      };

      db.data.chat_messages.push(dbMessage);

      // Update session last message time
      const session = db.data.chat_sessions.find((s: any) => s.id === data.sessionId);
      if (session) {
        session.last_message_at = timestamp;
        if (data.isUser) {
          session.unread_count = (session.unread_count || 0) + 1;
        }
      }

      await db.write();

      console.log(`💬 Message sent in session ${data.sessionId} by ${data.isUser ? 'user' : 'admin'}: "${data.text}"`);

      // Broadcast to all clients in the session room
      io.to(data.sessionId).emit('new_message', message);
      
      // ALSO emit directly to the socket that sent it (for immediate feedback)
      socket.emit('new_message', message);

      // Notify admins if message is from user
      if (data.isUser) {
        io.to('admin_room').emit('customer_message', {
          sessionId: data.sessionId,
          text: data.text,
          message
        });
      }
      
      console.log(`📤 Message broadcasted to session room: ${data.sessionId}`);
    });

    // Admin joins admin room
    socket.on('join_admin', (data: { adminId: string }) => {
      socket.join('admin_room');
      console.log(`👨‍💼 Admin joined: ${data.adminId}`);
    });

    // Admin joins specific chat session
    socket.on('admin_join_session', async (data: { sessionId: string; adminId: string }) => {
      const db = await getDb();
      socket.join(data.sessionId);

      // Assign admin to session
      const session = db.data.chat_sessions.find((s: any) => s.id === data.sessionId);
      if (session) {
        session.assigned_to = data.adminId;
        session.unread_count = 0;
        await db.write();
      }

      // Notify customer
      io.to(data.sessionId).emit('admin_joined', {
        adminId: data.adminId,
        message: 'An agent has joined the chat'
      });
    });

    // Typing indicator
    socket.on('typing', (data: { sessionId: string; isTyping: boolean; isAdmin: boolean }) => {
      socket.to(data.sessionId).emit('typing_indicator', {
        isTyping: data.isTyping,
        isAdmin: data.isAdmin
      });
    });

    // Mark messages as read
    socket.on('mark_read', async (data: { sessionId: string }) => {
      const db = await getDb();
      
      // Update all messages in session to read
      db.data.chat_messages.forEach((m: any) => {
        if (m.session_id === data.sessionId && m.status !== 'read') {
          m.status = 'read';
        }
      });

      await db.write();

      io.to(data.sessionId).emit('messages_read', { sessionId: data.sessionId });
    });

    // Close chat session
    socket.on('close_chat', async (data: { sessionId: string }) => {
      const db = await getDb();
      
      const session = db.data.chat_sessions.find((s: any) => s.id === data.sessionId);
      if (session) {
        session.status = 'closed';
        session.ended_at = new Date().toISOString();
        await db.write();
      }

      io.to(data.sessionId).emit('chat_closed', { sessionId: data.sessionId });
      socket.leave(data.sessionId);
    });

    socket.on('disconnect', () => {
      console.log('🔌 Client disconnected:', socket.id);
    });
  });

  console.log('✅ Socket.IO initialized');
  return io;
}

export function getIO(): SocketIOServer | null {
  return ioInstance;
}

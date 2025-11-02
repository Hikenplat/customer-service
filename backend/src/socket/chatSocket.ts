import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import prisma from '../database/prismaClient';
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
      let sessionId = (data.sessionId && data.sessionId !== 'null' && data.sessionId !== 'undefined') ? data.sessionId : undefined;

      const ensureSession = async () => {
        // Check if existing session
        if (sessionId) {
          const existing = await prisma.chatSession.findUnique({
            where: { id: sessionId }
          });
          if (existing) {
            // Update last message time
            await prisma.chatSession.update({
              where: { id: sessionId },
              data: { lastMessageAt: new Date() }
            });
            return existing.id;
          }
        }

        // Create new session
        const newSession = await prisma.chatSession.create({
          data: {
            customerId: socket.id,
            customerName: data.customerName,
            customerEmail: data.customerEmail || 'guest@example.com',
            status: 'active'
          }
        });
        return newSession.id;
      };

      sessionId = await ensureSession();
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
      const timestamp = new Date();

      const message: ChatMessage = {
        id: '',  // Will be set after creation
        sessionId: data.sessionId,
        text: data.text,
        isUser: data.isUser,
        timestamp: timestamp.toISOString(),
        status: 'sent'
      };

      // Save to database
      const dbMessage = await prisma.chatMessage.create({
        data: {
          sessionId: data.sessionId,
          sender: data.isUser ? 'customer' : 'agent',
          message: data.text,
          isUser: data.isUser,
          userId: data.isUser ? socket.id : null,
          adminId: data.isUser ? null : (data.adminId || null)
        }
      });

      message.id = dbMessage.id;

      // Update session last message time and unread count
      const updateData: any = { lastMessageAt: timestamp };
      if (data.isUser) {
        updateData.unreadCount = { increment: 1 };
      }
      
      await prisma.chatSession.update({
        where: { id: data.sessionId },
        data: updateData
      });

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
      socket.join(data.sessionId);

      // Assign admin to session and reset unread count
      await prisma.chatSession.update({
        where: { id: data.sessionId },
        data: {
          assignedTo: data.adminId,
          unreadCount: 0
        }
      });

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
      // Update all unread messages in session to read
      await prisma.chatMessage.updateMany({
        where: {
          sessionId: data.sessionId,
          status: { not: 'read' }
        },
        data: { status: 'read' }
      });

      io.to(data.sessionId).emit('messages_read', { sessionId: data.sessionId });
    });

    // Close chat session
    socket.on('close_chat', async (data: { sessionId: string }) => {
      await prisma.chatSession.update({
        where: { id: data.sessionId },
        data: {
          status: 'closed',
          endedAt: new Date()
        }
      });

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

import { Router, Response } from 'express';
import { getDb } from '../database/db';
import { authenticateToken, requirePermission, AuthRequest } from '../middleware/auth';
import { ChatSession, ApiResponse, PaginatedResponse } from '../types';
import emailService from '../services/emailService';

const router = Router();

// Get all chat sessions
router.get('/sessions', authenticateToken, requirePermission('view_chats'), async (req: AuthRequest, res: Response<PaginatedResponse<ChatSession>>) => {
  try {
    const db = await getDb();
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;

    const { status, assignedTo } = req.query;

    let sessions = [...db.data.chat_sessions];

    if (status) {
      sessions = sessions.filter((s: any) => s.status === status);
    }

    if (assignedTo) {
      sessions = sessions.filter((s: any) => s.assigned_to === assignedTo);
    }

    sessions.sort((a: any, b: any) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime());

    const total = sessions.length;
    const paginatedSessions = sessions.slice(offset, offset + limit);

    res.json({
      success: true,
      data: paginatedSessions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get chat sessions error:', error);
    res.status(500).json({ success: false, data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } });
  }
});

// Get single chat session with messages
router.get('/sessions/:id', authenticateToken, requirePermission('view_chats'), async (req: AuthRequest, res: Response<ApiResponse<any>>) => {
  try {
    const db = await getDb();
    const session = db.data.chat_sessions.find((s: any) => s.id === req.params.id);

    if (!session) {
      res.status(404).json({ success: false, error: 'Chat session not found' });
      return;
    }

    const messages = db.data.chat_messages.filter((m: any) => m.session_id === req.params.id);
    messages.sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    res.json({
      success: true,
      data: {
        ...session,
        messages
      }
    });
  } catch (error) {
    console.error('Get chat session error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve chat session' });
  }
});

// Update chat session (assign, close, etc.)
router.patch('/sessions/:id', authenticateToken, requirePermission('respond_chats'), async (req: AuthRequest, res: Response<ApiResponse<ChatSession>>) => {
  try {
    const db = await getDb();
    const { status, assignedTo } = req.body;
    
    const session = db.data.chat_sessions.find((s: any) => s.id === req.params.id);

    if (!session) {
      res.status(404).json({ success: false, error: 'Session not found' });
      return;
    }

    if (status) {
      session.status = status;
      if (status === 'closed') {
        session.ended_at = new Date().toISOString();
      }
    }

    if (assignedTo !== undefined) {
      session.assigned_to = assignedTo;
    }

    await db.write();

    res.json({
      success: true,
      data: session,
      message: 'Chat session updated successfully'
    });
  } catch (error) {
    console.error('Update chat session error:', error);
    res.status(500).json({ success: false, error: 'Failed to update chat session' });
  }
});

// Get chat statistics
router.get('/stats', authenticateToken, requirePermission('view_chats'), async (_req: AuthRequest, res) => {
  try {
    const db = await getDb();
    
    const activeChats = db.data.chat_sessions.filter((s: any) => s.status === 'active').length;
    const waitingChats = db.data.chat_sessions.filter((s: any) => s.status === 'waiting').length;
    const closedToday = db.data.chat_sessions.filter((s: any) => {
      if (s.status === 'closed' && s.ended_at) {
        return s.ended_at.startsWith(new Date().toISOString().split('T')[0]);
      }
      return false;
    }).length;

    res.json({
      success: true,
      data: {
        activeChats,
        waitingChats,
        closedToday
      }
    });
  } catch (error) {
    console.error('Chat stats error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve chat statistics' });
  }
});

export default router;

// Send chat transcript via email and optionally close session
router.post('/sessions/:id/transcript', authenticateToken, requirePermission('respond_chats'), async (req: AuthRequest, res: Response<ApiResponse<any>>) => {
  try {
    const db = await getDb();
    const { to, close } = req.body || {};

    const session = db.data.chat_sessions.find((s: any) => s.id === req.params.id);
    if (!session) {
      res.status(404).json({ success: false, error: 'Session not found' });
      return;
    }

    const messages = db.data.chat_messages
      .filter((m: any) => m.session_id === req.params.id)
      .sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    const lines = messages.map((m: any) => {
      const who = m.is_user ? (session.customer_name || 'Customer') : 'Agent';
      const at = new Date(m.timestamp).toLocaleString();
      return `[${at}] ${who}: ${m.text}`;
    });
    const body = `Hello ${session.customer_name || ''},\n\nHere is the transcript of your recent chat with our support team (Session ${session.id}).\n\n${lines.join('\n')}\n\nBest regards,\nDispute Support`;
    const subject = `Chat Transcript - Session ${session.id}`;

    const recipient = to || session.customer_email;
    if (!recipient) {
      res.status(400).json({ success: false, error: 'Recipient email not available' });
      return;
    }

    const sent = await emailService.sendEmail(recipient, subject, body);

    if (close) {
      session.status = 'closed';
      session.ended_at = new Date().toISOString();
      await db.write();
    }

    res.json({ success: true, data: { sent, to: recipient }, message: 'Transcript sent successfully' });
  } catch (error) {
    console.error('Transcript error:', error);
    res.status(500).json({ success: false, error: 'Failed to send transcript' });
  }
});

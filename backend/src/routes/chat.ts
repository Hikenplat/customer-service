import { Router, Response } from 'express';
import prisma from '../database/prismaClient';
import { authenticateToken, requirePermission, AuthRequest } from '../middleware/auth';
import { ChatSession, ApiResponse, PaginatedResponse } from '../types';
import emailService from '../services/emailService';

const router = Router();

// Get all chat sessions
router.get('/sessions', authenticateToken, requirePermission('view_chats'), async (req: AuthRequest, res: Response<PaginatedResponse<ChatSession>>) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const { status, assignedTo } = req.query;

    const where: any = {};
    if (status) where.status = status;
    if (assignedTo) where.assignedTo = assignedTo;

    const [sessions, total] = await Promise.all([
      prisma.chatSession.findMany({
        where,
        skip,
        take: limit,
        orderBy: { lastMessageAt: 'desc' }
      }),
      prisma.chatSession.count({ where })
    ]);

    res.json({
      success: true,
      data: sessions as any[],
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
    const session = await prisma.chatSession.findUnique({
      where: { id: req.params.id },
      include: {
        messages: {
          orderBy: { timestamp: 'asc' }
        }
      }
    });

    if (!session) {
      res.status(404).json({ success: false, error: 'Chat session not found' });
      return;
    }

    res.json({
      success: true,
      data: session
    });
  } catch (error) {
    console.error('Get chat session error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve chat session' });
  }
});

// Update chat session (assign, close, etc.)
router.patch('/sessions/:id', authenticateToken, requirePermission('respond_chats'), async (req: AuthRequest, res: Response<ApiResponse<ChatSession>>) => {
  try {
    const { status, assignedTo } = req.body;
    
    const updateData: any = {};
    if (status) {
      updateData.status = status;
      if (status === 'closed') {
        updateData.endedAt = new Date();
      }
    }
    if (assignedTo !== undefined) {
      updateData.assignedTo = assignedTo;
    }

    const session = await prisma.chatSession.update({
      where: { id: req.params.id },
      data: updateData
    });

    res.json({
      success: true,
      data: session as any,
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
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const [activeChats, waitingChats, closedToday] = await Promise.all([
      prisma.chatSession.count({ where: { status: 'active' } }),
      prisma.chatSession.count({ where: { status: 'waiting' } }),
      prisma.chatSession.count({
        where: {
          status: 'closed',
          endedAt: { gte: today }
        }
      })
    ]);

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

// Send chat transcript via email and optionally close session
router.post('/sessions/:id/transcript', authenticateToken, requirePermission('respond_chats'), async (req: AuthRequest, res: Response<ApiResponse<any>>) => {
  try {
    const { to, close } = req.body || {};

    const session = await prisma.chatSession.findUnique({
      where: { id: req.params.id },
      include: {
        messages: {
          orderBy: { timestamp: 'asc' }
        }
      }
    });

    if (!session) {
      res.status(404).json({ success: false, error: 'Session not found' });
      return;
    }

    const lines = session.messages.map((m: any) => {
      const who = m.isUser ? (session.customerName || 'Customer') : 'Agent';
      const at = new Date(m.timestamp).toLocaleString();
      return `[${at}] ${who}: ${m.message}`;
    });
    const body = `Hello ${session.customerName || ''},\n\nHere is the transcript of your recent chat with our support team (Session ${session.id}).\n\n${lines.join('\n')}\n\nBest regards,\nDispute Support`;
    const subject = `Chat Transcript - Session ${session.id}`;

    const recipient = to || session.customerEmail;
    if (!recipient) {
      res.status(400).json({ success: false, error: 'Recipient email not available' });
      return;
    }

    const sent = await emailService.sendEmail(recipient, subject, body);

    if (close) {
      await prisma.chatSession.update({
        where: { id: req.params.id },
        data: {
          status: 'closed',
          endedAt: new Date()
        }
      });
    }

    res.json({ success: true, data: { sent, to: recipient }, message: 'Transcript sent successfully' });
  } catch (error) {
    console.error('Transcript error:', error);
    res.status(500).json({ success: false, error: 'Failed to send transcript' });
  }
});

export default router;

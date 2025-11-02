import { Router, Response } from 'express';
import prisma from '../database/prismaClient';
import { authenticateToken, requirePermission, AuthRequest } from '../middleware/auth';
import { EmailTemplate, EmailThread, ApiResponse, PaginatedResponse } from '../types';
import emailService from '../services/emailService';
import { getIO } from '../socket/chatSocket';

const router = Router();

// ==========================================
// EMAIL TEMPLATES
// ==========================================

// Get all email templates
router.get('/templates', authenticateToken, requirePermission('manage_templates'), async (_req: AuthRequest, res: Response<ApiResponse<EmailTemplate[]>>) => {
  try {
    const templates = await prisma.emailTemplate.findMany();
    res.json({
      success: true,
      data: templates as any[]
    });
  } catch (error) {
    console.error('Get templates error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve templates' });
  }
});

// Get single email template
router.get('/templates/:id', authenticateToken, requirePermission('manage_templates'), async (req: AuthRequest, res: Response<ApiResponse<EmailTemplate>>) => {
  try {
    const template = await prisma.emailTemplate.findUnique({
      where: { id: req.params.id }
    });

    if (!template) {
      res.status(404).json({ success: false, error: 'Template not found' });
      return;
    }

    res.json({
      success: true,
      data: template as any
    });
  } catch (error) {
    console.error('Get template error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve template' });
  }
});

// Create email template
router.post('/templates', authenticateToken, requirePermission('manage_templates'), async (req: AuthRequest, res: Response<ApiResponse<EmailTemplate>>) => {
  try {
    const { name, subject, body, variables, category } = req.body;

    if (!name || !subject || !body || !category) {
      res.status(400).json({ success: false, error: 'Missing required fields' });
      return;
    }

    const template = await prisma.emailTemplate.create({
      data: {
        name,
        subject,
        body,
        variables: variables || [],
        category,
        isActive: true
      }
    });

    res.status(201).json({
      success: true,
      data: template as any,
      message: 'Template created successfully'
    });
  } catch (error) {
    console.error('Create template error:', error);
    res.status(500).json({ success: false, error: 'Failed to create template' });
  }
});

// Update email template
router.patch('/templates/:id', authenticateToken, requirePermission('manage_templates'), async (req: AuthRequest, res: Response<ApiResponse<EmailTemplate>>) => {
  try {
    const { name, subject, body, variables, category, isActive } = req.body;
    
    const updateData: any = {};
    if (name) updateData.name = name;
    if (subject) updateData.subject = subject;
    if (body) updateData.body = body;
    if (variables) updateData.variables = variables;
    if (category) updateData.category = category;
    if (isActive !== undefined) updateData.isActive = isActive;

    const template = await prisma.emailTemplate.update({
      where: { id: req.params.id },
      data: updateData
    });

    res.json({
      success: true,
      data: template as any,
      message: 'Template updated successfully'
    });
  } catch (error) {
    console.error('Update template error:', error);
    res.status(500).json({ success: false, error: 'Failed to update template' });
  }
});

// Delete email template
router.delete('/templates/:id', authenticateToken, requirePermission('manage_templates'), async (req: AuthRequest, res: Response<ApiResponse<void>>) => {
  try {
    await prisma.emailTemplate.delete({
      where: { id: req.params.id }
    });

    res.json({
      success: true,
      message: 'Template deleted successfully'
    });
  } catch (error) {
    console.error('Delete template error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete template' });
  }
});

// ==========================================
// EMAIL THREADS & MESSAGES
// ==========================================

// Get all email threads
router.get('/threads', authenticateToken, requirePermission('view_emails'), async (req: AuthRequest, res: Response<PaginatedResponse<EmailThread>>) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const { status, priority, assignedTo } = req.query;

    const where: any = {};
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (assignedTo) where.assignedTo = assignedTo;

    const [threads, total] = await Promise.all([
      prisma.emailThread.findMany({
        where,
        skip,
        take: limit,
        orderBy: { lastMessageAt: 'desc' }
      }),
      prisma.emailThread.count({ where })
    ]);

    res.json({
      success: true,
      data: threads as any[],
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get email threads error:', error);
    res.status(500).json({ success: false, data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } });
  }
});

// Get single email thread with messages
router.get('/threads/:id', authenticateToken, requirePermission('view_emails'), async (req: AuthRequest, res: Response<ApiResponse<any>>) => {
  try {
    const thread = await prisma.emailThread.findUnique({
      where: { id: req.params.id },
      include: {
        messages: {
          orderBy: { sentAt: 'asc' }
        }
      }
    });

    if (!thread) {
      res.status(404).json({ success: false, error: 'Email thread not found' });
      return;
    }

    res.json({
      success: true,
      data: thread
    });
  } catch (error) {
    console.error('Get email thread error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve email thread' });
  }
});

// Send email (Create new thread or reply to existing)
router.post('/send', authenticateToken, requirePermission('send_emails'), async (req: AuthRequest, res: Response<ApiResponse<any>>) => {
  try {
    const { to, subject, body, threadId, disputeId } = req.body;

    if (!to || !subject || !body) {
      res.status(400).json({ success: false, error: 'Missing required fields' });
      return;
    }

    let finalThreadId = threadId;
    let message;

    // Create new thread if not provided
    if (!finalThreadId) {
      const thread = await prisma.emailThread.create({
        data: {
          disputeId: disputeId || null,
          customerEmail: to.toLowerCase(),
          customerName: to.split('@')[0],
          subject,
          status: 'open',
          assignedTo: req.user!.id,
          priority: 'medium',
          messages: {
            create: {
              fromAddress: req.user!.email,
              toAddress: to.toLowerCase(),
              subject,
              body,
              isFromCustomer: false
            }
          }
        },
        include: {
          messages: true
        }
      });
      
      finalThreadId = thread.id;
      message = thread.messages[0];
    } else {
      // Create message in existing thread
      message = await prisma.emailMessage.create({
        data: {
          threadId: finalThreadId,
          fromAddress: req.user!.email,
          toAddress: to.toLowerCase(),
          subject,
          body,
          isFromCustomer: false
        }
      });

      // Update thread last message time
      await prisma.emailThread.update({
        where: { id: finalThreadId },
        data: { lastMessageAt: new Date() }
      });
    }

    // Send actual email
    const sent = await emailService.sendEmail(to, subject, body);

    res.json({
      success: true,
      data: { threadId: finalThreadId, messageId: message.id, sent },
      message: 'Email sent successfully'
    });
  } catch (error) {
    console.error('Send email error:', error);
    res.status(500).json({ success: false, error: 'Failed to send email' });
  }
});

// Update email thread
router.patch('/threads/:id', authenticateToken, requirePermission('send_emails'), async (req: AuthRequest, res: Response<ApiResponse<EmailThread>>) => {
  try {
    const { status, priority, assignedTo } = req.body;
    
    const updateData: any = {};
    if (status) updateData.status = status;
    if (priority) updateData.priority = priority;
    if (assignedTo !== undefined) updateData.assignedTo = assignedTo;

    const thread = await prisma.emailThread.update({
      where: { id: req.params.id },
      data: updateData
    });

    res.json({
      success: true,
      data: thread as any,
      message: 'Email thread updated successfully'
    });
  } catch (error) {
    console.error('Update email thread error:', error);
    res.status(500).json({ success: false, error: 'Failed to update email thread' });
  }
});

// ==========================================
// PUBLIC INCOMING EMAIL (from website form)
// ==========================================
router.post('/incoming', async (req, res: Response<ApiResponse<any>>) => {
  try {
    const { email, subject, message, fullName } = req.body || {};

    if (!email || !subject || !message) {
      res.status(400).json({ success: false, error: 'Missing required fields' });
      return;
    }

    // Create a new thread for the customer email with the message
    const thread = await prisma.emailThread.create({
      data: {
        customerEmail: email.toLowerCase(),
        customerName: fullName || email.split('@')[0],
        subject,
        status: 'open',
        priority: 'medium',
        messages: {
          create: {
            fromAddress: email.toLowerCase(),
            toAddress: 'support@disputeportal.com',
            subject,
            body: message,
            isFromCustomer: true
          }
        }
      }
    });

    // Notify admins via socket
    const io = getIO();
    io?.to('admin_room').emit('email_received', {
      threadId: thread.id,
      subject,
      from: email,
      customerName: thread.customerName,
      receivedAt: thread.createdAt
    });

    res.status(201).json({ success: true, data: { threadId: thread.id } });
  } catch (error) {
    console.error('Incoming email error:', error);
    res.status(500).json({ success: false, error: 'Failed to process incoming email' });
  }
});

// ==========================================
// EMAIL CONFIGURATION & TESTING
// ==========================================

// Get email configuration status
router.get('/config/status', authenticateToken, requirePermission('manage_templates'), async (_req: AuthRequest, res: Response) => {
  try {
    const config = emailService.getConfig();
    const isConfigured = emailService.isConfigured();

    res.json({
      success: true,
      data: {
        configured: isConfigured,
        provider: emailService.getProvider(),
        config: config
      }
    });
  } catch (error) {
    console.error('Email config status error:', error);
    res.status(500).json({ success: false, error: 'Failed to get email configuration status' });
  }
});

// Test email connection
router.post('/config/test-connection', authenticateToken, requirePermission('manage_templates'), async (_req: AuthRequest, res: Response) => {
  try {
    const result = await emailService.testConnection();
    
    res.json({
      success: result.success,
      message: result.message,
      data: {
        provider: emailService.getProvider(),
        timestamp: new Date().toISOString()
      }
    });
  } catch (error: any) {
    console.error('Email connection test error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Connection test failed',
      message: error.message || 'Unknown error'
    });
  }
});

// Send test email
router.post('/config/test-send', authenticateToken, requirePermission('manage_templates'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { to } = req.body;

    if (!to) {
      res.status(400).json({ success: false, error: 'Recipient email address is required' });
      return;
    }

    const sent = await emailService.sendTestEmail(to);

    if (sent) {
      res.json({
        success: true,
        message: `Test email sent successfully to ${to}`,
        data: {
          provider: emailService.getProvider(),
          to,
          timestamp: new Date().toISOString()
        }
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to send test email. Check email configuration and logs.'
      });
    }
  } catch (error: any) {
    console.error('Send test email error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to send test email',
      message: error.message || 'Unknown error'
    });
  }
});

export default router;

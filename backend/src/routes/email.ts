import { Router, Response } from 'express';
import { getDb } from '../database/db';
import { v4 as uuidv4 } from 'uuid';
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
    const db = await getDb();
    res.json({
      success: true,
      data: db.data.email_templates
    });
  } catch (error) {
    console.error('Get templates error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve templates' });
  }
});

// Get single email template
router.get('/templates/:id', authenticateToken, requirePermission('manage_templates'), async (req: AuthRequest, res: Response<ApiResponse<EmailTemplate>>) => {
  try {
    const db = await getDb();
    const template = db.data.email_templates.find((t: any) => t.id === req.params.id);

    if (!template) {
      res.status(404).json({ success: false, error: 'Template not found' });
      return;
    }

    res.json({
      success: true,
      data: template
    });
  } catch (error) {
    console.error('Get template error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve template' });
  }
});

// Create email template
router.post('/templates', authenticateToken, requirePermission('manage_templates'), async (req: AuthRequest, res: Response<ApiResponse<EmailTemplate>>) => {
  try {
    const db = await getDb();
    const { name, subject, body, variables, category } = req.body;

    if (!name || !subject || !body || !category) {
      res.status(400).json({ success: false, error: 'Missing required fields' });
      return;
    }

    const template: any = {
      id: uuidv4(),
      name,
      subject,
      body,
      variables: variables || [],
      category,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    db.data.email_templates.push(template);
    await db.write();

    res.status(201).json({
      success: true,
      data: template,
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
    const db = await getDb();
    const { name, subject, body, variables, category, isActive } = req.body;
    
    const template = db.data.email_templates.find((t: any) => t.id === req.params.id);

    if (!template) {
      res.status(404).json({ success: false, error: 'Template not found' });
      return;
    }

    if (name) template.name = name;
    if (subject) template.subject = subject;
    if (body) template.body = body;
    if (variables) template.variables = variables;
    if (category) template.category = category;
    if (isActive !== undefined) template.is_active = isActive;

    template.updated_at = new Date().toISOString();

    await db.write();

    res.json({
      success: true,
      data: template,
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
    const db = await getDb();
    const index = db.data.email_templates.findIndex((t: any) => t.id === req.params.id);

    if (index === -1) {
      res.status(404).json({ success: false, error: 'Template not found' });
      return;
    }

    db.data.email_templates.splice(index, 1);
    await db.write();

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
    const db = await getDb();
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;

    const { status, priority, assignedTo } = req.query;

    let threads = [...db.data.email_threads];

    if (status) {
      threads = threads.filter((t: any) => t.status === status);
    }

    if (priority) {
      threads = threads.filter((t: any) => t.priority === priority);
    }

    if (assignedTo) {
      threads = threads.filter((t: any) => t.assigned_to === assignedTo);
    }

    threads.sort((a: any, b: any) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime());

    const total = threads.length;
    const paginatedThreads = threads.slice(offset, offset + limit);

    res.json({
      success: true,
      data: paginatedThreads,
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
    const db = await getDb();
    const thread = db.data.email_threads.find((t: any) => t.id === req.params.id);

    if (!thread) {
      res.status(404).json({ success: false, error: 'Email thread not found' });
      return;
    }

    const messages = db.data.email_messages.filter((m: any) => m.thread_id === req.params.id);
    messages.sort((a: any, b: any) => new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime());

    res.json({
      success: true,
      data: {
        ...thread,
        messages
      }
    });
  } catch (error) {
    console.error('Get email thread error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve email thread' });
  }
});

// Send email (Create new thread or reply to existing)
router.post('/send', authenticateToken, requirePermission('send_emails'), async (req: AuthRequest, res: Response<ApiResponse<any>>) => {
  try {
    const db = await getDb();
    const { to, subject, body, threadId, disputeId } = req.body;

    if (!to || !subject || !body) {
      res.status(400).json({ success: false, error: 'Missing required fields' });
      return;
    }

    let finalThreadId = threadId;

    // Create new thread if not provided
    if (!finalThreadId) {
      finalThreadId = uuidv4();
      
      const newThread: any = {
        id: finalThreadId,
        dispute_id: disputeId || null,
        customer_email: to,
        customer_name: to.split('@')[0],
        subject,
        last_message_at: new Date().toISOString(),
        status: 'open',
        assigned_to: req.user!.id,
        priority: 'medium',
        created_at: new Date().toISOString()
      };

      db.data.email_threads.push(newThread);
    }

    // Create email message
    const message: any = {
      id: uuidv4(),
      thread_id: finalThreadId,
      from_address: req.user!.email,
      to_address: to,
      subject,
      body,
      is_from_customer: false,
      attachments: [],
      sent_at: new Date().toISOString(),
      read_at: null
    };

    db.data.email_messages.push(message);

    // Update thread
    const thread = db.data.email_threads.find((t: any) => t.id === finalThreadId);
    if (thread) {
      thread.last_message_at = new Date().toISOString();
    }

    await db.write();

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
    const db = await getDb();
    const { status, priority, assignedTo } = req.body;
    
    const thread = db.data.email_threads.find((t: any) => t.id === req.params.id);

    if (!thread) {
      res.status(404).json({ success: false, error: 'Thread not found' });
      return;
    }

    if (status) thread.status = status;
    if (priority) thread.priority = priority;
    if (assignedTo !== undefined) thread.assigned_to = assignedTo;

    await db.write();

    res.json({
      success: true,
      data: thread,
      message: 'Email thread updated successfully'
    });
  } catch (error) {
    console.error('Update email thread error:', error);
    res.status(500).json({ success: false, error: 'Failed to update email thread' });
  }
});

export default router;

// ==========================================
// PUBLIC INCOMING EMAIL (from website form)
// ==========================================
router.post('/incoming', async (req, res: Response<ApiResponse<any>>) => {
  try {
    const db = await getDb();
    const { email, subject, message, fullName } = req.body || {};

    if (!email || !subject || !message) {
      res.status(400).json({ success: false, error: 'Missing required fields' });
      return;
    }

    // Create a new thread for the customer email
    const threadId = uuidv4();
    const now = new Date().toISOString();
    const thread: any = {
      id: threadId,
      dispute_id: null,
      customer_email: email,
      customer_name: fullName || email.split('@')[0],
      subject,
      last_message_at: now,
      status: 'open',
      assigned_to: null,
      priority: 'medium',
      created_at: now
    };
    db.data.email_threads.push(thread);

    const msg: any = {
      id: uuidv4(),
      thread_id: threadId,
      from_address: email,
      to_address: 'support@disputeportal.com',
      subject,
      body: message,
      is_from_customer: true,
      attachments: [],
      sent_at: now,
      read_at: null
    };
    db.data.email_messages.push(msg);
    await db.write();

    // Notify admins via socket
    const io = getIO();
    io?.to('admin_room').emit('email_received', {
      threadId,
      subject,
      from: email,
      customerName: thread.customer_name,
      receivedAt: now
    });

    res.status(201).json({ success: true, data: { threadId } });
  } catch (error) {
    console.error('Incoming email error:', error);
    res.status(500).json({ success: false, error: 'Failed to process incoming email' });
  }
});

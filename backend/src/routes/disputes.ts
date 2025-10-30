import { Router, Response } from 'express';
import { getDb } from '../database/db';
import { v4 as uuidv4 } from 'uuid';
import { authenticateToken, requirePermission, AuthRequest } from '../middleware/auth';
import { upload } from '../middleware/upload';
import { DisputeRecord, ApiResponse, PaginatedResponse, DisputeFilters } from '../types';
import emailService from '../services/emailService';

const router = Router();

// Track dispute by reference number (PUBLIC - no auth required)
router.post('/track', async (req, res: Response<ApiResponse<any>>) => {
  try {
    const db = await getDb();
    const { referenceNumber, email } = req.body;

    if (!referenceNumber || !email) {
      res.status(400).json({ success: false, error: 'Reference number and email are required' });
      return;
    }

    // Find dispute by reference number and verify email matches
    const dispute = db.data.disputes.find(
      (d: any) => d.reference_number === referenceNumber && 
                  d.email.toLowerCase() === email.toLowerCase()
    );

    if (!dispute) {
      res.status(404).json({ success: false, error: 'Dispute not found or email does not match' });
      return;
    }

    // Return limited info (don't expose sensitive data)
    const trackingInfo = {
      reference_number: dispute.reference_number,
      status: dispute.status,
      priority: dispute.priority,
      transaction_date: dispute.transaction_date,
      transaction_amount: dispute.transaction_amount,
      currency: dispute.currency,
      created_at: dispute.created_at,
      updated_at: dispute.updated_at,
      resolved_at: dispute.resolved_at,
      resolution: dispute.resolution
    };

    res.json({
      success: true,
      data: trackingInfo,
      message: 'Dispute found'
    });
  } catch (error) {
    console.error('Track dispute error:', error);
    res.status(500).json({ success: false, error: 'Failed to track dispute' });
  }
});

// Submit new dispute (PUBLIC - no auth required)
router.post('/', upload.array('documents', 10), async (req, res: Response<ApiResponse<DisputeRecord>>) => {
  try {
    const db = await getDb();
    const {
      transactionDate,
      transactionAmount,
      currency,
      role,
      authorizationStatus,
      disputeDescription,
      accountStatement,
      fullName,
      email,
      phone
    } = req.body;

    // Validation
    if (!transactionDate || !transactionAmount || !currency || !role || !disputeDescription || !fullName || !email) {
      res.status(400).json({ success: false, error: 'Missing required fields' });
      return;
    }

    const id = uuidv4();
    const referenceNumber = `DSP-${Date.now()}`;
    const files = req.files as any[];
    
    // Save file information
    const attachments: string[] = [];
    if (files && files.length > 0) {
      for (const file of files) {
        const fileId = uuidv4();
        const fileRecord = {
          id: fileId,
          filename: file.filename,
          original_name: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
          path: file.path,
          uploaded_by: email,
          dispute_id: id,
          created_at: new Date().toISOString()
        };
        db.data.file_uploads.push(fileRecord);
        attachments.push(file.filename);
      }
    }

    // Insert dispute
    const dispute: any = {
      id,
      reference_number: referenceNumber,
      transaction_date: transactionDate,
      transaction_amount: parseFloat(transactionAmount),
      currency,
      role,
      authorization_status: authorizationStatus,
      dispute_description: disputeDescription,
      account_statement: accountStatement || null,
      full_name: fullName,
      email,
      phone: phone || null,
      status: 'pending',
      priority: 'medium',
      attachments,
      assigned_to: null,
      resolution: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      resolved_at: null
    };

    db.data.disputes.push(dispute);

    // Check if there's an existing chat session for this customer email
    // and link it to this dispute
    const existingChatSession = db.data.chat_sessions.find(
      (session: any) => session.customer_email?.toLowerCase() === email.toLowerCase() && session.status === 'active'
    );
    
    let linkedChatSessionId: string | null = null;
    if (existingChatSession) {
      // Link the chat session to this dispute
      existingChatSession.dispute_id = id;
      existingChatSession.customer_name = fullName; // Update name if they filled dispute form
      linkedChatSessionId = existingChatSession.id;
      console.log(`✅ Linked existing chat session ${linkedChatSessionId} to dispute ${referenceNumber}`);
    }

    // Create an associated email thread for this dispute
    const threadId = uuidv4();
    const emailThread: any = {
      id: threadId,
      dispute_id: id,
      customer_email: email,
      customer_name: fullName,
      subject: `Dispute ${referenceNumber} - Payment Dispute`,
      last_message_at: new Date().toISOString(),
      status: 'open',
      assigned_to: null,
      priority: dispute.priority,
      created_at: new Date().toISOString()
    };
    db.data.email_threads.push(emailThread);

    await db.write();

    // Send confirmation email
    const template = db.data.email_templates.find(
      (t: any) => t.category === 'dispute_confirmation' && t.is_active
    );

    if (template) {
      await emailService.sendTemplateEmail(
        email,
        template,
        {
          customerName: fullName,
          referenceNumber,
          transactionAmount,
          transactionDate
        }
      );
    }

    res.status(201).json({
      success: true,
      data: { ...dispute, threadId, linkedChatSessionId },
      message: 'Dispute submitted successfully'
    });
  } catch (error) {
    console.error('Dispute submission error:', error);
    res.status(500).json({ success: false, error: 'Failed to submit dispute' });
  }
});

// Get all disputes (ADMIN)
router.get('/', authenticateToken, requirePermission('view_disputes'), async (req: AuthRequest, res: Response<PaginatedResponse<DisputeRecord>>) => {
  try {
    const db = await getDb();
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;

    const { status, priority, assignedTo, dateFrom, dateTo, searchTerm }: Partial<DisputeFilters> = req.query;

    let disputes = [...db.data.disputes];

    // Apply filters
    if (status) {
      disputes = disputes.filter((d: any) => d.status === status);
    }

    if (priority) {
      disputes = disputes.filter((d: any) => d.priority === priority);
    }

    if (assignedTo) {
      disputes = disputes.filter((d: any) => d.assigned_to === assignedTo);
    }

    if (dateFrom) {
      disputes = disputes.filter((d: any) => d.created_at >= dateFrom);
    }

    if (dateTo) {
      disputes = disputes.filter((d: any) => d.created_at <= dateTo);
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      disputes = disputes.filter((d: any) => 
        d.reference_number.toLowerCase().includes(term) ||
        d.full_name.toLowerCase().includes(term) ||
        d.email.toLowerCase().includes(term)
      );
    }

    // Sort by created_at DESC
    disputes.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const total = disputes.length;
    const paginatedDisputes = disputes.slice(offset, offset + limit);

    res.json({
      success: true,
      data: paginatedDisputes,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get disputes error:', error);
    res.status(500).json({ success: false, data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } });
  }
});

// Get single dispute
router.get('/:id', authenticateToken, requirePermission('view_disputes'), async (req: AuthRequest, res: Response<ApiResponse<DisputeRecord>>) => {
  try {
    const db = await getDb();
    const dispute = db.data.disputes.find(
      (d: any) => d.id === req.params.id || d.reference_number === req.params.id
    );

    if (!dispute) {
      res.status(404).json({ success: false, error: 'Dispute not found' });
      return;
    }

    res.json({
      success: true,
      data: dispute
    });
  } catch (error) {
    console.error('Get dispute error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve dispute' });
  }
});

// Update dispute (ADMIN)
router.patch('/:id', authenticateToken, requirePermission('manage_disputes'), async (req: AuthRequest, res: Response<ApiResponse<DisputeRecord>>) => {
  try {
    const db = await getDb();
    const { status, priority, assignedTo, resolution } = req.body;
    
    const dispute = db.data.disputes.find((d: any) => d.id === req.params.id);

    if (!dispute) {
      res.status(404).json({ success: false, error: 'Dispute not found' });
      return;
    }

    // Track if status changed for email notification
    const statusChanged = status && status !== dispute.status;
    const oldStatus = dispute.status;

    // Apply updates
    if (status) {
      dispute.status = status;
      if (status === 'resolved') {
        dispute.resolved_at = new Date().toISOString();
      }
    }

    if (priority) {
      dispute.priority = priority;
    }

    if (assignedTo !== undefined) {
      dispute.assigned_to = assignedTo;
    }

    if (resolution) {
      dispute.resolution = resolution;
    }

    dispute.updated_at = new Date().toISOString();

    await db.write();

    // Send email notification if status changed
    if (statusChanged && dispute.email) {
      try {
        // Find appropriate template based on new status
        let templateCategory = 'status_update';
        if (status === 'resolved' || status === 'rejected') {
          templateCategory = 'resolution';
        }

        const template = db.data.email_templates.find(
          (t: any) => t.category === templateCategory && t.isActive
        );

        if (template) {
          const statusLabels: Record<string, string> = {
            'pending': 'Pending Review',
            'in_review': 'Under Investigation',
            'resolved': 'Resolved',
            'rejected': 'Rejected'
          };

          await emailService.sendTemplateEmail(
            dispute.email,
            template,
            {
              customerName: dispute.full_name || 'Valued Customer',
              referenceNumber: dispute.reference_number,
              oldStatus: statusLabels[oldStatus] || oldStatus,
              newStatus: statusLabels[status] || status,
              resolution: resolution || dispute.resolution || 'Our team has reviewed your case.',
              transactionAmount: String(dispute.transaction_amount),
              transactionDate: dispute.transaction_date,
              expectedDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toLocaleDateString()
            }
          );
          console.log(`📧 Status change notification sent to ${dispute.email}`);
        }
      } catch (emailError) {
        console.error('Failed to send status change email:', emailError);
        // Don't fail the request if email fails
      }
    }

    res.json({
      success: true,
      data: dispute,
      message: 'Dispute updated successfully'
    });
  } catch (error) {
    console.error('Update dispute error:', error);
    res.status(500).json({ success: false, error: 'Failed to update dispute' });
  }
});

// Get dispute statistics (ADMIN)
router.get('/stats/dashboard', authenticateToken, requirePermission('view_analytics'), async (_req: AuthRequest, res) => {
  try {
    const db = await getDb();
    
    const totalDisputes = db.data.disputes.length;
    const pendingDisputes = db.data.disputes.filter((d: any) => d.status === 'pending').length;
    const inReviewDisputes = db.data.disputes.filter((d: any) => d.status === 'in_review').length;
    const resolvedDisputes = db.data.disputes.filter((d: any) => d.status === 'resolved').length;
    const rejectedDisputes = db.data.disputes.filter((d: any) => d.status === 'rejected').length;
    const closedDisputes = resolvedDisputes + rejectedDisputes;
    
    const today = new Date().toISOString().split('T')[0];
    const todayDisputes = db.data.disputes.filter((d: any) => d.created_at.startsWith(today)).length;
    
    const activeChats = db.data.chat_sessions.filter((s: any) => s.status === 'active').length;
    const closedChats = db.data.chat_sessions.filter((s: any) => s.status === 'closed').length;
    const totalEmailThreads = db.data.email_threads.length;
    const openEmailThreads = db.data.email_threads.filter((t: any) => t.status === 'open').length;
    const closedEmailThreads = db.data.email_threads.filter((t: any) => t.status === 'closed').length;

    res.json({
      success: true,
      data: {
        totalDisputes,
        pendingDisputes,
        inReviewDisputes,
        resolvedDisputes,
        rejectedDisputes,
        closedDisputes,
        openDisputes: pendingDisputes + inReviewDisputes,
        todayDisputes,
        activeChats,
        closedChats,
        totalEmailThreads,
        openEmailThreads,
        closedEmailThreads,
        avgResolutionTime: 48,
        satisfactionRate: 95
      }
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve statistics' });
  }
});

export default router;

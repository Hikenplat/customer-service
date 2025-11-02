import { Router, Response } from 'express';
import prisma from '../database/prismaClient';
import { authenticateToken, requirePermission, AuthRequest } from '../middleware/auth';
import { upload } from '../middleware/upload';
import { DisputeRecord, ApiResponse, PaginatedResponse, DisputeFilters } from '../types';
import emailService from '../services/emailService';

const router = Router();

// Track dispute by reference number (PUBLIC - no auth required)
router.post('/track', async (req, res: Response<ApiResponse<any>>) => {
  try {
    const { referenceNumber, email } = req.body;

    if (!referenceNumber || !email) {
      res.status(400).json({ success: false, error: 'Reference number and email are required' });
      return;
    }

    // Find dispute by reference number and verify email matches
    const dispute = await prisma.dispute.findFirst({
      where: {
        referenceNumber,
        customerEmail: email.toLowerCase()
      }
    });

    if (!dispute) {
      res.status(404).json({ success: false, error: 'Dispute not found or email does not match' });
      return;
    }

    // Return limited info (don't expose sensitive data)
    const trackingInfo = {
      reference_number: dispute.referenceNumber,
      status: dispute.status,
      priority: dispute.priority,
      transaction_date: dispute.transactionDate,
      transaction_amount: dispute.transactionAmount,
      currency: dispute.currency,
      created_at: dispute.createdAt,
      updated_at: dispute.updatedAt,
      resolved_at: dispute.resolvedAt,
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

    const referenceNumber = `DSP-${Date.now()}`;
    const files = req.files as any[];
    
    // Create dispute with nested file uploads and email thread
    const dispute = await prisma.dispute.create({
      data: {
        referenceNumber,
        transactionDate,
        transactionAmount: parseFloat(transactionAmount),
        currency,
        customerName: fullName,
        customerEmail: email.toLowerCase(),
        customerPhone: phone || null,
        merchantName: role,
        description: disputeDescription,
        accountStatement: accountStatement || null,
        authorizationStatus: authorizationStatus || null,
        status: 'pending',
        priority: 'medium',
        fileUploads: files && files.length > 0 ? {
          create: files.map((file: any) => ({
            fileName: file.filename,
            originalName: file.originalname,
            filePath: file.path,
            mimeType: file.mimetype,
            size: file.size,
            uploadedBy: email
          }))
        } : undefined,
        emailThreads: {
          create: {
            customerEmail: email.toLowerCase(),
            customerName: fullName,
            subject: `Dispute ${referenceNumber} - Payment Dispute`,
            status: 'open',
            priority: 'medium'
          }
        }
      },
      include: {
        fileUploads: true,
        emailThreads: true
      }
    });

    // Check if there's an existing chat session for this customer email
    // and link it to this dispute
    const existingChatSession = await prisma.chatSession.findFirst({
      where: {
        customerEmail: email.toLowerCase(),
        status: 'active'
      }
    });
    
    let linkedChatSessionId: string | null = null;
    if (existingChatSession) {
      // Link the chat session to this dispute
      await prisma.chatSession.update({
        where: { id: existingChatSession.id },
        data: {
          disputeId: dispute.id,
          customerName: fullName
        }
      });
      linkedChatSessionId = existingChatSession.id;
      console.log(`✅ Linked existing chat session ${linkedChatSessionId} to dispute ${referenceNumber}`);
    }

    // Send confirmation email
    const template = await prisma.emailTemplate.findFirst({
      where: {
        category: 'dispute_confirmation',
        isActive: true
      }
    });

    if (template) {
      await emailService.sendTemplateEmail(
        email,
        template as any,
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
      data: { 
        ...dispute, 
        threadId: dispute.emailThreads[0]?.id, 
        linkedChatSessionId 
      } as any,
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
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const { status, priority, assignedTo, dateFrom, dateTo, searchTerm }: Partial<DisputeFilters> = req.query;

    // Build where clause
    const where: any = {};

    if (status) {
      where.status = status;
    }

    if (priority) {
      where.priority = priority;
    }

    if (assignedTo) {
      where.assignedTo = assignedTo;
    }

    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom as string);
      if (dateTo) where.createdAt.lte = new Date(dateTo as string);
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      where.OR = [
        { referenceNumber: { contains: term, mode: 'insensitive' } },
        { customerName: { contains: term, mode: 'insensitive' } },
        { customerEmail: { contains: term, mode: 'insensitive' } }
      ];
    }

    const [disputes, total] = await Promise.all([
      prisma.dispute.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.dispute.count({ where })
    ]);

    res.json({
      success: true,
      data: disputes as any[],
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
    const dispute = await prisma.dispute.findFirst({
      where: {
        OR: [
          { id: req.params.id },
          { referenceNumber: req.params.id }
        ]
      },
      include: {
        fileUploads: true,
        emailThreads: true,
        chatSessions: true
      }
    });

    if (!dispute) {
      res.status(404).json({ success: false, error: 'Dispute not found' });
      return;
    }

    res.json({
      success: true,
      data: dispute as any
    });
  } catch (error) {
    console.error('Get dispute error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve dispute' });
  }
});

// Update dispute (ADMIN)
router.patch('/:id', authenticateToken, requirePermission('manage_disputes'), async (req: AuthRequest, res: Response<ApiResponse<DisputeRecord>>) => {
  try {
    const { status, priority, assignedTo, resolution } = req.body;
    
    // Get existing dispute
    const existingDispute = await prisma.dispute.findUnique({
      where: { id: req.params.id }
    });

    if (!existingDispute) {
      res.status(404).json({ success: false, error: 'Dispute not found' });
      return;
    }

    // Track if status changed for email notification
    const statusChanged = status && status !== existingDispute.status;
    const oldStatus = existingDispute.status;

    // Build update data
    const updateData: any = {};

    if (status) {
      updateData.status = status;
      if (status === 'resolved') {
        updateData.resolvedAt = new Date();
      }
    }

    if (priority) {
      updateData.priority = priority;
    }

    if (assignedTo !== undefined) {
      updateData.assignedTo = assignedTo;
    }

    if (resolution) {
      updateData.resolution = resolution;
    }

    // Update dispute
    const dispute = await prisma.dispute.update({
      where: { id: req.params.id },
      data: updateData
    });

    // Send email notification if status changed
    if (statusChanged && dispute.customerEmail) {
      try {
        // Find appropriate template based on new status
        let templateCategory = 'status_update';
        if (status === 'resolved' || status === 'rejected') {
          templateCategory = 'resolution';
        }

        const template = await prisma.emailTemplate.findFirst({
          where: {
            category: templateCategory,
            isActive: true
          }
        });

        if (template) {
          const statusLabels: Record<string, string> = {
            'pending': 'Pending Review',
            'in_review': 'Under Investigation',
            'resolved': 'Resolved',
            'rejected': 'Rejected'
          };

          await emailService.sendTemplateEmail(
            dispute.customerEmail,
            template as any,
            {
              customerName: dispute.customerName || 'Valued Customer',
              referenceNumber: dispute.referenceNumber,
              oldStatus: statusLabels[oldStatus] || oldStatus,
              newStatus: statusLabels[status] || status,
              resolution: resolution || dispute.resolution || 'Our team has reviewed your case.',
              transactionAmount: String(dispute.transactionAmount),
              transactionDate: dispute.transactionDate,
              expectedDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toLocaleDateString()
            }
          );
          console.log(`📧 Status change notification sent to ${dispute.customerEmail}`);
        }
      } catch (emailError) {
        console.error('Failed to send status change email:', emailError);
        // Don't fail the request if email fails
      }
    }

    res.json({
      success: true,
      data: dispute as any,
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
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const [
      totalDisputes,
      pendingDisputes,
      inReviewDisputes,
      resolvedDisputes,
      rejectedDisputes,
      todayDisputes,
      activeChats,
      closedChats,
      totalEmailThreads,
      openEmailThreads,
      closedEmailThreads
    ] = await Promise.all([
      prisma.dispute.count(),
      prisma.dispute.count({ where: { status: 'pending' } }),
      prisma.dispute.count({ where: { status: 'in_review' } }),
      prisma.dispute.count({ where: { status: 'resolved' } }),
      prisma.dispute.count({ where: { status: 'rejected' } }),
      prisma.dispute.count({ where: { createdAt: { gte: today } } }),
      prisma.chatSession.count({ where: { status: 'active' } }),
      prisma.chatSession.count({ where: { status: 'closed' } }),
      prisma.emailThread.count(),
      prisma.emailThread.count({ where: { status: 'open' } }),
      prisma.emailThread.count({ where: { status: 'closed' } })
    ]);

    const closedDisputes = resolvedDisputes + rejectedDisputes;

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

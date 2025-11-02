/**
 * Migration Script: LowDB to Prisma
 * This script migrates all data from the JSON-based lowdb to PostgreSQL via Prisma
 */

import { PrismaClient } from '@prisma/client';
import { getDb } from './db';

const prisma = new PrismaClient();

async function migrateLowDBToPrisma() {
  console.log('🚀 Starting migration from LowDB to Prisma...\n');
  
  try {
    // Connect to Prisma
    await prisma.$connect();
    console.log('✅ Connected to Prisma database\n');
    
    // Read LowDB data
    const lowdb = await getDb();
    console.log('✅ Connected to LowDB\n');
    
    // Migrate Admin Users
    console.log('👥 Migrating admin users...');
    for (const user of lowdb.data.admin_users || []) {
      try {
        await prisma.adminUser.upsert({
          where: { email: user.email },
          update: {
            password: user.password,
            fullName: user.fullName || user.full_name || 'Admin User',
            role: user.role,
            permissions: user.permissions || [],
            isActive: user.isActive !== undefined ? user.isActive : true,
          },
          create: {
            id: user.id,
            email: user.email,
            password: user.password,
            fullName: user.fullName || user.full_name || 'Admin User',
            role: user.role,
            permissions: user.permissions || [],
            isActive: user.isActive !== undefined ? user.isActive : true,
            createdAt: user.createdAt ? new Date(user.createdAt) : new Date(),
          },
        });
        console.log(`  ✓ Migrated admin: ${user.email}`);
      } catch (error) {
        console.error(`  ✗ Failed to migrate admin ${user.email}:`, error);
      }
    }
    console.log('');
    
    // Migrate Disputes
    console.log('🎫 Migrating disputes...');
    for (const dispute of lowdb.data.disputes || []) {
      try {
        await prisma.dispute.upsert({
          where: { referenceNumber: dispute.reference_number },
          update: {
            customerName: dispute.customer_name || dispute.customerName || 'Unknown',
            customerEmail: dispute.customer_email || dispute.customerEmail || 'unknown@example.com',
            transactionAmount: parseFloat(dispute.transaction_amount || dispute.transactionAmount) || 0,
            transactionDate: dispute.transaction_date || dispute.transactionDate || new Date().toISOString().split('T')[0],
            merchantName: dispute.merchant_name || dispute.merchantName || 'Unknown Merchant',
            description: dispute.description || 'No description provided',
            status: dispute.status,
            priority: dispute.priority || 'normal',
            assignedTo: dispute.assigned_to || dispute.assignedTo,
            resolution: dispute.resolution,
            updatedAt: dispute.updated_at ? new Date(dispute.updated_at) : new Date(),
          },
          create: {
            id: dispute.id,
            referenceNumber: dispute.reference_number,
            customerName: dispute.customer_name || dispute.customerName || 'Unknown',
            customerEmail: dispute.customer_email || dispute.customerEmail || 'unknown@example.com',
            transactionAmount: parseFloat(dispute.transaction_amount || dispute.transactionAmount) || 0,
            transactionDate: dispute.transaction_date || dispute.transactionDate || new Date().toISOString().split('T')[0],
            merchantName: dispute.merchant_name || dispute.merchantName || 'Unknown Merchant',
            description: dispute.description || 'No description provided',
            status: dispute.status,
            priority: dispute.priority || 'normal',
            assignedTo: dispute.assigned_to || dispute.assignedTo,
            resolution: dispute.resolution,
            createdAt: dispute.created_at ? new Date(dispute.created_at) : new Date(),
            updatedAt: dispute.updated_at ? new Date(dispute.updated_at) : new Date(),
          },
        });
        console.log(`  ✓ Migrated dispute: ${dispute.reference_number}`);
      } catch (error) {
        console.error(`  ✗ Failed to migrate dispute ${dispute.reference_number}:`, error);
      }
    }
    console.log('');
    
    // Migrate Email Templates
    console.log('📧 Migrating email templates...');
    for (const template of lowdb.data.email_templates || []) {
      try {
        await prisma.emailTemplate.upsert({
          where: { id: template.id },
          update: {
            name: template.name,
            subject: template.subject,
            body: template.body,
            variables: template.variables,
            category: template.category,
            isActive: template.isActive,
            updatedAt: template.updatedAt ? new Date(template.updatedAt) : new Date(),
          },
          create: {
            id: template.id,
            name: template.name,
            subject: template.subject,
            body: template.body,
            variables: template.variables,
            category: template.category,
            isActive: template.isActive,
            createdAt: template.createdAt ? new Date(template.createdAt) : new Date(),
            updatedAt: template.updatedAt ? new Date(template.updatedAt) : new Date(),
          },
        });
        console.log(`  ✓ Migrated template: ${template.name}`);
      } catch (error) {
        console.error(`  ✗ Failed to migrate template ${template.name}:`, error);
      }
    }
    console.log('');
    
    // Migrate Chat Sessions
    console.log('💬 Migrating chat sessions...');
    for (const session of lowdb.data.chat_sessions || []) {
      try {
        await prisma.chatSession.upsert({
          where: { id: session.id },
          update: {
            disputeId: session.dispute_id || session.disputeId,
            customerName: session.customer_name || session.customerName || 'Guest',
            customerEmail: session.customer_email || session.customerEmail || 'guest@example.com',
            status: session.status || 'active',
            updatedAt: session.updated_at ? new Date(session.updated_at) : new Date(),
          },
          create: {
            id: session.id,
            disputeId: session.dispute_id || session.disputeId,
            customerName: session.customer_name || session.customerName || 'Guest',
            customerEmail: session.customer_email || session.customerEmail || 'guest@example.com',
            status: session.status || 'active',
            createdAt: session.created_at ? new Date(session.created_at) : new Date(),
            updatedAt: session.updated_at ? new Date(session.updated_at) : new Date(),
          },
        });
        console.log(`  ✓ Migrated chat session: ${session.id}`);
      } catch (error) {
        console.error(`  ✗ Failed to migrate chat session ${session.id}:`, error);
      }
    }
    console.log('');
    
    // Migrate Chat Messages
    console.log('💬 Migrating chat messages...');
    for (const message of lowdb.data.chat_messages || []) {
      try {
        await prisma.chatMessage.create({
          data: {
            id: message.id,
            sessionId: message.session_id || message.sessionId,
            sender: message.sender || message.from || 'unknown',
            message: message.message || message.text || message.content || '',
            timestamp: message.timestamp ? new Date(message.timestamp) : new Date(),
          },
        });
        console.log(`  ✓ Migrated message in session: ${message.session_id || message.sessionId}`);
      } catch (error) {
        console.error(`  ✗ Failed to migrate message ${message.id}:`, error);
      }
    }
    console.log('');
    
    // Migrate File Uploads
    console.log('📎 Migrating file uploads...');
    for (const file of lowdb.data.file_uploads || []) {
      try {
        await prisma.fileUpload.upsert({
          where: { id: file.id },
          update: {
            disputeId: file.dispute_id,
            fileName: file.file_name,
            originalName: file.original_name,
            filePath: file.file_path,
            mimeType: file.mime_type,
            size: file.size,
          },
          create: {
            id: file.id,
            disputeId: file.dispute_id,
            fileName: file.file_name,
            originalName: file.original_name,
            filePath: file.file_path,
            mimeType: file.mime_type,
            size: file.size,
            uploadedAt: file.uploaded_at ? new Date(file.uploaded_at) : new Date(),
          },
        });
        console.log(`  ✓ Migrated file: ${file.original_name}`);
      } catch (error) {
        console.error(`  ✗ Failed to migrate file ${file.id}:`, error);
      }
    }
    console.log('');
    
    // Print summary
    const summary = {
      adminUsers: await prisma.adminUser.count(),
      disputes: await prisma.dispute.count(),
      emailTemplates: await prisma.emailTemplate.count(),
      chatSessions: await prisma.chatSession.count(),
      chatMessages: await prisma.chatMessage.count(),
      fileUploads: await prisma.fileUpload.count(),
    };
    
    console.log('✅ Migration completed successfully!\n');
    console.log('📊 Summary:');
    console.log(`   Admin Users: ${summary.adminUsers}`);
    console.log(`   Disputes: ${summary.disputes}`);
    console.log(`   Email Templates: ${summary.emailTemplates}`);
    console.log(`   Chat Sessions: ${summary.chatSessions}`);
    console.log(`   Chat Messages: ${summary.chatMessages}`);
    console.log(`   File Uploads: ${summary.fileUploads}`);
    console.log('');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run migration if called directly
if (require.main === module) {
  migrateLowDBToPrisma()
    .then(() => {
      console.log('🎉 Migration script completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Migration script failed:', error);
      process.exit(1);
    });
}

export { migrateLowDBToPrisma };

import { PrismaClient } from '@prisma/client';
import { withAccelerate } from '@prisma/extension-accelerate';

// Initialize Prisma Client with Accelerate extension
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
}).$extends(withAccelerate());

// Initialize database connection
export async function initializePrismaDatabase(): Promise<void> {
  try {
    // Test the connection
    await prisma.$connect();
    console.log('✅ Prisma database connected successfully');
    
    // Check if admin users exist
    const adminCount = await prisma.adminUser.count();
    console.log('👥 Admin users:', adminCount);
    
    if (adminCount === 0) {
      console.log('📦 No admin users found, running seed...');
      await seedPrismaDatabase();
    }
    
    const disputeCount = await prisma.dispute.count();
    const templateCount = await prisma.emailTemplate.count();
    console.log('🎫 Disputes:', disputeCount);
    console.log('📧 Email templates:', templateCount);
    
  } catch (error) {
    console.error('❌ Failed to connect to Prisma database:', error);
    throw error;
  }
}

// Seed database with initial data
async function seedPrismaDatabase(): Promise<void> {
  const bcrypt = require('bcryptjs');
  
  try {
    // Create admin user
    const hashedPassword = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'Admin@SecurePass123', 10);
    
    const admin = await prisma.adminUser.create({
      data: {
        email: process.env.ADMIN_EMAIL || 'admin@disputeportal.com',
        password: hashedPassword,
        fullName: 'System Administrator',
        role: 'super_admin',
        permissions: [
          'view_disputes',
          'manage_disputes',
          'view_chats',
          'respond_chats',
          'view_emails',
          'send_emails',
          'manage_templates',
          'manage_users',
          'view_analytics'
        ],
        isActive: true,
      },
    });
    
    console.log('✅ Admin user created:', admin.email);
    
    // Create email templates
    const templates = [
      {
        name: 'Dispute Confirmation',
        subject: 'Your Dispute {{referenceNumber}} Has Been Received',
        body: 'Dear {{customerName}},\n\nThank you for submitting your payment dispute.\n\nReference Number: {{referenceNumber}}\nTransaction Amount: {{transactionAmount}}\nTransaction Date: {{transactionDate}}\n\nOur team will review your case and respond within 2-3 business days.\n\nBest regards,\nDispute Resolution Team',
        variables: ['customerName', 'referenceNumber', 'transactionAmount', 'transactionDate'],
        category: 'dispute_confirmation',
        isActive: true,
      },
      {
        name: 'Status Update',
        subject: 'Update on Your Dispute {{referenceNumber}}',
        body: 'Dear {{customerName}},\n\nYour dispute {{referenceNumber}} status has been updated to: {{newStatus}}\n\n{{updateMessage}}\n\nBest regards,\nDispute Resolution Team',
        variables: ['customerName', 'referenceNumber', 'newStatus', 'updateMessage'],
        category: 'status_update',
        isActive: true,
      },
      {
        name: 'Dispute Resolution',
        subject: 'Resolution for Dispute {{referenceNumber}}',
        body: 'Dear {{customerName}},\n\nYour dispute {{referenceNumber}} has been resolved.\n\nResolution: {{resolution}}\n\nThank you for your patience.\n\nBest regards,\nDispute Resolution Team',
        variables: ['customerName', 'referenceNumber', 'resolution'],
        category: 'resolution',
        isActive: true,
      },
    ];
    
    for (const template of templates) {
      await prisma.emailTemplate.create({ data: template });
    }
    
    console.log('✅ Email templates created');
    console.log('🔐 Admin Login:');
    console.log('   Email:', admin.email);
    console.log('   Password:', process.env.ADMIN_PASSWORD || 'Admin@SecurePass123');
    
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    throw error;
  }
}

// Disconnect on app shutdown
export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
  console.log('👋 Prisma disconnected');
}

export default prisma;

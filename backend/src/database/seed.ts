import { getDb, initializeDatabase } from './db';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

export async function seedDatabase(): Promise<void> {
  console.log('🌱 Starting database seeding...');

  try {
    // Initialize database schema first
    await initializeDatabase();
    const db = await getDb();

    // Check if admin already exists
    const existingAdmin = db.data.admin_users.find((u: any) => u.email === 'admin@disputeportal.com');

    if (!existingAdmin) {
      // Create default super admin
      const hashedPassword = await bcrypt.hash('Admin@SecurePass123', 10);
      const adminId = uuidv4();

      const permissions = [
        'view_disputes',
        'manage_disputes',
        'view_chats',
        'respond_chats',
        'view_emails',
        'send_emails',
        'manage_templates',
        'manage_users',
        'view_analytics'
      ];

      db.data.admin_users.push({
        id: adminId,
        email: 'admin@disputeportal.com',
        password: hashedPassword,
        full_name: 'System Administrator',
        role: 'super_admin',
        permissions,
        is_active: true,
        last_login_at: null,
        created_at: new Date().toISOString()
      });

      await db.write();
      console.log('✅ Super Admin created: admin@disputeportal.com / Admin@SecurePass123');
    } else {
      console.log('ℹ️  Admin user already exists');
    }

    // Seed default email templates
    if (db.data.email_templates.length === 0) {
      const templates = [
        {
          id: uuidv4(),
          name: 'Dispute Confirmation',
          subject: 'Your Dispute {{referenceNumber}} Has Been Received',
          body: `Dear {{customerName}},

Thank you for submitting your payment dispute. We have received your case and it has been assigned reference number {{referenceNumber}}.

Our team will review your dispute within 2-3 business days. You will receive email updates as we progress with your case.

Case Details:
- Reference: {{referenceNumber}}
- Transaction Amount: {{transactionAmount}}
- Transaction Date: {{transactionDate}}

If you have any questions, please don't hesitate to contact us.

Best regards,
Dispute Resolution Team`,
          variables: ['customerName', 'referenceNumber', 'transactionAmount', 'transactionDate'],
          category: 'dispute_confirmation',
          isActive: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        {
          id: uuidv4(),
          name: 'Status Update - Under Review',
          subject: 'Update on Your Dispute {{referenceNumber}}',
          body: `Dear {{customerName}},

We wanted to inform you that your dispute (Reference: {{referenceNumber}}) is now under review.

Our investigation team is carefully examining your case and all supporting documentation. We will contact you if we need any additional information.

Expected completion: {{expectedDate}}

Thank you for your patience.

Best regards,
Dispute Resolution Team`,
          variables: ['customerName', 'referenceNumber', 'expectedDate'],
          category: 'status_update',
          isActive: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        {
          id: uuidv4(),
          name: 'Dispute Resolved',
          subject: 'Your Dispute {{referenceNumber}} Has Been Resolved',
          body: `Dear {{customerName}},

We are pleased to inform you that your dispute (Reference: {{referenceNumber}}) has been successfully resolved.

Resolution:
{{resolution}}

The appropriate action has been taken, and you should see the changes reflected in your account within 3-5 business days.

Thank you for your patience throughout this process.

Best regards,
Dispute Resolution Team`,
          variables: ['customerName', 'referenceNumber', 'resolution'],
          category: 'resolution',
          isActive: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ];

      db.data.email_templates.push(...templates);
      await db.write();
      console.log('✅ Email templates seeded');
    } else {
      console.log('ℹ️  Email templates already exist');
    }

    console.log('🎉 Database seeding completed!');
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    throw error;
  }
}

// Run seeding if this file is executed directly
if (require.main === module) {
  seedDatabase()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

import nodemailer, { Transporter } from 'nodemailer';
import { EmailTemplate } from '../types';

class EmailService {
  private transporter: Transporter | null = null;

  constructor() {
    this.initialize();
  }

  private initialize(): void {
    try {
      this.transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.EMAIL_PORT || '587'),
        secure: process.env.EMAIL_SECURE === 'true',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASSWORD
        }
      });

      console.log('📧 Email service initialized');
    } catch (error) {
      console.error('❌ Email service initialization failed:', error);
      this.transporter = null;
    }
  }

  async sendEmail(to: string, subject: string, html: string, attachments?: any[]): Promise<boolean> {
    if (!this.transporter) {
      console.warn('⚠️  Email service not available, email not sent');
      return false;
    }

    try {
      const mailOptions = {
        from: process.env.EMAIL_FROM || 'DisputePortal <noreply@disputeportal.com>',
        to,
        subject,
        html,
        attachments
      };

      await this.transporter.sendMail(mailOptions);
      console.log(`✅ Email sent to ${to}`);
      return true;
    } catch (error) {
      console.error('❌ Failed to send email:', error);
      return false;
    }
  }

  async sendTemplateEmail(
    to: string,
    template: EmailTemplate,
    variables: Record<string, string>,
    attachments?: any[]
  ): Promise<boolean> {
    let subject = template.subject;
    let body = template.body;

    // Replace variables in subject and body
    for (const [key, value] of Object.entries(variables)) {
      const placeholder = `{{${key}}}`;
      subject = subject.replace(new RegExp(placeholder, 'g'), value);
      body = body.replace(new RegExp(placeholder, 'g'), value);
    }

    return this.sendEmail(to, subject, body, attachments);
  }

  isConfigured(): boolean {
    return this.transporter !== null;
  }
}

export default new EmailService();

import nodemailer, { Transporter } from 'nodemailer';
import { EmailTemplate } from '../types';

type EmailProvider = 'smtp' | 'gmail' | 'protonmail' | 'domain' | 'sendgrid' | 'mailgun';

interface EmailConfig {
  provider: EmailProvider;
  host?: string;
  port?: number;
  secure?: boolean;
  user?: string;
  password?: string;
  apiKey?: string;
  from: string;
}

class EmailService {
  private transporter: Transporter | null = null;
  private config: EmailConfig;
  private provider: EmailProvider;

  constructor() {
    this.provider = this.detectProvider();
    this.config = this.loadConfiguration();
    this.initialize();
  }

  /**
   * Detect email provider from environment variables
   */
  private detectProvider(): EmailProvider {
    const provider = (process.env.EMAIL_PROVIDER || 'smtp').toLowerCase() as EmailProvider;
    
    // Auto-detect based on host if not explicitly set
    if (provider === 'smtp' && process.env.EMAIL_HOST) {
      const host = process.env.EMAIL_HOST.toLowerCase();
      if (host.includes('gmail')) return 'gmail';
      if (host.includes('protonmail') || host.includes('proton.me')) return 'protonmail';
      if (host.includes('sendgrid')) return 'sendgrid';
      if (host.includes('mailgun')) return 'mailgun';
    }
    
    return provider;
  }

  /**
   * Load email configuration based on provider
   */
  private loadConfiguration(): EmailConfig {
    const baseConfig = {
      provider: this.provider,
      from: process.env.EMAIL_FROM || 'DisputePortal <noreply@disputeportal.com>'
    };

    switch (this.provider) {
      case 'gmail':
        return {
          ...baseConfig,
          host: 'smtp.gmail.com',
          port: 587,
          secure: false,
          user: process.env.EMAIL_USER,
          password: process.env.EMAIL_PASSWORD
        };

      case 'protonmail':
        return {
          ...baseConfig,
          host: 'smtp.protonmail.com',
          port: 587,
          secure: false,
          user: process.env.EMAIL_USER,
          password: process.env.EMAIL_PASSWORD
        };

      case 'sendgrid':
        return {
          ...baseConfig,
          host: 'smtp.sendgrid.net',
          port: 587,
          secure: false,
          user: 'apikey',
          password: process.env.SENDGRID_API_KEY || process.env.EMAIL_API_KEY
        };

      case 'mailgun':
        return {
          ...baseConfig,
          host: process.env.MAILGUN_SMTP_HOST || 'smtp.mailgun.org',
          port: 587,
          secure: false,
          user: process.env.MAILGUN_SMTP_USER || process.env.EMAIL_USER,
          password: process.env.MAILGUN_SMTP_PASSWORD || process.env.EMAIL_PASSWORD
        };

      case 'domain':
        // For custom domain email (hosting platforms like Render, Vercel, etc.)
        return {
          ...baseConfig,
          host: process.env.EMAIL_HOST || 'smtp.example.com',
          port: parseInt(process.env.EMAIL_PORT || '587'),
          secure: process.env.EMAIL_SECURE === 'true',
          user: process.env.EMAIL_USER,
          password: process.env.EMAIL_PASSWORD
        };

      case 'smtp':
      default:
        // Generic SMTP configuration
        return {
          ...baseConfig,
          host: process.env.EMAIL_HOST || 'smtp.gmail.com',
          port: parseInt(process.env.EMAIL_PORT || '587'),
          secure: process.env.EMAIL_SECURE === 'true',
          user: process.env.EMAIL_USER,
          password: process.env.EMAIL_PASSWORD
        };
    }
  }

  /**
   * Initialize email transporter based on configuration
   */
  private initialize(): void {
    try {
      // Check if required configuration exists
      if (!this.config.user || !this.config.password) {
        console.warn('⚠️  Email credentials not configured. Email service disabled.');
        console.log('💡 To enable email:');
        console.log(`   1. Set EMAIL_PROVIDER=${this.provider} (or smtp, gmail, protonmail, domain, sendgrid, mailgun)`);
        console.log('   2. Set EMAIL_USER=your-email@example.com');
        console.log('   3. Set EMAIL_PASSWORD=your-password-or-app-key');
        console.log('   4. Set EMAIL_FROM=Your Name <your-email@example.com>');
        this.transporter = null;
        return;
      }

      this.transporter = nodemailer.createTransport({
        host: this.config.host,
        port: this.config.port,
        secure: this.config.secure,
        auth: {
          user: this.config.user,
          pass: this.config.password
        },
        // Add timeout and connection options
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 10000
      });

      console.log(`📧 Email service initialized with ${this.provider.toUpperCase()} provider`);
      console.log(`   Host: ${this.config.host}:${this.config.port}`);
      console.log(`   From: ${this.config.from}`);
      console.log(`   User: ${this.config.user}`);
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

  /**
   * Get current email provider
   */
  getProvider(): EmailProvider {
    return this.provider;
  }

  /**
   * Get email configuration (without sensitive data)
   */
  getConfig(): Partial<EmailConfig> {
    return {
      provider: this.config.provider,
      host: this.config.host,
      port: this.config.port,
      secure: this.config.secure,
      from: this.config.from,
      user: this.config.user ? this.maskEmail(this.config.user) : undefined
    };
  }

  /**
   * Mask email for logging
   */
  private maskEmail(email: string): string {
    const [local, domain] = email.split('@');
    if (!domain) return '***';
    const maskedLocal = local.length > 2 
      ? local[0] + '***' + local[local.length - 1]
      : '***';
    return `${maskedLocal}@${domain}`;
  }

  /**
   * Test email configuration
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    if (!this.transporter) {
      return {
        success: false,
        message: 'Email service not configured. Check EMAIL_USER and EMAIL_PASSWORD.'
      };
    }

    try {
      await this.transporter.verify();
      return {
        success: true,
        message: `Email connection successful using ${this.provider.toUpperCase()} provider.`
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Email connection failed: ${error.message || error}`
      };
    }
  }

  /**
   * Send test email
   */
  async sendTestEmail(to: string): Promise<boolean> {
    const subject = 'DisputePortal Email Configuration Test';
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #B8102E;">✅ Email Configuration Successful</h2>
        <p>This is a test email from your DisputePortal application.</p>
        <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <strong>Provider:</strong> ${this.provider.toUpperCase()}<br>
          <strong>Host:</strong> ${this.config.host}<br>
          <strong>Port:</strong> ${this.config.port}<br>
          <strong>From:</strong> ${this.config.from}
        </div>
        <p>If you received this email, your email service is working correctly.</p>
        <p style="color: #666; font-size: 0.9em;">
          Sent at: ${new Date().toLocaleString()}
        </p>
      </div>
    `;

    return this.sendEmail(to, subject, html);
  }
}

export default new EmailService();

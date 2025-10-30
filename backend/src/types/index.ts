// ==========================================
// SHARED TYPES - Frontend & Backend
// ==========================================

// Dispute Form Data
export interface DisputeFormData {
  transactionDate: string;
  transactionAmount: string;
  currency: string;
  role: 'cardholder' | 'merchant';
  referenceNumber?: string;
  authorizationStatus: 'authorized' | 'declined';
  disputeDescription: string;
  accountStatement?: string;
  fullName: string;
  email: string;
  phone?: string;
  documents?: string[]; // File paths/names
  statementUpload?: string; // File path/name
}

// Chat Message
export interface ChatMessage {
  id?: string;
  text: string;
  isUser: boolean;
  timestamp: Date | string;
  userId?: string;
  adminId?: string;
  sessionId?: string;
  status?: 'sent' | 'delivered' | 'read';
}

// Email Template
export interface EmailTemplate {
  id?: string;
  name: string;
  subject: string;
  body: string;
  variables: string[]; // e.g., {{customerName}}, {{disputeId}}
  category: 'dispute_confirmation' | 'status_update' | 'resolution' | 'follow_up' | 'custom';
  isActive: boolean;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

// Email Thread
export interface EmailThread {
  id?: string;
  disputeId?: string;
  customerEmail: string;
  customerName: string;
  subject: string;
  lastMessageAt: Date | string;
  status: 'open' | 'closed' | 'pending';
  assignedTo?: string; // Admin ID
  priority: 'low' | 'medium' | 'high' | 'urgent';
  createdAt?: Date | string;
}

// Email Message
export interface EmailMessage {
  id?: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  isFromCustomer: boolean;
  attachments?: string[];
  sentAt: Date | string;
  readAt?: Date | string;
}

// Dispute Record
export interface DisputeRecord {
  id?: string;
  referenceNumber: string;
  transactionDate: string;
  transactionAmount: number;
  currency: string;
  role: 'cardholder' | 'merchant';
  authorizationStatus: 'authorized' | 'declined';
  disputeDescription: string;
  accountStatement?: string;
  fullName: string;
  email: string;
  phone?: string;
  status: 'pending' | 'under_review' | 'resolved' | 'rejected' | 'escalated';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  assignedTo?: string; // Admin ID
  resolution?: string;
  attachments?: string[];
  createdAt?: Date | string;
  updatedAt?: Date | string;
  resolvedAt?: Date | string;
}

// Admin User
export interface AdminUser {
  id?: string;
  email: string;
  password?: string; // Never sent to frontend
  fullName: string;
  role: 'super_admin' | 'admin' | 'agent';
  permissions: AdminPermission[];
  isActive: boolean;
  lastLoginAt?: Date | string;
  createdAt?: Date | string;
}

export type AdminPermission = 
  | 'view_disputes' 
  | 'manage_disputes' 
  | 'view_chats' 
  | 'respond_chats'
  | 'view_emails' 
  | 'send_emails' 
  | 'manage_templates'
  | 'manage_users'
  | 'view_analytics';

// Chat Session
export interface ChatSession {
  id?: string;
  customerId: string;
  customerName: string;
  customerEmail?: string;
  status: 'active' | 'closed' | 'waiting';
  assignedTo?: string; // Admin ID
  startedAt: Date | string;
  endedAt?: Date | string;
  lastMessageAt?: Date | string;
  unreadCount?: number;
}

// File Upload
export interface FileUpload {
  id?: string;
  filename: string;
  originalName: string;
  mimetype: string;
  size: number;
  path: string;
  uploadedBy: string; // Email or user ID
  disputeId?: string;
  emailThreadId?: string;
  createdAt?: Date | string;
}

// Statistics
export interface DashboardStats {
  totalDisputes: number;
  pendingDisputes: number;
  resolvedDisputes: number;
  activeChats: number;
  unreadEmails: number;
  todayDisputes: number;
  avgResolutionTime: number; // in hours
  satisfactionRate: number; // percentage
}

// API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Auth Types
export interface LoginCredentials {
  email: string;
  password: string;
}

export interface AuthToken {
  token: string;
  expiresIn: number;
  user: {
    id: string;
    email: string;
    fullName: string;
    role: string;
    permissions: AdminPermission[];
  };
}

// WebSocket Events
export interface ChatEventData {
  type: 'message' | 'typing' | 'read' | 'join' | 'leave';
  sessionId: string;
  message?: ChatMessage;
  userId?: string;
  adminId?: string;
}

// Notification
export interface Notification {
  id?: string;
  type: 'new_dispute' | 'new_chat' | 'new_email' | 'status_update' | 'assignment';
  title: string;
  message: string;
  isRead: boolean;
  relatedId?: string; // Dispute ID, Chat ID, etc.
  recipientId: string; // Admin ID
  createdAt?: Date | string;
}

// Filter & Search Options
export interface DisputeFilters {
  status?: DisputeRecord['status'];
  priority?: DisputeRecord['priority'];
  assignedTo?: string;
  dateFrom?: string;
  dateTo?: string;
  searchTerm?: string;
}

export interface EmailFilters {
  status?: EmailThread['status'];
  priority?: EmailThread['priority'];
  assignedTo?: string;
  dateFrom?: string;
  dateTo?: string;
  searchTerm?: string;
}

export interface ChatFilters {
  status?: ChatSession['status'];
  assignedTo?: string;
  dateFrom?: string;
  dateTo?: string;
}

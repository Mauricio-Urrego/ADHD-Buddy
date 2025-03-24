export interface Todo {
  id: string;
  title: string;
  description?: string;
  completed: boolean;
  createdAt: Date;
  dueDate?: Date;
  notificationTime?: Date;
  subTasks?: Todo[];
  userId: string;
  buddyId?: string;
  attempts: number;
  lastNotificationSuccess?: boolean;
  sharedWith?: string[];
  completedAt?: Date | null;
  lastActivityAt?: Date | null;
  sharedBy?: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  password: string;
  buddies: BuddyRelation[];
  preferredNotificationTimes?: Date[];
  completedTasks: number;
  streak: number;
  avatarUrl?: string;
}

export interface BuddyRelation {
  userId: string;
  name: string;
  email: string;
  status: 'pending' | 'accepted' | 'rejected';
  since?: Date;
  isActive: boolean;
}

export interface BuddyRequest {
  id: string;
  senderId: string;
  senderName: string;
  senderEmail: string;
  receiverId: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: Date;
}

export interface NotificationPreference {
  userId: string;
  todoId: string;
  successfulTimes: Date[];
  unsuccessfulTimes: Date[];
} 
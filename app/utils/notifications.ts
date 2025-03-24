import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NotificationPreference, Todo } from '../types';

const NOTIFICATION_PREFERENCES_KEY = '@notification_preferences';

export async function registerForPushNotificationsAsync() {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    return false;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  return true;
}

export async function scheduleNotification(todo: Todo) {
  try {
    const bestTime = await calculateBestNotificationTime(todo.userId, todo.id);
    
    if (!bestTime) {
      console.log('Could not determine best notification time');
      return;
    }

    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Don't forget your task!",
        body: todo.title,
        data: { todoId: todo.id },
      },
      trigger: {
        type: 'calendar',
        hour: bestTime.getHours(),
        minute: bestTime.getMinutes(),
        repeats: true,
      } as Notifications.NotificationTriggerInput,
    });

    console.log('Notification scheduled for:', bestTime.toLocaleTimeString());
  } catch (error) {
    console.error('Error scheduling notification:', error);
  }
};

export const recordNotificationSuccess = async (userId: string, todoId: string, timestamp: Date) => {
  // Record when the notification was successful
  // This could be used to track notification effectiveness
  console.log('Notification success recorded for todo:', todoId, 'at:', timestamp);
};

export async function recordNotificationFailure(userId: string, todoId: string, time: Date) {
  const preferences = await getNotificationPreferences();
  const key = `${userId}_${todoId}`;
  const pref = preferences[key] || {
    userId,
    todoId,
    successfulTimes: [],
    unsuccessfulTimes: [],
  };

  pref.unsuccessfulTimes.push(time);
  preferences[key] = pref;

  await AsyncStorage.setItem(NOTIFICATION_PREFERENCES_KEY, JSON.stringify(preferences));
}

async function getNotificationPreferences(): Promise<Record<string, NotificationPreference>> {
  const data = await AsyncStorage.getItem(NOTIFICATION_PREFERENCES_KEY);
  return data ? JSON.parse(data) : {};
}

async function calculateBestNotificationTime(userId: string, todoId: string): Promise<Date | null> {
  const preferences = await getNotificationPreferences();
  const key = `${userId}_${todoId}`;
  const pref = preferences[key];

  if (!pref || pref.successfulTimes.length === 0) {
    // Default to 9 AM if no data available
    const now = new Date();
    return new Date(now.setHours(9, 0, 0, 0));
  }

  // Convert successful times to hours
  const successfulHours = pref.successfulTimes.map(time => new Date(time).getHours());
  
  // Find the most common successful hour
  const hourCounts = successfulHours.reduce((acc, hour) => {
    acc[hour] = (acc[hour] || 0) + 1;
    return acc;
  }, {} as Record<number, number>);

  const bestHour = Object.entries(hourCounts)
    .reduce((a, b) => a[1] > b[1] ? a : b)[0];

  const now = new Date();
  const suggestedTime = new Date(now.setHours(parseInt(bestHour), 0, 0, 0));

  // If the suggested time is in the past, schedule for tomorrow
  if (suggestedTime < now) {
    suggestedTime.setDate(suggestedTime.getDate() + 1);
  }

  return suggestedTime;
}

export const scheduleChatNotification = async (
  senderId: string,
  senderName: string,
  message: string,
  todoTitle?: string
) => {
  try {
    await Notifications.requestPermissionsAsync();
    
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `New message from ${senderName}`,
        body: todoTitle ? `Re: ${todoTitle}\n${message}` : message,
        data: { type: 'chat', senderId },
      },
      trigger: null, // Send immediately
    });
  } catch (error) {
    console.error('Error scheduling chat notification:', error);
  }
};

export const dismissChatNotifications = async (senderId: string) => {
  try {
    // Get all scheduled notifications
    const notifications = await Notifications.getAllScheduledNotificationsAsync();
    
    // Find and cancel notifications from this sender
    for (const notification of notifications) {
      if (notification.content.data?.type === 'chat' && 
          notification.content.data?.senderId === senderId) {
        await Notifications.cancelScheduledNotificationAsync(notification.identifier);
      }
    }

    // Also dismiss any delivered notifications from this sender
    const deliveredNotifications = await Notifications.getPresentedNotificationsAsync();
    for (const notification of deliveredNotifications) {
      if (notification.request.content.data?.type === 'chat' && 
          notification.request.content.data?.senderId === senderId) {
        await Notifications.dismissNotificationAsync(notification.request.identifier);
      }
    }
  } catch (error) {
    console.error('Error dismissing chat notifications:', error);
  }
}; 
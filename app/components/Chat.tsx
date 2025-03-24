import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { scheduleChatNotification, dismissChatNotifications } from '../utils/notifications';

export interface Message {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: Date;
  todoId?: string;
  todoTitle?: string;
  read?: boolean;
}

interface ChatProps {
  userId: string;
  userName: string;
  buddyId: string;
  buddyName: string;
  todoId?: string;
  todoTitle?: string;
  onClose: () => void;
  onMessagesRead?: () => void;
}

const CHAT_STORAGE_KEY = '@chat_messages';
const UNREAD_MESSAGES_KEY = '@unread_messages';

export const Chat: React.FC<ChatProps> = ({
  userId,
  userName,
  buddyId,
  buddyName,
  todoId,
  todoTitle,
  onClose,
  onMessagesRead,
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const chatId = [...[userId, buddyId].sort(), todoId].join('_');

  useEffect(() => {
    const initializeChat = async () => {
      await loadMessages();
      await markMessagesAsRead();
      // Dismiss any existing notifications from this buddy
      await dismissChatNotifications(buddyId);
    };
    initializeChat();
  }, []);

  const loadMessages = async () => {
    try {
      const storedMessages = await AsyncStorage.getItem(`${CHAT_STORAGE_KEY}:${chatId}`);
      if (storedMessages) {
        const parsedMessages: Message[] = JSON.parse(storedMessages);
        // Convert string timestamps back to Date objects and ensure proper typing
        const messagesWithDates = parsedMessages.map(msg => ({
          ...msg,
          timestamp: new Date(msg.timestamp),
          id: msg.id || Date.now().toString(),
          senderId: msg.senderId,
          senderName: msg.senderName,
          text: msg.text,
          read: msg.read || false
        }));
        setMessages(messagesWithDates.sort((a, b) => 
          b.timestamp.getTime() - a.timestamp.getTime()
        ));
        return messagesWithDates; // Return for markMessagesAsRead to use
      }
      return [];
    } catch (error) {
      console.error('Error loading messages:', error);
      return [];
    }
  };

  const markMessagesAsRead = async () => {
    try {
      // Clear unread count for this chat
      const unreadMessagesStr = await AsyncStorage.getItem(`${UNREAD_MESSAGES_KEY}:${userId}`);
      let unreadMessages = unreadMessagesStr ? JSON.parse(unreadMessagesStr) : {};
      
      if (unreadMessages[chatId]) {
        delete unreadMessages[chatId];
        await AsyncStorage.setItem(
          `${UNREAD_MESSAGES_KEY}:${userId}`,
          JSON.stringify(unreadMessages)
        );
      }

      // Mark messages as read in storage
      const currentMessages = await AsyncStorage.getItem(`${CHAT_STORAGE_KEY}:${chatId}`);
      if (currentMessages) {
        const parsedMessages = JSON.parse(currentMessages);
        const updatedMessages = parsedMessages.map((msg: Message) => ({
          ...msg,
          read: msg.senderId !== userId ? true : msg.read
        }));
        await AsyncStorage.setItem(
          `${CHAT_STORAGE_KEY}:${chatId}`,
          JSON.stringify(updatedMessages)
        );
        
        // Update state with read messages
        setMessages(updatedMessages.map((msg: Message) => ({
          ...msg,
          timestamp: new Date(msg.timestamp)
        })).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()));
      }
    } catch (error) {
      console.error('Error marking messages as read:', error);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim()) return;

    const message: Message = {
      id: Date.now().toString(),
      senderId: userId,
      senderName: userName,
      text: newMessage.trim(),
      timestamp: new Date(),
      todoId,
      todoTitle,
      read: false,
    };

    try {
      // Get current messages from storage to ensure we don't lose any
      const storedMessages = await AsyncStorage.getItem(`${CHAT_STORAGE_KEY}:${chatId}`);
      const currentMessages = storedMessages ? JSON.parse(storedMessages) : [];
      
      const updatedMessages = [message, ...currentMessages];
      await AsyncStorage.setItem(
        `${CHAT_STORAGE_KEY}:${chatId}`,
        JSON.stringify(updatedMessages)
      );
      
      // Update state with the new message
      setMessages(updatedMessages.map(msg => ({
        ...msg,
        timestamp: new Date(msg.timestamp)
      })).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()));
      
      setNewMessage('');

      // Update unread count for buddy
      const buddyUnreadKey = `${UNREAD_MESSAGES_KEY}:${buddyId}`;
      const unreadMessagesStr = await AsyncStorage.getItem(buddyUnreadKey);
      let unreadMessages = unreadMessagesStr ? JSON.parse(unreadMessagesStr) : {};
      
      unreadMessages[chatId] = (unreadMessages[chatId] || 0) + 1;
      await AsyncStorage.setItem(buddyUnreadKey, JSON.stringify(unreadMessages));

      // Schedule notification for buddy
      await scheduleChatNotification(userId, userName, message.text, todoTitle);
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isOwnMessage = item.senderId === userId;

    return (
      <View style={[
        styles.messageContainer,
        isOwnMessage ? styles.ownMessage : styles.buddyMessage
      ]}>
        <View style={[
          styles.messageBubble,
          isOwnMessage ? styles.ownBubble : styles.buddyBubble
        ]}>
          {!isOwnMessage && (
            <Text style={styles.senderName}>{item.senderName}</Text>
          )}
          {item.todoTitle && (
            <Text style={styles.todoReference}>Re: {item.todoTitle}</Text>
          )}
          <Text style={[
            styles.messageText,
            isOwnMessage ? styles.ownMessageText : styles.buddyMessageText
          ]}>
            {item.text}
          </Text>
          <Text style={[
            styles.timestamp,
            isOwnMessage ? styles.ownTimestamp : styles.buddyTimestamp
          ]}>
            {new Date(item.timestamp).toLocaleTimeString([], { 
              hour: '2-digit', 
              minute: '2-digit' 
            })}
          </Text>
        </View>
      </View>
    );
  };

  const handleClose = async () => {
    await markMessagesAsRead();
    if (onMessagesRead) {
      onMessagesRead();
    }
    onClose();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView 
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <View style={styles.header}>
          <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
            <Ionicons name="close" size={24} color="#007AFF" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Chat with {buddyName}</Text>
            {todoTitle && (
              <Text style={styles.headerSubtitle}>Re: {todoTitle}</Text>
            )}
          </View>
          <View style={styles.placeholder} />
        </View>

        <View style={styles.contentContainer}>
          <FlatList
            data={messages}
            renderItem={renderMessage}
            keyExtractor={item => item.id}
            style={styles.messagesList}
            inverted
            contentContainerStyle={styles.messagesContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          />
        </View>

        <View style={styles.inputWrapper}>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              value={newMessage}
              onChangeText={setNewMessage}
              placeholder="Type a message..."
              multiline
              maxLength={500}
              returnKeyType="default"
            />
            <TouchableOpacity 
              style={styles.sendButton} 
              onPress={sendMessage}
              disabled={!newMessage.trim()}
            >
              <Ionicons 
                name="send" 
                size={24} 
                color={newMessage.trim() ? "#007AFF" : "#999"} 
              />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff',
  },
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 15,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    height: 60,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  closeButton: {
    padding: 5,
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholder: {
    width: 44,
  },
  contentContainer: {
    flex: 1,
  },
  messagesList: {
    flex: 1,
  },
  messagesContent: {
    padding: 15,
    paddingBottom: 20,
  },
  messageContainer: {
    marginVertical: 5,
    flexDirection: 'row',
  },
  ownMessage: {
    justifyContent: 'flex-end',
  },
  buddyMessage: {
    justifyContent: 'flex-start',
  },
  messageBubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 20,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  ownBubble: {
    backgroundColor: '#007AFF',
    borderBottomRightRadius: 5,
  },
  buddyBubble: {
    backgroundColor: '#fff',
    borderBottomLeftRadius: 5,
  },
  senderName: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  todoReference: {
    fontSize: 12,
    fontStyle: 'italic',
    color: '#666',
    marginBottom: 4,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 20,
  },
  ownMessageText: {
    color: '#fff',
  },
  buddyMessageText: {
    color: '#333',
  },
  timestamp: {
    fontSize: 11,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  ownTimestamp: {
    color: 'rgba(255, 255, 255, 0.7)',
  },
  buddyTimestamp: {
    color: '#999',
  },
  inputWrapper: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 10,
    paddingBottom: Platform.OS === 'ios' ? 25 : 10,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    backgroundColor: '#f8f8f8',
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingTop: 10,
    paddingBottom: 10,
    marginRight: 10,
    fontSize: 16,
  },
  sendButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
}); 
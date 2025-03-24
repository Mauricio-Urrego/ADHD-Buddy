import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  Text,
  Alert,
  Modal,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Todo as TodoType, BuddyRelation, User } from '../types';
import { Todo } from '../components/Todo';
import { Chat } from '../components/Chat';
import { scheduleNotification, recordNotificationSuccess, scheduleChatNotification } from '../utils/notifications';
import { useAuth } from '../context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { Swipeable } from 'react-native-gesture-handler';

const TODOS_STORAGE_KEY = '@todos';
const BUDDIES_STORAGE_KEY = '@buddies';
const LAST_CHECK_KEY = '@last_check';
const ALL_USERS_KEY = '@all_users';
const UNREAD_MESSAGES_KEY = '@unread_messages';
const LAST_ENCOURAGEMENT_KEY = '@last_encouragement';
const CHAT_STORAGE_KEY = '@chat_messages';

export const TodoListScreen: React.FC = () => {
  const { user } = useAuth();
  const [todos, setTodos] = useState<TodoType[]>([]);
  const [newTodoTitle, setNewTodoTitle] = useState('');
  const [buddies, setBuddies] = useState<BuddyRelation[]>([]);
  const [selectedTodo, setSelectedTodo] = useState<TodoType | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showSharedTodos, setShowSharedTodos] = useState(true);
  const [showChatModal, setShowChatModal] = useState(false);
  const [selectedTodoForChat, setSelectedTodoForChat] = useState<TodoType | null>(null);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (user) {
      loadTodos();
      loadBuddies();
      checkBuddyProgress();
      ensureActiveBuddy();
      initializeMockUsers();
      loadUnreadCounts();
    }
  }, [user]);

  // Check for buddy progress every minute
  useEffect(() => {
    if (!user) return;
    
    const interval = setInterval(() => {
      checkBuddyProgress();
    }, 60000); // Check every minute

    return () => clearInterval(interval);
  }, [user, todos]);

  // Check unread counts every 30 seconds
  useEffect(() => {
    if (!user) return;
    
    const interval = setInterval(() => {
      loadUnreadCounts();
    }, 30000);

    return () => clearInterval(interval);
  }, [user]);

  const checkBuddyProgress = async () => {
    if (!user) return;

    try {
      const lastCheck = await AsyncStorage.getItem(`${LAST_CHECK_KEY}:${user.id}`);
      const lastCheckTime = lastCheck ? new Date(JSON.parse(lastCheck)) : new Date(0);
      const now = new Date();

      // Look for completed todos from buddies
      const sharedTodos = todos.filter(todo => 
        todo.userId !== user.id && 
        todo.completed && 
        todo.completedAt && 
        new Date(todo.completedAt) > lastCheckTime
      );

      // Look for incomplete todos from buddies that haven't been worked on in a while
      const needsEncouragement = todos.filter(todo =>
        todo.userId !== user.id &&
        !todo.completed &&
        (!todo.lastActivityAt || new Date(todo.lastActivityAt).getTime() + 24 * 60 * 60 * 1000 < now.getTime())
      );

      // Check when we last sent encouragement to avoid spamming
      const lastEncouragementStr = await AsyncStorage.getItem(`${LAST_ENCOURAGEMENT_KEY}:${user.id}`);
      const lastEncouragement = lastEncouragementStr ? JSON.parse(lastEncouragementStr) : {};

      // Send congratulations for completed todos
      for (const todo of sharedTodos) {
        const buddy = buddies.find(b => b.userId === todo.userId);
        if (buddy) {
          const chatId = getChatId(user.id, buddy.userId, todo.id);
          const lastSentTime = lastEncouragement[chatId] || 0;
          
          // Only send if we haven't sent a message in the last 6 hours
          if (now.getTime() - lastSentTime > 6 * 60 * 60 * 1000) {
            const message = {
              id: Date.now().toString(),
              senderId: user.id,
              senderName: user.name,
              text: `Great job completing "${todo.title}"! 🎉`,
              timestamp: now,
              todoId: todo.id,
              todoTitle: todo.title,
              read: false,
            };

            const storedMessages = await AsyncStorage.getItem(`${CHAT_STORAGE_KEY}:${chatId}`);
            const currentMessages = storedMessages ? JSON.parse(storedMessages) : [];
            await AsyncStorage.setItem(
              `${CHAT_STORAGE_KEY}:${chatId}`,
              JSON.stringify([message, ...currentMessages])
            );

            // Update unread count for buddy
            const buddyUnreadKey = `${UNREAD_MESSAGES_KEY}:${buddy.userId}`;
            const unreadMessagesStr = await AsyncStorage.getItem(buddyUnreadKey);
            let unreadMessages = unreadMessagesStr ? JSON.parse(unreadMessagesStr) : {};
            unreadMessages[chatId] = (unreadMessages[chatId] || 0) + 1;
            await AsyncStorage.setItem(buddyUnreadKey, JSON.stringify(unreadMessages));

            // Schedule notification for buddy
            await scheduleChatNotification(user.id, user.name, message.text, todo.title);

            // Update last encouragement time
            lastEncouragement[chatId] = now.getTime();
            await AsyncStorage.setItem(
              `${LAST_ENCOURAGEMENT_KEY}:${user.id}`,
              JSON.stringify(lastEncouragement)
            );
          }
        }
      }

      // Send encouragement for tasks that need attention
      for (const todo of needsEncouragement) {
        const buddy = buddies.find(b => b.userId === todo.userId);
        if (buddy) {
          const chatId = getChatId(user.id, buddy.userId, todo.id);
          const lastSentTime = lastEncouragement[chatId] || 0;
          
          // Only send if we haven't sent a message in the last 12 hours
          if (now.getTime() - lastSentTime > 12 * 60 * 60 * 1000) {
            const message = {
              id: Date.now().toString(),
              senderId: user.id,
              senderName: user.name,
              text: `Hey! How's it going with "${todo.title}"? Let me know if you need any help! 💪`,
              timestamp: now,
              todoId: todo.id,
              todoTitle: todo.title,
              read: false,
            };

            const storedMessages = await AsyncStorage.getItem(`${CHAT_STORAGE_KEY}:${chatId}`);
            const currentMessages = storedMessages ? JSON.parse(storedMessages) : [];
            await AsyncStorage.setItem(
              `${CHAT_STORAGE_KEY}:${chatId}`,
              JSON.stringify([message, ...currentMessages])
            );

            // Update unread count for buddy
            const buddyUnreadKey = `${UNREAD_MESSAGES_KEY}:${buddy.userId}`;
            const unreadMessagesStr = await AsyncStorage.getItem(buddyUnreadKey);
            let unreadMessages = unreadMessagesStr ? JSON.parse(unreadMessagesStr) : {};
            unreadMessages[chatId] = (unreadMessages[chatId] || 0) + 1;
            await AsyncStorage.setItem(buddyUnreadKey, JSON.stringify(unreadMessages));

            // Schedule notification for buddy
            await scheduleChatNotification(user.id, user.name, message.text, todo.title);

            // Update last encouragement time
            lastEncouragement[chatId] = now.getTime();
            await AsyncStorage.setItem(
              `${LAST_ENCOURAGEMENT_KEY}:${user.id}`,
              JSON.stringify(lastEncouragement)
            );
          }
        }
      }

      // Update last check time
      await AsyncStorage.setItem(`${LAST_CHECK_KEY}:${user.id}`, JSON.stringify(now));
    } catch (error) {
      console.error('Error checking buddy progress:', error);
    }
  };

  const loadTodos = async () => {
    if (!user) return;
    
    try {
      // Load user's own todos
      const storedTodos = await AsyncStorage.getItem(`${TODOS_STORAGE_KEY}:${user.id}`);
      const userTodos = storedTodos ? JSON.parse(storedTodos) : [];

      // Load todos shared with the user
      const allTodosKeys = await AsyncStorage.getAllKeys();
      const todoKeys = allTodosKeys.filter(key => key.startsWith(TODOS_STORAGE_KEY));
      
      let sharedTodos: TodoType[] = [];
      for (const key of todoKeys) {
        if (key === `${TODOS_STORAGE_KEY}:${user.id}`) continue; // Skip own todos
        const otherUserTodos = await AsyncStorage.getItem(key);
        if (otherUserTodos) {
          const parsedTodos: TodoType[] = JSON.parse(otherUserTodos);
          // Include todos that are either explicitly shared with the user
          // or belong to the user's active buddy
          const activeBuddy = buddies.find(b => b.isActive);
          const todosToInclude = parsedTodos.filter(todo => 
            todo.sharedWith?.includes(user.id) ||
            (activeBuddy && todo.userId === activeBuddy.userId)
          );
          sharedTodos = [...sharedTodos, ...todosToInclude];
        }
      }

      setTodos([...userTodos, ...sharedTodos]);
    } catch (error) {
      console.error('Error loading todos:', error);
    }
  };

  const loadBuddies = async () => {
    if (!user) return;

    try {
      const storedBuddies = await AsyncStorage.getItem(`${BUDDIES_STORAGE_KEY}:${user.id}`);
      if (storedBuddies) {
        setBuddies(JSON.parse(storedBuddies));
      }
    } catch (error) {
      console.error('Error loading buddies:', error);
    }
  };

  const ensureActiveBuddy = async () => {
    if (!user) return;

    try {
      // Load current buddies
      const storedBuddies = await AsyncStorage.getItem(`${BUDDIES_STORAGE_KEY}:${user.id}`);
      let currentBuddies: BuddyRelation[] = storedBuddies ? JSON.parse(storedBuddies) : [];
      
      // If user already has a buddy, just load it
      if (currentBuddies.length > 0) {
        setBuddies(currentBuddies);
        return;
      }

      // Get all users' buddy lists to check their availability
      const allBuddyKeys = await AsyncStorage.getAllKeys();
      const buddyKeys = allBuddyKeys.filter(key => key.startsWith(BUDDIES_STORAGE_KEY));
      const unavailableUserIds = new Set<string>();

      // Check which users already have buddies
      for (const key of buddyKeys) {
        const userBuddiesStr = await AsyncStorage.getItem(key);
        if (userBuddiesStr) {
          const userBuddies = JSON.parse(userBuddiesStr);
          if (userBuddies.length > 0) {
            // Extract user ID from the storage key
            const userId = key.replace(`${BUDDIES_STORAGE_KEY}:`, '');
            unavailableUserIds.add(userId);
            // Add their buddies to unavailable list
            userBuddies.forEach((buddy: BuddyRelation) => {
              unavailableUserIds.add(buddy.userId);
            });
          }
        }
      }

      // Get all users
      const allUsersStr = await AsyncStorage.getItem(ALL_USERS_KEY);
      const allUsers: User[] = allUsersStr ? JSON.parse(allUsersStr) : [];
      
      // Filter out unavailable users and current user
      const availableUsers = allUsers.filter(u => 
        u.id !== user.id && !unavailableUserIds.has(u.id)
      );

      if (availableUsers.length > 0) {
        // Randomly select a buddy
        const randomBuddy = availableUsers[Math.floor(Math.random() * availableUsers.length)];
        
        const newBuddy: BuddyRelation = {
          userId: randomBuddy.id,
          name: randomBuddy.name,
          email: randomBuddy.email,
          status: 'accepted',
          since: new Date(),
          isActive: true
        };

        const reciprocalBuddy: BuddyRelation = {
          userId: user.id,
          name: user.name,
          email: user.email,
          status: 'accepted',
          since: new Date(),
          isActive: true
        };

        // Save buddy relations
        await AsyncStorage.setItem(
          `${BUDDIES_STORAGE_KEY}:${user.id}`,
          JSON.stringify([newBuddy])
        );
        await AsyncStorage.setItem(
          `${BUDDIES_STORAGE_KEY}:${randomBuddy.id}`,
          JSON.stringify([reciprocalBuddy])
        );

        setBuddies([newBuddy]);

        // Share current user's todos with random buddy
        const userTodos = todos.filter(t => t.userId === user.id);
        const updatedUserTodos = userTodos.map(todo => ({
          ...todo,
          sharedWith: [randomBuddy.id],
        }));
        await AsyncStorage.setItem(
          `${TODOS_STORAGE_KEY}:${user.id}`,
          JSON.stringify(updatedUserTodos)
        );

        // Share random buddy's todos with current user
        const randomBuddyTodosStr = await AsyncStorage.getItem(`${TODOS_STORAGE_KEY}:${randomBuddy.id}`);
        const randomBuddyTodos = randomBuddyTodosStr ? JSON.parse(randomBuddyTodosStr) : [];
        const updatedRandomBuddyTodos = randomBuddyTodos.map(todo => ({
          ...todo,
          sharedWith: [user.id],
        }));
        await AsyncStorage.setItem(
          `${TODOS_STORAGE_KEY}:${randomBuddy.id}`,
          JSON.stringify(updatedRandomBuddyTodos)
        );

        // Update local state with all shared todos
        setTodos(prevTodos => {
          const otherTodos = prevTodos.filter(t => 
            t.userId !== user.id && t.userId !== randomBuddy.id
          );
          return [...otherTodos, ...updatedUserTodos, ...updatedRandomBuddyTodos];
        });

        Alert.alert(
          'New Buddy Assigned!',
          `You've been paired with ${newBuddy.name}. All your todos will be automatically shared with them.`
        );
      }
    } catch (error) {
      console.error('Error ensuring active buddy:', error);
    }
  };

  const addTodo = async () => {
    if (!newTodoTitle.trim() || !user) return;

    const activeBuddy = buddies.find(b => b.isActive);

    const newTodo: TodoType = {
      id: Date.now().toString(),
      title: newTodoTitle.trim(),
      completed: false,
      createdAt: new Date(),
      userId: user.id,
      attempts: 0,
      sharedWith: activeBuddy ? [activeBuddy.userId] : [],
    };

    try {
      // Get current todos for the user
      const storedTodos = await AsyncStorage.getItem(`${TODOS_STORAGE_KEY}:${user.id}`);
      const currentTodos = storedTodos ? JSON.parse(storedTodos) : [];
      const updatedTodos = [...currentTodos, newTodo];

      // Save the updated todos
      await AsyncStorage.setItem(
        `${TODOS_STORAGE_KEY}:${user.id}`,
        JSON.stringify(updatedTodos)
      );

      // Update the state with all todos (including shared ones)
      setTodos(prevTodos => {
        const otherTodos = prevTodos.filter(t => t.userId !== user.id);
        return [...otherTodos, ...updatedTodos];
      });

      setNewTodoTitle('');

      // Schedule notification for the new todo
      await scheduleNotification(newTodo);

      // If shared with a buddy, send a chat message about the new task
      if (activeBuddy) {
        const chatId = getChatId(user.id, activeBuddy.userId, newTodo.id);
        const message = {
          id: Date.now().toString(),
          senderId: user.id,
          senderName: user.name,
          text: `I just added a new task: "${newTodo.title}". Let's work on our goals together! 🎯`,
          timestamp: new Date(),
          todoId: newTodo.id,
          todoTitle: newTodo.title,
          read: false,
        };

        // Add message to chat
        const storedMessages = await AsyncStorage.getItem(`${CHAT_STORAGE_KEY}:${chatId}`);
        const currentMessages = storedMessages ? JSON.parse(storedMessages) : [];
        await AsyncStorage.setItem(
          `${CHAT_STORAGE_KEY}:${chatId}`,
          JSON.stringify([message, ...currentMessages])
        );

        // Update unread count for buddy
        const buddyUnreadKey = `${UNREAD_MESSAGES_KEY}:${activeBuddy.userId}`;
        const unreadMessagesStr = await AsyncStorage.getItem(buddyUnreadKey);
        let unreadMessages = unreadMessagesStr ? JSON.parse(unreadMessagesStr) : {};
        unreadMessages[chatId] = (unreadMessages[chatId] || 0) + 1;
        await AsyncStorage.setItem(buddyUnreadKey, JSON.stringify(unreadMessages));

        // Schedule notification for buddy
        await scheduleChatNotification(user.id, user.name, message.text, newTodo.title);
      }
    } catch (error) {
      console.error('Error adding todo:', error);
      Alert.alert('Error', 'Failed to add todo. Please try again.');
    }
  };

  const handleComplete = async (id: string) => {
    if (!user) return;

    const todo = todos.find(t => t.id === id);
    if (!todo) return;

    // Only allow completion if the user owns the todo
    if (todo.userId !== user.id) {
      Alert.alert('Not Allowed', 'Only the todo owner can mark it as complete. You can send encouragement instead!');
      return;
    }

    const now = new Date();
    const updatedTodos = todos.map(todo => {
      if (todo.id === id) {
        const completed = !todo.completed;
        if (completed) {
          recordNotificationSuccess(todo.userId, todo.id, now);
          return { 
            ...todo, 
            completed,
            completedAt: now,
            lastActivityAt: now,
          };
        }
        return { 
          ...todo, 
          completed,
          completedAt: null,
          lastActivityAt: now,
        };
      }
      return todo;
    });

    await saveTodos(updatedTodos.filter(t => t.userId === user.id));
    setTodos(updatedTodos);
  };

  const handleBreakDown = (id: string) => {
    if (!user) return;

    const todo = todos.find(t => t.id === id);
    if (!todo) return;

    // Only allow breaking down if the user owns the todo
    if (todo.userId !== user.id) {
      Alert.alert('Error', 'Only the owner can break down this todo.');
      return;
    }

    Alert.prompt(
      'Break Down Task',
      'How would you like to break down this task?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Add Subtask',
          onPress: async (subtaskTitle?: string) => {
            if (!subtaskTitle?.trim()) return;

            const newSubtask: TodoType = {
              id: Date.now().toString(),
              title: subtaskTitle.trim(),
              completed: false,
              createdAt: new Date(),
              userId: user.id,
              attempts: 0,
              sharedWith: todo.sharedWith,
            };

            const updatedTodos = todos.map(t => {
              if (t.id === id) {
                return {
                  ...t,
                  subTasks: [...(t.subTasks || []), newSubtask],
                };
              }
              return t;
            });

            await saveTodos(updatedTodos.filter(t => t.userId === user.id));
            setTodos(updatedTodos);
          },
        },
      ],
      'plain-text'
    );
  };

  const handleCelebrate = async (id: string) => {
    if (!user) return;

    const todo = todos.find(t => t.id === id);
    if (!todo) return;

    // Only allow celebrating if the user owns the todo or it's shared with them
    if (todo.userId !== user.id && !todo.sharedWith?.includes(user.id)) {
      Alert.alert('Error', 'You do not have permission to celebrate this todo.');
      return;
    }

    const updatedTodos = todos.map(todo => {
      if (todo.id === id) {
        return { ...todo, attempts: todo.attempts + 1 };
      }
      return todo;
    });

    await saveTodos(updatedTodos.filter(t => t.userId === user.id));
    setTodos(updatedTodos);

    Alert.alert(
      '🎉 Great effort!',
      'Remember: Progress is progress, no matter how small. Keep going!',
      [{ text: 'Thanks!' }]
    );
  };

  const saveTodos = async (todosToSave: TodoType[]) => {
    if (!user) return;

    try {
      await AsyncStorage.setItem(
        `${TODOS_STORAGE_KEY}:${user.id}`,
        JSON.stringify(todosToSave)
      );
    } catch (error) {
      console.error('Error saving todos:', error);
    }
  };

  const handleShare = (id: string) => {
    if (!user) return;

    const todo = todos.find(t => t.id === id);
    if (!todo) return;

    if (todo.userId !== user.id) {
      Alert.alert('Error', 'Only the owner can manage sharing for this todo.');
      return;
    }

    Alert.alert(
      'Share Options',
      'How would you like to share your todos?',
      [
        {
          text: 'Random Active User',
          onPress: () => shareWithRandomUser()
        },
        {
          text: 'Choose Buddy',
          onPress: () => setShowShareModal(true)
        },
        {
          text: 'Cancel',
          style: 'cancel'
        }
      ]
    );
  };

  const shareWithRandomUser = async () => {
    if (!user) return;

    try {
      // Get all users
      const allUsersStr = await AsyncStorage.getItem(ALL_USERS_KEY);
      const allUsers: User[] = allUsersStr ? JSON.parse(allUsersStr) : [];
      
      // Check if user already has a buddy
      if (buddies.length > 0) {
        Alert.alert(
          'Buddy Already Assigned',
          'You already have a buddy. To pair with someone else, you need to remove your current buddy first.',
          [{ text: 'OK' }]
        );
        return;
      }

      // Get all users' buddy lists to check their availability
      const allBuddyKeys = await AsyncStorage.getAllKeys();
      const buddyKeys = allBuddyKeys.filter(key => key.startsWith(BUDDIES_STORAGE_KEY));
      const unavailableUserIds = new Set<string>();

      // Check which users already have buddies
      for (const key of buddyKeys) {
        const userBuddiesStr = await AsyncStorage.getItem(key);
        if (userBuddiesStr) {
          const userBuddies = JSON.parse(userBuddiesStr);
          if (userBuddies.length > 0) {
            // Extract user ID from the storage key
            const userId = key.replace(`${BUDDIES_STORAGE_KEY}:`, '');
            unavailableUserIds.add(userId);
            // Add their buddies to unavailable list
            userBuddies.forEach((buddy: BuddyRelation) => {
              unavailableUserIds.add(buddy.userId);
            });
          }
        }
      }

      // Filter out unavailable users and current user
      const availableUsers = allUsers.filter(u => 
        u.id !== user.id && !unavailableUserIds.has(u.id)
      );

      if (availableUsers.length === 0) {
        Alert.alert(
          'No Users Available', 
          'There are no available users to pair with. Try inviting a friend to join ADHD Buddy!',
          [{ text: 'OK' }]
        );
        return;
      }

      // Randomly select an available user
      const randomUser = availableUsers[Math.floor(Math.random() * availableUsers.length)];
      
      // Create new buddy relation
      const newBuddy: BuddyRelation = {
        userId: randomUser.id,
        name: randomUser.name,
        email: randomUser.email,
        status: 'accepted',
        since: new Date(),
        isActive: true
      };

      // Create reciprocal buddy relation
      const reciprocalBuddy: BuddyRelation = {
        userId: user.id,
        name: user.name,
        email: user.email,
        status: 'accepted',
        since: new Date(),
        isActive: true
      };

      // Save buddy relations
      await AsyncStorage.setItem(
        `${BUDDIES_STORAGE_KEY}:${user.id}`,
        JSON.stringify([newBuddy])
      );
      await AsyncStorage.setItem(
        `${BUDDIES_STORAGE_KEY}:${randomUser.id}`,
        JSON.stringify([reciprocalBuddy])
      );

      setBuddies([newBuddy]);

      // Share current user's todos with random user
      const userTodos = todos.filter(t => t.userId === user.id);
      const updatedUserTodos = userTodos.map(todo => ({
        ...todo,
        sharedWith: [randomUser.id],
      }));
      await AsyncStorage.setItem(
        `${TODOS_STORAGE_KEY}:${user.id}`,
        JSON.stringify(updatedUserTodos)
      );

      // Share random user's todos with current user
      const randomUserTodosStr = await AsyncStorage.getItem(`${TODOS_STORAGE_KEY}:${randomUser.id}`);
      const randomUserTodos = randomUserTodosStr ? JSON.parse(randomUserTodosStr) : [];
      const updatedRandomUserTodos = randomUserTodos.map(todo => ({
        ...todo,
        sharedWith: [user.id],
      }));
      await AsyncStorage.setItem(
        `${TODOS_STORAGE_KEY}:${randomUser.id}`,
        JSON.stringify(updatedRandomUserTodos)
      );

      // Update local state with all shared todos
      setTodos(prevTodos => {
        const otherTodos = prevTodos.filter(t => 
          t.userId !== user.id && t.userId !== randomUser.id
        );
        return [...otherTodos, ...updatedUserTodos, ...updatedRandomUserTodos];
      });

      Alert.alert(
        'Success!', 
        `You and ${newBuddy.name} are now buddies! You can see each other's todos and encourage each other.`
      );
    } catch (error) {
      console.error('Error sharing with random user:', error);
      Alert.alert('Error', 'Failed to share with random user. Please try again.');
    }
  };

  const shareTodoWithBuddy = async (buddyId: string) => {
    if (!user) return;

    try {
      // Update all buddies' active status
      const updatedBuddies = buddies.map(b => ({
        ...b,
        isActive: b.userId === buddyId
      }));

      await AsyncStorage.setItem(
        `${BUDDIES_STORAGE_KEY}:${user.id}`,
        JSON.stringify(updatedBuddies)
      );

      setBuddies(updatedBuddies);

      // Share current user's todos with the buddy
      const userTodos = todos.filter(t => t.userId === user.id);
      const updatedUserTodos = userTodos.map(todo => ({
        ...todo,
        sharedWith: [buddyId],
      }));
      await AsyncStorage.setItem(
        `${TODOS_STORAGE_KEY}:${user.id}`,
        JSON.stringify(updatedUserTodos)
      );

      // Share buddy's todos with current user
      const buddyTodosStr = await AsyncStorage.getItem(`${TODOS_STORAGE_KEY}:${buddyId}`);
      const buddyTodos = buddyTodosStr ? JSON.parse(buddyTodosStr) : [];
      const updatedBuddyTodos = buddyTodos.map(todo => ({
        ...todo,
        sharedWith: [user.id],
      }));
      await AsyncStorage.setItem(
        `${TODOS_STORAGE_KEY}:${buddyId}`,
        JSON.stringify(updatedBuddyTodos)
      );

      // Update local state with all shared todos
      setTodos(prevTodos => {
        const otherTodos = prevTodos.filter(t => 
          t.userId !== user.id && t.userId !== buddyId
        );
        return [...otherTodos, ...updatedUserTodos, ...updatedBuddyTodos];
      });

      setShowShareModal(false);
      Alert.alert('Success', 'Active buddy changed! All todos are now shared with them.');
    } catch (error) {
      console.error('Error changing active buddy:', error);
      Alert.alert('Error', 'Failed to change active buddy. Please try again.');
    }
  };

  const handleChat = (todo: TodoType) => {
    const buddy = buddies.find(b => b.userId === todo.userId || todo.sharedWith?.includes(b.userId));
    if (!buddy) {
      Alert.alert('Error', 'No buddy found for this todo.');
      return;
    }
    setSelectedTodoForChat(todo);
    setShowChatModal(true);
  };

  const handleMessagesRead = () => {
    // Force refresh of unread counts
    loadUnreadCounts();
  };

  const loadUnreadCounts = async () => {
    if (!user) return;

    try {
      const unreadMessagesStr = await AsyncStorage.getItem(`${UNREAD_MESSAGES_KEY}:${user.id}`);
      const unreadMessages = unreadMessagesStr ? JSON.parse(unreadMessagesStr) : {};
      setUnreadCounts(unreadMessages);
    } catch (error) {
      console.error('Error loading unread counts:', error);
    }
  };

  const getChatId = (userId1: string, userId2: string, todoId: string) => {
    return [...[userId1, userId2].sort(), todoId].join('_');
  };

  const handleDelete = async (id: string) => {
    if (!user) return;

    const todoToDelete = todos.find(t => t.id === id);
    if (!todoToDelete) return;

    // Only allow deletion if the user owns the todo
    if (todoToDelete.userId !== user.id) {
      Alert.alert('Not Allowed', 'You can only delete your own todos.');
      return;
    }

    try {
      const updatedTodos = todos.filter(t => t.id !== id);
      const userTodos = updatedTodos.filter(t => t.userId === user.id);
      
      // Save updated todos
      await AsyncStorage.setItem(
        `${TODOS_STORAGE_KEY}:${user.id}`,
        JSON.stringify(userTodos)
      );

      // Update state
      setTodos(updatedTodos);
    } catch (error) {
      console.error('Error deleting todo:', error);
      Alert.alert('Error', 'Failed to delete todo. Please try again.');
    }
  };

  const renderRightActions = (id: string) => {
    return (
      <TouchableOpacity
        style={styles.deleteButton}
        onPress={() => {
          Alert.alert(
            'Delete Todo',
            'Are you sure you want to delete this todo?',
            [
              {
                text: 'Cancel',
                style: 'cancel',
              },
              {
                text: 'Delete',
                onPress: () => handleDelete(id),
                style: 'destructive',
              },
            ]
          );
        }}
      >
        <Ionicons name="trash-outline" size={24} color="#fff" />
      </TouchableOpacity>
    );
  };

  const renderTodoItem = ({ item }: { item: TodoType }) => {
    const canChat = item.userId !== user?.id || item.sharedWith?.length > 0;
    const chatPartnerId = item.userId === user?.id ? item.sharedWith?.[0] : item.userId;
    const chatId = chatPartnerId ? getChatId(user?.id || '', chatPartnerId, item.id) : '';
    const unreadCount = unreadCounts[chatId] || 0;

    return (
      <Swipeable
        renderRightActions={() => renderRightActions(item.id)}
        overshootRight={false}
      >
        <View style={styles.todoItemContainer}>
          <View style={{ flex: 1 }}>
            <Todo
              todo={item}
              onComplete={handleComplete}
              onBreakDown={handleBreakDown}
              onCelebrate={handleCelebrate}
              onShare={handleShare}
            />
          </View>
          {canChat && (
            <TouchableOpacity
              style={styles.chatButton}
              onPress={() => handleChat(item)}
            >
              <View>
                <Ionicons name="chatbubble-outline" size={24} color="#007AFF" />
                {unreadCount > 0 && (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadText}>{unreadCount}</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          )}
        </View>
      </Swipeable>
    );
  };

  const getOwnTodos = () => todos.filter(todo => todo.userId === user?.id);
  const getSharedTodos = () => todos.filter(todo => todo.userId !== user?.id);

  const initializeMockUsers = async () => {
    if (!user) return;

    try {
      // Check if mock users already exist
      const existingUsersStr = await AsyncStorage.getItem(ALL_USERS_KEY);
      if (existingUsersStr) {
        console.log('Mock users already initialized');
        return;
      }

      // Create mock users with fixed IDs to prevent duplicates
      const mockUsers = [
        {
          id: 'mock_1',
          name: 'Alex Thompson',
          email: 'alex@example.com',
        },
        {
          id: 'mock_2',
          name: 'Sam Rivera',
          email: 'sam@example.com',
        },
        {
          id: 'mock_3',
          name: 'Jordan Lee',
          email: 'jordan@example.com',
        },
        {
          id: 'mock_4',
          name: 'Taylor Kim',
          email: 'taylor@example.com',
        },
        {
          id: 'mock_5',
          name: 'Morgan Chen',
          email: 'morgan@example.com',
        }
      ];

      // Filter out any mock user that might have the same ID as the current user
      const otherUsers = mockUsers.filter(mockUser => mockUser.id !== user.id);
      
      // Save mock users to AsyncStorage
      await AsyncStorage.setItem(ALL_USERS_KEY, JSON.stringify(otherUsers));
      
      console.log('Mock users initialized:', otherUsers);
    } catch (error) {
      console.error('Error initializing mock users:', error);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          value={newTodoTitle}
          onChangeText={setNewTodoTitle}
          placeholder="Add a new task..."
          onSubmitEditing={addTodo}
        />
        <TouchableOpacity style={styles.addButton} onPress={addTodo}>
          <Text style={styles.addButtonText}>+</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={getOwnTodos()}
        keyExtractor={item => item.id}
        renderItem={renderTodoItem}
        style={styles.list}
        ListHeaderComponent={() => (
          <Text style={styles.sectionTitle}>My Tasks</Text>
        )}
        ListFooterComponent={() => {
          const sharedTodos = getSharedTodos();
          if (sharedTodos.length === 0) return null;

          return (
            <View style={styles.sharedSection}>
              <TouchableOpacity
                style={[
                  styles.sharedHeader,
                  showSharedTodos && styles.sharedHeaderExpanded
                ]}
                onPress={() => setShowSharedTodos(!showSharedTodos)}
              >
                <Text style={styles.sectionTitle}>
                  Shared with me ({sharedTodos.length})
                </Text>
                <Ionicons
                  name={showSharedTodos ? 'chevron-down' : 'chevron-forward'}
                  size={24}
                  color="#007AFF"
                />
              </TouchableOpacity>
              {showSharedTodos && (
                <View style={styles.sharedTodosList}>
                  {sharedTodos.map(todo => (
                    <View key={todo.id} style={styles.sharedTodoItem}>
                      <Text style={styles.sharedByText}>
                        From: {buddies.find(b => b.userId === todo.userId)?.name || 'a buddy'}
                      </Text>
                      {renderTodoItem({ item: todo })}
                    </View>
                  ))}
                </View>
              )}
            </View>
          );
        }}
      />

      <Modal
        visible={showShareModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowShareModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Choose a Buddy</Text>
            <FlatList
              data={buddies}
              keyExtractor={item => item.userId}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.buddyItem,
                    item.isActive && styles.activeBuddyItem
                  ]}
                  onPress={() => shareTodoWithBuddy(item.userId)}
                >
                  <View style={styles.buddyInfo}>
                    <Text style={styles.buddyName}>{item.name}</Text>
                    <Text style={styles.buddyEmail}>{item.email}</Text>
                  </View>
                  {item.isActive && (
                    <View style={styles.activeIndicator}>
                      <Text style={styles.activeText}>Active</Text>
                    </View>
                  )}
                </TouchableOpacity>
              )}
              ListEmptyComponent={() => (
                <Text style={styles.emptyText}>No buddies added yet</Text>
              )}
            />
            <TouchableOpacity
              style={styles.randomButton}
              onPress={() => {
                setShowShareModal(false);
                shareWithRandomUser();
              }}
            >
              <Text style={styles.randomButtonText}>Share with Random User</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setShowShareModal(false)}
            >
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {showChatModal && selectedTodoForChat && user && (
        <Modal
          visible={showChatModal}
          animationType="slide"
          presentationStyle="fullScreen"
        >
          <Chat
            userId={user.id}
            userName={user.name}
            buddyId={selectedTodoForChat.userId === user.id 
              ? selectedTodoForChat.sharedWith![0]
              : selectedTodoForChat.userId}
            buddyName={buddies.find(b => 
              b.userId === (selectedTodoForChat.userId === user.id 
                ? selectedTodoForChat.sharedWith![0]
                : selectedTodoForChat.userId)
            )?.name || 'Buddy'}
            todoId={selectedTodoForChat.id}
            todoTitle={selectedTodoForChat.title}
            onClose={() => {
              setShowChatModal(false);
              setSelectedTodoForChat(null);
            }}
            onMessagesRead={handleMessagesRead}
          />
        </Modal>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  inputContainer: {
    flexDirection: 'row',
    marginBottom: 20,
    marginHorizontal: 15,
    marginTop: 15,
  },
  input: {
    flex: 1,
    height: 50,
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 15,
    marginRight: 10,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  addButton: {
    width: 50,
    height: 50,
    backgroundColor: '#007AFF',
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButtonText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  list: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    color: '#333',
    marginHorizontal: 15,
  },
  sharedSection: {
    marginTop: 20,
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sharedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 0,
  },
  sharedHeaderExpanded: {
    marginBottom: 15,
  },
  sharedTodosList: {
    marginTop: 10,
  },
  sharedTodoItem: {
    marginBottom: 15,
  },
  sharedByText: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
    marginBottom: 4,
    marginLeft: 4,
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    width: '80%',
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  buddyItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  buddyInfo: {
    flex: 1,
  },
  buddyName: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  buddyEmail: {
    fontSize: 14,
    color: '#666',
  },
  activeBuddyItem: {
    backgroundColor: '#f0f9ff',
  },
  activeIndicator: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 10,
  },
  activeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  randomButton: {
    marginTop: 20,
    padding: 15,
    backgroundColor: '#34C759',
    borderRadius: 10,
    alignItems: 'center',
  },
  randomButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  closeButton: {
    marginTop: 20,
    padding: 15,
    backgroundColor: '#007AFF',
    borderRadius: 10,
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  emptyText: {
    textAlign: 'center',
    color: '#666',
    fontSize: 16,
    fontStyle: 'italic',
    padding: 20,
  },
  todoItemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5E5',
    backgroundColor: '#fff',
    width: '100%',
  },
  chatButton: {
    padding: 10,
    marginLeft: 10,
  },
  unreadBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: '#FF3B30',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  unreadText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  deleteButton: {
    backgroundColor: '#FF3B30',
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
  },
}); 
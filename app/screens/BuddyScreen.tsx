import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BuddyRelation, BuddyRequest } from '../types';
import { useAuth, TEST_USERS } from '../context/AuthContext';

const BUDDIES_STORAGE_KEY = '@buddies';
const BUDDY_REQUESTS_STORAGE_KEY = '@buddy_requests';

export const BuddyScreen: React.FC = () => {
  const { user } = useAuth();
  const [buddies, setBuddies] = useState<BuddyRelation[]>([]);
  const [buddyRequests, setBuddyRequests] = useState<BuddyRequest[]>([]);
  const [newBuddyEmail, setNewBuddyEmail] = useState('');

  useEffect(() => {
    if (user) {
      loadBuddies();
      loadBuddyRequests();
    }
  }, [user]);

  const loadBuddies = async () => {
    try {
      const storedBuddies = await AsyncStorage.getItem(`${BUDDIES_STORAGE_KEY}:${user?.id}`);
      if (storedBuddies) {
        setBuddies(JSON.parse(storedBuddies));
      }
    } catch (error) {
      console.error('Error loading buddies:', error);
    }
  };

  const loadBuddyRequests = async () => {
    try {
      const storedRequests = await AsyncStorage.getItem(`${BUDDY_REQUESTS_STORAGE_KEY}:${user?.id}`);
      if (storedRequests) {
        setBuddyRequests(JSON.parse(storedRequests));
      }
    } catch (error) {
      console.error('Error loading buddy requests:', error);
    }
  };

  const sendBuddyRequest = async () => {
    if (!newBuddyEmail.trim() || !user) return;

    // Find the test user by email
    const targetUser = TEST_USERS.find(u => u.email.toLowerCase() === newBuddyEmail.toLowerCase());
    if (!targetUser) {
      Alert.alert('Error', 'User not found. Try one of the test users.');
      return;
    }

    if (targetUser.id === user.id) {
      Alert.alert('Error', 'You cannot add yourself as a buddy.');
      return;
    }

    if (buddies.some(b => b.userId === targetUser.id)) {
      Alert.alert('Error', 'This user is already your buddy.');
      return;
    }

    const newRequest: BuddyRequest = {
      id: Date.now().toString(),
      senderId: user.id,
      senderName: user.name,
      senderEmail: user.email,
      receiverId: targetUser.id,
      status: 'pending',
      createdAt: new Date(),
    };

    try {
      // Save the request for both users
      const senderRequests = [...buddyRequests, newRequest];
      await AsyncStorage.setItem(
        `${BUDDY_REQUESTS_STORAGE_KEY}:${user.id}`,
        JSON.stringify(senderRequests)
      );
      setBuddyRequests(senderRequests);

      // Simulate saving for receiver
      const receiverRequests = await AsyncStorage.getItem(
        `${BUDDY_REQUESTS_STORAGE_KEY}:${targetUser.id}`
      );
      const parsedReceiverRequests = receiverRequests ? JSON.parse(receiverRequests) : [];
      await AsyncStorage.setItem(
        `${BUDDY_REQUESTS_STORAGE_KEY}:${targetUser.id}`,
        JSON.stringify([...parsedReceiverRequests, newRequest])
      );

      setNewBuddyEmail('');
      Alert.alert('Success', 'Buddy request sent!');
    } catch (error) {
      console.error('Error sending buddy request:', error);
      Alert.alert('Error', 'Failed to send buddy request');
    }
  };

  const handleBuddyRequest = async (request: BuddyRequest, accept: boolean) => {
    if (!user) return;

    const updatedRequests = buddyRequests.filter(r => r.id !== request.id);
    
    if (accept) {
      const newBuddy: BuddyRelation = {
        userId: request.senderId,
        name: request.senderName,
        email: request.senderEmail,
        status: 'accepted',
        since: new Date(),
      };

      // Add buddy for current user
      const updatedBuddies = [...buddies, newBuddy];
      await AsyncStorage.setItem(
        `${BUDDIES_STORAGE_KEY}:${user.id}`,
        JSON.stringify(updatedBuddies)
      );
      setBuddies(updatedBuddies);

      // Add current user as buddy for the sender
      const senderBuddy: BuddyRelation = {
        userId: user.id,
        name: user.name,
        email: user.email,
        status: 'accepted',
        since: new Date(),
      };
      const senderBuddies = await AsyncStorage.getItem(
        `${BUDDIES_STORAGE_KEY}:${request.senderId}`
      );
      const parsedSenderBuddies = senderBuddies ? JSON.parse(senderBuddies) : [];
      await AsyncStorage.setItem(
        `${BUDDIES_STORAGE_KEY}:${request.senderId}`,
        JSON.stringify([...parsedSenderBuddies, senderBuddy])
      );
    }

    await AsyncStorage.setItem(
      `${BUDDY_REQUESTS_STORAGE_KEY}:${user.id}`,
      JSON.stringify(updatedRequests)
    );
    setBuddyRequests(updatedRequests);
  };

  const removeBuddy = async (buddyId: string) => {
    if (!user) return;

    Alert.alert(
      'Remove Buddy',
      'Are you sure you want to remove this buddy?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const updatedBuddies = buddies.filter(b => b.userId !== buddyId);
            await AsyncStorage.setItem(
              `${BUDDIES_STORAGE_KEY}:${user.id}`,
              JSON.stringify(updatedBuddies)
            );
            setBuddies(updatedBuddies);

            // Remove the current user from the other user's buddy list
            const otherUserBuddies = await AsyncStorage.getItem(
              `${BUDDIES_STORAGE_KEY}:${buddyId}`
            );
            if (otherUserBuddies) {
              const parsedOtherUserBuddies = JSON.parse(otherUserBuddies);
              const updatedOtherUserBuddies = parsedOtherUserBuddies.filter(
                (b: BuddyRelation) => b.userId !== user.id
              );
              await AsyncStorage.setItem(
                `${BUDDIES_STORAGE_KEY}:${buddyId}`,
                JSON.stringify(updatedOtherUserBuddies)
              );
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.addBuddySection}>
        <TextInput
          style={styles.input}
          value={newBuddyEmail}
          onChangeText={setNewBuddyEmail}
          placeholder="Enter buddy's email"
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <TouchableOpacity style={styles.addButton} onPress={sendBuddyRequest}>
          <Text style={styles.addButtonText}>Send Request</Text>
        </TouchableOpacity>
      </View>

      {buddyRequests.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Buddy Requests</Text>
          <FlatList
            data={buddyRequests.filter(r => r.receiverId === user?.id)}
            keyExtractor={item => item.id}
            renderItem={({ item }) => (
              <View style={styles.requestItem}>
                <View style={styles.requestInfo}>
                  <Text style={styles.requestName}>{item.senderName}</Text>
                  <Text style={styles.requestEmail}>{item.senderEmail}</Text>
                </View>
                <View style={styles.requestButtons}>
                  <TouchableOpacity
                    style={[styles.requestButton, styles.acceptButton]}
                    onPress={() => handleBuddyRequest(item, true)}
                  >
                    <Text style={styles.requestButtonText}>Accept</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.requestButton, styles.rejectButton]}
                    onPress={() => handleBuddyRequest(item, false)}
                  >
                    <Text style={styles.requestButtonText}>Reject</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          />
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Your Buddies</Text>
        <FlatList
          data={buddies}
          keyExtractor={item => item.userId}
          renderItem={({ item }) => (
            <View style={styles.buddyItem}>
              <View style={styles.buddyInfo}>
                <Text style={styles.buddyName}>{item.name}</Text>
                <Text style={styles.buddyEmail}>{item.email}</Text>
              </View>
              <TouchableOpacity
                style={styles.removeButton}
                onPress={() => removeBuddy(item.userId)}
              >
                <Text style={styles.removeButtonText}>Remove</Text>
              </TouchableOpacity>
            </View>
          )}
          ListEmptyComponent={() => (
            <Text style={styles.emptyText}>No buddies yet. Add some!</Text>
          )}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  addBuddySection: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  input: {
    flex: 1,
    height: 50,
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 15,
    marginRight: 10,
    fontSize: 16,
  },
  addButton: {
    backgroundColor: '#007AFF',
    borderRadius: 10,
    justifyContent: 'center',
    paddingHorizontal: 15,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  requestItem: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  requestInfo: {
    flex: 1,
  },
  requestName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  requestEmail: {
    fontSize: 14,
    color: '#666',
  },
  requestButtons: {
    flexDirection: 'row',
  },
  requestButton: {
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 5,
    marginLeft: 10,
  },
  acceptButton: {
    backgroundColor: '#4CD964',
  },
  rejectButton: {
    backgroundColor: '#FF3B30',
  },
  requestButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  buddyItem: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  buddyInfo: {
    flex: 1,
  },
  buddyName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  buddyEmail: {
    fontSize: 14,
    color: '#666',
  },
  removeButton: {
    backgroundColor: '#FF3B30',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 5,
  },
  removeButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  emptyText: {
    textAlign: 'center',
    color: '#666',
    fontSize: 16,
    fontStyle: 'italic',
    padding: 20,
  },
}); 
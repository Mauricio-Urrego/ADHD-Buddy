import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Todo as TodoType } from '../types';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';

interface TodoProps {
  todo: TodoType;
  onComplete: (id: string) => void;
  onBreakDown: (id: string) => void;
  onCelebrate: (id: string) => void;
  onShare: (id: string) => void;
}

export const Todo: React.FC<TodoProps> = ({ todo, onComplete, onBreakDown, onCelebrate, onShare }) => {
  const { user } = useAuth();
  const isOwner = user?.id === todo.userId;
  const [showDetails, setShowDetails] = useState(false);

  const handleLongPress = () => {
    Alert.alert(
      'Need help?',
      'This task seems challenging. Would you like to:',
      [
        {
          text: 'Break it down',
          onPress: () => onBreakDown(todo.id),
        },
        {
          text: 'Mark as attempted',
          onPress: () => {
            onCelebrate(todo.id);
          },
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.todoContent}>
        <TouchableOpacity 
          onPress={() => onComplete(todo.id)}
          disabled={!isOwner}
          style={[styles.checkbox, !isOwner && styles.disabledCheckbox]}
        >
          <Ionicons
            name={todo.completed ? "checkmark-circle" : "ellipse-outline"}
            size={24}
            color={isOwner ? "#007AFF" : "#999999"}
          />
        </TouchableOpacity>
        
        <View style={styles.textContainer}>
          <Text style={[
            styles.title,
            todo.completed && styles.completedText
          ]}>
            {todo.title}
          </Text>
          {todo.sharedBy && (
            <Text style={styles.sharedByText}>
              Shared by: {todo.sharedBy}
            </Text>
          )}
        </View>
      </View>

      <View style={styles.actions}>
        {onShare && (
          <TouchableOpacity onPress={() => onShare(todo.id)} style={styles.actionButton}>
            <Ionicons name="share-outline" size={24} color="#007AFF" />
            <Text style={styles.actionText}>Share</Text>
          </TouchableOpacity>
        )}
        
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => onBreakDown(todo.id)}
        >
          <Ionicons name="git-branch-outline" size={24} color="#007AFF" />
          <Text style={styles.actionText}>Break Down</Text>
        </TouchableOpacity>
        
        {todo.completed && onCelebrate && (
          <TouchableOpacity onPress={() => onCelebrate(todo.id)} style={styles.actionButton}>
            <Ionicons name="star-outline" size={24} color="#007AFF" />
            <Text style={styles.actionText}>Celebrate</Text>
          </TouchableOpacity>
        )}
      </View>
      {showDetails && (
        <View style={styles.details}>
          {todo.description && (
            <Text style={styles.description}>{todo.description}</Text>
          )}
          <Text style={styles.attempts}>Attempts: {todo.attempts}</Text>
          {todo.subTasks && todo.subTasks.length > 0 && (
            <View style={styles.subTasks}>
              <Text style={styles.subTasksTitle}>Sub-tasks:</Text>
              {todo.subTasks.map((subTask) => (
                <Todo
                  key={subTask.id}
                  todo={subTask}
                  onComplete={onComplete}
                  onBreakDown={onBreakDown}
                  onCelebrate={onCelebrate}
                  onShare={onShare}
                />
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#ffffff',
    padding: 15,
    borderRadius: 10,
    marginVertical: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
  },
  todoContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    marginRight: 10,
  },
  disabledCheckbox: {
    opacity: 0.5,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    color: '#333',
  },
  completedText: {
    textDecorationLine: 'line-through',
    color: '#888',
  },
  sharedByText: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
    fontStyle: 'italic',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: 10,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 15,
    padding: 5,
  },
  actionText: {
    marginLeft: 5,
    color: '#007AFF',
    fontSize: 14,
  },
  details: {
    marginTop: 10,
  },
  description: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5,
  },
  attempts: {
    fontSize: 12,
    color: '#888',
    fontStyle: 'italic',
  },
  subTasks: {
    marginTop: 10,
    paddingLeft: 15,
  },
  subTasksTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 5,
  },
}); 
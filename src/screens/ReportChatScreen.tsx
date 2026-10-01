import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, ScrollView, Pressable, Platform, ActivityIndicator, Image } from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../types';
import { Colors } from '../constants/colors';
import { AppText } from '../components/ui/AppText';
import { AppTextInput } from '../components/ui/AppTextInput';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';
import { DeviceEventEmitter } from 'react-native';

export default function ReportChatScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'ReportChat'>>();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  
  const { reportId } = route.params;
  
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    fetchMessages();
    
    // Listen for WebSocket updates triggered via DeviceEventEmitter in HomeScreen
    // When a report message is received, AlignedData or a specific event can be fired.
    const sub = DeviceEventEmitter.addListener('REFRESH_ALIGNED_DATA', fetchMessages);
    
    return () => {
      sub.remove();
    };
  }, [reportId]);

  const fetchMessages = async () => {
    try {
      const res = await api.get(`/reports/${reportId}/messages`);
      if (res.data) {
        setMessages(res.data);
      }
    } catch (e) {
      console.log('Failed to fetch report messages', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    if (!inputText.trim()) return;
    
    setSending(true);
    try {
      await api.post(`/reports/${reportId}/messages`, { message: inputText.trim() });
      setInputText('');
      fetchMessages();
    } catch (e) {
      console.log('Error sending report message', e);
    } finally {
      setSending(false);
    }
  };

  const renderMessage = (msg: any, index: number) => {
    const isUser = msg.sender_type === 'user';
    return (
      <View key={msg.id || index} style={[styles.messageRow, isUser ? styles.messageRowUser : styles.messageRowAdmin]}>
        <View style={[styles.messageBubble, isUser ? styles.messageBubbleUser : styles.messageBubbleAdmin]}>
          <AppText style={{ color: isUser ? '#fff' : Colors.ink, fontSize: 14, lineHeight: 20 }}>
            {msg.message}
          </AppText>
          {msg.file_url && (
            <Image 
              source={{ uri: msg.file_url }} 
              style={styles.attachedImage} 
              resizeMode="cover"
            />
          )}
        </View>
        <AppText style={styles.timeText}>
          {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </AppText>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.ink} />
        </Pressable>
        <AppText variant="heading">Ticket Chat</AppText>
        <View style={{ width: 24 }} />
      </View>

      <View style={{ flex: 1 }}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="small" color={Colors.accent} />
          </View>
        ) : (
          <ScrollView 
            ref={scrollViewRef}
            style={styles.chatList}
            contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
            onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
            keyboardShouldPersistTaps="handled"
          >
            {messages.map(renderMessage)}
          </ScrollView>
        )}

        <KeyboardStickyView offset={{ closed: 0, opened: 0 }}>
          <View style={[styles.inputArea, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <View style={styles.inputContainer}>
              <AppTextInput
                value={inputText}
                onChangeText={setInputText}
                placeholder="Type a message..."
                style={styles.textInput}
                n=""
                label=""
              />
              <Pressable 
                style={[styles.sendBtn, !inputText.trim() && { opacity: 0.5 }]} 
                onPress={handleSend}
                disabled={sending || !inputText.trim()}
              >
                {sending ? (
                   <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="send" size={16} color="#fff" />
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardStickyView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bone },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: Colors.rule
  },
  backBtn: { padding: 4 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  chatList: { flex: 1 },
  messageRow: { marginBottom: 16, maxWidth: '80%' },
  messageRowUser: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  messageRowAdmin: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  messageBubble: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
  },
  messageBubbleUser: {
    backgroundColor: Colors.accent,
    borderBottomRightRadius: 4,
  },
  messageBubbleAdmin: {
    backgroundColor: '#E5E5EA',
    borderBottomLeftRadius: 4,
  },
  attachedImage: {
    width: 200,
    height: 150,
    borderRadius: 8,
    marginTop: 10
  },
  timeText: {
    fontSize: 10,
    color: Colors.muted,
    marginTop: 4,
  },
  inputArea: {
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: Colors.bone,
    borderTopWidth: 1,
    borderTopColor: Colors.rule
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: -20
  },
  textInput: {
    flex: 1,
    marginRight: 10
  },
  sendBtn: {
    backgroundColor: Colors.accent,
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20
  }
});

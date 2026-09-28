import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, ScrollView, StyleSheet, Pressable, RefreshControl, DeviceEventEmitter, Alert, Image } from 'react-native';
import { Colors } from '../../constants/colors';
import { AppText } from '../../components/ui/AppText';
import { AppButton } from '../../components/ui/AppButton';
import { AppTextInput } from '../../components/ui/AppTextInput';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { ThreadEntryCard } from '../../components/thread/ThreadEntry';
import { ThreadEntry } from '../../types';
import AlignedNav from '@/components/ui/AlignedNav';
import { useAudioRecorder, useAudioPlayer, useAudioPlayerStatus, AudioModule, RecordingPresets } from 'expo-audio';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useRoute } from '@react-navigation/native';
import {
  getThreadMessages,
  postLetter,
  postAppreciation,
  postCheckin,
  askPrompt,
  postVoice,
  postPhoto,
  replyToPrompt
} from '../../services/threadApi';
import { completeRitual } from '../../services/ritualApi';
import { createCheckin } from '../../services/checkinApi';
import { getUserProfile, getPartnerProfile } from '../../services/userApi';
import { getMe } from '../../services/authApi';
import { SharedCheckinSheet } from '../../components/shared/SharedCheckinSheet';

const TYPES = ['all', 'partner', 'letter', 'voice', 'photo', 'prompt', 'appreciation', 'checkin'] as const;

const COMPOSE_TYPES = [
  { k: 'letter', l: 'Letter', mark: '❦' },
  { k: 'voice', l: 'Voice', mark: '◉' },
  { k: 'photo', l: 'Photo', mark: '◇' },
  { k: 'prompt', l: 'Prompt', mark: '◈' },
  { k: 'appreciation', l: 'Appreciation', mark: '❦' },
  { k: 'checkin', l: 'Check-in', mark: '◈' },
];

export const ThreadScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const route = useRoute<any>();
  const [thread, setThread] = useState<any[]>([]);
  const [filter, setFilter] = useState<typeof TYPES[number]>('all');

  useEffect(() => {
    if (route.params?.activeCategory) {
      const cat = String(route.params.activeCategory).toLowerCase();
      if (TYPES.includes(cat as any)) {
        setFilter(cat as any);
      }
    }
  }, [route.params?.activeCategory]);
  const [sheet, setSheet] = useState(false);
  const [composeType, setComposeType] = useState<'letter' | 'voice' | 'photo' | 'prompt' | 'appreciation' | 'checkin' | 'replyPrompt'>('letter');

  const [refreshing, setRefreshing] = useState(false);

  // Prompt Reply State
  const [replyPromptId, setReplyPromptId] = useState<string | null>(null);
  const [replyPromptQuestion, setReplyPromptQuestion] = useState<string | null>(null);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [partnerName, setPartnerName] = useState<string>('Partner');
  const [isAligned, setIsAligned] = useState<boolean>(true);

  // Form State
  const [textVal, setTextVal] = useState('');
  const [checkinA1, setCheckinA1] = useState('');
  const [checkinA2, setCheckinA2] = useState('');
  const [checkinA3, setCheckinA3] = useState('');
  const [promptTab, setPromptTab] = useState<'romantic' | 'desire'>('romantic');

  const [isSendingVoice, setIsSendingVoice] = useState(false);
  const [isSendingPhoto, setIsSendingPhoto] = useState(false);
  const [photoUri, setPhotoUri] = useState<string | null>(null);

  // Audio Recording State
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recordingActive, setRecordingActive] = useState(false);
  const [recordSec, setRecordSec] = useState(0);
  const isRecording = audioRecorder.isRecording || recordingActive;
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const isInitializingRef = useRef(false);

  useEffect(() => {
    let timer: any = null;
    if (recordingActive) {
      timer = setInterval(() => {
        setRecordSec((prev) => prev + 1);
      }, 1000);
    } else {
      setRecordSec(0);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [recordingActive]);

  // Audio Preview Playback State
  const previewPlayer = useAudioPlayer(previewUri);
  const previewStatus = useAudioPlayerStatus(previewPlayer);
  const isPreviewPlaying = previewPlayer.playing;
  
  const previewDurationMs = previewStatus.duration || 0;
  const previewPositionMs = previewStatus.currentTime || 0;
  const durSecs = Math.floor(previewDurationMs / 1000);
  const posSecs = Math.floor(previewPositionMs / 1000);
  const previewDuration = `${Math.floor(durSecs / 60).toString().padStart(2, '0')}:${(durSecs % 60).toString().padStart(2, '0')}`;
  const previewPosition = `${Math.floor(posSecs / 60).toString().padStart(2, '0')}:${(posSecs % 60).toString().padStart(2, '0')}`;
  const previewProgress = previewDurationMs ? (previewPositionMs / previewDurationMs) : 0;
  const formattedRecordTime = `${Math.floor(recordSec / 60).toString().padStart(2, '0')}:${(recordSec % 60).toString().padStart(2, '0')}`;

  const fetchMessages = useCallback(async () => {
    try {
      const res = await getThreadMessages();
      setThread(res || []);
    } catch (e) {
      console.log('Error fetching thread:', e);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchMessages();
    }, [fetchMessages])
  );

  const [userPhoto, setUserPhoto] = useState<string | null>(null);
  const [partnerPhoto, setPartnerPhoto] = useState<string | null>(null);

  const checkAlignment = async () => {
    try {
      const meData = await getMe();
      const aligned = !!(meData && (meData.is_aligned || meData.partner));
      setIsAligned(aligned);
    } catch (e) {
      console.log('Failed to check alignment in ThreadScreen', e);
    }
  };

  useEffect(() => {
    checkAlignment();
    getUserProfile().then((res) => {
      const data = res?.data || res;
      const id = data?.id || data?._id || data?.user_id;
      setCurrentUserId(id);
      setUserPhoto(data?.profile_photo_url || data?.photo_url || data?.avatar || null);
    }).catch(console.error);

    getPartnerProfile().then((res) => {
      const data = res?.data || res;
      if (data?.name) {
        setPartnerName(data.name);
      }
      setPartnerPhoto(data?.profile_photo_url || data?.photo_url || data?.avatar || null);
    }).catch(console.error);

    const sub1 = DeviceEventEmitter.addListener('NEW_THREAD_MESSAGE', (eventData: any) => {
      if (eventData) {
        const newMsg = eventData.message || (eventData.id ? eventData : null);
        const deletedId = eventData.deleted_id;

        if (deletedId) {
          setThread((prev) => prev.filter((m: any) => m.id !== deletedId && m._id !== deletedId));
        } else if (newMsg && (newMsg.id || newMsg._id)) {
          setThread((prev) => {
            const msgId = newMsg.id || newMsg._id;
            const exists = prev.some((m: any) => m.id === msgId || m._id === msgId);
            if (exists) {
              return prev.map((m: any) => (m.id === msgId || m._id === msgId ? { ...m, ...newMsg } : m));
            }
            return [newMsg, ...prev];
          });
        }
      }
      fetchMessages();
    });

    const sub2 = DeviceEventEmitter.addListener('REFRESH_ALIGNED_DATA', () => {
      fetchMessages();
      checkAlignment();
    });
    const sub3 = DeviceEventEmitter.addListener('ALIGNMENT_BONDED', () => {
      fetchMessages();
      checkAlignment();
    });
    const sub4 = DeviceEventEmitter.addListener('ALIGNMENT_BROKEN', () => {
      fetchMessages();
      checkAlignment();
    });

    return () => {
      sub1.remove();
      sub2.remove();
      sub3.remove();
      sub4.remove();
    };
  }, [fetchMessages]);

  useEffect(() => {
    // Unloading handled automatically by expo-audio hook
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchMessages();
    setRefreshing(false);
  };

  const filtered = filter === 'all'
    ? thread
    : filter === 'partner'
      ? thread.filter(t => {
        const senderId = t.sender_id || t.creator_id || t.from;
        return currentUserId ? senderId !== currentUserId : true;
      })
      : thread.filter(t => {
        const cat = (t.category || t.type || '').toLowerCase();
        return cat === filter.toLowerCase();
      });

  const pickImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });

    if (!result.canceled) {
      setPhotoUri(result.assets[0].uri);
    }
  };

  // Audio Recording Handlers
  const isPreparingRef = useRef(false);
  const isRecordingRef = useRef(false);
  const isStoppingRef = useRef(false);
  const recordStartTimeRef = useRef<number | null>(null);

  const startRecording = async () => {
    if (isPreparingRef.current || isRecordingRef.current || isStoppingRef.current || previewUri) return;
    isPreparingRef.current = true;

    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (permission.status === 'granted') {
        if (audioRecorder.isRecording) {
          try { await audioRecorder.stop(); } catch (_) {}
        }
        await audioRecorder.prepareToRecordAsync();
        audioRecorder.record();
        recordStartTimeRef.current = Date.now();
        isRecordingRef.current = true;
        setRecordingActive(true);
      } else {
        Alert.alert('Microphone Access', 'Please enable microphone access in your device settings to record voice messages.');
      }
    } catch (err) {
      console.log('Failed to start recording gracefully:', err);
      isRecordingRef.current = false;
      setRecordingActive(false);
      recordStartTimeRef.current = null;
    } finally {
      isPreparingRef.current = false;
    }
  };

  const stopRecording = async () => {
    if (isStoppingRef.current) return;
    isStoppingRef.current = true;

    if (isPreparingRef.current) {
      let attempts = 0;
      while (isPreparingRef.current && attempts < 10) {
        await new Promise((r) => setTimeout(r, 100));
        attempts++;
      }
    }

    try {
      // Ensure Android MediaRecorder has recorded for at least 800ms to avoid 'stop failed' RuntimeException
      if (recordStartTimeRef.current) {
        const elapsed = Date.now() - recordStartTimeRef.current;
        if (elapsed < 800) {
          await new Promise((r) => setTimeout(r, 800 - elapsed));
        }
      }

      if (audioRecorder.isRecording || isRecordingRef.current) {
        try {
          await audioRecorder.stop();
        } catch (stopErr) {
          console.log('Handled audio recorder stop:', stopErr);
        }
        const uri = audioRecorder.uri;
        if (uri) {
          setPreviewUri(uri);
        }
      }
    } catch (err) {
      console.log('Gracefully handled stop recording:', err);
    } finally {
      isRecordingRef.current = false;
      isPreparingRef.current = false;
      isStoppingRef.current = false;
      setRecordingActive(false);
      recordStartTimeRef.current = null;
    }
  };

  const toggleTapRecording = async () => {
    if (audioRecorder.isRecording || isRecordingRef.current) {
      await stopRecording();
    } else {
      await startRecording();
    }
  };

  const discardPreview = () => {
    setPreviewUri(null);
  };

  const togglePreviewPlayback = async () => {
    if (isPreviewPlaying) {
      previewPlayer.pause();
    } else {
      if (previewProgress >= 0.99) {
        previewPlayer.seekTo(0);
      }
      previewPlayer.play();
    }
  };

  const sendVoiceMessage = async () => {
    if (!isAligned) {
      Alert.alert('Partner Required', 'Please connect with your partner first to send voice notes.');
      return;
    }
    if (!previewUri) return;
    setIsSendingVoice(true);
    const file = {
      uri: previewUri,
      type: 'audio/m4a',
      name: `voice_${Date.now()}.m4a`
    };
    try {
      await postVoice(file);
      discardPreview();
      setSheet(false);
      fetchMessages();
    } catch (e: any) {
      console.error('Failed to send voice', e);
      Alert.alert('Upload Failed', e?.response?.data?.detail || e.message || String(e));
    } finally {
      setIsSendingVoice(false);
    }
  };

  const handleSend = async () => {
    if (!isAligned) {
      Alert.alert('Partner Required', 'Please connect with your partner first to post in Thread.');
      return;
    }
    const trimmedText = textVal.trim();

    try {
      if (composeType === 'photo') {
        setIsSendingPhoto(true);
      }

      if (composeType === 'letter') {
        if (!trimmedText) {
          Alert.alert('Empty Letter', 'Please write something in your letter before sending.');
          return;
        }
        await postLetter({ text: trimmedText });
      } else if (composeType === 'appreciation') {
        if (!trimmedText) {
          Alert.alert('Empty Appreciation', 'Please write your appreciation message before sending.');
          return;
        }
        await postAppreciation({ text: trimmedText });
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const hour = new Date().getHours();
        let tod = 'afternoon';
        if (hour < 12) tod = 'morning';
        else if (hour > 17) tod = 'evening';
        await completeRitual({ ritual_type: 'appreciation', text: trimmedText, timezone: tz, time_name: tod });
      } else if (composeType === 'prompt') {
        if (!trimmedText) {
          Alert.alert('Empty Question', 'Please enter a question for your prompt before sending.');
          return;
        }
        const mappedPromptType = promptTab === 'romantic' ? 'Romantic' : 'Desired';
        await askPrompt({ prompt_type: mappedPromptType, question_text: trimmedText, type: 'custom' });
      } else if (composeType === 'replyPrompt' && replyPromptId) {
        if (!trimmedText) {
          Alert.alert('Empty Answer', 'Please enter your answer before replying to the prompt.');
          return;
        }
        await replyToPrompt(replyPromptId, { answer: trimmedText });
      } else if (composeType === 'checkin') {
        const c1 = checkinA1.trim();
        const c2 = checkinA2.trim();
        const c3 = checkinA3.trim();
        if (!c1 && !c2 && !c3) {
          Alert.alert('Empty Check-in', 'Please answer at least one check-in question before submitting.');
          return;
        }
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const today = new Date().toLocaleDateString('en-US', {
          month: '2-digit', day: '2-digit', year: 'numeric'
        }).replace(/\//g, '.');

        await postCheckin({ date: new Date().toISOString(), answer_1: c1, answer_2: c2, answer_3: c3 });

        // Integrate with Today page
        await createCheckin({
          date: today,
          answer_1: c1,
          answer_2: c2,
          answer_3: c3,
          timezone: tz,
          time_name: 'afternoon' // fallback default tod
        });

        await completeRitual({ ritual_type: 'checkin' });
      } else if (composeType === 'voice') {
        return; // Voice has custom flow
      } else if (composeType === 'photo') {
        if (!photoUri) {
          Alert.alert('No Photo Selected', 'Please select a photo before sending.');
          setIsSendingPhoto(false);
          return;
        }
        const file = {
          uri: photoUri,
          type: 'image/jpeg',
          name: `photo_${Date.now()}.jpg`
        };
        await postPhoto(file, trimmedText);
      }

      setSheet(false);
      setTextVal('');
      setPhotoUri(null);
      setCheckinA1(''); setCheckinA2(''); setCheckinA3('');
      setReplyPromptId(null);
      setReplyPromptQuestion(null);
      fetchMessages(); // refresh manually as fallback to ws
    } catch (e: any) {
      console.log("Error sending:", e);
      Alert.alert('Upload Failed', e?.response?.data?.detail || String(e));
    } finally {
      if (composeType === 'photo') {
        setIsSendingPhoto(false);
      }
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <AlignedNav></AlignedNav>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}
      >
        <View style={styles.inner}>
          <AppText variant="display" size={36} style={{ lineHeight: 38, marginBottom: 4 }}>
            Thread<AppText size={36} color={Colors.accent}>.</AppText>
          </AppText>
          <AppText variant="serifItalic" size={15} color={Colors.muted} style={{ lineHeight: 22, marginBottom: 16 }}>
            A shared record — letters, voices, photos.
          </AppText>

          {/* Compose Grid */}
          <View style={styles.composeGrid}>
            {COMPOSE_TYPES.map((c) => (
              <Pressable
                key={c.k}
                style={({ pressed }) => [
                  styles.composeCard,
                  pressed && { opacity: 0.85, backgroundColor: Colors.cream }
                ]}
                onPress={() => {
                  if (!isAligned) {
                    Alert.alert('Partner Required', 'Please connect with your partner first to post in Thread.');
                    return;
                  }
                  setComposeType(c.k as any);
                  setSheet(true);
                  setTextVal('');
                  discardPreview(); // reset voice UI
                }}
              >
                <AppText style={{ marginBottom: 4, fontSize: 20 }} color={Colors.accent}>
                  {c.mark}
                </AppText>
                <AppText
                  variant="heading"
                  size={12}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                  style={{ textAlign: 'center', width: '100%' }}
                >
                  {c.l}
                </AppText>
              </Pressable>
            ))}
          </View>

          {/* Filter Chips */}
          <View style={{ marginTop: 4, marginBottom: 20 }}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingRight: 20 }}
            >
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {TYPES.map((t) => {
                  const label = t === 'partner' ? partnerName : t.charAt(0).toUpperCase() + t.slice(1);
                  const isActive = filter === t;
                  return (
                    <Pressable
                      key={t}
                      onPress={() => setFilter(t)}
                      style={({ pressed }) => [
                        {
                          paddingHorizontal: 16,
                          paddingVertical: 8,
                          backgroundColor: isActive ? Colors.ink : '#EFEAE1',
                          borderRadius: 20,
                          borderWidth: 1,
                          borderColor: isActive ? Colors.ink : Colors.rule,
                          flexDirection: 'row',
                          alignItems: 'center',
                        },
                        pressed && { opacity: 0.8 }
                      ]}
                    >
                      {isActive && (
                        <View
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: 3,
                            backgroundColor: Colors.accent,
                            marginRight: 6,
                          }}
                        />
                      )}
                      <AppText
                        variant="smallCaps"
                        style={{
                          color: isActive ? '#FFFFFF' : Colors.ink,
                          fontSize: 12,
                          letterSpacing: 0.8,
                        }}
                      >
                        {label}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
          </View>

          {/* Entries */}
          {filtered.map((entry) => (
            <ThreadEntryCard
              key={entry.id || entry._id || Math.random()}
              entry={entry}
              currentUserId={currentUserId}
              userPhoto={userPhoto}
              partnerPhoto={partnerPhoto}
              onDelete={fetchMessages}
              onReplyPrompt={(id, question) => {
                setReplyPromptId(id);
                setReplyPromptQuestion(question);
                setComposeType('replyPrompt');
                setTextVal('');
                setSheet(true);
              }}
            />
          ))}
          <View style={{ height: Math.max(insets.bottom, 16) + 80 }} />
        </View>
      </ScrollView>

      {/* ==================== COMPOSE BOTTOM SHEETS ==================== */}
      <BottomSheet
        open={sheet}
        onClose={() => setSheet(false)}
        kicker={`NEW ${composeType.toUpperCase()}`}
        title={
          composeType === 'letter' ? "Write a letter" :
            composeType === 'voice' ? "Record your voice" :
              composeType === 'photo' ? "Share a moment" :
                composeType === 'prompt' ? "Send a question" :
                  composeType === 'replyPrompt' ? "Reply to Prompt" :
                    composeType === 'appreciation' ? "A love note" : "Check in"
        }
      >
        {/* OTHER COMPOSE TYPES */}
        {composeType === 'letter' && (
          <View>
            <AppText variant="serifItalic" size={15} color={Colors.muted} style={{ marginBottom: 12 }}>
              My Love,
            </AppText>
            <AppTextInput
              multiline
              placeholder="Write your letter here..."
              style={{ minHeight: 180 }}
              value={textVal}
              onChangeText={setTextVal}
            />
            <AppButton full variant="solid" size="lg" onPress={handleSend}>
              Send Letter →
            </AppButton>
          </View>
        )}

        {composeType === 'voice' && (
          <View style={{ paddingVertical: 20 }}>
            {previewUri ? (
              <View style={styles.previewContainer}>
                <AppText variant="heading" size={20} style={{ marginBottom: 24, textAlign: 'center' }}>
                  Review Voice Note
                </AppText>

                <View style={styles.previewPlayer}>
                  <Pressable style={styles.previewPlayBtn} onPress={togglePreviewPlayback}>
                    <Ionicons name={isPreviewPlaying ? "pause" : "play"} size={16} color="black" style={{ marginLeft: isPreviewPlaying ? 0 : 2 }} />
                  </Pressable>
                  <View style={{ flex: 1, marginLeft: 16 }}>
                    {/* Fake Scrubber for Preview */}
                    <View style={styles.scrubberBg}>
                      <View style={[styles.scrubberFill, { width: `${previewProgress * 100}%` }]} />
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                      <AppText variant="mono" style={{ fontSize: 10, color: Colors.muted }}>{previewPosition}</AppText>
                      <AppText variant="mono" style={{ fontSize: 10, color: Colors.muted }}>{previewDuration}</AppText>
                    </View>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 40 }}>
                  <Pressable style={styles.discardBtn} onPress={discardPreview}>
                    <Ionicons name="trash-outline" size={20} color={Colors.accent} />
                  </Pressable>
                  <AppButton style={{ flex: 1, marginLeft: 16 }} variant="solid" size="lg" onPress={sendVoiceMessage} loading={isSendingVoice}>
                    SEND VOICE →
                  </AppButton>
                </View>
              </View>
            ) : (
              <View style={{ alignItems: 'center' }}>
                <Pressable
                  onPressIn={startRecording}
                  onPressOut={stopRecording}
                  style={({ pressed }) => [
                    styles.circleBtn,
                    (isRecording || pressed) && { borderColor: Colors.accent, borderWidth: 3 }
                  ]}
                >
                  <View style={[
                    styles.circleInner,
                    isRecording && { backgroundColor: Colors.accent, transform: [{ scale: 0.85 }] }
                  ]} />
                </Pressable>

                <View style={{ alignItems: 'center', marginTop: 20, marginBottom: 30 }}>
                  <AppText variant="heading" size={18} color={isRecording ? Colors.accent : Colors.ink}>
                    {isRecording ? `● Recording... ${formattedRecordTime}` : "Hold to Record"}
                  </AppText>
                  {isRecording && (
                    <AppText variant="body" size={13} color={Colors.muted} style={{ marginTop: 4 }}>
                      Release button when finished
                    </AppText>
                  )}
                </View>

                <AppText variant="smallCaps" color={Colors.muted} style={{ marginBottom: 16 }}>OR</AppText>

                <AppButton
                  full
                  variant={isRecording ? "solid" : "outline"}
                  size="lg"
                  style={isRecording ? { backgroundColor: Colors.accent, borderColor: Colors.accent } : { borderColor: Colors.ink }}
                  textStyle={isRecording ? { color: '#FFF' } : { color: Colors.ink }}
                  onPress={toggleTapRecording}
                >
                  {isRecording ? `STOP & REVIEW RECORDING (${formattedRecordTime})` : "START RECORDING"}
                </AppButton>
              </View>
            )}
          </View>
        )}

        {composeType === 'photo' && (
          <View>
            <Pressable style={styles.photoPlaceholder} onPress={pickImage}>
              {photoUri ? (
                <Image source={{ uri: photoUri }} style={{ width: '100%', height: '100%', borderRadius: 4 }} />
              ) : (
                <AppText color={Colors.muted}>+ Select a Photo</AppText>
              )}
            </Pressable>
            <AppTextInput
              label="Caption"
              n="01"
              placeholder="First light on the Pont..."
              value={textVal}
              onChangeText={setTextVal}
            />
            <AppButton full variant="solid" size="lg" onPress={handleSend} disabled={!photoUri || isSendingPhoto} loading={isSendingPhoto}>
              {isSendingPhoto ? "SENDING..." : "Share →"}
            </AppButton>
          </View>
        )}

        {composeType === 'prompt' && (
          <View>
            <AppText variant="serifItalic" size={15} color={Colors.muted} style={{ marginBottom: 20, lineHeight: 22 }}>
              A question to deepen the conversation. They'll see it, answer privately, then both reveal in Thread.
            </AppText>

            <View style={{ flexDirection: 'row', marginBottom: 16 }}>
              {['ROMANTIC', 'DESIRE'].map((tab) => (
                <Pressable
                  key={tab}
                  style={[styles.promptTab, promptTab === tab.toLowerCase() && styles.promptTabActive]}
                  onPress={() => setPromptTab(tab.toLowerCase() as any)}
                >
                  <AppText style={{ color: promptTab === tab.toLowerCase() ? '#fff' : Colors.ink }}>
                    {tab}
                  </AppText>
                </Pressable>
              ))}
            </View>

            <AppTextInput
              multiline
              placeholder="Write or pick a question..."
              style={{ minHeight: 100 }}
              value={textVal}
              onChangeText={setTextVal}
            />
            <AppButton full variant="solid" size="lg" onPress={handleSend}>
              Send to Partner →
            </AppButton>
          </View>
        )}

        {composeType === 'replyPrompt' && (
          <View>
            <AppText variant="serifItalic" size={18} color={Colors.ink} style={{ marginBottom: 20, lineHeight: 26, textAlign: 'center' }}>
              "{replyPromptQuestion}"
            </AppText>
            <AppTextInput
              multiline
              placeholder="Your answer..."
              style={{ minHeight: 120 }}
              value={textVal}
              onChangeText={setTextVal}
            />
            <AppButton full variant="solid" size="lg" onPress={handleSend}>
              Submit Reply →
            </AppButton>
          </View>
        )}

        {composeType === 'appreciation' && (
          <View>
            <AppText variant="serifItalic" size={15} color={Colors.muted} style={{ marginBottom: 18, lineHeight: 22 }}>
              One thing you noticed about them this week. Small is fine — true is better.
            </AppText>
            <AppTextInput
              multiline
              placeholder="One thing I love about you is..."
              style={{ minHeight: 140 }}
              value={textVal}
              onChangeText={setTextVal}
            />
            <AppButton full variant="solid" size="lg" onPress={handleSend}>
              Send →
            </AppButton>
          </View>
        )}
      </BottomSheet>

      <SharedCheckinSheet
        open={sheet && composeType === 'checkin'}
        onClose={() => setSheet(false)}
        onSuccess={() => fetchMessages()}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bone },
  inner: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24 },

  composeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 8,
    rowGap: 10,
  },
  composeCard: {
    width: '31%',
    aspectRatio: 1.1,
    backgroundColor: Colors.bone,
    borderWidth: 1,
    borderColor: Colors.rule,
    borderRadius: 14,
    paddingHorizontal: 4,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },

  photoPlaceholder: {
    height: 160,
    backgroundColor: '#EAE2D4',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.rule,
    marginBottom: 16,
  },

  promptTab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#F5F0E8',
    borderRadius: 12,
    marginRight: 8,
  },
  promptTabActive: {
    backgroundColor: '#1C1C1E',
  },

  // Voice UI
  circleBtn: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    borderColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleInner: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.accent,
  },
  previewContainer: {
    width: '100%',
    paddingHorizontal: 10,
  },
  previewPlayer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.rule,
  },
  previewPlayBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrubberBg: {
    height: 6,
    backgroundColor: Colors.bone,
    borderRadius: 3,
    overflow: 'hidden',
  },
  scrubberFill: {
    height: '100%',
    backgroundColor: Colors.accent,
  },
  discardBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#F7F5F0',
    borderWidth: 1,
    borderColor: Colors.rule,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

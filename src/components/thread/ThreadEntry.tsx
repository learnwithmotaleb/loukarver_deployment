import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Pressable, Alert, Image } from 'react-native';
import { Colors } from '../../constants/colors';
import { AppText } from '../ui/AppText';
import { ThreadEntry as TEntry } from '../../types';
import { Config } from '../../constants/config';
import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { deleteMessage } from '../../services/threadApi';
import { BottomSheet } from '../ui/BottomSheet';
import { AppButton } from '../ui/AppButton';
import ImageViewing from './ImageViewerWrapper';
import { File, Paths } from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';

interface ThreadEntryProps {
  entry: TEntry | any; // allow backend payload
  onDelete?: () => void;
  onReplyPrompt?: (id: string, question: string) => void;
  currentUserId?: string | null;
  userPhoto?: string | null;
  partnerPhoto?: string | null;
}

const LABEL: Record<string, string> = {
  letter: 'Letter', 
  voice: 'Voice', 
  photo: 'Photograph',
  prompt: 'Prompt', 
  appreciation: 'Appreciation', 
  checkin: 'Check-in',
};

/**
 * Isolated VoicePlayer component — native audio player is only created
 * when this component mounts (i.e. only for voice entries).
 */
const VoicePlayer: React.FC<{ url: string }> = ({ url }) => {
  const player = useAudioPlayer(url);
  const status = useAudioPlayerStatus(player);
  const isPlaying = player.playing;

  const durationMs = status.duration || 0;
  const positionMs = status.currentTime || 0;
  const durSecs = Math.floor(durationMs / 1000);
  const posSecs = Math.floor(positionMs / 1000);

  const duration = `${Math.floor(durSecs/60).toString().padStart(2,'0')}:${(durSecs%60).toString().padStart(2,'0')}`;
  const position = `${Math.floor(posSecs/60).toString().padStart(2,'0')}:${(posSecs%60).toString().padStart(2,'0')}`;
  const progress = durationMs ? (positionMs / durationMs) : 0;

  const togglePlayback = () => {
    try {
      if (isPlaying) {
        player.pause();
      } else {
        if (progress >= 0.99) {
          player.seekTo(0);
        }
        player.play();
      }
    } catch (err) {
      console.error('Playback error:', err);
    }
  };

  const handleSeek = (e: any) => {
    try {
      const { locationX } = e.nativeEvent;
      const SCRUBBER_WIDTH = 220;
      let percentage = locationX / SCRUBBER_WIDTH;
      if (percentage < 0) percentage = 0;
      if (percentage > 1) percentage = 1;

      if (durationMs) {
        player.seekTo(percentage * durationMs);
      }
    } catch (err) {
      console.log('Error seeking', err);
    }
  };

  return (
    <View style={styles.voicePlayer}>
      <Pressable style={styles.playButton} onPress={togglePlayback}>
        <Ionicons name={isPlaying ? "pause" : "play"} size={15} color="#fff" style={{ marginLeft: isPlaying ? 0 : 2 }} />
      </Pressable>

      <View style={{ marginLeft: 12, flex: 1 }}>
        <Pressable onPress={handleSeek}>
          <View style={styles.scrubberBg}>
            <View style={[styles.scrubberFill, { width: `${progress * 100}%` }]} />
          </View>
        </Pressable>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
          <AppText variant="mono" style={{ color: Colors.muted, fontSize: 10 }}>
            {position}
          </AppText>
          <AppText variant="mono" style={{ color: Colors.muted, fontSize: 10 }}>
            {duration}
          </AppText>
        </View>
      </View>
    </View>
  );
};

export const ThreadEntryCard: React.FC<ThreadEntryProps> = ({ entry: t, onDelete, onReplyPrompt, currentUserId, userPhoto, partnerPhoto }) => {
  const typeStr = (t.type || t.category || '').toLowerCase();
  
  let dateStr = t.date;
  let timeStr = t.time;
  if (t.created_at) {
    const d = new Date(t.created_at);
    dateStr = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
    timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  const senderId = t.sender_id || t.creator_id || t.from;
  const isMine = currentUserId ? senderId === currentUserId : true; // assume mine while loading to prevent flash
  
  const senderName = t.sender_name || (t.from && (Config.DEMO_USERS as any)[t.from]?.name) || 'Unknown';
  const textContent = t.text || t.content?.text || '';

  const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8000';
  const fileUrl = t.content?.file_url;
  const fullUrl = fileUrl ? (fileUrl.startsWith('http') ? fileUrl : `${backendUrl}${fileUrl}`) : null;

  const [isImageViewVisible, setIsImageViewVisible] = useState(false);

  const handleDownload = async () => {
    if (!fullUrl) return;
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync(true);
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please allow photo access to download images.');
        return;
      }
      const filename = fullUrl.split('/').pop() || `photo_${Date.now()}.jpg`;
      const file = new File(Paths.document, filename);
      const downloadedFile = await File.downloadFileAsync(fullUrl, file);
      await MediaLibrary.saveToLibraryAsync(downloadedFile.uri);
      Alert.alert('Success', 'Photo saved to your device!');
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to save photo.');
    }
  };

  const [deleteSheetOpen, setDeleteSheetOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeletePress = () => {
    setDeleteSheetOpen(true);
  };

  const executeDelete = async (mode: 'me' | 'everyone') => {
    const messageId = t.id || t._id;
    if (!messageId) return;
    setIsDeleting(true);
    try {
      await deleteMessage(messageId, mode);
      setDeleteSheetOpen(false);
      if (onDelete) onDelete();
    } catch (e: any) {
      console.error('Failed to delete message', e);
      Alert.alert('Delete Failed', e.response?.data?.detail || String(e));
    } finally {
      setIsDeleting(false);
    }
  };
  // -----------------------------

  const getPhotoUrl = (url: string | null | undefined) => {
    if (!url) return null;
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    const cleanPath = url.replace(/\\/g, '/').replace(/^\//, '');
    const baseUrl = backendUrl.replace(/\/$/, '');
    return `${baseUrl}/${cleanPath}`;
  };

  const fallbackPhoto = isMine ? userPhoto : partnerPhoto;
  const senderPhoto = t.sender_photo || t.sender_avatar || t.avatar || fallbackPhoto;
  const senderPhotoUri = getPhotoUrl(senderPhoto);

  const CARD_MARKS: Record<string, string> = {
    letter: '❦',
    voice: '◉',
    photo: '◇',
    prompt: '◈',
    appreciation: '❦',
    checkin: '◈',
  };

  return (
    <View style={styles.cardContainer}>
      {/* UNIFIED TOP HEADER */}
      <View style={styles.cardHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
          <View style={styles.avatarCircle}>
            {senderPhotoUri ? (
              <Image source={{ uri: senderPhotoUri }} style={styles.avatarImg} />
            ) : (
              <AppText variant="heading" style={{ fontSize: 13, color: Colors.ink }}>
                {senderName.charAt(0).toUpperCase()}
              </AppText>
            )}
          </View>

          <View style={{ marginLeft: 10 }}>
            <AppText variant="heading" size={14} color={Colors.ink}>
              {senderName}
            </AppText>
            <AppText variant="mono" style={{ fontSize: 10, color: Colors.muted }}>
              {dateStr} · {timeStr}
            </AppText>
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={styles.categoryPill}>
            <AppText variant="smallCaps" style={{ fontSize: 10, color: Colors.accent }}>
              {CARD_MARKS[typeStr] || '◈'} {LABEL[typeStr]?.toUpperCase() || typeStr.toUpperCase()}
            </AppText>
          </View>

          <Pressable onPress={handleDeletePress} hitSlop={10}>
            <Ionicons name="trash-outline" size={16} color={Colors.muted} />
          </Pressable>
        </View>
      </View>

      {/* CARD BODY CONTENT */}
      {/* LETTER */}
      {typeStr === 'letter' && (
        <View style={styles.contentBox}>
          <AppText variant="serifItalic" size={16} color={Colors.ink} style={{ lineHeight: 25 }}>
            "{textContent}"
          </AppText>
        </View>
      )}

      {/* VOICE */}
      {typeStr === 'voice' && fullUrl && (
        <View style={styles.contentBox}>
          <VoicePlayer url={fullUrl} />
        </View>
      )}

      {/* PHOTO */}
      {typeStr === 'photo' && (
        <View style={styles.contentBox}>
          {fullUrl && (
            <Pressable onPress={() => setIsImageViewVisible(true)} style={styles.photoPreview}>
              <Image source={{ uri: fullUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
            </Pressable>
          )}
          {(t.content?.caption || textContent) ? (
            <AppText variant="serifItalic" size={15} color={Colors.ink} style={{ marginTop: 8 }}>
              {t.content?.caption || textContent}
            </AppText>
          ) : null}
        </View>
      )}

      {/* APPRECIATION */}
      {typeStr === 'appreciation' && (
        <View style={[styles.contentBox, { borderLeftWidth: 3, borderLeftColor: Colors.accent, paddingLeft: 12 }]}>
          <AppText variant="serifItalic" size={16} color={Colors.ink} style={{ lineHeight: 25 }}>
            "{textContent}"
          </AppText>
        </View>
      )}

      {/* CHECK-IN */}
      {typeStr === 'checkin' && (
        <View style={styles.contentBox}>
          {t.content?.answer_1 ? (
            <View style={{ gap: 10 }}>
              <View>
                <AppText variant="smallCaps" color={Colors.muted} style={{ fontSize: 10, marginBottom: 2 }}>How are you feeling?</AppText>
                <AppText variant="serifItalic" size={15} color={Colors.ink}>{t.content.answer_1}</AppText>
              </View>
              {t.content.answer_2 && (
                <View>
                  <AppText variant="smallCaps" color={Colors.muted} style={{ fontSize: 10, marginBottom: 2 }}>What do you need most</AppText>
                  <AppText variant="serifItalic" size={15} color={Colors.ink}>{t.content.answer_2}</AppText>
                </View>
              )}
              {t.content.answer_3 && (
                <View>
                  <AppText variant="smallCaps" color={Colors.muted} style={{ fontSize: 10, marginBottom: 2 }}>One thing on your mind</AppText>
                  <AppText variant="serifItalic" size={15} color={Colors.ink}>{t.content.answer_3}</AppText>
                </View>
              )}
            </View>
          ) : textContent ? (
            <AppText variant="serifItalic" size={15} color={Colors.ink}>
              {textContent}
            </AppText>
          ) : null}
        </View>
      )}

      {/* PROMPT */}
      {typeStr === 'prompt' && (
        <View style={styles.contentBox}>
          <AppText variant="heading" size={16} color={Colors.ink} style={{ marginBottom: 6 }}>
            {t.content?.question || textContent || 'Question...'}
          </AppText>
          {t.content?.answer ? (
            <View style={{ borderTopWidth: 1, borderTopColor: Colors.rule, paddingTop: 8, marginTop: 4 }}>
              <AppText variant="serifItalic" size={15} color={Colors.ink}>
                "{t.content.answer}"
              </AppText>
            </View>
          ) : (
            <View style={{ marginTop: 8 }}>
              {!isMine && onReplyPrompt ? (
                <Pressable onPress={() => onReplyPrompt(t.id || t._id, t.content?.question || textContent)} style={styles.replyButton}>
                  <AppText variant="smallCaps" style={{ color: Colors.cream, fontSize: 11 }}>TAP TO REPLY →</AppText>
                </Pressable>
              ) : (
                <AppText variant="serifItalic" size={14} color={Colors.muted}>
                  Waiting for partner's answer...
                </AppText>
              )}
            </View>
          )}
        </View>
      )}

      {fullUrl && (
        <ImageViewing
          images={[{ uri: fullUrl }]}
          imageIndex={0}
          visible={isImageViewVisible}
          onRequestClose={() => setIsImageViewVisible(false)}
          HeaderComponent={() => (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 20, paddingTop: 60 }}>
              <Pressable onPress={() => setIsImageViewVisible(false)} hitSlop={20}>
                <Ionicons name="close" size={28} color="#fff" />
              </Pressable>
              <Pressable onPress={handleDownload} hitSlop={20}>
                <Ionicons name="download-outline" size={26} color="#fff" />
              </Pressable>
            </View>
          )}
        />
      )}

      <BottomSheet
        open={deleteSheetOpen}
        onClose={() => setDeleteSheetOpen(false)}
        kicker="DELETE MESSAGE"
        title={isMine ? "Delete Options" : "Remove from Your Thread"}
      >
        <View style={{ paddingVertical: 12 }}>
          <AppText variant="serifItalic" size={15} color={Colors.muted} style={{ marginBottom: 24, textAlign: 'center', lineHeight: 22 }}>
            {isMine
              ? "Choose whether to hide this message only from your view, or permanently delete it for both you and your partner."
              : "This will remove the message from your thread view. Your partner will still be able to view it."}
          </AppText>

          <View style={{ gap: 12 }}>
            <AppButton
              full
              variant="outline"
              size="lg"
              loading={isDeleting}
              onPress={() => executeDelete('me')}
            >
              DELETE FOR ME
            </AppButton>

            {isMine && (
              <AppButton
                full
                variant="solid"
                size="lg"
                loading={isDeleting}
                style={{ backgroundColor: '#D9534F', borderColor: '#D9534F' }}
                textStyle={{ color: '#FFFFFF' }}
                onPress={() => executeDelete('everyone')}
              >
                DELETE FOR EVERYONE
              </AppButton>
            )}

            <Pressable
              style={{ paddingVertical: 14, alignItems: 'center', marginTop: 4 }}
              onPress={() => setDeleteSheetOpen(false)}
            >
              <AppText variant="smallCaps" color={Colors.muted} style={{ fontSize: 13, letterSpacing: 1 }}>
                CANCEL
              </AppText>
            </Pressable>
          </View>
        </View>
      </BottomSheet>
    </View>
  );
};

const styles = StyleSheet.create({
  cardContainer: {
    backgroundColor: '#FAF7F2',
    borderWidth: 1,
    borderColor: Colors.rule,
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  avatarCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#EAE2D4',
    borderWidth: 1,
    borderColor: Colors.rule,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: {
    width: '100%',
    height: '100%',
  },
  categoryPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#EFEAE1',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.rule,
  },
  contentBox: {
    paddingTop: 2,
  },
  photoPreview: {
    height: 180,
    backgroundColor: Colors.cream,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.rule,
  },
  voicePlayer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.rule,
  },
  playButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
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
  replyButton: {
    backgroundColor: Colors.accent,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 16,
    alignSelf: 'flex-start',
  }
});

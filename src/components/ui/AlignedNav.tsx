import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, StyleSheet, Pressable, Image, PanResponder, DeviceEventEmitter, Alert } from 'react-native';
import { Colors } from '../../constants/colors';
import { AppText } from '../../components/ui/AppText';
import { Ionicons } from '@expo/vector-icons';
import { getMe } from '../../services/authApi';
import { getMyNotifications } from '../../services/notificationApi';
import api from '../../services/api';
import { useNavigation } from '@react-navigation/native';
import { useModeSwitcher } from '../../hooks/useModeSwitcher';
import { AlignedNotificationSheet } from './AlignedNotificationSheet';

const API_BASE = process.env.EXPO_PUBLIC_BACKEND_URL;

const AlignedNav: React.FC = () => {
  const [user, setUser] = useState<any>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isNotificationSheetOpen, setIsNotificationSheetOpen] = useState(false);
  const [photoKey, setPhotoKey] = useState(Date.now());
  const navigation = useNavigation<any>();
  const { switchToVibeCheck } = useModeSwitcher();

  const panResponder = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dy) > 10 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
      },
      onPanResponderRelease: (_, gestureState) => {
        if (Math.abs(gestureState.dy) > 30) {
          if (user?.is_aligned || user?.partner) {
            Alert.alert(
              'Vibe Check Locked',
              'You are currently in an aligned relationship. You cannot access Vibe Check unless you break your aligned connection in Profile settings.'
            );
            return;
          }
          if (gestureState.dy > 30) {
            switchToVibeCheck('down');
          } else if (gestureState.dy < -30) {
            switchToVibeCheck('up');
          }
        }
      },
    })
  ).current;

  const getImageUrl = (url: string | null | undefined, bustKey: number) => {
    if (!url) return null;
    let cleanUrl = url;
    if (!url.startsWith('http')) {
      const baseUrl = api.defaults.baseURL?.replace('/api/v1', '') || API_BASE || '';
      cleanUrl = `${baseUrl}/${url.replace(/^\//, '')}`;
    }
    const separator = cleanUrl.includes('?') ? '&' : '?';
    return `${cleanUrl}${separator}t=${bustKey}`;
  };

  const fetchTimeout = useRef<any>(null);

  const fetchUserData = useCallback(async () => {
    try {
      const [me, notifs] = await Promise.all([
        getMe().catch(() => null),
        getMyNotifications(1, 1).catch(() => null),
      ]);
      if (me) {
        setUser(me);
        setPhotoKey(Date.now());
      }
      if (notifs && typeof notifs.unread_count === 'number') {
        setUnreadCount(notifs.unread_count);
      }
    } catch (err) {
      console.log("Error fetching user for AlignedNav:", err);
    }
  }, []);

  const debouncedFetchUserData = useCallback(() => {
    if (fetchTimeout.current) clearTimeout(fetchTimeout.current);
    fetchTimeout.current = setTimeout(() => {
      fetchUserData();
    }, 300);
  }, [fetchUserData]);

  useEffect(() => {
    fetchUserData();
    const sub1 = DeviceEventEmitter.addListener('REFRESH_ALIGNED_DATA', debouncedFetchUserData);
    const sub2 = DeviceEventEmitter.addListener('UNREAD_NOTIFICATIONS_CHANGED', (explicitCount?: number) => {
      if (typeof explicitCount === 'number') {
        setUnreadCount(explicitCount);
      } else {
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
      debouncedFetchUserData();
    });
    return () => {
      if (fetchTimeout.current) clearTimeout(fetchTimeout.current);
      sub1.remove();
      sub2.remove();
    };
  }, [debouncedFetchUserData, fetchUserData]);

  const myInitial = user?.name ? user.name[0].toUpperCase() : 'U';
  const profilePictureUrl = getImageUrl(user?.profile_photo_url, photoKey);

  return (
    <View style={styles.topBar}>
      <AppText variant="display" style={{ fontSize: 25 }}>
        aligned.
      </AppText>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        {/* Notification Bell with unread badge */}
        <Pressable
          onPress={() => {
            setIsNotificationSheetOpen(true);
          }}
          hitSlop={10}
          style={styles.bellButton}
          accessibilityLabel="Notifications"
        >
          <Ionicons name="notifications-outline" size={21} color={Colors.ink} />
          {unreadCount > 0 && (
            <View style={styles.unreadBadge}>
              <AppText variant="mono" style={styles.unreadText}>
                {unreadCount > 9 ? '9+' : unreadCount}
              </AppText>
            </View>
          )}
        </Pressable>

        <View {...panResponder.panHandlers}>
          <Pressable 
            onPress={() => navigation.navigate('AlignedProfile')} 
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
          >
            {user?.name && (
              <AppText variant="serifItalic" size={16} color={Colors.ink}>
                {user.name}
              </AppText>
            )}
            {profilePictureUrl ? (
              <Image 
                source={{ uri: profilePictureUrl }} 
                style={styles.navAvatar}
              />
            ) : (
              <View style={styles.navAvatarPlaceholder}>
                <AppText style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>
                  {myInitial}
                </AppText>
              </View>
            )}
          </Pressable>
        </View>
      </View>

      <AlignedNotificationSheet
        open={isNotificationSheetOpen}
        onClose={() => setIsNotificationSheetOpen(false)}
        partnerName={user?.partner?.name}
      />
    </View>
  );
};

export default AlignedNav;

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 1,
    borderBottomWidth: 1,
    borderBottomColor: Colors.rule,
    backgroundColor: Colors.bone,
  },
  bellButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  unreadBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: Colors.bone,
  },
  unreadText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '700',
  },
  navAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: Colors.accent,
  },
  navAvatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
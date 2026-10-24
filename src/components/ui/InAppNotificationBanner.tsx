import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  Animated,
  PanResponder,
  DeviceEventEmitter,
  Platform,
  Vibration,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Colors } from '../../constants/colors';
import { AppText } from './AppText';
import { navigationRef } from '../../navigation/RootNavigator';
import { markNotificationSeen } from '../../services/notificationApi';
import { handleNotificationDeepLink } from '../../utils/notificationDeepLink';

export interface InAppNotificationPayload {
  id?: string;
  type?: string;
  title: string;
  message?: string;
  metadata?: any;
  durationMs?: number;
}

export const InAppNotificationBanner: React.FC = () => {
  const insets = useSafeAreaInsets();
  const [notification, setNotification] = useState<InAppNotificationPayload | null>(null);
  const translateY = useRef(new Animated.Value(-160)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const hideTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastNotifRef = useRef<{ key: string; time: number } | null>(null);

  const clearTimer = () => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  };

  const hideBanner = () => {
    clearTimer();
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -160,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setNotification(null);
    });
  };

  const showBanner = (payload: InAppNotificationPayload) => {
    // Deduplication check: prevent duplicate popups/buzzes within 2 seconds
    const notifKey = payload.id || `${payload.title}_${payload.message || ''}`;
    const now = Date.now();
    if (lastNotifRef.current && lastNotifRef.current.key === notifKey && now - lastNotifRef.current.time < 2000) {
      return;
    }
    lastNotifRef.current = { key: notifKey, time: now };

    clearTimer();
    setNotification(payload);

    try {
      if (Platform.OS !== 'web') {
        // Distinct double-buzz pattern ([0, 250, 150, 250]ms) for noticeable physical sensation
        Vibration.vibrate([0, 250, 150, 250]);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e) {
      console.log('Notification vibration error:', e);
    }

    translateY.setValue(-160);
    opacity.setValue(0);

    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        tension: 80,
        friction: 10,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();

    const duration = payload.durationMs || 4500;
    hideTimerRef.current = setTimeout(() => {
      hideBanner();
    }, duration);
  };

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(
      'SHOW_IN_APP_NOTIFICATION',
      (payload: InAppNotificationPayload) => {
        if (payload && payload.title) {
          showBanner(payload);
        }
      }
    );

    return () => {
      clearTimer();
      sub.remove();
    };
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return gestureState.dy < -8 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy < -15) {
          hideBanner();
        }
      },
    })
  ).current;

  const handlePress = () => {
    if (!notification) return;

    if (notification.id) {
      markNotificationSeen(notification.id).catch(() => {});
      DeviceEventEmitter.emit('UNREAD_NOTIFICATIONS_CHANGED');
    }

    if (navigationRef.isReady()) {
      try {
        handleNotificationDeepLink(notification, navigationRef);
      } catch (err) {
        console.log('Error navigating from notification banner:', err);
      }
    }

    hideBanner();
  };

  if (!notification) return null;

  const getIconName = (type?: string, metadata?: any): keyof typeof Ionicons.glyphMap => {
    if (metadata?.action === 'ping_late') return 'alarm-outline';
    if (!type) return 'notifications-outline';
    const lower = type.toLowerCase();
    if (lower.includes('date') || lower.includes('proposal')) return 'calendar-outline';
    if (lower.includes('late') || lower.includes('running late')) return 'alarm-outline';
    if (lower.includes('mood')) return 'heart-circle-outline';
    if (lower.includes('milestone')) return 'ribbon-outline';
    if (lower.includes('thread') || lower.includes('message')) return 'chatbubble-ellipses-outline';
    if (lower.includes('confidential') || lower.includes('secret')) return 'lock-closed-outline';
    if (lower.includes('map')) return 'location-outline';
    if (lower.includes('checkin') || lower.includes('ritual')) return 'checkmark-circle-outline';
    if (lower.includes('align')) return 'people-outline';
    if (lower.includes('thinking') || lower.includes('pulse')) return 'sparkles-outline';
    return 'notifications-outline';
  };

  const isDate =
    notification.type?.toLowerCase().includes('date') ||
    notification.title?.toLowerCase().includes('date') ||
    notification.metadata?.screen === 'Dates' ||
    notification.metadata?.action?.includes('date') ||
    notification.metadata?.action === 'ping_late' ||
    notification.metadata?.action === 'upcoming_reminder';

  const isMilestone =
    notification.type?.toLowerCase().includes('milestone') ||
    notification.title?.toLowerCase().includes('milestone') ||
    notification.metadata?.screen === 'Future' ||
    notification.metadata?.action?.includes('milestone');

  const kickerLabel = isDate ? 'DATE ALERT' : isMilestone ? 'MILESTONE ALERT' : 'PARTNER ACTIVITY';
  const topOffset = insets.top + (Platform.OS === 'ios' ? 6 : 10);

  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={[
        styles.container,
        {
          top: topOffset,
          opacity,
          transform: [{ translateY }],
        },
      ]}
    >
      <Pressable onPress={handlePress} style={styles.card}>
        {/* Top Header Row */}
        <View style={styles.headerRow}>
          <View style={styles.kickerGroup}>
            <View style={styles.accentDot} />
            <AppText variant="mono" size={10} color={Colors.accent} style={styles.kickerText}>
              {kickerLabel}
            </AppText>
            <AppText variant="mono" size={10} color={Colors.muted}>
              · Just now
            </AppText>
          </View>
          <Pressable onPress={hideBanner} hitSlop={10} style={styles.closeBtn}>
            <Ionicons name="close" size={16} color={Colors.muted} />
          </Pressable>
        </View>

        {/* Content Row */}
        <View style={styles.contentRow}>
          <View style={styles.iconCircle}>
            <Ionicons name={getIconName(notification.type, notification.metadata)} size={18} color={Colors.accent} />
          </View>

          <View style={styles.textColumn}>
            <AppText variant="serif" size={15} color={Colors.ink} numberOfLines={1} style={styles.title}>
              {notification.title}
            </AppText>
            {notification.message ? (
              <AppText variant="body" size={13} color={Colors.ink2} numberOfLines={2} style={styles.message}>
                {notification.message}
              </AppText>
            ) : null}
          </View>
        </View>

        {/* Footer Hint */}
        <View style={styles.footerRow}>
          <AppText variant="mono" size={9} color={Colors.muted}>
            Tap to open · Swipe up to dismiss
          </AppText>
          <Ionicons name="chevron-forward" size={11} color={Colors.muted} />
        </View>
      </Pressable>
    </Animated.View>
  );
};

(InAppNotificationBanner as any).show = (payload: InAppNotificationPayload) => {
  DeviceEventEmitter.emit('SHOW_IN_APP_NOTIFICATION', payload);
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 14,
    right: 14,
    zIndex: 99999,
    elevation: 10,
  },
  card: {
    backgroundColor: Colors.cream,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.rule,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 8,
    shadowColor: Colors.ink,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  kickerGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  accentDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.accent,
  },
  kickerText: {
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  closeBtn: {
    padding: 2,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.bone,
    borderWidth: 1,
    borderColor: Colors.rule,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textColumn: {
    flex: 1,
  },
  title: {
    fontWeight: '600',
    marginBottom: 2,
  },
  message: {
    lineHeight: 17,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    paddingTop: 5,
    borderTopWidth: 0.5,
    borderTopColor: Colors.rule,
  },
});

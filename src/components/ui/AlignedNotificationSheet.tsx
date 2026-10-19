import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, StyleSheet, Pressable, ScrollView, Alert, ActivityIndicator, DeviceEventEmitter } from 'react-native';
import { Colors } from '../../constants/colors';
import { AppText } from './AppText';
import { BottomSheet } from './BottomSheet';
import { Ionicons } from '@expo/vector-icons';
import { Swipeable } from 'react-native-gesture-handler';
import {
  getMyNotifications,
  markNotificationSeen,
  markAllNotificationsSeen,
  deleteNotification,
  hideNotification,
  unhideNotification,
  clearAllNotifications,
} from '../../services/notificationApi';
import { getPartnerProfile } from '../../services/userApi';
import { formatTime } from '../../utils/dateUtils';
import { useNavigation } from '@react-navigation/native';
import { handleNotificationDeepLink } from '../../utils/notificationDeepLink';

const VIBE_TYPES = ['Vibe Date', 'Red Flag', 'Green Flag', 'Yellow Flag', 'Vibe System'];

export interface AlignedNotificationSheetProps {
  open: boolean;
  onClose: () => void;
  partnerName?: string;
}

export const AlignedNotificationSheet: React.FC<AlignedNotificationSheetProps> = ({
  open,
  onClose,
  partnerName: initialPartnerName,
}) => {
  const navigation = useNavigation<any>();
  const rowRefs = useRef<{ [key: string]: any }>({});
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showHidden, setShowHidden] = useState(false);
  const [partnerName, setPartnerName] = useState<string>(initialPartnerName || '');
  const [loading, setLoading] = useState(false);

  const fetchNotificationsData = useCallback(async () => {
    try {
      const [notificationsRes, profileRes] = await Promise.all([
        getMyNotifications(1, 50).catch(() => ({ success: false, data: [] })),
        !initialPartnerName ? getPartnerProfile().catch(() => ({ success: false })) : Promise.resolve(null),
      ]);

      if (profileRes && profileRes.success && profileRes.data?.name) {
        setPartnerName(profileRes.data.name);
      } else if (initialPartnerName) {
        setPartnerName(initialPartnerName);
      }

      if (notificationsRes && notificationsRes.data) {
        const notifList = Array.isArray(notificationsRes.data)
          ? notificationsRes.data
          : notificationsRes.data.items || [];
        const filtered = notifList.filter((n: any) => !VIBE_TYPES.includes(n.type));
        setNotifications(filtered);
      }
    } catch (err) {
      console.log('Error fetching notifications for AlignedNotificationSheet:', err);
    } finally {
      setLoading(false);
    }
  }, [initialPartnerName]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetchNotificationsData();

    const sub1 = DeviceEventEmitter.addListener('REFRESH_ALIGNED_DATA', fetchNotificationsData);
    const sub2 = DeviceEventEmitter.addListener('UNREAD_NOTIFICATIONS_CHANGED', fetchNotificationsData);

    return () => {
      sub1.remove();
      sub2.remove();
    };
  }, [open, fetchNotificationsData]);

  const handleClearAll = () => {
    Alert.alert(
      'Clear All Notifications',
      'Are you sure you want to permanently delete all notifications? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            try {
              await clearAllNotifications();
              setNotifications([]);
              DeviceEventEmitter.emit('UNREAD_NOTIFICATIONS_CHANGED', 0);
              DeviceEventEmitter.emit('REFRESH_ALIGNED_DATA');
            } catch (e) {
              console.log('Error clearing notifications:', e);
            }
          },
        },
      ]
    );
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsSeen();
      setNotifications(prev => prev.map(n => ({ ...n, status: 'Seen' })));
      DeviceEventEmitter.emit('UNREAD_NOTIFICATIONS_CHANGED', 0);
      DeviceEventEmitter.emit('REFRESH_ALIGNED_DATA');
    } catch (e) {
      console.log('Error marking all seen:', e);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteNotification(id);
      setNotifications(prev => prev.filter(x => x.id !== id));
      DeviceEventEmitter.emit('UNREAD_NOTIFICATIONS_CHANGED');
      DeviceEventEmitter.emit('REFRESH_ALIGNED_DATA');
    } catch (e) {
      console.log('Error deleting notification:', e);
    }
    setTimeout(() => {
      if (rowRefs.current[id]) {
        rowRefs.current[id].close();
      }
    }, 150);
  };

  const handleToggleArchive = async (n: any) => {
    const isHidden = n.is_hidden;
    try {
      if (isHidden) {
        await unhideNotification(n.id);
        setNotifications(prev => prev.map(x => (x.id === n.id ? { ...x, is_hidden: false } : x)));
      } else {
        await hideNotification(n.id);
        setNotifications(prev => prev.map(x => (x.id === n.id ? { ...x, is_hidden: true } : x)));
      }
      DeviceEventEmitter.emit('REFRESH_ALIGNED_DATA');
    } catch (e) {
      console.log('Error toggling archive:', e);
    }
    setTimeout(() => {
      if (rowRefs.current[n.id]) {
        rowRefs.current[n.id].close();
      }
    }, 150);
  };

  const handleNotificationPress = async (n: any) => {
    const isUnread = n.status !== 'Seen';
    if (isUnread) {
      setNotifications(prev => {
        const next = [...prev];
        const idx = next.findIndex(x => x.id === n.id);
        if (idx > -1) next[idx] = { ...next[idx], status: 'Seen' };
        return next;
      });
      DeviceEventEmitter.emit('UNREAD_NOTIFICATIONS_CHANGED');
      DeviceEventEmitter.emit('REFRESH_ALIGNED_DATA');
      try {
        await markNotificationSeen(n.id);
      } catch (err) {
        console.log('Error marking notification seen:', err);
      }
    }
    handleNotificationDeepLink(n, navigation, onClose);
  };

  const renderLeftActions = () => (
    <View style={styles.swipeLeftAction}>
      <Ionicons name="trash-outline" size={20} color="#D9534F" />
      <AppText color="#D9534F" variant="mono" style={styles.swipeText}>
        DELETE
      </AppText>
    </View>
  );

  const renderRightActions = (isHidden: boolean) => (
    <View style={styles.swipeRightAction}>
      <Ionicons name={isHidden ? 'archive' : 'archive-outline'} size={20} color={Colors.accent} />
      <AppText color={Colors.accent} variant="mono" style={styles.swipeText}>
        {isHidden ? 'UNARCHIVE' : 'ARCHIVE'}
      </AppText>
    </View>
  );

  const visibleNotifications = notifications.filter(n => (showHidden ? n.is_hidden : !n.is_hidden));
  const hasUnread = notifications.some(n => n.status !== 'Seen');
  const sheetTitle = partnerName ? `${partnerName}'s Activity` : 'Notifications';

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={sheetTitle}
      kicker="NOTIFICATIONS"
      noScroll
    >
      <View style={styles.headerBar}>
        <Pressable onPress={handleClearAll} hitSlop={8}>
          <AppText color="#D9534F" size={14} style={{ fontWeight: '600' }}>
            Clear All
          </AppText>
        </Pressable>

        <View style={styles.headerRight}>
          {hasUnread && (
            <Pressable onPress={handleMarkAllRead} hitSlop={8}>
              <AppText color={Colors.accent} size={13} style={{ fontWeight: '600' }}>
                Mark all read
              </AppText>
            </Pressable>
          )}
          <Pressable onPress={() => setShowHidden(!showHidden)} hitSlop={8}>
            <AppText color={Colors.accent} size={14}>
              {showHidden ? 'Back to History' : 'Archived'}
            </AppText>
          </Pressable>
        </View>
      </View>

      {loading && notifications.length === 0 ? (
        <View style={{ paddingVertical: 40, alignItems: 'center' }}>
          <ActivityIndicator color={Colors.accent} size="small" />
        </View>
      ) : (
        <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
          {visibleNotifications.length === 0 ? (
            <AppText color={Colors.muted} style={styles.emptyText}>
              {showHidden ? 'No archived activity.' : 'No recent activity recorded.'}
            </AppText>
          ) : (
            visibleNotifications.map((n, idx) => {
              const isUnread = n.status !== 'Seen';
              const borderC = isUnread ? Colors.accent : Colors.rule;
              const bgC = isUnread ? '#ffffff' : 'transparent';
              const isHidden = !!n.is_hidden;

              let messageText = n.message || '';
              if (
                n.type === 'Presence' &&
                partnerName &&
                !messageText.toLowerCase().includes(partnerName.toLowerCase())
              ) {
                messageText = `${partnerName} is ${messageText}`;
              }

              return (
                <View key={n.id || idx} style={{ marginBottom: 14 }}>
                  <Swipeable
                    ref={ref => {
                      if (ref) rowRefs.current[n.id] = ref;
                    }}
                    renderLeftActions={renderLeftActions}
                    renderRightActions={() => renderRightActions(isHidden)}
                    overshootLeft={true}
                    overshootRight={true}
                    friction={1.5}
                    onSwipeableLeftOpen={() => handleDelete(n.id)}
                    onSwipeableRightOpen={() => handleToggleArchive(n)}
                  >
                    <Pressable
                      style={({ pressed }) => [
                        styles.card,
                        { backgroundColor: bgC, borderColor: borderC },
                        pressed && { opacity: 0.7 },
                      ]}
                      onPress={() => handleNotificationPress(n)}
                    >
                      <View style={styles.cardHeader}>
                        <View style={styles.cardTitleWrap}>
                          {isUnread && <View style={styles.unreadDot} />}
                          <AppText
                            variant="serifItalic"
                            size={16}
                            color={Colors.ink}
                            style={{ fontWeight: isUnread ? 'bold' : 'normal' }}
                          >
                            {messageText}
                          </AppText>
                        </View>
                        <AppText variant="mono" color={Colors.muted} style={styles.cardTime}>
                          {n.created_at ? formatTime(new Date(n.created_at)) : ''}
                        </AppText>
                      </View>

                      {n.created_at && (
                        <AppText
                          variant="smallCaps"
                          color={Colors.muted}
                          style={[styles.cardDate, { marginLeft: isUnread ? 12 : 0 }]}
                        >
                          {new Date(n.created_at).toLocaleDateString()}
                        </AppText>
                      )}
                    </Pressable>
                  </Swipeable>
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </BottomSheet>
  );
};

const styles = StyleSheet.create({
  headerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 12,
    paddingHorizontal: 20,
    marginTop: 10,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 28,
    marginBottom: 20,
  },
  card: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginHorizontal: 20,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  unreadDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.accent,
    marginRight: 6,
    marginTop: 2,
  },
  cardTime: {
    fontSize: 11,
    marginLeft: 8,
    paddingTop: 4,
  },
  cardDate: {
    marginTop: 4,
  },
  swipeLeftAction: {
    justifyContent: 'center',
    height: '100%',
    flex: 1,
    alignItems: 'flex-start',
    paddingLeft: 24,
  },
  swipeRightAction: {
    justifyContent: 'center',
    height: '100%',
    flex: 1,
    alignItems: 'flex-end',
    paddingRight: 24,
  },
  swipeText: {
    fontSize: 10,
    marginTop: 4,
    letterSpacing: 1,
  },
});

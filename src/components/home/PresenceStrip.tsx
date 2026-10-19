import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, StyleSheet, Pressable, ScrollView, Image, DeviceEventEmitter, Alert, Platform, useWindowDimensions } from 'react-native';
import { Colors } from '../../constants/colors';
import { AppText } from '../ui/AppText';
import { formatTime } from '../../utils/dateUtils';
import { getPartnerProfile, alignWithPartner, sendAlignmentRequest, getAlignmentRequestStatus, respondAlignmentRequest, cancelAlignmentRequest } from '../../services/userApi';
import { getMyNotifications } from '../../services/notificationApi';
import { getMe } from '../../services/authApi';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../../services/api';
import { BottomSheet } from '../ui/BottomSheet';
import { AlignedNotificationSheet } from '../ui/AlignedNotificationSheet';
import { AppTextInput } from '../ui/AppTextInput';
import { AppButton } from '../ui/AppButton';
import { showPartnerPicture } from '../ui/PartnerPictureViewer';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { Swipeable } from 'react-native-gesture-handler';
import { markNotificationSeen, markAllNotificationsSeen, markNotificationUnread, deleteNotification, hideNotification, unhideNotification, clearAllNotifications } from '../../services/notificationApi';
import QRCode from 'react-native-qrcode-svg';
import { useNavigation } from '@react-navigation/native';
import { handleNotificationDeepLink } from '../../utils/notificationDeepLink';

export interface PresenceStripProps {
  onRedirect?: (type: string, data?: any) => void;
  refreshTrigger?: number;
}

export const PresenceStrip: React.FC<PresenceStripProps> = ({ onRedirect, refreshTrigger = 0 }) => {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const qrSize = Math.min(Math.round(windowWidth * 0.48), Math.round(windowHeight * 0.22), 180);
  const rowRefs = React.useRef<{ [key: string]: any }>({});
  const [showHidden, setShowHidden] = useState(false);
  const [partner, setPartner] = useState<any>(null);
  const [me, setMe] = useState<any>(null);
  const [presenceNotifications, setPresenceNotifications] = useState<any[]>([]);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [inputKey, setInputKey] = useState("");
  const [isAligning, setIsAligning] = useState(false);
  const [isResponding, setIsResponding] = useState(false);
  const [requestStatus, setRequestStatus] = useState<{
    incoming: any | null;
    incoming_list: any[];
    outgoing: any | null;
  }>({ incoming: null, incoming_list: [], outgoing: null });
  const [qrSheet, setQrSheet] = useState(false);
  const [now, setNow] = useState<Date>(new Date());
  const nav = useNavigation<any>();

  const fetchPresenceData = async () => {
    try {
      const [profileRes, notificationsRes, meRes, reqStatusRes] = await Promise.all([
        getPartnerProfile().catch(() => ({ success: false })),
        getMyNotifications(1, 50).catch(() => ({ success: false })),
        getMe().catch(() => null),
        getAlignmentRequestStatus().catch(() => ({ success: false, data: { incoming: null, incoming_list: [], outgoing: null } }))
      ]);

      if (profileRes.success && profileRes.data) {
        setPartner(profileRes.data);
      } else {
        setPartner(null);
      }

      if (meRes) {
        setMe(meRes);
      }

      if (reqStatusRes?.data) {
        const incomingList = reqStatusRes.data.incoming_list || (reqStatusRes.data.incoming ? [reqStatusRes.data.incoming] : []);
        setRequestStatus({
          incoming: reqStatusRes.data.incoming || null,
          incoming_list: incomingList,
          outgoing: reqStatusRes.data.outgoing || null,
        });
      } else {
        setRequestStatus({ incoming: null, incoming_list: [], outgoing: null });
      }

      if (notificationsRes.success && notificationsRes.data) {
        const presenceOnly = notificationsRes.data.filter((n: any) => [
          'Partner Check-in', 'Ritual Completed', 'Proposal', 'Reunion', 'Mood Change',
          'Cycle Update', 'Browse Ideas', 'Thinking of You', 'Watch Together',
          'Confidential Message', 'Date Added', 'Milestone Step', 'Us Section Update',
          'Map Create', 'Map Delete', 'Thread Message', 'Milestone', 'Map Update', 'State Update',
          'Alignment Request', 'Alignment Connected!', 'Trip Reminder', 'Anniversary', 'System'
        ].includes(n.type));
        setPresenceNotifications(presenceOnly);
      }
    } catch (e) {
      console.log("Error fetching presence data", e);
    }
  };

  const fetchTimeout = useRef<any>(null);
  const debouncedFetchPresenceData = useCallback(() => {
    if (fetchTimeout.current) clearTimeout(fetchTimeout.current);
    fetchTimeout.current = setTimeout(() => {
      fetchPresenceData();
    }, 300);
  }, []);

  useEffect(() => {
    fetchPresenceData();

    const sub2 = DeviceEventEmitter.addListener('REFRESH_ALIGNED_DATA', debouncedFetchPresenceData);
    const sub3 = DeviceEventEmitter.addListener('ALIGNMENT_REQUEST_UPDATED', debouncedFetchPresenceData);
    const sub4 = DeviceEventEmitter.addListener('ALIGNMENT_BONDED', debouncedFetchPresenceData);
    const sub5 = DeviceEventEmitter.addListener('ALIGNMENT_BROKEN', debouncedFetchPresenceData);
    const sub6 = DeviceEventEmitter.addListener('QR_CODE_SCANNED', (data: string) => {
      if (data) {
        handleSendRequest(data);
      }
    });

    const sub7 = DeviceEventEmitter.addListener('PRESENCE_TRACKED', debouncedFetchPresenceData);

    const t = setInterval(() => {
      fetchPresenceData(); // Refresh every minute
    }, 60_000);

    const clockTimer = setInterval(() => {
      setNow(new Date());
    }, 30_000);

    return () => {
      if (fetchTimeout.current) clearTimeout(fetchTimeout.current);
      clearInterval(t);
      clearInterval(clockTimer);
      sub2.remove();
      sub3.remove();
      sub4.remove();
      sub5.remove();
      sub6.remove();
      sub7.remove();
    };
  }, [debouncedFetchPresenceData, refreshTrigger]);

  // Refresh notifications when presence history sheet opens, without auto-marking them as seen
  useEffect(() => {
    if (isSheetOpen) {
      fetchPresenceData();
    }
  }, [isSheetOpen]);

  const handleSendRequest = async (keyToSend?: string) => {
    const key = (keyToSend || inputKey).trim().toUpperCase();
    if (!key) return;
    setIsAligning(true);
    try {
      const res = await sendAlignmentRequest(key);
      setInputKey("");
      await fetchPresenceData();
      Alert.alert(
        "Request Sent",
        `Alignment request sent to ${res.data?.receiver_name || "your partner"}. Waiting for their approval!`
      );
    } catch (e: any) {
      console.log("Alignment request failed", e);
      const msg = e.response?.data?.detail || e.message || "Failed to send request. Check the key and try again.";
      Alert.alert("Notice", msg);
    } finally {
      setIsAligning(false);
    }
  };

  const handleRespond = async (requestId: string, accept: boolean) => {
    setIsResponding(true);
    try {
      const res = await respondAlignmentRequest(requestId, accept);
      if (accept) {
        Alert.alert("Aligned!", "You and your partner are now aligned!");
        DeviceEventEmitter.emit('REFRESH_ALIGNED_DATA');
      } else {
        Alert.alert("Declined", "Alignment request declined.");
      }
      await fetchPresenceData();
    } catch (e: any) {
      console.log("Failed to respond to alignment request", e);
      const msg = e.response?.data?.detail || e.message || "Failed to process response.";
      Alert.alert("Error", msg);
    } finally {
      setIsResponding(false);
    }
  };

  const handleCancelRequest = async (requestId: string) => {
    Alert.alert(
      "Cancel Request",
      "Are you sure you want to cancel this connection request?",
      [
        { text: "No", style: "cancel" },
        {
          text: "Yes, Cancel",
          style: "destructive",
          onPress: async () => {
            setIsAligning(true);
            try {
              await cancelAlignmentRequest(requestId);
              await fetchPresenceData();
            } catch (e: any) {
              console.log("Failed to cancel request", e);
              const msg = e.response?.data?.detail || e.message || "Could not cancel request.";
              Alert.alert("Error", msg);
            } finally {
              setIsAligning(false);
            }
          }
        }
      ]
    );
  };

  if (!partner) {
    return (
      <View style={styles.alignmentContainer}>
        {requestStatus.incoming_list && requestStatus.incoming_list.length > 0 ? (
          /* Incoming Request from Partner (Latest Only) */
          (() => {
            const latestReq = requestStatus.incoming_list[0];
            const totalCount = requestStatus.incoming_list.length;
            return (
              <View style={{ width: '100%' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <View style={styles.incomingBadge}>
                    <AppText variant="mono" style={{ fontSize: 9, color: Colors.accent, letterSpacing: 1 }}>
                      INCOMING ALIGNMENT REQUEST
                    </AppText>
                  </View>
                  {totalCount > 1 && (
                    <Pressable
                      onPress={() => nav.navigate('AlignmentRequests')}
                      style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 2, paddingHorizontal: 6 }}
                    >
                      <AppText variant="smallCaps" color={Colors.accent} style={{ fontSize: 11, fontWeight: '600' }}>
                        SEE ALL ({totalCount}) →
                      </AppText>
                    </Pressable>
                  )}
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginVertical: 10 }}>
                  {latestReq.sender_profile_photo ? (
                    <Image
                      source={{ uri: latestReq.sender_profile_photo }}
                      style={styles.requestAvatar}
                    />
                  ) : (
                    <View style={[styles.requestAvatar, { backgroundColor: Colors.cream, alignItems: 'center', justifyContent: 'center' }]}>
                      <AppText variant="display" size={20} color={Colors.accent}>
                        {latestReq.sender_name?.charAt(0)?.toUpperCase() || "P"}
                      </AppText>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <AppText variant="heading" size={19} color={Colors.ink}>
                      {latestReq.sender_name}
                    </AppText>
                    <AppText variant="serifItalic" size={13} color={Colors.muted} style={{ marginTop: 2 }}>
                      {latestReq.sender_city ? `${latestReq.sender_city} • ` : ""}wants to align with you
                    </AppText>
                  </View>
                </View>

                <AppText variant="serifItalic" size={13} color={Colors.ink2} style={{ lineHeight: 19, marginVertical: 8 }}>
                  Accepting will link your accounts, daily rituals, shared maps, and connection pulses.
                </AppText>

                <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                  <AppButton
                    variant="outline"
                    size="md"
                    style={{ flex: 1, borderColor: Colors.rule }}
                    textStyle={{ color: Colors.muted }}
                    onPress={() => handleRespond(latestReq.id, false)}
                    disabled={isResponding}
                  >
                    Decline
                  </AppButton>
                  <AppButton
                    variant="solid"
                    size="md"
                    style={{ flex: 1.6, backgroundColor: Colors.ink }}
                    onPress={() => handleRespond(latestReq.id, true)}
                    disabled={isResponding}
                  >
                    {isResponding ? "Connecting..." : "Approve & Align →"}
                  </AppButton>
                </View>
              </View>
            );
          })()
        ) : requestStatus.outgoing ? (
          /* Outgoing Request Waiting for Partner Approval */
          <View style={{ width: '100%' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <View style={[styles.incomingBadge, { backgroundColor: '#F1E4DA' }]}>
                <AppText variant="mono" style={{ fontSize: 9, color: Colors.accent, letterSpacing: 1 }}>
                  PENDING APPROVAL
                </AppText>
              </View>
            </View>

            <View style={{ marginVertical: 8 }}>
              <AppText variant="heading" size={18} color={Colors.ink}>
                Request Sent to {requestStatus.outgoing.receiver_name}
              </AppText>
              <AppText variant="serifItalic" size={13} color={Colors.muted} style={{ marginTop: 6, lineHeight: 20 }}>
                Waiting for your partner to approve your connection request. Your dashboard will auto-refresh the moment they accept.
              </AppText>
            </View>

            <View style={{ marginTop: 14 }}>
              <AppButton
                variant="outline"
                size="sm"
                style={{ borderColor: Colors.rule }}
                textStyle={{ color: '#FF3B30', fontSize: 11 }}
                onPress={() => handleCancelRequest(requestStatus.outgoing.id)}
                disabled={isAligning}
              >
                {isAligning ? "Cancelling..." : "Cancel Request"}
              </AppButton>
            </View>
          </View>
        ) : (
          /* Normal Key & Connect Input */
          <>
            <AppText variant="serifItalic" size={18} color={Colors.ink} style={{ marginBottom: 12 }}>
              Not aligned with a partner yet.
            </AppText>
            <AppText variant="smallCaps" color={Colors.muted} style={{ marginBottom: 4 }}>
              YOUR SECRET KEY
            </AppText>
            <View style={styles.secretKeyContainer}>
              <AppText variant="mono" color={Colors.ink} style={styles.secretKeyText} selectable>
                {me?.secret_key || "Loading..."}
              </AppText>
              <Pressable
                style={styles.copyButton}
                onPress={async () => {
                  if (me?.secret_key) {
                    await Clipboard.setStringAsync(me.secret_key);
                    Alert.alert("Copied", "Secret key copied to clipboard!");
                  }
                }}
              >
                <Ionicons name="copy-outline" size={18} color={Colors.ink} />
              </Pressable>
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              <AppButton variant="outline" size="sm" style={{ flex: 1, paddingHorizontal: 4 }} textStyle={{ fontSize: 9.5 }} onPress={() => setQrSheet(true)}>
                SHOW QR
              </AppButton>
            </View>

            <View style={{ width: '100%', marginTop: 24 }}>
              <AppTextInput
                label="PARTNER'S KEY"
                n="01"
                value={inputKey}
                onChangeText={setInputKey}
                placeholder="Enter their key to connect"
                autoCapitalize="characters"
              />
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
                <AppButton
                  variant="solid"
                  size="sm"
                  style={{ flex: 1, backgroundColor: Colors.accent }}
                  onPress={() => handleSendRequest()}
                  disabled={isAligning || !inputKey.trim()}
                >
                  {isAligning ? "SENDING..." : "CONNECT"}
                </AppButton>
                <AppButton variant="outline" size="sm" style={{ flex: 1 }} onPress={() => {
                  nav.navigate('AlignedQRScanner');
                }}>
                  SCAN QR
                </AppButton>
              </View>
            </View>
          </>
        )}

        <BottomSheet
          open={qrSheet}
          onClose={() => setQrSheet(false)}
          kicker="QR CODE"
          title="Your Aligned Key"
        >
          <View style={{ alignItems: 'center', paddingVertical: 10 }}>
            {me?.secret_key ? (
              <View style={{ padding: 12, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: Colors.rule }}>
                <QRCode value={me.secret_key} size={qrSize} />
              </View>
            ) : (
              <AppText color={Colors.muted}>Loading...</AppText>
            )}
            <AppText variant="serifItalic" size={14} color={Colors.muted} style={{ marginTop: 12, textAlign: 'center' }}>
              Have your partner scan this to align with you.
            </AppText>
          </View>
        </BottomSheet>

      </View>
    );
  }

  // Calculate dot color and active status string based on last_active_at
  let dotColor: string = Colors.accent; // Default red
  let isOnline = false;
  let activeStatusStr = '○ AWAY';

  if (partner.last_active_at) {
    const lastActive = new Date(partner.last_active_at);
    const diffMins = Math.floor((now.getTime() - lastActive.getTime()) / 60000);

    if (diffMins < 5) {
      dotColor = Colors.sage;
      isOnline = true;
      activeStatusStr = '● ACTIVE NOW';
    } else if (diffMins < 60) {
      dotColor = '#FFC107'; // Yellow
      activeStatusStr = `○ ACTIVE ${diffMins}M AGO`;
    } else {
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) {
        activeStatusStr = `○ ACTIVE ${diffHours}H AGO`;
      } else {
        const diffDays = Math.floor(diffHours / 24);
        activeStatusStr = `○ ACTIVE ${diffDays}D AGO`;
      }
    }
  }

  // Find latest active presence event (excluding static pairing/system onboarding notifications)
  const systemTypes = ['State Update', 'Alignment Request', 'Alignment Connected!', 'System'];
  const activeEvents = presenceNotifications.filter(
    (n: any) => !systemTypes.includes(n.type) && !n.message?.toLowerCase().includes("aligned with")
  );
  const latestPresence = activeEvents.length > 0 ? activeEvents[0] : null;
  const partnerName = partner.name || 'Partner';

  const partnerTz = partner.timezone || latestPresence?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

  const partnerCity = partner.location_city || partner.city_name || '';
  let locationStr = partnerCity ? partnerCity.toUpperCase() : '';
  if (!locationStr && partnerTz) {
    const tzParts = partnerTz.split('/');
    if (tzParts.length > 1) {
      locationStr = tzParts[tzParts.length - 1].replace(/_/g, ' ').toUpperCase();
    }
  }

  let partnerTimeStr = formatTime(now);
  try {
    partnerTimeStr = new Intl.DateTimeFormat('en-US', {
      timeZone: partnerTz,
      hour: 'numeric',
      minute: 'numeric',
      hour12: true
    }).format(now);
  } catch (e) {
    partnerTimeStr = formatTime(now);
  }

  // Determine presence phrase
  let phrase = '';
  const isFreshEvent = latestPresence && latestPresence.created_at && (now.getTime() - new Date(latestPresence.created_at).getTime() < 2 * 3600 * 1000);

  if (isFreshEvent && latestPresence?.message) {
    phrase = latestPresence.message;
  } else if (isOnline) {
    phrase = 'active now';
  } else {
    let partnerHour = now.getHours();
    try {
      const hourStr = new Intl.DateTimeFormat('en-US', {
        timeZone: partnerTz,
        hour: 'numeric',
        hour12: false
      }).format(now);
      partnerHour = parseInt(hourStr, 10);
    } catch (e) {}

    if (partnerHour >= 23 || partnerHour < 7) {
      phrase = 'probably sleeping';
    } else {
      phrase = 'quiet for now';
    }
  }

  // Format prefix and suffix cleanly
  let displayPrefix = `${partnerName}, `;
  let displaySuffix = phrase;

  if (phrase.startsWith(partnerName)) {
    displayPrefix = `${partnerName} `;
    displaySuffix = phrase.substring(partnerName.length).trim();
  } else if (['active now', 'probably sleeping', 'quiet for now', 'still awake', 'just waking up', 'in the middle of their day', 'winding down', 'probably asleep'].includes(phrase.toLowerCase())) {
    displayPrefix = `${partnerName}, `;
    displaySuffix = phrase;
  } else {
    displayPrefix = `${partnerName} `;
    displaySuffix = phrase;
  }

  return (
    <>
      <View style={styles.container}>
        <View style={styles.left}>
          <Pressable
            style={styles.avatarWrap}
            onPress={() => {
              showPartnerPicture({
                context: 'aligned',
                fallbackUrl: partner.profile_photo_url,
                name: partnerName,
              });
            }}
          >
            <View style={styles.avatar}>
              {partner.profile_photo_url ? (
                <Image source={{ 
                  uri: partner.profile_photo_url.startsWith('http') 
                    ? `${partner.profile_photo_url}` 
                    : `${api.defaults.baseURL}/${partner.profile_photo_url.replace(/\\/g, '/').replace(/^\//, '')}` 
                }} style={{ width: '100%', height: '100%', borderRadius: 18 }} />
              ) : (
                <AppText variant="mono" color={Colors.bone} style={{ fontSize: 13, fontWeight: '500' }}>
                  {partnerName[0].toUpperCase()}
                </AppText>
              )}
            </View>
            <View style={[styles.dot, { backgroundColor: dotColor }]} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <AppText variant="smallCaps" color={Colors.muted} style={{ marginBottom: 2 }}>
              {locationStr ? `${locationStr} · ` : ''}{partnerTimeStr}
            </AppText>
            <AppText variant="serifItalic" size={15} color={Colors.ink2} numberOfLines={2}>
              {displayPrefix}<AppText variant="serifItalic" size={15} color={Colors.muted}>{displaySuffix}</AppText>
            </AppText>
          </View>
        </View>
        <Pressable onPress={() => setIsSheetOpen(true)} style={styles.seeMoreBtn}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <AppText variant="mono" color={isOnline ? Colors.sage : Colors.light} style={{ fontSize: 10 }}>
              {activeStatusStr}
            </AppText>
          </View>
          <AppText
            variant="smallCaps"
            color={Colors.accent}
            style={{
              fontSize: 9,
              marginTop: 4,
              fontWeight: presenceNotifications.some(n => n.status !== "Seen") ? 'bold' : 'normal'
            }}
          >
            SEE MORE
          </AppText>
        </Pressable>
      </View>

      <AlignedNotificationSheet
        open={isSheetOpen}
        onClose={() => setIsSheetOpen(false)}
        partnerName={partnerName}
      />

    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 15,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: Colors.rule,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  avatarWrap: { position: 'relative' },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: Colors.bone,
  },
  seeMoreBtn: {
    alignItems: 'flex-end',
    padding: 8,
  },
  historyItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.rule,
  },
  historyLeft: {
    flex: 1,
  },
  alignmentContainer: {
    height: 'auto',
    flexDirection: 'column',
    alignItems: 'flex-start',
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: '#FAF9F6',
    borderWidth: 1,
    borderColor: Colors.rule,
    borderRadius: 12,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
  },
  secretKeyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0EFEA',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.rule,
    width: '100%',
    overflow: 'hidden',
  },
  secretKeyText: {
    flex: 1,
    fontSize: 16,
    padding: 12,
    textAlign: 'center',
    letterSpacing: 2
  },
  copyButton: {
    paddingHorizontal: 15,
    paddingVertical: 12,
    backgroundColor: '#E5E4DF',
    borderLeftWidth: 1,
    borderLeftColor: Colors.rule,
    justifyContent: 'center',
    alignItems: 'center'
  },
  incomingBadge: {
    backgroundColor: '#F1E4DA',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  requestAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: Colors.accent,
  }
});
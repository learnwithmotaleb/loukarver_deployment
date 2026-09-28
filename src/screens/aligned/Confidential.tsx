import React, { useState, useEffect, useRef, useCallback } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { View, StyleSheet, Pressable, Modal, Image, DeviceEventEmitter, ActivityIndicator, Animated, useWindowDimensions, Platform } from 'react-native';
import { CustomAlert } from '../../components/ui/CustomAlert';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { Colors } from '../../constants/colors';
import { AppText } from '../../components/ui/AppText';
import { AppButton } from '../../components/ui/AppButton';
import * as ImagePicker from 'expo-image-picker';
import { preventScreenCaptureAsync, allowScreenCaptureAsync } from 'expo-screen-capture';
import { uploadSecret, getReceivedSecrets, getSentSecrets, getSecretViewUrl, requestRewatchSecret, approveRewatchSecret, declineRewatchSecret, revokeSecret } from '../../services/secretApi';
import { triggerNotification } from '../../services/notificationApi';
import { getMe } from '../../services/authApi';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import ReAnimated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

const Confidential: React.FC = () => {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const navigation = useNavigation<any>();
  const [secrets, setSecrets] = useState<any[]>([]);
  const [sentSecrets, setSentSecrets] = useState<any[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isAligned, setIsAligned] = useState<boolean>(true);
  const [viewingSecret, setViewingSecret] = useState<any | null>(null);
  const [mediaDataUri, setMediaDataUri] = useState<string | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);

  const progress = useRef(new Animated.Value(1)).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);
  const viewingSecretRef = useRef<any>(null);



  // Keep ref in sync for use inside callbacks
  useEffect(() => {
    viewingSecretRef.current = viewingSecret;
  }, [viewingSecret]);

  // Pinch-to-zoom shared values
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = savedScale.value * e.scale;
    })
    .onEnd(() => {
      if (scale.value < 1) {
        scale.value = withSpring(1);
        savedScale.value = 1;
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else {
        savedScale.value = scale.value;
      }
    });

  const panGesture = Gesture.Pan()
    .minPointers(2)
    .onUpdate((e) => {
      translateX.value = savedTranslateX.value + e.translationX;
      translateY.value = savedTranslateY.value + e.translationY;
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1) {
        scale.value = withSpring(1);
        savedScale.value = 1;
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else {
        scale.value = withSpring(2.5);
        savedScale.value = 2.5;
      }
    });

  const composedGesture = Gesture.Simultaneous(pinchGesture, panGesture, doubleTapGesture);

  const animatedImageStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  // Screenshot protection scoped to modal
  useEffect(() => {
    if (viewingSecret) {
      preventScreenCaptureAsync().catch(console.error);
    } else {
      allowScreenCaptureAsync().catch(console.error);
      progress.stopAnimation();
      // Reset zoom
      scale.value = 1;
      savedScale.value = 1;
      translateX.value = 0;
      translateY.value = 0;
      savedTranslateX.value = 0;
      savedTranslateY.value = 0;
    }
    return () => { allowScreenCaptureAsync().catch(console.error); };
  }, [viewingSecret]);

  const startTimer = (duration: number) => {
    animRef.current = Animated.timing(progress, {
      toValue: 0,
      duration: duration,
      useNativeDriver: false,
    });
    animRef.current.start(({ finished }) => {
      if (finished) {
        handleViewSecretOut();
      }
    });
  };

  // Start 10s timer for images
  useEffect(() => {
    if (viewingSecret && mediaDataUri) {
      progress.setValue(1);
      startTimer(10000);
    }
  }, [viewingSecret, mediaDataUri]);

  const handlePause = () => {
    setIsPaused(true);
    progress.stopAnimation();
  };

  const handleResume = () => {
    setIsPaused(false);
    progress.stopAnimation((value) => {
      startTimer(value * 10000);
    });
  };

  const parseUtcDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    let d = dateStr;
    if (!d.endsWith("Z") && !d.includes("+") && !d.includes("-", 10)) d += "Z";
    return new Date(d);
  };

  const loadSecrets = async () => {
    try {
      const [resRec, resSent] = await Promise.all([
        getReceivedSecrets(),
        getSentSecrets()
      ]);
      if (resRec.success) setSecrets(resRec.data);
      if (resSent.success) setSentSecrets(resSent.data);
    } catch (e) {
      console.log("Failed to load secrets", e);
    }
  };

  const checkAlignment = async () => {
    try {
      const meData = await getMe();
      const aligned = !!(meData && (meData.is_aligned || meData.partner));
      setIsAligned(aligned);
    } catch (e) {
      console.log("Failed to check alignment in Confidential", e);
    }
  };

  useEffect(() => {
    const fetchToken = async () => {
      const token = await AsyncStorage.getItem('access_token');
      setAuthToken(token);
    };
    fetchToken();
    loadSecrets();
    checkAlignment();
    
    const sub1 = DeviceEventEmitter.addListener('REFRESH_SECRET_DATA', loadSecrets);
    const sub2 = DeviceEventEmitter.addListener('REFRESH_ALIGNED_DATA', () => {
      loadSecrets();
      checkAlignment();
    });
    const sub3 = DeviceEventEmitter.addListener('ALIGNMENT_BONDED', () => {
      loadSecrets();
      checkAlignment();
    });
    const sub4 = DeviceEventEmitter.addListener('ALIGNMENT_BROKEN', () => {
      loadSecrets();
      checkAlignment();
    });

    return () => {
      sub1.remove();
      sub2.remove();
      sub3.remove();
      sub4.remove();
    };
  }, []);

  const handleCompose = async () => {
    if (!isAligned) {
      CustomAlert.alert(
        "Partner Required",
        "Please connect with your partner first to send confidential photos."
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const asset = result.assets[0];

      setIsUploading(true);
      try {
        await uploadSecret(asset.uri);
        triggerNotification("Confidential Message", "Sent a confidential message").catch(() => {});
        CustomAlert.alert("Success", "Secret sent successfully!");
      } catch (error: any) {
        const errorMsg = error?.response?.data?.detail || "Could not send the secret.";
        CustomAlert.alert("Upload Failed", errorMsg);
        console.error(error);
      } finally {
        setIsUploading(false);
      }
    }
  };

  const handleViewSecretIn = async (secret: any) => {
    setViewingSecret(secret);
    setIsPaused(false);
    if (!authToken) return;

    try {
      const res = await fetch(getSecretViewUrl(secret.id), {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      const blob = await res.blob();
      const reader = new FileReader();
      reader.onloadend = () => {
        setMediaDataUri(reader.result as string);
      };
      reader.readAsDataURL(blob);
    } catch (e) {
      console.log("Failed to load secret media", e);
    }
  };

  const handleViewSecretOut = () => {
    if (!viewingSecretRef.current) return;
    setSecrets(prev => prev.filter(s => s.id !== viewingSecretRef.current.id));
    setViewingSecret(null);
    setMediaDataUri(null);
    progress.stopAnimation();
    setIsPaused(false);
    loadSecrets();
  };

  const handleRequestRewatch = async (secretId: string) => {
    try {
      await requestRewatchSecret(secretId);
      loadSecrets();
      CustomAlert.alert("Requested", "Rewatch request sent to your partner.");
    } catch (e) {
      console.log(e);
      CustomAlert.alert("Error", "Could not request rewatch.");
    }
  };

  const handleApproveRewatch = async (secretId: string) => {
    try {
      await approveRewatchSecret(secretId);
      loadSecrets();
      CustomAlert.alert("Approved", "Your partner can now view it one more time.");
    } catch (e) {
      console.log(e);
      CustomAlert.alert("Error", "Could not approve rewatch.");
    }
  };

  const handleDeclineRewatch = async (secretId: string) => {
    try {
      await declineRewatchSecret(secretId);
      loadSecrets();
    } catch (e) {
      console.log(e);
      CustomAlert.alert("Error", "Could not decline rewatch.");
    }
  };

  const handleRevokeSecret = (secretId: string) => {
    CustomAlert.alert(
      "Revoke Secret",
      "Are you sure you want to permanently delete this secret before it's opened?",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Revoke", 
          style: "destructive",
          onPress: async () => {
            try {
              await revokeSecret(secretId);
              loadSecrets();
            } catch (e) {
              console.log(e);
              CustomAlert.alert("Error", "Could not revoke secret.");
            }
          }
        }
      ]
    );
  };

  const renderSecret = (secret: any) => (
    <View key={secret.id} style={styles.messageCard}>
      <View style={styles.messageHeader}>
        <View style={styles.avatar}>
          <AppText style={{ color: '#fff', fontSize: 14 }}>
            {secret.partner_name ? secret.partner_name[0].toUpperCase() : "P"}
          </AppText>
        </View>
        <View>
          <AppText variant="mono" style={styles.fromText}>
            FROM {secret.partner_name ? secret.partner_name.toUpperCase() : "PARTNER"}
          </AppText>
          <AppText variant="heading" size={17} style={{ color: '#fff' }}>
            Something just for you
          </AppText>
        </View>
      </View>

      <View style={styles.messageMeta}>
        <AppText variant="mono" style={{ color: '#8C7F75', fontSize: 12 }}>
          📷 OPENS ONCE • {secret.delete_after}
        </AppText>
        
        {(!secret.is_viewed || secret.rewatch_status === 'approved') ? (
          <Pressable
            onPress={() => handleViewSecretIn(secret)}
            style={styles.openButton}
          >
            <AppText variant="mono" style={{ color: '#fff', fontSize: 10 }}>TAP TO VIEW</AppText>
          </Pressable>
        ) : secret.rewatch_status === "requested" ? (
          <View style={[styles.openButton, { backgroundColor: '#5c544d' }]}>
            <AppText variant="mono" style={{ color: '#fff', fontSize: 12 }}>
              WAITING...
            </AppText>
          </View>
        ) : (
          <Pressable
            onPress={() => handleRequestRewatch(secret.id)}
            style={[styles.openButton, { backgroundColor: '#8C7F75' }]}
          >
            <AppText variant="mono" style={{ color: '#fff', fontSize: 12 }}>
              ASK TO REWATCH
            </AppText>
          </Pressable>
        )}
      </View>
    </View>
  );

  const renderMediaViewer = () => {
    if (!mediaDataUri) {
      return (
        <View style={viewerStyles.loadingContainer}>
          <View style={viewerStyles.loadingPulse}>
            <ActivityIndicator size="large" color="#E06C6C" />
          </View>
          <AppText variant="mono" style={viewerStyles.loadingText}>DECRYPTING...</AppText>
          <AppText variant="serifItalic" style={viewerStyles.loadingSubtext}>
            Preparing your secret photo
          </AppText>
        </View>
      );
    }

    // Image with pinch-to-zoom
    return (
      <GestureDetector gesture={composedGesture}>
        <ReAnimated.View 
          style={[{ flex: 1, width: '100%', justifyContent: 'center', alignItems: 'center' }, animatedImageStyle]}
        >
          <Image 
            source={{ uri: mediaDataUri }} 
            style={{ width: windowWidth, height: windowHeight * 0.8, resizeMode: 'contain' }}
          />
        </ReAnimated.View>
      </GestureDetector>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <AppText variant="mono" style={styles.headerText}>CONFIDENTIAL</AppText>
      </View>

      <AppText variant="display" size={35} style={styles.title}>
        Just between {""}
        <AppText variant="serifItalic" size={32} style={{ color: "#E06C6C" }}>
         you two.
        </AppText>
      </AppText>

      <AppText variant="serifItalic" size={13} color={Colors.cream} style={styles.subtitle}>
        Photos that open once, then disappear. No screenshots, no saves.
      </AppText>

      {secrets.length === 0 ? (
        <AppText variant="serifItalic" color={Colors.muted} style={{ marginTop: 20, marginBottom: 40 }}>
          No new secrets received.
        </AppText>
      ) : (
        <View>
          {renderSecret(secrets[0])}
          {secrets.length > 1 && (
            <Pressable 
              onPress={() => navigation.navigate('SecretHistory')}
              style={{ alignSelf: 'flex-start', padding: 8, backgroundColor: '#3A2823', borderRadius: 8, marginBottom: 20 }}
            >
              <AppText variant="mono" style={{ color: '#E06C6C', fontSize: 11 }}>
                VIEW {secrets.length - 1} OLDER SECRETS
              </AppText>
            </Pressable>
          )}
        </View>
      )}

      {/* Sent Secrets Status Tracker */}
      {sentSecrets.length > 0 && (
        <View style={{ marginTop: 10, marginBottom: 30 }}>
          <AppText variant="smallCaps" color={Colors.ink2} style={{ fontSize: 10, marginBottom: 15, color: '#8C7F75' }}>
            SENT STATUS
          </AppText>
          {sentSecrets.map(sent => (
            <View key={sent.id} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <AppText style={{ fontSize: 14, marginRight: 8 }}>
                {sent.status === 'viewed' ? '⭕' : '🔴'}
              </AppText>
              <View style={{ flex: 1 }}>
                <AppText variant="serifItalic" color={Colors.cream} style={{ fontSize: 15 }}>
                  {sent.status === 'viewed' ? 'Opened' : 'Delivered'}
                </AppText>
              </View>

              {sent.rewatch_status === 'requested' && (
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <Pressable 
                    onPress={() => handleDeclineRewatch(sent.id)}
                    style={{ backgroundColor: '#4A3B32', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}
                  >
                    <AppText variant="mono" style={{ color: '#fff', fontSize: 10 }}>DENY</AppText>
                  </Pressable>
                  <Pressable 
                    onPress={() => handleApproveRewatch(sent.id)}
                    style={{ backgroundColor: '#B7553E', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginRight: 10 }}
                  >
                    <AppText variant="mono" style={{ color: '#fff', fontSize: 10 }}>APPROVE</AppText>
                  </Pressable>
                </View>
              )}

              {sent.rewatch_status === 'none' && !sent.is_viewed && (
                <Pressable 
                  onPress={() => handleRevokeSecret(sent.id)}
                  style={{ backgroundColor: '#4A3B32', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}
                >
                  <AppText variant="mono" style={{ color: '#E06C6C', fontSize: 10 }}>REVOKE</AppText>
                </Pressable>
              )}

              <AppText variant="mono" style={{ color: '#8C7F75', fontSize: 10 }}>
                {parseUtcDate(sent.created_at)?.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
              </AppText>
            </View>
          ))}
        </View>
      )}

      <View style={styles.composeSection}>
        <AppText variant="smallCaps" style={styles.composeLabel}>COMPOSE</AppText>

        {!isAligned && (
          <View style={styles.notAlignedCard}>
            <View style={styles.notAlignedHeader}>
              <AppText style={{ fontSize: 16, marginRight: 8 }}>🔒</AppText>
              <AppText variant="heading" size={15} style={{ color: '#E06C6C' }}>
                Partner Not Connected
              </AppText>
            </View>
            <AppText variant="serifItalic" size={13} style={styles.notAlignedDesc}>
              Confidential photos are strictly private between two partners. Please connect with your partner on the Today tab first.
            </AppText>
            <Pressable 
              style={styles.connectButton}
              onPress={() => navigation.navigate('Home')}
            >
              <AppText variant="mono" style={styles.connectButtonText}>
                CONNECT WITH PARTNER →
              </AppText>
            </Pressable>
          </View>
        )}

        <Pressable 
          style={[styles.composeButton, !isAligned && styles.composeButtonDisabled]} 
          onPress={handleCompose} 
          disabled={isUploading}
        >
          <AppText variant="heading" size={17} style={{ color: !isAligned ? '#7A6E65' : '#fff' }}>
            {isUploading ? "Sending..." : "Send something private"}
          </AppText>
          <AppText style={{ color: !isAligned ? '#7A6E65' : '#E8B4A0', fontSize: 18 }}>→</AppText>
        </Pressable>
      </View>

      <Modal visible={!!viewingSecret} transparent={true} animationType="fade">
        <GestureHandlerRootView style={{ flex: 1 }}>
          <View style={viewerStyles.container}>
            {/* Top gradient overlay */}
            <LinearGradient
              colors={['rgba(0,0,0,0.8)', 'transparent']}
              style={viewerStyles.topGradient}
            />

            {/* Close button */}
            <Pressable onPress={handleViewSecretOut} style={viewerStyles.closeButton}>
              <View style={viewerStyles.closeButtonInner}>
                <AppText style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>✕</AppText>
              </View>
            </Pressable>

            {/* Progress bar */}
            <View style={viewerStyles.progressTrack}>
              <Animated.View style={[viewerStyles.progressBar, { 
                width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] })
              }]} />
            </View>

            {/* Timer label */}
            {mediaDataUri && (
              <View style={viewerStyles.timerLabel}>
                <AppText variant="mono" style={{ color: 'rgba(255,255,255,0.5)', fontSize: 9 }}>
                  {isPaused ? 'PAUSED' : 'AUTO-DESTRUCT'}
                </AppText>
              </View>
            )}

            {/* Media content */}
            <View 
              style={{ flex: 1, width: '100%', justifyContent: 'center', alignItems: 'center' }}
              onStartShouldSetResponder={() => true}
              onResponderGrant={handlePause}
              onResponderRelease={handleResume}
              onResponderTerminate={handleResume}
            >
              {renderMediaViewer()}
            </View>

            {/* Bottom gradient overlay */}
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.6)']}
              style={viewerStyles.bottomGradient}
            />

            {/* Bottom hint */}
            {mediaDataUri && (
              <View style={viewerStyles.bottomHint}>
                <AppText variant="mono" style={{ color: 'rgba(255,255,255,0.35)', fontSize: 9 }}>
                  HOLD TO PAUSE • PINCH TO ZOOM • DOUBLE TAP TO 2.5×
                </AppText>
              </View>
            )}
          </View>
        </GestureHandlerRootView>
      </Modal>
    </View>
  );
};

export default Confidential;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    marginHorizontal: -20,
    backgroundColor: "#1D1815",
    padding: 20,
    marginVertical: 20,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerText: { fontSize: 10, letterSpacing: 1, color: '#AD442E' },
  title: { color: "#fff", marginBottom: 4 },
  subtitle: { marginTop: -7, marginBottom: 24 },
  messageCard: {
    backgroundColor: '#2D1D1A',
    borderRadius: 16,
    padding: 10,
    marginBottom: 24,
  },
  messageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E06C6C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fromText: {
    fontSize: 11,
    color: '#AD442E',
    letterSpacing: 1,
  },
  messageMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  openButton: {
    backgroundColor: '#B7553E',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  composeSection: {
    marginTop: 8,
  },
  composeLabel: {
    fontSize: 11,
    letterSpacing: 2,
    color: '#8C7F75',
    marginBottom: 10,
  },
  composeButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#2E2622',
    padding: 20,
    borderRadius: 14,
  },
  composeButtonDisabled: {
    opacity: 0.6,
    borderWidth: 1,
    borderColor: '#3A2E28',
  },
  notAlignedCard: {
    backgroundColor: '#261D1A',
    borderColor: '#3D2A24',
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  notAlignedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  notAlignedDesc: {
    color: '#A89B91',
    lineHeight: 18,
    marginBottom: 12,
  },
  connectButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#AD442E',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  connectButtonText: {
    color: '#FFFFFF',
    fontSize: 10,
    letterSpacing: 1,
    fontWeight: '600',
  },
});

const viewerStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  topGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 150,
    zIndex: 5,
  },
  bottomGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 100,
    zIndex: 5,
  },
  closeButton: {
    position: 'absolute',
    top: 55,
    right: 20,
    zIndex: 10,
  },
  closeButtonInner: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressTrack: {
    position: 'absolute',
    top: 100,
    left: 24,
    right: 24,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 2,
    overflow: 'hidden',
    zIndex: 10,
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#E06C6C',
    borderRadius: 2,
  },
  timerLabel: {
    position: 'absolute',
    top: 108,
    right: 24,
    zIndex: 10,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingPulse: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(224, 108, 108, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(224, 108, 108, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  loadingText: {
    color: '#E06C6C',
    fontSize: 12,
    letterSpacing: 3,
    marginBottom: 8,
  },
  loadingSubtext: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 13,
  },
  pausedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pausedIcon: {
    fontSize: 48,
    color: '#fff',
    marginBottom: 12,
  },
  pausedText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    letterSpacing: 4,
  },
  bottomHint: {
    position: 'absolute',
    bottom: 30,
    alignSelf: 'center',
    zIndex: 10,
  },
});
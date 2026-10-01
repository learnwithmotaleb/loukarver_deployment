import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useState } from 'react';
import { View, StyleSheet, Pressable, Alert, useWindowDimensions, Keyboard } from 'react-native';
import { KeyboardAwareScrollView, KeyboardStickyView } from 'react-native-keyboard-controller';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Colors } from '../../constants/colors';
import { AppText } from '../../components/ui/AppText';
import { AppButton } from '../../components/ui/AppButton';
import { AppTextInput } from '../../components/ui/AppTextInput';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { RootStackParamList } from '../../types';
import { setupVibeProfile, connectWithKey, generateInvite } from '../../services/vibeCheckApi';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
// QRCode imported conditionally below
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

let CameraView: any = null;
let useCameraPermissions: any = () => [null, async () => {}];
let QRCode: any = null;

if (Platform.OS !== 'web') {
  const ExpoCamera = require('expo-camera');
  CameraView = ExpoCamera.CameraView;
  useCameraPermissions = ExpoCamera.useCameraPermissions;
  QRCode = require('react-native-qrcode-svg').default;
}

type Nav = StackNavigationProp<RootStackParamList>;

export const VCOnboarding: React.FC = () => {
  const nav = useNavigation<Nav>();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const qrSize = Math.min(Math.round(windowWidth * 0.48), Math.round(windowHeight * 0.20), 180);
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [connectOption, setConnectOption] = useState<'key' | 'invite' | 'scan' | 'skip'>('skip');
  const [vibeKey, setVibeKey] = useState('');
  const [myVibeKey, setMyVibeKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [inviteData, setInviteData] = useState<{ invite_code: string; invite_link: string } | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);


  const qrRef = React.useRef<any>(null);

  const [qrSheet, setQrSheet] = useState(false);
  const [scannerSheet, setScannerSheet] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();

  const handleGenerateInvite = async () => {
    try {
      setInviteLoading(true);
      setErrorMsg(null);
      // Profile is already set up in step 1 transition
      const data = await generateInvite();
      setInviteData(data);
    } catch (error: any) {
      const msg = error.response?.data?.detail || error.message || 'Failed to generate invite.';
      setErrorMsg(msg);
    } finally {
      setInviteLoading(false);
    }
  };

  const handleCopyInvite = async () => {
    if (inviteData) {
      const message = `hey — found this game thing, takes 5 seconds a day. wanna do a vibe check? ${inviteData.invite_link}`;
      await Clipboard.setStringAsync(message);
      Alert.alert('Copied!', 'Invite message copied to clipboard.');
    }
  };

  const handleCopyKey = async () => {
    if (myVibeKey) {
      await Clipboard.setStringAsync(myVibeKey);
      Alert.alert('Copied!', 'Vibe Key copied to clipboard.');
    }
  };

  const handleDownloadQR = () => {
    if (qrRef.current) {
      qrRef.current.toDataURL(async (data: string) => {
        try {
          if (Platform.OS === 'web') {
            fetch(`data:image/png;base64,${data}`)
              .then(res => res.blob())
              .then(blob => {
                const url = window.URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `VibeKey-${myVibeKey}.png`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                window.URL.revokeObjectURL(url);
              })
              .catch(() => Alert.alert('Error', 'Failed to download QR code.'));
          } else {
            // For now, native download is disabled to test Web stability
            Alert.alert('Notice', 'Mobile download is temporarily disabled for testing.');
          }
        } catch (e: any) {
          Alert.alert('Error', 'Failed to save or share QR code.');
        }
      });
    }
  };

  const handleSetupProfileAndNext = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const profile = await setupVibeProfile(name.trim());
      setMyVibeKey(profile.vibe_key);
      setStep(s => s + 1);
    } catch (error: any) {
      const msg = error.response?.data?.detail || error.message || 'Failed to setup profile.';
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenScanner = async () => {
    if (!permission?.granted) {
      await requestPermission();
    }
    setScannerSheet(true);
  };

  const handleBarcodeScanned = ({ data }: any) => {
    setScannerSheet(false);
    setVibeKey(data);
    setConnectOption('key');
  };

  const handleScanFromGallery = async () => {
    Alert.alert('Notice', 'Scanning from gallery is currently disabled.');
  };

  const handleFinish = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);

      // Step 2: Connect if user chose to enter a key
      if (connectOption === 'key' && vibeKey.trim()) {
        try {
          await connectWithKey(vibeKey.trim());
        } catch (error: any) {
          const msg = error.response?.data?.detail || error.message || 'Failed to connect.';
          setErrorMsg(msg);
          setLoading(false);
          return;
        }
      }

      nav.navigate('VibeApp');
    } catch (error: any) {
      const msg = error.response?.data?.detail || error.message || 'An error occurred.';
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  const steps = [
    {
      kicker: '01',
      title: 'Your name?',
      sub: "Just so we know who's who.",
      body: (
        <View>
          <AppTextInput
            label="Your first name"
            n="01"
            value={name}
            onChangeText={(text) => {
              setName(text);
              setErrorMsg(null);
            }}
            placeholder="You"
            returnKeyType="next"
            onSubmitEditing={() => {
              if (name.trim()) {
                handleSetupProfileAndNext();
              }
            }}
          />
        </View>
      ),
    },
    {
      kicker: '02',
      title: 'Connect with someone',
      sub: 'Play together or start solo.',
      body: (
        <View>
          {/* Display User's Vibe Key */}
          {myVibeKey && (
            <View style={styles.myKeyCard}>
              <AppText variant="smallCaps" color={Colors.muted} style={{ fontSize: 10, marginBottom: 4 }}>YOUR VIBE KEY</AppText>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <AppText variant="display" size={24} color={Colors.ink} style={{ letterSpacing: 1 }}>{myVibeKey}</AppText>
                <Pressable onPress={handleCopyKey} style={{ padding: 4 }}>
                  <Ionicons name="copy-outline" size={20} color={Colors.accent} />
                </Pressable>
              </View>
              <AppButton 
                variant="outline" 
                size="sm" 
                style={{ marginTop: 12 }} 
                onPress={() => setQrSheet(true)}
              >
                SHOW QR CODE
              </AppButton>
            </View>
          )}

          {/* Option: Scan a QR Code */}
          <Pressable
            onPress={() => { setConnectOption('scan'); setErrorMsg(null); handleOpenScanner(); }}
            style={styles.optRow}
          >
            <View style={{ flex: 1 }}>
              <AppText variant="heading" size={18}>Scan a QR Code</AppText>
              <AppText variant="mono" color={Colors.light} style={{ fontSize: 10, marginTop: 2 }}>
                USING CAMERA OR GALLERY
              </AppText>
            </View>
            <AppText size={18} color={connectOption === 'scan' ? Colors.accent : Colors.rule}>
              {connectOption === 'scan' ? '●' : '○'}
            </AppText>
          </Pressable>

          {/* Option: Enter a Vibe Key */}
          <Pressable
            onPress={() => { setConnectOption('key'); setErrorMsg(null); }}
            style={styles.optRow}
          >
            <View style={{ flex: 1 }}>
              <AppText variant="heading" size={18}>Enter a Vibe Key</AppText>
              <AppText variant="mono" color={Colors.light} style={{ fontSize: 10, marginTop: 2 }}>
                CONNECT WITH SOMEONE'S KEY
              </AppText>
            </View>
            <AppText size={18} color={connectOption === 'key' ? Colors.accent : Colors.rule}>
              {connectOption === 'key' ? '●' : '○'}
            </AppText>
          </Pressable>

          {connectOption === 'key' && (
            <View style={styles.keyInput}>
              <AppTextInput
                label="Vibe Key"
                n="02"
                value={vibeKey}
                onChangeText={(text) => {
                  setVibeKey(text);
                  setErrorMsg(null);
                }}
                placeholder="e.g. VIBE-k7d2x"
                autoCapitalize="none"
                returnKeyType="done"
                onSubmitEditing={() => {
                  Keyboard.dismiss();
                }}
              />
            </View>
          )}

          {/* Option: Generate Invite Link */}
          <Pressable
            onPress={() => { setConnectOption('invite'); setErrorMsg(null); }}
            style={styles.optRow}
          >
            <View style={{ flex: 1 }}>
              <AppText variant="heading" size={18}>Send an invite</AppText>
              <AppText variant="mono" color={Colors.light} style={{ fontSize: 10, marginTop: 2 }}>
                GENERATE A LINK TO SHARE
              </AppText>
            </View>
            <AppText size={18} color={connectOption === 'invite' ? Colors.accent : Colors.rule}>
              {connectOption === 'invite' ? '●' : '○'}
            </AppText>
          </Pressable>

          {connectOption === 'invite' && (
            <View style={styles.inviteSection}>
              {!inviteData ? (
                <AppButton
                  full
                  variant="outline"
                  size="md"
                  onPress={handleGenerateInvite}
                  disabled={inviteLoading}
                >
                  {inviteLoading ? 'Generating...' : 'Generate Invite Link'}
                </AppButton>
              ) : (
                <View>
                  <View style={styles.inviteLinkBox}>
                    <AppText variant="mono" color={Colors.accent} style={{ fontSize: 11 }}>
                      {inviteData.invite_link}
                    </AppText>
                  </View>
                  <AppButton
                    full
                    variant="solid"
                    size="md"
                    onPress={handleCopyInvite}
                    style={{ marginTop: 8, backgroundColor: '#1C1C1E' }}
                  >
                    COPY MESSAGE
                  </AppButton>
                </View>
              )}
            </View>
          )}

          {/* Option: Skip */}
          <Pressable
            onPress={() => { setConnectOption('skip'); setErrorMsg(null); }}
            style={styles.optRow}
          >
            <View style={{ flex: 1 }}>
              <AppText variant="heading" size={18}>Skip for now</AppText>
              <AppText variant="mono" color={Colors.light} style={{ fontSize: 10, marginTop: 2 }}>
                START SOLO, CONNECT LATER
              </AppText>
            </View>
            <AppText size={18} color={connectOption === 'skip' ? Colors.accent : Colors.rule}>
              {connectOption === 'skip' ? '●' : '○'}
            </AppText>
          </Pressable>
        </View>
      ),
    },
  ];

  const cur = steps[step];

  return (
    <SafeAreaView style={styles.safe}>
        <View style={styles.container}>
          <KeyboardAwareScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
            bottomOffset={100}
          >
            <View style={styles.topBar}>
              <AppText variant="smallCaps" color={Colors.muted}>vibe check</AppText>
              <AppText variant="mono" color={Colors.light} style={{ fontSize: 10 }}>
                {String(step + 1).padStart(2, '0')} / {String(steps.length).padStart(2, '0')}
              </AppText>
            </View>

            <View style={{ flex: 1 }}>
              <AppText variant="smallCaps" color={Colors.accent} style={{ marginBottom: 14 }}>{cur.kicker}</AppText>
              <AppText variant="display" size={38} style={{ lineHeight: 38, marginBottom: 14 }}>{cur.title}</AppText>
              {cur.sub && <AppText variant="serifItalic" size={17} color={Colors.muted} style={{ marginBottom: 30, lineHeight: 25 }}>{cur.sub}</AppText>}
              
              {errorMsg && (
                <View style={styles.errorBox}>
                  <AppText variant="mono" style={{ color: '#D32F2F', fontSize: 11 }}>{errorMsg}</AppText>
                </View>
              )}

              {cur.body}
            </View>
          </KeyboardAwareScrollView>

          {/* Sticky footer that moves with the keyboard */}
          <KeyboardStickyView offset={{ closed: 0, opened: 0 }}>
            <View style={styles.footer}>
              <View style={styles.progress}>
                {steps.map((_, i) => (
                  <View key={i} style={[styles.bar, { backgroundColor: i <= step ? Colors.accent : Colors.rule }]} />
                ))}
              </View>

              <View style={styles.actions}>
                {step > 0 && (
                  <AppButton variant="outline" size="lg" onPress={() => { Keyboard.dismiss(); setStep(s => s - 1); setErrorMsg(null); }} style={{ flex: 1 }}>
                    Back
                  </AppButton>
                )}
                <AppButton
                  variant="solid"
                  size="lg"
                  style={{ flex: step > 0 ? 2 : 1 }}
                  disabled={loading}
                  onPress={() => {
                    if (step < steps.length - 1) {
                      if (step === 0) {
                        if (!name.trim()) {
                          setErrorMsg('Please enter your name.');
                          return;
                        }
                        Keyboard.dismiss();
                        handleSetupProfileAndNext();
                      } else {
                        Keyboard.dismiss();
                        setStep(s => s + 1);
                      }
                    } else {
                      handleFinish();
                    }
                  }}
                >
                  {step === steps.length - 1
                    ? loading ? 'Connecting...' : 'Start →'
                    : loading ? 'Setting up...' : 'Continue'}
                </AppButton>
              </View>
            </View>
          </KeyboardStickyView>
        </View>

      {/* ==================== QR CODE SHEET ==================== */}
      <BottomSheet
        open={qrSheet}
        onClose={() => setQrSheet(false)}
        kicker="SHARE"
        title="Your Vibe Key"
      >
        <View style={{ alignItems: 'center', paddingVertical: 10 }}>
          <View style={styles.qrContainer}>
            {myVibeKey && QRCode ? (
              <QRCode
                value={myVibeKey}
                size={qrSize}
                color={Colors.ink}
                backgroundColor={Colors.bone}
                getRef={(c: any) => (qrRef.current = c)}
              />
            ) : myVibeKey ? (
              <View style={{ width: qrSize, height: qrSize, backgroundColor: Colors.bone, alignItems: 'center', justifyContent: 'center' }}>
                <AppText variant="mono" size={12} color={Colors.muted} style={{ textAlign: 'center' }}>QR Code unavailable on Web.{'\n\n'}Use your Vibe Key instead.</AppText>
              </View>
            ) : null}
          </View>
          <AppText variant="display" size={22} color={Colors.accent} style={{ marginTop: 14, letterSpacing: 2 }}>
            {myVibeKey}
          </AppText>
          <AppButton variant="outline" size="sm" onPress={handleDownloadQR} style={{ marginTop: 12 }}>
            SAVE QR CODE
          </AppButton>
          <AppText variant="serifItalic" size={13} color={Colors.muted} style={{ marginTop: 10, textAlign: 'center' }}>
            Let your friend scan this code to connect instantly.
          </AppText>
        </View>
      </BottomSheet>

      {/* ==================== SCANNER SHEET ==================== */}
      <BottomSheet
        open={scannerSheet}
        onClose={() => setScannerSheet(false)}
        kicker="SCAN"
        title="Scan QR Code"
        dark
      >
        <View style={{ alignItems: 'center' }}>
          {Platform.OS !== 'web' ? (
            permission?.granted ? (
              <View style={styles.cameraContainer}>
                <CameraView
                  style={styles.camera}
                  onBarcodeScanned={handleBarcodeScanned}
                  barcodeScannerSettings={{
                    barcodeTypes: ['qr'],
                  }}
                />
                <View style={styles.scannerOverlay}>
                  <View style={styles.scannerFrame} />
                </View>
              </View>
            ) : (
              <View style={[styles.cameraContainer, { justifyContent: 'center', backgroundColor: '#333' }]}>
                <AppText color="#fff">Camera permission is required.</AppText>
                <AppButton variant="solid" size="sm" onPress={requestPermission} style={{ marginTop: 16 }}>
                  Grant Permission
                </AppButton>
              </View>
            )
          ) : (
            <View style={[styles.cameraContainer, { justifyContent: 'center', backgroundColor: Colors.bone, padding: 20 }]}>
              <Ionicons name="camera-outline" size={48} color={Colors.muted} style={{ alignSelf: 'center', marginBottom: 12 }} />
              <AppText color={Colors.muted} style={{ textAlign: 'center' }}>
                Live scanning is only available on the mobile app. Please upload a QR code from your gallery.
              </AppText>
            </View>
          )}
          
          <AppText variant="mono" color="#ccc" style={{ marginVertical: 24 }}>OR</AppText>

          <AppButton
            full
            variant="solid"
            size="lg"
            onPress={handleScanFromGallery}
          >
            UPLOAD FROM GALLERY
          </AppButton>
        </View>
      </BottomSheet>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bone },
  container: {
    flex: 1,
    paddingHorizontal: 32,
    paddingTop: 32,
  },
  scrollContent: { flexGrow: 1 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 40 },
  footer: { paddingTop: 16, paddingBottom: 20 },
  optRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: Colors.rule, gap: 12,
  },
  keyInput: {
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: Colors.rule,
  },
  inviteSection: {
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: Colors.rule,
  },
  inviteLinkBox: {
    backgroundColor: '#EAE2D4',
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.rule,
  },
  errorBox: {
    backgroundColor: '#FFEBEE',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FFCDD2',
    marginBottom: 20,
  },
  myKeyCard: {
    backgroundColor: '#EAE2D4',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.rule,
    marginBottom: 24,
    alignItems: 'center',
  },
  qrContainer: {
    padding: 14,
    backgroundColor: Colors.bone,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: Colors.rule,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  cameraContainer: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#444',
  },
  camera: {
    flex: 1,
  },
  scannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scannerFrame: {
    width: 220,
    height: 220,
    borderWidth: 2,
    borderColor: Colors.accent,
    borderRadius: 16,
    backgroundColor: 'transparent',
  },
  progress: { flexDirection: 'row', gap: 4, marginBottom: 18 },
  bar: { flex: 1, height: 2, borderRadius: 1 },
  actions: { flexDirection: 'row', gap: 10 },
});
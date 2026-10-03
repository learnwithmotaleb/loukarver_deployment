import React, { useState, useEffect } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Pressable,
  Alert,
  Image,
  ActivityIndicator,
  Platform,
  Switch,
  Modal,
  DeviceEventEmitter,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Colors } from '../../constants/colors';
import { AppText } from '../../components/ui/AppText';
import { AppButton } from '../../components/ui/AppButton';
import { AppTextInput } from '../../components/ui/AppTextInput';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { CustomAlert } from '../../components/ui/CustomAlert';
import { RootStackParamList } from '../../types';
import {
  getUserProfile,
  updateUserProfile,
  uploadProfilePhoto,
  getProfilePhotos,
  selectProfilePhoto,
  deleteProfilePhotoItem,
  regenerateAlignedKey,
  updateUserKeySettings,
  sendAlignmentRequest,
  breakAlignment,
  deleteAccount,
  getPartnerProfile,
} from '../../services/userApi';
import { signoutUser, getMe } from '../../services/authApi';
import api from '../../services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { ImageCropModal } from '../../components/ui/ImageCropModal';
import { useModeSwitcher } from '../../hooks/useModeSwitcher';

let CameraView: any = null;
let useCameraPermissions: any = () => [null, async () => {}];
if (Platform.OS !== "web") {
  const ExpoCamera = require("expo-camera");
  CameraView = ExpoCamera.CameraView;
  useCameraPermissions = ExpoCamera.useCameraPermissions;
}

type Nav = StackNavigationProp<RootStackParamList>;

const API_BASE = process.env.EXPO_PUBLIC_BACKEND_URL;

export const AlignedProfileScreen: React.FC = () => {
  const nav = useNavigation<Nav>();
  const { switchToVibeCheck } = useModeSwitcher();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const qrSize = Math.min(Math.round(windowWidth * 0.48), Math.round(windowHeight * 0.20), 180);

  const [user, setUser] = useState<any>(null);
  const [partner, setPartner] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Edit details state
  const [editSheet, setEditSheet] = useState(false);
  const [editName, setEditName] = useState('');
  const [editGender, setEditGender] = useState('Not to say');
  const [isGenderExpanded, setIsGenderExpanded] = useState(false);
  const [saving, setSaving] = useState(false);

  // QR state
  const qrRef = React.useRef<any>(null);
  const [qrSheet, setQrSheet] = useState(false);

  // Picture state
  const [pictureSheet, setPictureSheet] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [picturesGallery, setPicturesGallery] = useState<any[]>([]);
  const [selectedRawImageUri, setSelectedRawImageUri] = useState<string | null>(null);
  const [isCropModalOpen, setIsCropModalOpen] = useState(false);

  // Connect state
  const [connectKey, setConnectKey] = useState('');
  const [connecting, setConnecting] = useState(false);

  // Scanner state
  const [scannerSheet, setScannerSheet] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();

  // Sign out confirmation
  const [signoutSheet, setSignoutSheet] = useState(false);

  // Break alignment confirmation
  const [breakSheet, setBreakSheet] = useState(false);
  const [breakPassword, setBreakPassword] = useState('');
  const [breaking, setBreaking] = useState(false);

  // Delete account confirmation
  const [deleteSheet, setDeleteSheet] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleting, setDeleting] = useState(false);

  const fetchUserData = async () => {
    try {
      setLoading(true);
      const [meRes, profileRes, partnerRes] = await Promise.all([
        getMe().catch(() => null),
        getUserProfile().catch(() => null),
        getPartnerProfile().catch(() => ({ success: false, data: null })),
      ]);

      const mergedUser = {
        ...(meRes || {}),
        ...(profileRes?.data || {}),
      };
      setUser(mergedUser);
      setEditName(mergedUser.name || '');
      setEditGender(mergedUser.gender || 'Not to say');

      if (partnerRes && partnerRes.success && partnerRes.data) {
        setPartner(partnerRes.data);
      } else {
        setPartner(null);
      }

      try {
        const galleryRes = await getProfilePhotos();
        if (galleryRes && galleryRes.data && galleryRes.data.photos) {
          setPicturesGallery(galleryRes.data.photos);
        }
      } catch (gErr) {
        console.log('Error fetching profile photos:', gErr);
      }
    } catch (error) {
      console.log('Error fetching user profile:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUserData();
    const sub = DeviceEventEmitter.addListener('REFRESH_ALIGNED_DATA', fetchUserData);
    return () => sub.remove();
  }, []);

  const getImageUrl = (path: string | null | undefined) => {
    if (!path) return null;
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    const baseUrl = api.defaults.baseURL?.replace('/api/v1', '') || API_BASE || '';
    const cleanPath = path.replace(/\\/g, '/').replace(/^\//, '');
    return `${baseUrl}/${cleanPath}`;
  };

  const profilePictureUrl = getImageUrl(user?.profile_photo_url);

  // ─── Handlers ──────────────────────────────────────────────

  const handleUpdateDetails = async () => {
    if (!editName.trim()) {
      CustomAlert.alert('Missing Name', 'Please enter a name.');
      return;
    }
    try {
      setSaving(true);
      await updateUserProfile({
        name: editName.trim(),
        gender: editGender,
      });
      setUser((prev: any) => ({
        ...prev,
        name: editName.trim(),
        gender: editGender,
      }));
      setEditSheet(false);
      DeviceEventEmitter.emit('REFRESH_ALIGNED_DATA');
      CustomAlert.alert('Updated', 'Your profile details have been updated.');
    } catch (error: any) {
      const msg = error.response?.data?.detail || error.message || 'Failed to update profile.';
      CustomAlert.alert('Error', msg);
    } finally {
      setSaving(false);
    }
  };

  const handlePickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.95,
    });

    if (!result.canceled && result.assets && result.assets[0]) {
      setSelectedRawImageUri(result.assets[0].uri);
      setIsCropModalOpen(true);
    }
  };

  const handleCropConfirmed = async (croppedUri: string) => {
    try {
      setUploading(true);
      await uploadProfilePhoto(croppedUri);
      await fetchUserData();
      DeviceEventEmitter.emit('REFRESH_ALIGNED_DATA');
      CustomAlert.alert('Uploaded', 'Profile photo updated successfully.');
    } catch (error: any) {
      const msg = error.response?.data?.detail || error.message || 'Upload failed.';
      CustomAlert.alert('Error', msg);
    } finally {
      setUploading(false);
    }
  };

  const handleSelectPhoto = async (photoId: string) => {
    try {
      setUploading(true);
      await selectProfilePhoto(photoId);
      await fetchUserData();
      DeviceEventEmitter.emit('REFRESH_ALIGNED_DATA');
    } catch (error: any) {
      const msg = error.response?.data?.detail || error.message || 'Could not select photo.';
      CustomAlert.alert('Error', msg);
    } finally {
      setUploading(false);
    }
  };

  const handleDeletePhotoItem = async (photoId: string) => {
    CustomAlert.alert(
      'Delete Photo',
      'Are you sure you want to delete this profile photo from your history?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setUploading(true);
              await deleteProfilePhotoItem(photoId);
              await fetchUserData();
              DeviceEventEmitter.emit('REFRESH_ALIGNED_DATA');
            } catch (error: any) {
              const msg = error.response?.data?.detail || error.message || 'Failed to delete photo.';
              CustomAlert.alert('Error', msg);
            } finally {
              setUploading(false);
            }
          },
        },
      ]
    );
  };

  const handleCopyKey = async () => {
    if (!user?.secret_key) return;
    await Clipboard.setStringAsync(user.secret_key);
    CustomAlert.alert('Copied', 'Aligned Key copied to clipboard.');
  };

  const handleToggleSecretKey = async (value: boolean) => {
    try {
      await updateUserKeySettings({ secret_key_enabled: value });
      setUser((prev: any) => ({ ...prev, secret_key_enabled: value }));
    } catch (error: any) {
      const msg = error.response?.data?.detail || error.message || 'Failed to update key settings.';
      CustomAlert.alert('Error', msg);
    }
  };

  const handleRegenerateKey = async () => {
    const doRegenerate = async () => {
      try {
        const result = await regenerateAlignedKey();
        setUser((prev: any) => ({ ...prev, secret_key: result.secret_key, secret_key_enabled: true }));
        DeviceEventEmitter.emit('REFRESH_ALIGNED_DATA');
        CustomAlert.alert('Done', result.message || 'New Aligned Key generated.');
      } catch (error: any) {
        const msg = error.response?.data?.detail || error.message || 'Failed to regenerate key.';
        CustomAlert.alert('Error', msg);
      }
    };

    CustomAlert.alert(
      'Regenerate Key?',
      'Your current Aligned Key will stop working. Anyone trying to connect with the old key won\'t be able to.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Regenerate', onPress: doRegenerate },
      ]
    );
  };

  const handleConnect = async (keyToUse?: string | any) => {
    const finalKey = (typeof keyToUse === 'string' ? keyToUse : connectKey).trim().toUpperCase();
    if (!finalKey) {
      CustomAlert.alert('Missing Key', 'Please enter a partner\'s Aligned Key.');
      return;
    }
    try {
      setConnecting(true);
      const res = await sendAlignmentRequest(finalKey);
      setConnectKey('');
      DeviceEventEmitter.emit('REFRESH_ALIGNED_DATA');
      CustomAlert.alert('Request Sent', `Alignment request sent to ${res.data?.receiver_name || "your partner"}. Waiting for approval!`);
    } catch (error: any) {
      const msg = error.response?.data?.detail || error.message || 'Failed to send request.';
      CustomAlert.alert('Error', msg);
    } finally {
      setConnecting(false);
    }
  };

  const handleBarcodeScanned = ({ type, data }: { type: string; data: string }) => {
    setScannerSheet(false);
    setConnectKey(data);
    setTimeout(() => {
      handleConnect(data);
    }, 500);
  };

  const handleDownloadQR = () => {
    if (qrRef.current && user?.secret_key) {
      qrRef.current.toDataURL(async (data: string) => {
        try {
          if (Platform.OS === 'web') {
            fetch(`data:image/png;base64,${data}`)
              .then(res => res.blob())
              .then(blob => {
                const url = window.URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `AlignedKey-${user.secret_key}.png`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                window.URL.revokeObjectURL(url);
              })
              .catch(() => CustomAlert.alert('Error', 'Failed to download QR code.'));
          } else {
            CustomAlert.alert('Notice', 'Mobile download is saved to your gallery.');
          }
        } catch (e: any) {
          CustomAlert.alert('Error', 'Failed to save or share QR code.');
        }
      });
    }
  };

  const handleBreakAlignment = async () => {
    if (!breakPassword) {
      CustomAlert.alert('Missing Password', 'Please enter your account password to confirm.');
      return;
    }
    try {
      setBreaking(true);
      await breakAlignment(breakPassword);
      setBreakSheet(false);
      setBreakPassword('');
      DeviceEventEmitter.emit('REFRESH_ALIGNED_DATA');
      CustomAlert.alert('Alignment Broken', 'You have successfully unaligned with your partner.');
    } catch (error: any) {
      const msg = error.response?.data?.detail || error.message || 'Failed to break alignment.';
      CustomAlert.alert('Error', msg);
    } finally {
      setBreaking(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!deletePassword) {
      CustomAlert.alert('Missing Password', 'Please enter your account password to confirm deletion.');
      return;
    }
    try {
      setDeleting(true);
      await deleteAccount(deletePassword);
      setDeleteSheet(false);
      setDeletePassword('');
      await AsyncStorage.multiRemove(['access_token', 'refresh_token']);
      nav.reset({ index: 0, routes: [{ name: 'ModeSelector' }] });
    } catch (error: any) {
      const msg = error.response?.data?.detail || error.message || 'Failed to delete account.';
      CustomAlert.alert('Error', msg);
    } finally {
      setDeleting(false);
    }
  };

  const performSignout = async (route: 'ModeSelector' | 'Login') => {
    try {
      setLoading(true);
      await signoutUser().catch(() => {});
      await AsyncStorage.multiRemove(['access_token', 'refresh_token']);
      nav.reset({ index: 0, routes: [{ name: route }] });
    } catch (e) {
      CustomAlert.alert('Error', 'Failed to sign out locally.');
      setLoading(false);
    }
  };

  // ─── Render ────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={Colors.accent} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  const galleryItems = picturesGallery.length > 0 
    ? picturesGallery 
    : user?.profile_photo_url 
    ? [{ id: 'active', url: user.profile_photo_url, is_active: true }]
    : [];

  const isConnected = !!partner || !!user?.is_aligned || !!user?.partner;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => nav.goBack()}>
            <AppText variant="mono" color={Colors.accent} style={{ fontSize: 12 }}>
              ← BACK
            </AppText>
          </Pressable>
          <AppText variant="smallCaps" color={Colors.muted}>PROFILE</AppText>
        </View>

        {/* Profile Picture Section */}
        <View style={styles.avatarSection}>
          <Pressable onPress={() => setPictureSheet(true)}>
            {profilePictureUrl ? (
              <Image source={{ uri: profilePictureUrl }} style={styles.avatarLarge} />
            ) : (
              <View style={styles.avatarLargePlaceholder}>
                <AppText style={{ color: '#fff', fontSize: 42, fontWeight: '600' }}>
                  {user?.name?.charAt(0).toUpperCase() || 'U'}
                </AppText>
              </View>
            )}
            <View style={styles.editBadge}>
              <AppText style={{ color: '#fff', fontSize: 12 }}>✎</AppText>
            </View>
          </Pressable>

          <AppText variant="display" size={32} style={{ marginTop: 16, lineHeight: 34 }}>
            {user?.name || 'User'}
          </AppText>
          <AppText variant="mono" color={Colors.muted} style={{ fontSize: 11, marginTop: 4 }}>
            MEMBER SINCE {user?.created_at ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }).toUpperCase() : 'JUL 2026'}
          </AppText>
        </View>

        <View style={styles.inner}>
          {/* Key cards only shown when NOT connected */}
          {!isConnected && (
            <>
              {/* Aligned Key Card */}
              <View style={[styles.keyCard, user?.secret_key_enabled === false && { opacity: 0.6 }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <AppText variant="smallCaps" color={Colors.muted}>
                    YOUR ALIGNED KEY
                  </AppText>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <AppText size={12} color={Colors.muted}>
                      {user?.secret_key_enabled === false ? 'Disabled' : 'Enabled'}
                    </AppText>
                    <Switch 
                      value={user?.secret_key_enabled !== false} 
                      onValueChange={handleToggleSecretKey} 
                      trackColor={{ false: '#333', true: Colors.accent }}
                      thumbColor={Colors.bone}
                      style={{ transform: [{ scale: 0.7 }] }}
                    />
                  </View>
                </View>
                
                <AppText variant="display" size={22} color={Colors.accent} style={{ letterSpacing: 2, textDecorationLine: user?.secret_key_enabled === false ? 'line-through' : 'none' }}>
                  {user?.secret_key || 'ALIGNED-KEY'}
                </AppText>
                <AppText variant="serifItalic" size={13} color={Colors.muted} style={{ marginTop: 8, lineHeight: 20 }}>
                  {user?.secret_key_enabled === false 
                    ? "Your Aligned Key is disabled. No one can use it to connect with you."
                    : "Share this key with your partner so they can align with you."}
                </AppText>
                <View style={{ flexDirection: 'row', gap: 6, marginTop: 14 }}>
                  <AppButton variant="solid" size="sm" style={{ flex: 1, backgroundColor: '#1C1C1E', paddingHorizontal: 4 }} textStyle={{ fontSize: 9.5 }} onPress={handleCopyKey} disabled={user?.secret_key_enabled === false}>
                    COPY KEY
                  </AppButton>
                  <AppButton variant="outline" size="sm" style={{ flex: 1, paddingHorizontal: 4 }} textStyle={{ fontSize: 9.5 }} onPress={() => setQrSheet(true)} disabled={user?.secret_key_enabled === false}>
                    SHOW QR
                  </AppButton>
                  <AppButton variant="outline" size="sm" style={{ flex: 1, paddingHorizontal: 4 }} textStyle={{ fontSize: 9.5 }} onPress={handleRegenerateKey} disabled={user?.secret_key_enabled === false}>
                    REGENERATE
                  </AppButton>
                </View>
              </View>

              {/* Connect with Aligned Key Card */}
              <View style={[styles.keyCard, { marginTop: 16 }]}>
                <AppText variant="smallCaps" color={Colors.muted} style={{ marginBottom: 8 }}>
                  CONNECT WITH KEY
                </AppText>
                <AppTextInput
                  label="Enter a partner's Aligned Key"
                  n="01"
                  value={connectKey}
                  onChangeText={setConnectKey}
                  placeholder="e.g. ALIGNED-k7d2x"
                  autoCapitalize="none"
                />
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
                  <AppButton variant="solid" size="sm" style={{ flex: 1, backgroundColor: Colors.accent }} onPress={handleConnect} disabled={connecting}>
                    {connecting ? "SENDING..." : "SEND REQUEST"}
                  </AppButton>
                  <AppButton variant="outline" size="sm" style={{ flex: 1 }} onPress={() => setScannerSheet(true)}>
                    SCAN QR
                  </AppButton>
                </View>
              </View>
            </>
          )}

          {/* Actions */}
          <AppText variant="smallCaps" color={Colors.ink2} style={{ marginBottom: 12, marginTop: isConnected ? 8 : 24 }}>
            MANAGE
          </AppText>

          <Pressable
            style={styles.menuItem}
            onPress={() => setEditSheet(true)}
          >
            <View>
              <AppText variant="heading" size={17}>Edit name & details</AppText>
              <AppText variant="mono" color={Colors.muted} style={{ fontSize: 10, marginTop: 2 }}>
                CURRENTLY: {user?.name?.toUpperCase() || 'USER'} · {user?.gender?.toUpperCase() || 'NOT SPECIFIED'}
              </AppText>
            </View>
            <AppText color={Colors.accent}>→</AppText>
          </Pressable>

          <Pressable style={styles.menuItem} onPress={() => setPictureSheet(true)}>
            <View>
              <AppText variant="heading" size={17}>Profile picture</AppText>
              <AppText variant="mono" color={Colors.muted} style={{ fontSize: 10, marginTop: 2 }}>
                {profilePictureUrl ? `MANAGE PHOTOS (${galleryItems.length})` : 'ADD A PHOTO'}
              </AppText>
            </View>
            <AppText color={Colors.accent}>→</AppText>
          </Pressable>

          {/* Mode Switch Card */}
          <Pressable
            style={styles.blackCard}
            onPress={() => switchToVibeCheck('up')}
          >
            <View>
              <AppText variant="display" size={20} color={Colors.bone}>
                Flip to vibe check.
              </AppText>
              <AppText variant="mono" size={11} color={Colors.muted} style={{ marginTop: 4 }}>
                The other side — for figuring it out
              </AppText>
            </View>
            <AppText color={Colors.accent} size={18}>→</AppText>
          </Pressable>

          <Pressable style={styles.menuItem} onPress={() => setSignoutSheet(true)}>
            <View>
              <AppText variant="heading" size={17}>Sign out</AppText>
              <AppText variant="mono" color={Colors.muted} style={{ fontSize: 10, marginTop: 2 }}>
                LOG OUT OF YOUR ACCOUNT
              </AppText>
            </View>
            <AppText color={Colors.accent}>→</AppText>
          </Pressable>

          {/* Legal */}
          <AppText variant="smallCaps" color={Colors.ink2} style={{ marginBottom: 12, marginTop: 16 }}>
            LEGAL
          </AppText>

          <Pressable style={styles.menuItem} onPress={() => nav.navigate('Legal', { type: 'privacy' })}>
            <View>
              <AppText variant="heading" size={17}>Privacy Policy</AppText>
              <AppText variant="mono" color={Colors.muted} style={{ fontSize: 10, marginTop: 2 }}>
                HOW WE PROTECT YOUR DATA
              </AppText>
            </View>
            <AppText color={Colors.accent}>→</AppText>
          </Pressable>

          <Pressable style={styles.menuItem} onPress={() => nav.navigate('Report')}>
            <View>
              <AppText variant="heading" size={17}>Report an Issue</AppText>
              <AppText variant="mono" color={Colors.muted} style={{ fontSize: 10, marginTop: 2 }}>
                TICKETS & FEEDBACK
              </AppText>
            </View>
            <AppText color={Colors.accent}>→</AppText>
          </Pressable>

          <Pressable style={styles.menuItem} onPress={() => nav.navigate('Legal', { type: 'terms' })}>
            <View>
              <AppText variant="heading" size={17}>Terms of Conditions</AppText>
              <AppText variant="mono" color={Colors.muted} style={{ fontSize: 10, marginTop: 2 }}>
                OUR RULES & AGREEMENTS
              </AppText>
            </View>
            <AppText color={Colors.accent}>→</AppText>
          </Pressable>

          {/* Danger Zone */}
          <AppText variant="smallCaps" color={Colors.accent} style={{ marginBottom: 12, marginTop: 16 }}>
            DANGER ZONE
          </AppText>

          {isConnected && (
            <Pressable style={styles.warningCard} onPress={() => setBreakSheet(true)}>
              <AppText variant="heading" size={17} color={Colors.accent}>
                Break Alignment
              </AppText>
              <AppText variant="mono" color={Colors.muted} style={{ fontSize: 10, marginTop: 4 }}>
                UNPAIR FROM YOUR CURRENT PARTNER
              </AppText>
            </Pressable>
          )}

          <Pressable style={styles.warningCard} onPress={() => setDeleteSheet(true)}>
            <AppText variant="heading" size={17} color={Colors.accent}>
              Delete Account
            </AppText>
            <AppText variant="mono" color={Colors.muted} style={{ fontSize: 10, marginTop: 4 }}>
              PERMANENTLY REMOVE YOUR PROFILE & ALL DATA
            </AppText>
          </Pressable>
        </View>
      </ScrollView>

      {/* ==================== EDIT NAME & DETAILS SHEET ==================== */}
      <BottomSheet
        open={editSheet}
        onClose={() => setEditSheet(false)}
        kicker="DETAILS"
        title="Edit Profile"
      >
        <View style={{ gap: 16, paddingVertical: 8 }}>
          <AppTextInput
            label="Your name"
            n="01"
            value={editName}
            onChangeText={setEditName}
            placeholder="Your name"
          />

          <View>
            <Pressable 
              onPress={() => setIsGenderExpanded(!isGenderExpanded)}
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: Colors.bone,
                borderWidth: 1,
                borderColor: Colors.rule,
                borderRadius: 12,
                padding: 16,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <AppText variant="smallCaps" color={Colors.muted}>02 GENDER</AppText>
                <View style={{ width: 1, height: 14, backgroundColor: Colors.rule }} />
                <AppText variant="serif" size={15} color={Colors.ink}>{editGender}</AppText>
              </View>
              <Ionicons name={isGenderExpanded ? "chevron-up" : "chevron-down"} size={16} color={Colors.muted} />
            </Pressable>

            {isGenderExpanded && (
              <View style={{
                marginTop: 8,
                backgroundColor: '#FAF9F6',
                borderWidth: 1,
                borderColor: Colors.rule,
                borderRadius: 12,
                overflow: 'hidden'
              }}>
                {['Male', 'Female', 'Non-binary', 'Not to say'].map((g, idx, arr) => (
                  <Pressable
                    key={g}
                    onPress={() => {
                      setEditGender(g);
                      setIsGenderExpanded(false);
                    }}
                    style={{
                      paddingVertical: 14,
                      paddingHorizontal: 16,
                      borderBottomWidth: idx === arr.length - 1 ? 0 : 1,
                      borderBottomColor: Colors.rule,
                      backgroundColor: editGender === g ? '#EFECE6' : 'transparent',
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <AppText variant="serif" size={15} color={editGender === g ? Colors.accent : Colors.ink}>
                      {g}
                    </AppText>
                    {editGender === g && <Ionicons name="checkmark" size={16} color={Colors.accent} />}
                  </Pressable>
                ))}
              </View>
            )}
          </View>

          <AppButton
            variant="solid"
            size="lg"
            onPress={handleUpdateDetails}
            disabled={saving}
            style={{ width: '100%', marginTop: 8 }}
          >
            {saving ? 'Saving...' : 'Save Profile →'}
          </AppButton>
        </View>
      </BottomSheet>

      {/* ==================== PICTURE SHEET ==================== */}
      <BottomSheet
        open={pictureSheet}
        onClose={() => setPictureSheet(false)}
        kicker="PHOTOS"
        title="Profile Picture"
      >
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={{ alignItems: 'center', paddingVertical: 12 }}>
            {profilePictureUrl ? (
              <Image source={{ uri: profilePictureUrl }} style={[styles.avatarLarge, { width: 100, height: 100, borderRadius: 50 }]} />
            ) : (
              <View style={[styles.avatarLargePlaceholder, { width: 100, height: 100, borderRadius: 50 }]}>
                <AppText style={{ color: '#fff', fontSize: 44, fontWeight: '600' }}>
                  {user?.name?.charAt(0).toUpperCase() || 'U'}
                </AppText>
              </View>
            )}
          </View>

          <View style={{ gap: 10, paddingVertical: 8 }}>
            <AppButton
              variant="solid"
              size="md"
              onPress={handlePickImage}
              disabled={uploading}
              style={{ width: '100%', backgroundColor: Colors.accent }}
            >
              {uploading ? 'Uploading...' : '+ Upload New Photo'}
            </AppButton>
          </View>

          {/* Photo History Gallery */}
          {picturesGallery.length > 0 && (
            <View style={{ marginTop: 24 }}>
              <AppText variant="smallCaps" color={Colors.muted} style={{ marginBottom: 12 }}>
                PHOTO HISTORY ({picturesGallery.length})
              </AppText>

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                {picturesGallery.map((item) => {
                  const rawPath = item.url || item.photo_url;
                  const url = getImageUrl(rawPath);
                  const isCurrent = item.is_active || (rawPath && user?.profile_photo_url && (
                    rawPath === user.profile_photo_url || 
                    rawPath.endsWith(user.profile_photo_url) || 
                    user.profile_photo_url.endsWith(rawPath)
                  ));

                  return (
                    <View key={item.id} style={{ width: '30%', position: 'relative' }}>
                      <Pressable
                        onPress={() => !isCurrent && handleSelectPhoto(item.id)}
                        style={{
                          borderRadius: 12,
                          overflow: 'hidden',
                          borderWidth: isCurrent ? 2 : 1,
                          borderColor: isCurrent ? Colors.accent : Colors.rule,
                          backgroundColor: Colors.bone,
                        }}
                      >
                        {url ? (
                          <Image source={{ uri: url }} style={{ width: '100%', aspectRatio: 1 }} />
                        ) : (
                          <View style={{ width: '100%', aspectRatio: 1, backgroundColor: Colors.bone }} />
                        )}
                      </Pressable>

                      {isCurrent ? (
                        <View style={{
                          position: 'absolute',
                          bottom: 4,
                          left: 4,
                          right: 4,
                          backgroundColor: 'rgba(196,77,77,0.85)',
                          borderRadius: 4,
                          paddingVertical: 2,
                        }}>
                          <AppText style={{ color: '#fff', fontSize: 8, textAlign: 'center', fontWeight: 'bold' }}>
                            ACTIVE
                          </AppText>
                        </View>
                      ) : (
                        <Pressable
                          onPress={() => handleDeletePhotoItem(item.id)}
                          style={{
                            position: 'absolute',
                            top: 4,
                            right: 4,
                            backgroundColor: 'rgba(0,0,0,0.6)',
                            width: 22,
                            height: 22,
                            borderRadius: 11,
                            justifyContent: 'center',
                            alignItems: 'center',
                          }}
                        >
                          <Ionicons name="trash-outline" size={12} color="#fff" />
                        </Pressable>
                      )}
                    </View>
                  );
                })}
              </View>
            </View>
          )}
        </ScrollView>
      </BottomSheet>

      {/* ==================== QR CODE SHEET ==================== */}
      <BottomSheet
        open={qrSheet}
        onClose={() => setQrSheet(false)}
        kicker="SHARE"
        title="Your Aligned Key"
      >
        <View style={{ alignItems: 'center', paddingVertical: 10 }}>
          <View style={styles.qrContainer}>
            {user?.secret_key && QRCode ? (
              <QRCode
                value={user.secret_key}
                size={qrSize}
                color={Colors.ink}
                backgroundColor={Colors.bone}
                getRef={(c: any) => (qrRef.current = c)}
              />
            ) : null}
          </View>
          <AppText variant="display" size={22} color={Colors.accent} style={{ marginTop: 14, letterSpacing: 2 }}>
            {user?.secret_key}
          </AppText>
          <AppButton variant="outline" size="sm" onPress={handleDownloadQR} style={{ marginTop: 12 }}>
            SAVE QR CODE
          </AppButton>
          <AppText variant="serifItalic" size={13} color={Colors.muted} style={{ marginTop: 10, textAlign: 'center' }}>
            Have your partner scan this code to align with you instantly.
          </AppText>
        </View>
      </BottomSheet>

      {/* ==================== FULL SCREEN SCANNER MODAL ==================== */}
      <Modal
        visible={scannerSheet}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setScannerSheet(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 20, zIndex: 10 }}>
            <AppText variant="heading" size={20} color="#fff">Scan Aligned QR</AppText>
            <Pressable onPress={() => setScannerSheet(false)} style={{ padding: 4 }}>
              <Ionicons name="close" size={28} color="#fff" />
            </Pressable>
          </View>

          {CameraView && permission?.granted ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <CameraView
                style={StyleSheet.absoluteFillObject}
                barcodeScannerSettings={{
                  barcodeTypes: ["qr"],
                }}
                onBarcodeScanned={handleBarcodeScanned}
              />
              <View style={styles.scannerFrame} />
              <AppText variant="serifItalic" size={16} color="#fff" style={{ marginTop: 24, textAlign: 'center' }}>
                Point your camera at your partner's QR code
              </AppText>
            </View>
          ) : (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
              <AppText variant="serifItalic" size={16} color="#fff" style={{ textAlign: 'center', marginBottom: 20 }}>
                We need camera permission to scan QR codes.
              </AppText>
              <AppButton variant="solid" size="md" onPress={requestPermission}>
                Grant Permission
              </AppButton>
            </View>
          )}
        </SafeAreaView>
      </Modal>

      {/* ==================== SIGN OUT SHEET ==================== */}
      <BottomSheet
        open={signoutSheet}
        onClose={() => setSignoutSheet(false)}
        kicker="ACCOUNT"
        title="Sign Out"
      >
        <View style={{ paddingVertical: 12 }}>
          <AppText variant="serifItalic" size={15} color={Colors.muted} style={{ marginBottom: 24, lineHeight: 22 }}>
            Choose how you would like to exit.
          </AppText>
          <View style={{ gap: 12 }}>
            <AppButton
              variant="outline"
              size="lg"
              onPress={() => {
                setSignoutSheet(false);
                performSignout('ModeSelector');
              }}
              style={{ width: '100%' }}
            >
              Switch Mode (Keep Saved)
            </AppButton>
            <AppButton
              variant="solid"
              size="lg"
              onPress={() => {
                setSignoutSheet(false);
                performSignout('Login');
              }}
              style={{ width: '100%', backgroundColor: Colors.accent }}
            >
              Log Out Completely →
            </AppButton>
          </View>
        </View>
      </BottomSheet>

      {/* ==================== BREAK ALIGNMENT SHEET ==================== */}
      <BottomSheet
        open={breakSheet}
        onClose={() => {
          setBreakSheet(false);
          setBreakPassword('');
        }}
        kicker="DANGER"
        title="Break Alignment"
      >
        <View style={{ paddingVertical: 8, gap: 16 }}>
          <AppText variant="serifItalic" size={14} color={Colors.muted} style={{ lineHeight: 20 }}>
            This will disconnect your profile from your partner. To proceed, please confirm your password:
          </AppText>
          <AppTextInput
            label="Account password"
            n="01"
            value={breakPassword}
            onChangeText={setBreakPassword}
            placeholder="••••••••"
            isPassword
          />
          <AppButton
            variant="solid"
            size="lg"
            onPress={handleBreakAlignment}
            disabled={breaking}
            style={{ width: '100%', backgroundColor: Colors.accent, marginTop: 8 }}
          >
            {breaking ? 'Breaking...' : 'Confirm Break Alignment →'}
          </AppButton>
        </View>
      </BottomSheet>

      {/* ==================== DELETE ACCOUNT SHEET ==================== */}
      <BottomSheet
        open={deleteSheet}
        onClose={() => {
          setDeleteSheet(false);
          setDeletePassword('');
        }}
        kicker="PERMANENT ACTION"
        title="Delete Account"
      >
        <View style={{ paddingVertical: 8, gap: 16 }}>
          <AppText variant="serifItalic" size={14} color={Colors.accent} style={{ lineHeight: 20 }}>
            This will permanently delete your account, relationship data, and all photos. This action CANNOT be undone.
          </AppText>
          <AppTextInput
            label="Account password"
            n="01"
            value={deletePassword}
            onChangeText={setDeletePassword}
            placeholder="••••••••"
            isPassword
          />
          <AppButton
            variant="solid"
            size="lg"
            onPress={handleDeleteAccount}
            disabled={deleting}
            style={{ width: '100%', backgroundColor: Colors.accent, marginTop: 8 }}
          >
            {deleting ? 'Deleting...' : 'Permanently Delete Account →'}
          </AppButton>
        </View>
      </BottomSheet>

      {/* ==================== IMAGE CROP MODAL ==================== */}
      <ImageCropModal
        visible={isCropModalOpen}
        imageUri={selectedRawImageUri}
        onClose={() => {
          setIsCropModalOpen(false);
          setSelectedRawImageUri(null);
        }}
        onConfirm={handleCropConfirmed}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.bone,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
  },
  avatarSection: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  avatarLarge: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 2,
    borderColor: Colors.accent,
  },
  avatarLargePlaceholder: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#1C1C1E',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.bone,
  },
  inner: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  keyCard: {
    backgroundColor: '#EAE2D4',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.rule,
  },
  menuItem: {
    backgroundColor: '#FAF9F6',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.rule,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  blackCard: {
    backgroundColor: '#1C1C1E',
    borderRadius: 14,
    padding: 18,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  warningCard: {
    backgroundColor: '#FAF9F6',
    padding: 16,
    borderRadius: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(196,77,77,0.3)',
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
  scannerFrame: {
    width: 220,
    height: 220,
    borderWidth: 2,
    borderColor: Colors.accent,
    borderRadius: 20,
  },
});

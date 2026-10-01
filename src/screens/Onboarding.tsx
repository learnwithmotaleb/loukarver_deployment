import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useState } from "react";
import { View, StyleSheet, Pressable, DeviceEventEmitter, useWindowDimensions, Platform, Keyboard, Alert, Image } from 'react-native';
import { KeyboardAwareScrollView, KeyboardStickyView } from 'react-native-keyboard-controller';
import { useNavigation } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import { Colors } from "../constants/colors";
import { AppText } from "../components/ui/AppText";
import { AppButton } from "../components/ui/AppButton";
import { AppTextInput } from "../components/ui/AppTextInput";
import { RootStackParamList } from "../types";
import { Calendar, DateData } from "react-native-calendars";
import { Ionicons } from "@expo/vector-icons";
import { createRelationship, uploadProfilePhoto, alignWithPartner, sendAlignmentRequest } from "../services/userApi";
import * as ImagePicker from "expo-image-picker";
import QRCode from 'react-native-qrcode-svg';
import { BottomSheet } from '../components/ui/BottomSheet';

type Nav = StackNavigationProp<RootStackParamList>;

interface FormData {
  name: string;
  city: string;
  startDate: string;
  longDistance: boolean;
  photoUri: string | null;
  gender: string;
}

export const Onboarding: React.FC = () => {
  const nav = useNavigation<Nav>();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const qrSize = Math.min(Math.round(windowWidth * 0.48), Math.round(windowHeight * 0.22), 180);
  const [step, setStep] = useState(0);
  const [data, setData] = useState<FormData>({
    name: "",
    city: "",
    startDate: "",
    longDistance: false,
    photoUri: null,
    gender: "Not to say",
  });

  // Real-time WebSocket Alignment Listener & QR Scanner Listener
  React.useEffect(() => {
    const sub = DeviceEventEmitter.addListener('ALIGNMENT_BONDED', (evtData) => {
      const partnerName = evtData?.partner_name || "your partner";
      Alert.alert("Aligned!", `You are now aligned with ${partnerName}!`);
      nav.navigate("AlignedApp");
    });
    const subQR = DeviceEventEmitter.addListener('QR_CODE_SCANNED', (scannedData) => {
      if (scannedData) {
        sendAlignmentRequest(scannedData).then(() => {
          Alert.alert("Request Sent", "Connection request sent to your partner. Waiting for their approval!");
          nav.navigate("AlignedApp");
        }).catch((e: any) => {
          console.log("Alignment failed", e);
          const msg = e.response?.data?.detail || e.message || "Failed to send request. Check the key and try again.";
          Alert.alert("Notice", msg);
        });
      }
    });
    return () => {
      sub.remove();
      subQR.remove();
    };
  }, [nav]);

  // Calendar States
  const [markedDayDate, setMarkedDayDate] = useState<string | null>(null);
  const [showMarkedCalendar, setShowMarkedCalendar] = useState(false);

  // API States
  const [secretKey, setSecretKey] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [qrSheet, setQrSheet] = useState(false);

  const formatDisplayDate = (dateString: string | null): string => {
    if (!dateString) return "mm/dd/yyyy";
    const [year, month, day] = dateString.split("-");
    return `${month}/${day}/${year}`;
  };

  const handleMarkedDayPress = (day: DateData) => {
    setMarkedDayDate(day.dateString);
    setShowMarkedCalendar(false);
    setData((d) => ({ ...d, startDate: day.dateString }));
  };



  const handleNext = async () => {
    if (steps[step].key === "photo") {
      if (!data.name || !data.city) {
        Alert.alert("Missing Fields", "Please fill out all the fields before continuing.");
        return;
      }
      setIsSubmitting(true);
      try {
        const today = new Date();
        const m = String(today.getMonth() + 1).padStart(2, '0');
        const d = String(today.getDate()).padStart(2, '0');
        const y = String(today.getFullYear());
        const formattedDate = `${m}.${d}.${y}`;
        const payload = {
          name: data.name,
          city_name: data.city,
          relationship_start_date: formattedDate,
          is_long_distance: data.longDistance,
          gender: data.gender,
        };
        const res = await createRelationship(payload);
        if (res.success && res.data && res.data.secret_key) {
          setSecretKey(res.data.secret_key);
        }
        if (data.photoUri) {
          try {
            await uploadProfilePhoto(data.photoUri);
          } catch (uploadError) {
            console.log("Photo upload failed:", uploadError);
            Alert.alert("Upload Warning", "Relationship created but photo upload failed.");
          }
        }
        Keyboard.dismiss();
        setStep((s) => s + 1);
      } catch (e: any) {
        console.error(e);
        const errorMessage = e.response?.data?.detail || e.message || "An error occurred.";
        Alert.alert("Error", errorMessage);
      } finally {
        setIsSubmitting(false);
      }
    } else if (step < steps.length - 1) {
      if (step === 1) {
        Keyboard.dismiss();
      }
      setStep((s) => s + 1);
    } else {
      DeviceEventEmitter.emit('REFRESH_ALIGNED_DATA');
      nav.navigate("AlignedApp");
    }
  };

  const steps = [
    {
      key: "name",
      kicker: "Question 01",
      title: "What shall we call you?",
      sub: "This is your name inside the journal.",
      body: (
        <AppTextInput
          label="First name"
          n="01"
          value={data.name}
          onChangeText={(v) => setData((d) => ({ ...d, name: v }))}
          placeholder="Lou"
          returnKeyType="next"
          onSubmitEditing={() => {
            if (data.name.trim()) {
              setStep(1);
            }
          }}
        />
      ),
    },
    {
      key: "city",
      kicker: "Question 02",
      title: "And your city?",
      sub: "For nearby date ideas and local context.",
      body: (
        <AppTextInput
          label="Current city"
          n="02"
          value={data.city}
          onChangeText={(v) => setData((d) => ({ ...d, city: v }))}
          placeholder="Los Angeles"
          returnKeyType="next"
          onSubmitEditing={() => {
            if (data.city.trim()) {
              Keyboard.dismiss();
              setStep(2);
            }
          }}
        />
      ),
    },
    {
      key: "gender",
      kicker: "Question 03",
      title: "How do you identify?",
      sub: "Used to tailor health insights for you.",
      body: (
        <View>
          {["Female", "Male", "Not to say"].map((g) => (
            <Pressable
              key={g}
              onPress={() => setData((d) => ({ ...d, gender: g }))}
              style={[
                styles.optionRow,
                { opacity: g === data.gender ? 1 : 0.6 },
              ]}
            >
              <View style={{ flex: 1 }}>
                <AppText variant="heading" size={18}>
                  {g}
                </AppText>
              </View>
              <AppText
                size={18}
                color={g === data.gender ? Colors.accent : Colors.rule}
              >
                {g === data.gender ? "●" : "○"}
              </AppText>
            </Pressable>
          ))}
        </View>
      ),
    },
    {
      key: "photo",
      kicker: "Question 04",
      title: "Add a Face to Your Name",
      sub: "Choose a profile photo. Optional but recommended.",
      body: (
        <View style={{ alignItems: "center", marginTop: 20 }}>
          <Pressable
            onPress={async () => {
              const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
              if (status !== 'granted') {
                Alert.alert('Sorry, we need camera roll permissions to make this work!');
                return;
              }
              const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsEditing: true,
                aspect: [1, 1],
                legacy: true,
                quality: 0.8,
              });
              if (!result.canceled && result.assets && result.assets.length > 0) {
                setData((d) => ({ ...d, photoUri: result.assets[0].uri }));
              }
            }}
            style={{
              width: 150,
              height: 150,
              borderRadius: 75,
              backgroundColor: Colors.rule,
              justifyContent: "center",
              alignItems: "center",
              overflow: "hidden",
            }}
          >
            {data.photoUri ? (
              <Image source={{ uri: data.photoUri }} style={{ width: 150, height: 150 }} />
            ) : (
              <Ionicons name="camera-outline" size={40} color={Colors.muted} />
            )}
          </Pressable>
        </View>
      ),
    },
    {
      key: "invitation",
      kicker: "INVITATION",
      title: "Invite your partner",
      sub: "One private space, two keys.",
      body: (
        <View>
          <View style={styles.keyBox}>
            <AppText
              variant="smallCaps"
              color={Colors.ink2}
              style={{marginTop:15}}
            >
              YOUR SHARED KEY
            </AppText>
            <AppText
              variant="display"
              style={{ fontSize: 25, color: Colors.accent, letterSpacing: 2 }}
            >
              {secretKey || "ALIGNED-CZXSAU"}
            </AppText>
          </View>

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
            <AppButton variant="outline" size="sm" style={{ flex: 1 }} onPress={() => setQrSheet(true)}>
              SHOW QR
            </AppButton>
            <AppButton variant="outline" size="sm" style={{ flex: 1 }} onPress={() => {
                nav.navigate('AlignedQRScanner');
            }}>
              SCAN QR
            </AppButton>
          </View>

          <AppText
            variant="serifItalic"
            size={14}
            color={Colors.muted}
            style={{ marginTop: 24, textAlign: "center" }}
          >
            Share this with your partner.{"\n"}
            They enter it on their device to join.
          </AppText>
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
            {/* Header */}
            <View style={styles.topBar}>
              <AppText variant="smallCaps" color={Colors.muted}>
                ◇ BEGINNING
              </AppText>
              <AppText variant="mono" color={Colors.light} style={{ fontSize: 10 }}>
                {String(step + 1).padStart(2, "0")} /{" "}
                {String(steps.length).padStart(2, "0")}
              </AppText>
            </View>

            {/* Step content */}
            <View style={styles.content}>
              <AppText
                variant="smallCaps"
                color={Colors.accent}
                style={{ marginBottom: 14 }}
              >
                {cur.kicker}
              </AppText>
              <AppText
                variant="display"
                size={42}
                style={{ lineHeight: 42, marginBottom: 14 }}
              >
                {cur.title}
              </AppText>
              <AppText
                variant="serifItalic"
                size={18}
                color={Colors.muted}
                style={{ marginBottom: 36, lineHeight: 27 }}
              >
                {cur.sub}
              </AppText>
              {cur.body}
            </View>
          </KeyboardAwareScrollView>

          {/* Sticky footer that moves with the keyboard */}
          <KeyboardStickyView offset={{ closed: 0, opened: 0 }}>
            <View style={styles.footer}>
              {/* Progress bars */}
              <View style={styles.progress}>
                {steps.map((_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.progressBar,
                      { backgroundColor: i <= step ? Colors.accent : Colors.rule },
                    ]}
                  />
                ))}
              </View>

              {/* Actions */}
              <View style={styles.actions}>
                {step > 0 && (
                  <AppButton
                    variant="outline"
                    size="lg"
                    onPress={() => {
                      Keyboard.dismiss();
                      setStep((s) => s - 1);
                    }}
                    style={{ flex: 1 }}
                  >
                    Back
                  </AppButton>
                )}
                <AppButton
                  variant="solid"
                  size="lg"
                  style={{ flex: step > 0 ? 2 : 1 }}
                  disabled={isSubmitting}
                  onPress={handleNext}
                >
                  {isSubmitting ? "Loading..." : step === steps.length - 1 ? "Enter →" : "Continue"}
                </AppButton>
              </View>
            </View>
          </KeyboardStickyView>
        </View>

      <BottomSheet
        open={qrSheet}
        onClose={() => setQrSheet(false)}
        kicker="QR CODE"
        title="Your Aligned Key"
      >
        <View style={{ alignItems: 'center', paddingVertical: 10 }}>
          {secretKey ? (
            <View style={{ padding: 12, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: Colors.rule }}>
              <QRCode value={secretKey} size={qrSize} />
            </View>
          ) : (
            <AppText color={Colors.muted}>Loading...</AppText>
          )}
          <AppText variant="serifItalic" size={14} color={Colors.muted} style={{ marginTop: 12, textAlign: 'center' }}>
            Have your partner scan this to align with you.
          </AppText>
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
  scrollContent: {
    flexGrow: 1,
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: 40,
  },
  content: { flex: 1 },
  footer: { paddingTop: 16, paddingBottom: 20 },
  datePickerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: Colors.rule,
    paddingVertical: 1,
  },
  calendarWrapper: {
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.rule,
    overflow: "hidden",
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: Colors.rule,
    gap: 12,
  },
  keyBox: {
    borderWidth: 1,
    borderColor: Colors.accent,
    padding: 20,
    alignItems: "center",
    marginTop: 4,
  },
  progress: { flexDirection: "row", gap: 4, marginBottom: 18 },
  progressBar: { flex: 1, height: 2, borderRadius: 1 },
  actions: { flexDirection: "row", gap: 10 },
});

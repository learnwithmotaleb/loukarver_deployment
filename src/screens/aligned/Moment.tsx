import React, { useState, useEffect, useRef } from "react";
import { View, StyleSheet, Pressable, ScrollView, Alert, DeviceEventEmitter, Linking } from "react-native";
import { Colors } from "../../constants/colors";
import { AppText } from "@/components/ui/AppText";
import { AppButton } from "@/components/ui/AppButton";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { AppTextInput } from "@/components/ui/AppTextInput";
import { Calendar, DateData } from "react-native-calendars";
import { Ionicons } from "@expo/vector-icons";
import Confidential from "./Confidential";
import { pokePartner, getInteractions } from "../../services/interactionsApi";
import { createWatchSession, getWatchSessions, acceptWatchSession, setReadyWatchSession, triggerPlayWatchSession, deleteWatchSession } from "../../services/watchApi";
import { triggerNotification } from "../../services/notificationApi";
import { getMe } from "../../services/authApi";

const PLATFORMS = [
  { name: "NETFLIX", color: "#E50914" },
  { name: "HULU", color: "#1DB954" },
  { name: "MAX", color: "#0033A0" },
  { name: "PRIME", color: "#00A8E1" },
  { name: "APPLE TV", color: "#000000" },
  { name: "YOUTUBE", color: "#FF0000" },
];

const Moment: React.FC = () => {
  const [thinkingSent, setThinkingSent] = useState(false);
  const [interactionStats, setInteractionStats] = useState<any | null>(null);
  const [activeSheet, setActiveSheet] = useState<"watchTogether" | null>(null);
  const [isAligned, setIsAligned] = useState<boolean>(true);

  // Watch state
  const [watchPlatform, setWatchPlatform] = useState("APPLE TV");
  const [watchWhat, setWatchWhat] = useState("");
  const [watchLink, setWatchLink] = useState("");
  const [watchTime, setWatchTime] = useState("09:00 PM");
  const [watchDate, setWatchDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [showWatchCalendar, setShowWatchCalendar] = useState(false);

  const [activeSession, setActiveSession] = useState<any | null>(null);
  const [timeLeft, setTimeLeft] = useState<string | null>(null);
  
  const autoLaunchRef = useRef<string | null>(null);

  // Magic auto-launch listener
  useEffect(() => {
    if (activeSession?.is_playing && activeSession?.link) {
      if (autoLaunchRef.current !== activeSession.id) {
        autoLaunchRef.current = activeSession.id;
        try { Linking.openURL(activeSession.link); } catch (e) { console.log(e); }
      }
    }
  }, [activeSession?.is_playing, activeSession?.id, activeSession?.link]);

  const fetchInt = async () => {
    try {
      const res = await getInteractions();
      if (res.success) setInteractionStats(res.data);
    } catch (e) { console.log(e); }
  };

  const fetchWatch = async () => {
    try {
      const res = await getWatchSessions();
      if (res.success && res.data.length > 0) {
        setActiveSession(res.data[0]);
      } else {
        setActiveSession(null);
      }
    } catch (e) { console.log(e); }
  };

  const loadAll = () => {
    fetchInt();
    fetchWatch();
  };

  const parseUtcDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    let d = dateStr;
    if (!d.endsWith("Z") && !d.includes("+") && !d.includes("-", 10)) {
      d += "Z";
    }
    return new Date(d);
  };

  const checkAlignment = async () => {
    try {
      const meData = await getMe();
      const aligned = !!(meData && (meData.is_aligned || meData.partner));
      setIsAligned(aligned);
    } catch (e) {
      console.log("Failed to check alignment in Moment", e);
    }
  };

  useEffect(() => {
    loadAll();
    checkAlignment();

    const sub1 = DeviceEventEmitter.addListener('REFRESH_ALIGNED_DATA', () => {
      loadAll();
      checkAlignment();
    });
    const sub2 = DeviceEventEmitter.addListener('ALIGNMENT_BONDED', () => {
      loadAll();
      checkAlignment();
    });
    const sub3 = DeviceEventEmitter.addListener('ALIGNMENT_BROKEN', () => {
      loadAll();
      checkAlignment();
    });

    return () => {
      sub1.remove();
      sub2.remove();
      sub3.remove();
    };
  }, []);

  useEffect(() => {
    if (!activeSession || activeSession.is_playing) {
      setTimeLeft(null);
      return;
    }
    
    const interval = setInterval(() => {
      const now = new Date().getTime();
      // Ensure utc_timestamp exists and is parsed correctly using the helper (appends 'Z' if missing)
      const parsedDate = parseUtcDate(activeSession.utc_timestamp);
      const targetTime = parsedDate ? parsedDate.getTime() : now;
      const diff = targetTime - now;

      if (diff <= 0) {
        setTimeLeft("00:00:00");
      } else {
        const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
        const m = Math.floor((diff / 1000 / 60) % 60);
        const s = Math.floor((diff / 1000) % 60);
        setTimeLeft(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [activeSession]);

  const handlePoke = async () => {
    if (!isAligned) {
      Alert.alert("Partner Required", "Please connect with your partner first to send a silent ping.");
      return;
    }
    if (thinkingSent) return;
    setThinkingSent(true);
    try {
      await pokePartner();
      loadAll();
    } catch (e: any) {
      setThinkingSent(false);
      const msg = e?.response?.data?.detail || "Could not send ping to partner.";
      Alert.alert("Notice", msg);
    }
  };

  const handleOpenWatch = () => {
    if (!isAligned) {
      Alert.alert("Partner Required", "Please connect with your partner first to schedule watch sessions.");
      return;
    }
    setActiveSheet("watchTogether");
  };

  const handleWatchDatePress = (day: DateData) => {
    setWatchDate(day.dateString);
    setShowWatchCalendar(false);
  };

  const formatDisplayDate = (dateString: string | null): string => {
    if (!dateString) return "mm.dd.yyyy";
    const [year, month, day] = dateString.split("-");
    return `${month}.${day}.${year}`; 
  };

  const handleScheduleWatch = async () => {
    if (!isAligned) {
      Alert.alert("Partner Required", "Please connect with your partner first to schedule watch sessions.");
      return;
    }
    try {
      await createWatchSession({
        platform: watchPlatform,
        show_name: watchWhat,
        link: watchLink,
        date: formatDisplayDate(watchDate),
        time: watchTime,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
      });
      Alert.alert("Success", "Watch session scheduled!");
      triggerNotification("Watch Together", `Scheduled a Watch Session for ${watchWhat}`).catch(() => {});
      setActiveSheet(null);
      loadAll();
    } catch (e: any) {
      const msg = e?.response?.data?.detail || "Could not schedule watch session.";
      Alert.alert("Error", msg);
    }
  };

  return (
    <View>
      <AppText variant="smallCaps" color={Colors.ink2} style={styles.sectionLabel}>
        IN THIS MOMENT
      </AppText>

      <View style={styles.cardsContainer}>
        <Pressable 
          style={[styles.card, !isAligned && { opacity: 0.75 }]} 
          onPress={handlePoke} 
          disabled={thinkingSent}
        >
          <View style={styles.dotContainer}>
            <AppText style={{ fontSize: 16 }}>◉</AppText>
          </View>
          <AppText variant="heading" size={18} style={{ marginTop: 8 }}>
            Thinking of you
          </AppText>
          {!interactionStats || (interactionStats.sent_count === 0 && interactionStats.received_count === 0) ? (
            <AppText variant="serifItalic" size={14} color={Colors.muted} style={{ marginTop: 4 }}>
              A silent ping
            </AppText>
          ) : (
            <View style={{ marginTop: 6, alignItems: 'center' }}>
              {interactionStats.sent_count > 0 && (
                <AppText variant="serifItalic" size={12} color={Colors.muted}>
                  You sent: {interactionStats.sent_count} (last {parseUtcDate(interactionStats.sent_last_activity)?.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })})
                </AppText>
              )}
              {interactionStats.received_count > 0 && (
                <AppText variant="serifItalic" size={12} color={Colors.muted} style={{ marginTop: 2 }}>
                  Partner sent: {interactionStats.received_count} (last {parseUtcDate(interactionStats.received_last_activity)?.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })})
                </AppText>
              )}
            </View>
          )}
          {thinkingSent && (
            <View style={styles.sentContainer}>
              <AppText variant="mono" color={Colors.accent} style={{ fontSize: 15 }}>
                SENT ✓
              </AppText>
            </View>
          )}
        </Pressable>

        <Pressable 
          style={[
            styles.card, 
            activeSession && { backgroundColor: '#E4F1E8', borderColor: '#4CAF50', borderWidth: 1 },
            !isAligned && { opacity: 0.75 }
          ]} 
          onPress={handleOpenWatch}
        >
          <View style={styles.dotContainer}>
            <AppText style={{ fontSize: 16 }}>◐</AppText>
          </View>
          {activeSession ? (
            <>
              <AppText variant="heading" size={18} style={{ marginTop: 8 }}>
                {activeSession.show_name}
              </AppText>
              <AppText variant="serifItalic" size={14} color={Colors.muted}>
                {activeSession.is_playing ? "Playing now" : "Active Session"}
              </AppText>
            </>
          ) : (
            <>
              <AppText variant="heading" size={18} style={{ marginTop: 8 }}>
                Watch together
              </AppText>
              <AppText variant="serifItalic" size={14} color={Colors.muted}>
                Sync a movie, show, or game
              </AppText>
            </>
          )}
        </Pressable>
      </View>

      <AppText variant="serifItalic" size={14} color={Colors.muted} style={styles.footerText}>
        Things that exist in the present — they don't get saved.
      </AppText>

      <Confidential />

      <BottomSheet
        open={activeSheet === "watchTogether"}
        onClose={() => setActiveSheet(null)}
        kicker="IN SYNC"
        title="Watch together"
      >
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          <AppText variant="serifItalic" size={15} color={Colors.muted} style={{ marginBottom: 24, lineHeight: 22 }}>
            Pick what you're watching and when. We'll ping you both at the same moment to hit play.
          </AppText>

          {activeSession ? (
            <View style={{ padding: 10 }}>
              <AppText variant="display" size={24} style={{ marginBottom: 10 }}>
                {activeSession.show_name} on {activeSession.platform}
              </AppText>
              <AppText variant="serifItalic" size={16} color={Colors.muted} style={{ marginBottom: 15 }}>
                Scheduled for {parseUtcDate(activeSession.utc_timestamp)?.toLocaleDateString()} at {parseUtcDate(activeSession.utc_timestamp)?.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
              </AppText>

              {timeLeft && !activeSession.is_playing && (
                <View style={{ backgroundColor: Colors.cream, padding: 15, borderRadius: 12, marginBottom: 30, alignItems: 'center' }}>
                  <AppText variant="smallCaps" color={Colors.ink2} style={{ marginBottom: 5 }}>Countdown</AppText>
                  <AppText variant="display" size={32} color={timeLeft === "00:00:00" ? Colors.accent : Colors.ink}>
                    {timeLeft}
                  </AppText>
                </View>
              )}
              
              {!activeSession.is_accepted_user ? (
                <AppButton variant="accent" full size="lg" onPress={async () => {
                  await acceptWatchSession(activeSession.id);
                  loadAll();
                }}>
                  ACCEPT WATCH INVITATION
                </AppButton>
              ) : !activeSession.is_accepted_partner ? (
                <AppText variant="serifItalic" color={Colors.muted} style={{ textAlign: 'center' }}>
                  Waiting for partner to accept...
                </AppText>
              ) : (
                <>
                  {!activeSession.is_ready_user ? (
                    <AppButton variant="solid" full size="lg" onPress={async () => {
                      await setReadyWatchSession(activeSession.id, true);
                      loadAll();
                    }}>
                      I'M READY
                    </AppButton>
                  ) : !activeSession.is_ready_partner ? (
                    <AppText variant="serifItalic" color={Colors.muted} style={{ textAlign: 'center' }}>
                      Waiting for partner to be ready...
                    </AppText>
                  ) : (
                    <>
                      {!activeSession.is_playing ? (
                        <AppButton variant="accent" full size="lg" onPress={async () => {
                          // Mark it as launched locally so the useEffect doesn't double-fire
                          autoLaunchRef.current = activeSession.id;
                          if (activeSession.link) {
                            try { Linking.openURL(activeSession.link); } catch (e) { console.log(e); }
                          }
                          await triggerPlayWatchSession(activeSession.id);
                          loadAll();
                        }} disabled={timeLeft !== "00:00:00"}>
                          HIT PLAY NOW
                        </AppButton>
                      ) : (
                        <View>
                          <View style={{ padding: 20, backgroundColor: '#E4F1E8', borderRadius: 12, alignItems: 'center' }}>
                            <AppText variant="heading" size={20} color="#4CAF50">PLAYING IN SYNC</AppText>
                            <AppText variant="serifItalic" color={Colors.muted} style={{ marginTop: 5 }}>Enjoy the show!</AppText>
                          </View>
                          <AppButton variant="outline" full size="lg" style={{ marginTop: 20 }} onPress={async () => {
                            try {
                              await deleteWatchSession(activeSession.id);
                              loadAll();
                            } catch (e) {
                              Alert.alert("Error", "Could not finish session.");
                            }
                          }}>
                            FINISH WATCHING
                          </AppButton>
                        </View>
                      )}
                    </>
                  )}
                </>
              )}
            </View>
          ) : (
            <>
              <View style={{ marginBottom: 28 }}>
                <AppText variant="smallCaps" color={Colors.ink2} style={{ fontSize: 10, marginBottom: 12 }}>
                  01 WHERE
                </AppText>
                <View style={styles.platformRow}>
                  {PLATFORMS.map((platform, i) => {
                    const selected = watchPlatform === platform.name;
                    return (
                      <Pressable
                        key={i}
                        onPress={() => setWatchPlatform(platform.name)}
                        style={[
                          styles.platformBtn,
                          selected && { backgroundColor: platform.color, borderColor: platform.color },
                        ]}
                      >
                        <AppText style={{ color: selected ? "#fff" : Colors.ink, fontSize: 10 }}>
                          {platform.name}
                        </AppText>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={{ marginBottom: 20 }}>
                <AppTextInput label="What" n="02" placeholder="Severance • S2 E4" value={watchWhat} onChangeText={setWatchWhat} />
              </View>

              <View style={{ marginBottom: 5 }}>
                <AppTextInput label="Link (Optional)" n="03" placeholder="https://netflix.com/..." value={watchLink} onChangeText={setWatchLink} />
              </View>

              <AppText variant="smallCaps" color={Colors.ink2} style={{ fontSize: 10, marginTop: 15 }}>
                04 DATE
              </AppText>
              <View style={styles.datePickerRow}>
                <AppText variant="display" size={16}>
                  {formatDisplayDate(watchDate)}
                </AppText>
                <Pressable onPress={() => setShowWatchCalendar((v) => !v)}>
                  <Ionicons name="calendar-outline" size={26} color="#000" />
                </Pressable>
              </View>

              {showWatchCalendar && (
                <View style={styles.calendarWrapper}>
                  <Calendar
                    current={watchDate}
                    onDayPress={handleWatchDatePress}
                    markedDates={{ [watchDate]: { selected: true, selectedColor: Colors.accent } }}
                    theme={{ todayTextColor: Colors.accent, arrowColor: Colors.accent }}
                  />
                </View>
              )}

              <View style={{ marginBottom: 32, paddingTop: 10, borderTopWidth: 1, borderBottomWidth: 1, borderColor: Colors.rule }}>
                <AppText variant="smallCaps" color={Colors.ink2} style={{ fontSize: 10, marginBottom: 10 }}>
                  05 TIME
                </AppText>
                <View style={styles.datePickerRow}>
                  <View style={{ flex: 1, paddingRight: 10 }}>
                    <AppTextInput label="" n="" placeholder="09:00 PM" value={watchTime} onChangeText={setWatchTime} />
                  </View>
                  <Ionicons name="time-outline" size={26} color="#000" />
                </View>
              </View>

              <View style={styles.howItWorks}>
                <AppText variant="smallCaps" color={Colors.accent} style={{ fontSize: 12, marginBottom: 8 }}>
                  HOW IT WORKS
                </AppText>
                <AppText variant="serifItalic" size={14} color={Colors.muted} style={{ lineHeight: 20 }}>
                  You'll both get a notification at showtime. Hit play when the countdown hits zero. Watch in sync.
                </AppText>
              </View>

              <AppButton 
                variant="solid" 
                full 
                size="lg" 
                style={{ marginTop: 32 }} 
                onPress={handleScheduleWatch}
                disabled={!watchWhat || !watchTime}
              >
                SCHEDULE →
              </AppButton>
            </>
          )}
        </ScrollView>
      </BottomSheet>
    </View>
  );
};

export default Moment;

const styles = StyleSheet.create({
  sectionLabel: {
    fontSize: 12,
    letterSpacing: 2,
    marginBottom: 20,
    paddingHorizontal: 2,
  },
  cardsContainer: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 24,
  },
  card: {
    flex: 1,
    backgroundColor: Colors.cream,
    padding: 24,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  dotContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.bone,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: Colors.ink2,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  sentContainer: {
    position: "absolute",
    bottom: -10,
    backgroundColor: Colors.cream,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.accent,
  },
  footerText: {
    textAlign: "center",
  },
  platformRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  platformBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.rule,
    backgroundColor: Colors.bone,
  },
  datePickerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderColor: Colors.rule,
    marginBottom: 24,
  },
  calendarWrapper: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 10,
    marginBottom: 24,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  howItWorks: {
    backgroundColor: "#F1E4DA",
    padding: 16,
    borderRadius: 12,
  },
});

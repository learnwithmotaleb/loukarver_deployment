import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import React, { useState, useCallback, useEffect } from "react";
import AsyncStorage from '@react-native-async-storage/async-storage';
import { View, ScrollView, StyleSheet, Pressable, RefreshControl, DeviceEventEmitter } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from "expo-haptics";
import { Swipeable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from "../../constants/colors";
import { AppText } from "../../components/ui/AppText";
import { AppButton } from "../../components/ui/AppButton";
import { Rule } from "../../components/ui/Rule";
import { BottomSheet } from "../../components/ui/BottomSheet";
import { PresenceStrip } from "../../components/home/PresenceStrip";
import { CountdownBlock } from "../../components/home/CountdownBlock";
import { usePersist } from "../../hooks/usePersist";
import { useTimeOfDay } from "../../hooks/useTimeOfDay";
import { formatTime } from "../../utils/dateUtils";
import UsSection from "./UsSection";
import Rhythms from "./Rhythms";
import { AppTextInput } from "@/components/ui/AppTextInput";
import AlignedNav from "@/components/ui/AlignedNav";
import OurPlaylist from "./OurPlaylist";
import { usePresenceTracker } from "../../hooks/usePresenceTracker";
import { getMe } from "../../services/authApi";
import { getStreak } from "../../services/streakApi";
import { completeRitual, getPartnerRituals, updateRitualVisibility } from "../../services/ritualApi";
import { createCheckin, updateCheckin, getCheckin, getQuestionsEndpoint } from "../../services/checkinApi";
import { getAlignedSyncSummary, getPartnerProfile } from "../../services/userApi";
import { postCheckin, postAppreciation } from "../../services/threadApi";
import { SharedCheckinSheet } from "../../components/shared/SharedCheckinSheet";
import api from '../../services/api';

import { getMoodList, getCurrentMood, logMood } from "../../services/moodApi";

const RITUAL_BY_TOD: Record<
  string,
  { title: string; sub: string; cta: string; sheet: string }
> = {
  morning: {
    title: "Morning appreciation",
    sub: "Start the day with one thing you love about them.",
    cta: "Write",
    sheet: "appreciation",
  },
  afternoon: {
    title: "Midday check-in",
    sub: "A gentle pulse on how you're both doing.",
    cta: "Check in",
    sheet: "checkin",
  },
  evening: {
    title: "Evening appreciation",
    sub: "Send one appreciation before the day closes.",
    cta: "Write",
    sheet: "appreciation",
  },
  night: {
    title: "A check-in before bed",
    sub: "A pulse on where you each landed today.",
    cta: "Check in",
    sheet: "checkin",
  },
  late: {
    title: "Late night whisper",
    sub: "Send something tender before sleep.",
    cta: "Write",
    sheet: "appreciation",
  },
};

export const HomeScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  usePresenceTracker();
  const tod = useTimeOfDay();

  const [activeUsTab, setActiveUsTab] = useState<"TIME" | "DATES" | "REUNION">(
    "TIME",
  );
  const [userName, setUserName] = useState<string>("User");
  
  const [refreshing, setRefreshing] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setRefreshTrigger(prev => prev + 1);
    setTimeout(() => setRefreshing(false), 1000);
  }, []);



  useFocusEffect(
    useCallback(() => {
      const fetchUser = async () => {
        try {
          const data = await getMe();
          if (data && data.name) {
            const firstName = data.name.trim().split(" ")[0];
            setUserName(firstName);
          }
          
          const pProfile = await getPartnerProfile();
          if (pProfile && pProfile.success && pProfile.data && pProfile.data.name) {
            const partnerFirstName = pProfile.data.name.trim().split(" ")[0];
            setPartnerName(partnerFirstName);
          } else if (data && data.partner && data.partner.name) {
            // Fallback to cached partner name if profile fetch fails
            const partnerFirstName = data.partner.name.trim().split(" ")[0];
            setPartnerName(partnerFirstName);
          }
        } catch (err) {
          console.log("Error fetching user for greeting:", err);
        }
      };
      fetchUser();
    }, [refreshTrigger])
  );

  const [activeUser] = useState<"lou" | "amanda">("lou");
  const [sheet, setSheet] = useState<string | null>(null);
  const [weScore, setWeScore] = usePersist<number>("home.weScore", 72);
  const [streak, setStreak] = useState<number>(0);
  
  // Mood State
  const [moodOptions, setMoodOptions] = useState<any[]>([]);
  const [myMood, setMyMood] = useState<any>(null);
  const [partnerMood, setPartnerMood] = useState<any>(null);
  const [partnerName, setPartnerName] = useState<string>("Partner");
  const [partnerProfile, setPartnerProfile] = useState<any>(null);
  const [isLoadingMood, setIsLoadingMood] = useState<boolean>(true);
  const [moodError, setMoodError] = useState<string | null>(null);
  const [isUpdatingMood, setIsUpdatingMood] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [syncData, setSyncData] = useState<any>(null);

  // Partner Rituals History
  const [partnerRitualHistory, setPartnerRitualHistory] = useState<any[]>([]);
  const [hasPartnerRituals, setHasPartnerRituals] = useState<boolean>(false);
  const [showHiddenRituals, setShowHiddenRituals] = useState<boolean>(false);
  const [isLoadingPartnerRituals, setIsLoadingPartnerRituals] = useState<boolean>(false);
  const ritualRowRefs = React.useRef<{[key: string]: any}>({});

  // Appreciation State
  const [appreciationText, setAppreciationText] = useState("");

  // Checkin State
  const [checkinQ1, setCheckinQ1] = useState("");
  const [checkinQ2, setCheckinQ2] = useState("");
  const [checkinQ3, setCheckinQ3] = useState("");
  const [hasCheckedInToday, setHasCheckedInToday] = useState(false);
  const timeBasedRitual = RITUAL_BY_TOD[tod] || RITUAL_BY_TOD['afternoon'];
  const ritual = hasCheckedInToday ? timeBasedRitual : {
    title: "Daily check-in",
    sub: "A gentle pulse on how you're both doing.",
    cta: "Check in",
    sheet: "checkin",
  };
  const [partnerCheckin, setPartnerCheckin] = useState<any>(null);
  const [showPartnerCheckin, setShowPartnerCheckin] = useState(false);
  
  const [questions, setQuestions] = useState({
    question_1: "How are you feeling?",
    question_2: "What do you need most?",
    question_3: "One thing on your mind..."
  });

  useFocusEffect(
    useCallback(() => {
      const loadData = async () => {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const today = new Date().toLocaleDateString('en-US', {
        month: '2-digit', day: '2-digit', year: 'numeric'
      }).replace(/\//g, '.');

      // Fix #10: Run all API calls in parallel instead of sequentially
      const [streakData, qData, checkinData, summary, moods, opts, rituals] = await Promise.all([
        getStreak(tz).catch((e: any) => { console.log("Error fetching streak:", e); return null; }),
        getQuestionsEndpoint().catch((e: any) => { console.log("Error fetching questions:", e); return null; }),
        getCheckin(today).catch((e: any) => { console.log("Error fetching existing checkin:", e); return null; }),
        getAlignedSyncSummary(tz).catch((e: any) => { console.log("Error fetching sync summary:", e); return null; }),
        getCurrentMood().catch((e: any) => { console.log("Error fetching current mood:", e); return null; }),
        getMoodList().catch((e: any) => { console.log("Error fetching mood list:", e); return null; }),
        getPartnerRituals(1, 100, tz).catch((e: any) => { console.log("Error fetching partner rituals:", e); return null; }),
      ]);

      if (streakData) setStreak(streakData.current_streak);

      if (qData?.data) setQuestions(qData.data);

      if (checkinData?.data) {
        if (checkinData.data.my_check_in) {
          setCheckinQ1(checkinData.data.my_check_in.answer_1);
          setCheckinQ2(checkinData.data.my_check_in.answer_2);
          setCheckinQ3(checkinData.data.my_check_in.answer_3);
          setHasCheckedInToday(true);
        }
        if (checkinData.data.partner_check_in) {
          setPartnerCheckin(checkinData.data.partner_check_in);
        }
      }

      if (summary) {
        setSyncData(summary);
        setWeScore(summary.overall_score);
      }

      if (moods?.data) {
        const mine = moods.data.find((m: any) => !m.is_partner);
        const theirs = moods.data.find((m: any) => m.is_partner);
        if (mine) setMyMood(mine);
        if (theirs) setPartnerMood(theirs);
      }

      if (opts?.data) setMoodOptions(opts.data);
      setIsLoadingMood(false);

      if (rituals?.data) {
        setPartnerRitualHistory(rituals.data);
        setHasPartnerRituals(rituals.data.filter((r: any) => !r.is_hidden).length > 0);
      }
      
      };
      loadData();
    }, [refreshTrigger])
  );

  const handleAppreciationSubmit = async () => {
    if (!appreciationText.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const res = await completeRitual({
        ritual_type: 'appreciation',
        text: appreciationText,
        timezone: tz,
        time_name: tod
      });
      // Integrate with Thread section
      await postAppreciation({ text: appreciationText });
      
      setStreak(res.streak);
      setSheet(null);
      setAppreciationText("");
    } catch (e) {
      console.log("Error completing appreciation:", e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCheckinSubmit = async () => {
    if (!checkinQ1.trim() || !checkinQ2.trim() || !checkinQ3.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const today = new Date().toLocaleDateString('en-US', {
        month: '2-digit', day: '2-digit', year: 'numeric'
      }).replace(/\//g, '.');
      
      if (hasCheckedInToday) {
        await updateCheckin({
          date: today,
          answer_1: checkinQ1,
          answer_2: checkinQ2,
          answer_3: checkinQ3,
          timezone: tz,
          time_name: tod
        });
      } else {
        await createCheckin({
          date: today,
          answer_1: checkinQ1,
          answer_2: checkinQ2,
          answer_3: checkinQ3,
          timezone: tz,
          time_name: tod
        });
        
        // Integrate with Thread section
        await postCheckin({
          date: new Date().toISOString(),
          answer_1: checkinQ1,
          answer_2: checkinQ2,
          answer_3: checkinQ3
        });
        
        const res = await completeRitual({
          ritual_type: 'checkin',
          timezone: tz,
          time_name: tod
        });
        setStreak(res.streak);
        setHasCheckedInToday(true);
      }
      
      setSheet(null);
    } catch (e) {
      console.log("Error submitting checkin:", e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMoodSelect = async (moodId: string) => {
    setMoodError(null);
    setIsUpdatingMood(true);
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await logMood({ mood_id: moodId });
      // Refresh current mood
      const moods = await getCurrentMood();
      if (moods && moods.data) {
        const mine = moods.data.find((m: any) => !m.is_partner);
        if (mine) setMyMood(mine);
      }
      setSheet(null);
    } catch (e) {
      console.log("Error logging mood:", e);
      setMoodError("Failed to save. Please try again.");
    } finally {
      setIsUpdatingMood(false);
    }
  };

  const reunionDate = new Date("2026-03-15");
  const days = Math.floor(
    (Date.now() - new Date("2023-11-14").getTime()) / 86_400_000,
  );

  const greeting = {
    morning: "morning",
    afternoon: "afternoon",
    evening: "evening",
    night: "night",
    late: "night",
  }[tod];

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <AlignedNav></AlignedNav>
      <ScrollView 
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />
        }
      >
        <PresenceStrip 
          onRedirect={(type, partnerData) => {
            if (partnerData) {
              setPartnerProfile(partnerData);
            }
            if (type === 'Partner Check-in') {
              setSheet("checkin");
            }
            if (type === 'Ritual Completed') {
              setSheet("partner_ritual_history");
            }
          }}
          refreshTrigger={refreshTrigger}
        />

        <View style={styles.inner}>
          {/* Greeting */}
          <View style={styles.greeting}>
            <AppText
              variant="mono"
              color={Colors.muted}
              style={{ fontSize: 10, marginBottom: 12 }}
            >
              {new Date()
                .toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })
                .toUpperCase()}
            </AppText>
            <AppText variant="display" size={44} style={{ lineHeight: 44 }}>
              Good{" "}
              <AppText variant="serifItalic" size={44} color={Colors.accent}>
                {greeting}
              </AppText>
              {`,\n${userName}.`}
            </AppText>
          </View>

          {/* Hero: Score + Ritual */}
          <View style={styles.heroCard}>
            {/* Score */}
            <Pressable
              style={styles.scoreBlock}
              onPress={() => setSheet("sync")}
            >
              <AppText
                variant="display"
                size={62}
                color={Colors.ink}
                style={{ lineHeight: 62 }}
              >
                {weScore}
              </AppText>
              <AppText
                variant="smallCaps"
                color={Colors.muted}
                style={{ marginTop: 8 }}
              >
                Sync
              </AppText>
              <Rule style={{ marginVertical: 12 }} />
              <Pressable onPress={() => setSheet("streak")}>
                <AppText
                  variant="mono"
                  color={Colors.accent}
                  style={{ fontSize: 10 }}
                >
                  {streak}D STREAK
                </AppText>
              </Pressable>
            </Pressable>
            {/* Ritual */}
            <View style={styles.ritualBlock}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginBottom: 8, rowGap: 2 }}>
                <Pressable onPress={() => setSheet('checkin')} hitSlop={4}>
                  <AppText variant="smallCaps" size={9.5} color={Colors.accent} style={{ letterSpacing: 0.8 }}>
                    CHECK IN
                  </AppText>
                </Pressable>
                <AppText variant="smallCaps" size={9.5} color={Colors.muted} style={{ marginHorizontal: 3, letterSpacing: 0.5 }}>
                  ·
                </AppText>
                <Pressable 
                  onPress={() => hasPartnerRituals && setSheet('partner_ritual_history')}
                  disabled={!hasPartnerRituals}
                  hitSlop={4}
                >
                  <AppText variant="smallCaps" size={9.5} color={hasPartnerRituals ? Colors.accent : Colors.muted} style={{ letterSpacing: 0.8 }}>
                    RITUAL
                  </AppText>
                </Pressable>
                <AppText variant="smallCaps" size={9.5} color={Colors.muted} style={{ letterSpacing: 0.5 }}>
                  {' '}· {formatTime(new Date())}
                </AppText>
              </View>
              <AppText
                variant="display"
                size={22}
                style={{ lineHeight: 26, marginBottom: 6, letterSpacing:0.1 }}
              >
                {ritual.title}
              </AppText>
              <AppText
                variant="serifItalic"
                size={14}
                color={Colors.muted}
                style={{ lineHeight: 20 }}
              >
                {ritual.sub}
              </AppText>
              <Pressable
                style={styles.ritualCta}
                onPress={() => setSheet(ritual.sheet)}
              >
                <AppText
                  variant="mono"
                  color={Colors.accent}
                  style={{ fontSize: 11 }}
                >
                  {ritual.cta.toUpperCase()}
                </AppText>
                <AppText color={Colors.accent}>→</AppText>
              </Pressable>
            </View>
          </View>

          <UsSection refreshTrigger={refreshTrigger} />

          {/* <OurPlaylist></OurPlaylist> */}

          {/* Desire Mood */}
          <AppText
            variant="smallCaps"
            color={Colors.ink2}
            style={styles.sectionLabel}
          >
            Desire Mood
          </AppText>
          <View
            style={[
              styles.card1,
              { flexDirection: "row", padding: 0, overflow: "hidden" },
            ]}
          >
            {/* My Mood Block */}
            <Pressable
              style={[styles.moodBlock, styles.moodBorder]}
              onPress={() => setSheet("mood_selector")}
            >
              <AppText
                variant="smallCaps"
                color={Colors.muted}
                style={{ marginBottom: 10 }}
              >
                {userName.toUpperCase()}
              </AppText>
              {isLoadingMood ? (
                 <AppText variant="serifItalic" color={Colors.muted} style={{ opacity: 0.5 }}>Loading...</AppText>
              ) : (
                <>
                  <AppText
                    size={32}
                    color={Colors.accent}
                    style={{ marginBottom: 8 }}
                  >
                    {myMood ? myMood.mood_symbol : "◌"}
                  </AppText>
                  <AppText variant="heading" size={17}>
                    {myMood ? myMood.mood_name : "Tap to set"}
                  </AppText>
                </>
              )}
            </Pressable>

            {/* Partner Mood Block */}
            <View style={styles.moodBlock}>
              <AppText
                variant="smallCaps"
                color={Colors.muted}
                style={{ marginBottom: 10 }}
              >
                {partnerName.toUpperCase()}
              </AppText>
              {isLoadingMood ? (
                 <AppText variant="serifItalic" color={Colors.muted} style={{ opacity: 0.5 }}>Loading...</AppText>
              ) : (
                <>
                  <AppText
                    size={32}
                    color={Colors.accent}
                    style={{ marginBottom: 8 }}
                  >
                    {partnerMood ? partnerMood.mood_symbol : "◌"}
                  </AppText>
                  <AppText variant="heading" size={17} color={partnerMood ? Colors.ink : Colors.muted}>
                    {partnerMood ? partnerMood.mood_name : "Waiting..."}
                  </AppText>
                </>
              )}
            </View>
          </View>
            <Rhythms />
        </View>

        {/* Extra space for tab bar */}
        <View style={{ height: Math.max(insets.bottom, 16) + 80 }} />
      </ScrollView>

      {/* ─── Bottom Sheets ─── */}

      {/* Mood selector */}
      <BottomSheet
        open={sheet === "mood_selector"}
        onClose={() => { setSheet(null); setMoodError(null); }}
        kicker={userName.toUpperCase()}
        title="How are you?"
      >
        {moodOptions.map((m, i) => {
          const isActive = myMood && myMood.mood_name === m.name;
          return (
            <Pressable
              key={m.id}
              disabled={isActive || isUpdatingMood}
              onPress={() => handleMoodSelect(m.id)}
              style={[
                styles.moodOption, 
                isActive && { backgroundColor: "#EAE2D4" },
                (isActive || isUpdatingMood) && { opacity: 0.6 }
              ]}
            >
              <AppText size={20} color={Colors.accent} style={{ width: 28 }}>
                {m.symbol}
              </AppText>
              <AppText variant="heading" size={18} style={{ flex: 1, color: isActive ? Colors.ink : Colors.ink2 }}>
                {m.name}
              </AppText>
              <AppText variant="mono" style={{ fontSize: 10, color: isActive ? Colors.accent : Colors.muted }}>
                {String(i + 1).padStart(2, "0")}
              </AppText>
            </Pressable>
          );
        })}
        {moodError && (
          <AppText variant="serifItalic" color={Colors.accent} style={{ marginTop: 16, textAlign: 'center' }}>
            {moodError}
          </AppText>
        )}
      </BottomSheet>

      {/* Appreciation sheet */}
      <BottomSheet
        open={sheet === "appreciation"}
        onClose={() => setSheet(null)}
        kicker="APPRECIATION · ❦"
        title="A love note"
      >
       <View>
                   <AppText variant="serifItalic" size={15} color={Colors.muted} style={{ marginBottom: 18, lineHeight: 22 }}>
                     One thing you noticed about them this week. Small is fine — true is better.
                   </AppText>
                   <AppTextInput 
                     multiline 
                     placeholder="One thing I love about you is..." 
                     style={{ minHeight: 140 }} 
                     value={appreciationText}
                     onChangeText={setAppreciationText}
                   />
                
                 </View>
        <AppButton
          variant="solid"
          full
          size="lg"
          onPress={handleAppreciationSubmit}
          disabled={isSubmitting || !appreciationText.trim()}
          style={{ marginTop: 22 }}
        >
          {isSubmitting ? "Sending..." : "Send →"}
        </AppButton>
      </BottomSheet>

      {/* Check-in sheet */}
      <SharedCheckinSheet 
        open={sheet === "checkin"} 
        onClose={() => setSheet(null)}
        onSuccess={() => {
          setHasCheckedInToday(true);
          // Optional: refresh local state if needed
        }}
      />

      {/* Partner Ritual sheet */}
      <BottomSheet
        open={sheet === "partner_ritual_history"}
        onClose={() => setSheet(null)}
        kicker={`${partnerName}'s RITUALS`.toUpperCase()}
        title="What they shared with you"
      >
        <View style={{ paddingVertical: 10 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16, alignItems: 'center' }}>
            <AppText variant="smallCaps" color={Colors.muted} style={{ fontSize: 10 }}>
              {showHiddenRituals ? 'HIDDEN RITUALS' : 'RECENT RITUALS'}
            </AppText>
            <Pressable onPress={() => setShowHiddenRituals(!showHiddenRituals)}>
              <AppText variant="mono" color={Colors.accent} style={{ fontSize: 11 }}>
                {showHiddenRituals ? 'SHOW ACTIVE' : 'SHOW HIDDEN'}
              </AppText>
            </Pressable>
          </View>
          
          {isLoadingPartnerRituals ? (
            <AppText variant="serifItalic" size={16} color={Colors.muted}>
              Loading...
            </AppText>
          ) : partnerRitualHistory.filter(r => (showHiddenRituals ? r.is_hidden : !r.is_hidden)).length > 0 ? (
            <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={false}>
              {partnerRitualHistory
                .filter(r => (showHiddenRituals ? r.is_hidden : !r.is_hidden))
                .map((ritual) => {
                  const renderLeftActions = () => (
                    <View style={{ justifyContent: 'center', height: '100%', flex: 1, alignItems: 'flex-start', paddingLeft: 24, paddingBottom: 12 }}>
                      <Ionicons name="trash-outline" size={20} color={'#D9534F'} />
                      <AppText color={'#D9534F'} variant="mono" style={{ fontSize: 10, marginTop: 4, letterSpacing: 1 }}>DELETE</AppText>
                    </View>
                  );

                  const renderRightActions = () => (
                    <View style={{ justifyContent: 'center', height: '100%', flex: 1, alignItems: 'flex-end', paddingRight: 24, paddingBottom: 12 }}>
                      <Ionicons name={showHiddenRituals ? "eye-outline" : "eye-off-outline"} size={20} color={Colors.accent} />
                      <AppText color={Colors.accent} variant="mono" style={{ fontSize: 10, marginTop: 4, letterSpacing: 1 }}>{showHiddenRituals ? "UNHIDE" : "HIDE"}</AppText>
                    </View>
                  );

                  return (
                    <Swipeable
                      key={ritual.ritual_id}
                      ref={ref => {
                        if (ref) ritualRowRefs.current[ritual.ritual_id] = ref;
                      }}
                      renderLeftActions={renderLeftActions}
                      renderRightActions={renderRightActions}
                      overshootLeft={true}
                      overshootRight={true}
                      friction={1.5}
                      onSwipeableLeftOpen={async () => {
                        try {
                          await updateRitualVisibility(ritual.ritual_id, 'delete');
                          setPartnerRitualHistory(prev => prev.filter(r => r.ritual_id !== ritual.ritual_id));
                          setHasPartnerRituals(partnerRitualHistory.filter(r => !r.is_hidden && r.ritual_id !== ritual.ritual_id).length > 0);
                        } catch (e) {
                          console.log("Error deleting ritual", e);
                        }
                        setTimeout(() => {
                          if (ritualRowRefs.current[ritual.ritual_id]) {
                            ritualRowRefs.current[ritual.ritual_id].close();
                          }
                        }, 200);
                      }}
                      onSwipeableRightOpen={async () => {
                        try {
                          await updateRitualVisibility(ritual.ritual_id, showHiddenRituals ? 'unhide' : 'hide');
                          setPartnerRitualHistory(prev => prev.map(r => r.ritual_id === ritual.ritual_id ? { ...r, is_hidden: !showHiddenRituals } : r));
                          setHasPartnerRituals(partnerRitualHistory.filter(r => !r.is_hidden && (showHiddenRituals ? r.ritual_id === ritual.ritual_id : r.ritual_id !== ritual.ritual_id)).length > 0);
                        } catch (e) {
                          console.log("Error toggling hide ritual", e);
                        }
                        setTimeout(() => {
                          if (ritualRowRefs.current[ritual.ritual_id]) {
                            ritualRowRefs.current[ritual.ritual_id].close();
                          }
                        }, 200);
                      }}
                    >
                      <View style={{ borderWidth: 1, borderColor: Colors.rule, padding: 16, backgroundColor: '#EAE2D4', marginBottom: 12, borderRadius: 8 }}>
                        <AppText variant="mono" size={11} color={Colors.muted} style={{ marginBottom: 12 }}>
                          {new Date(ritual.created_at || ritual.date).toLocaleString()}
                        </AppText>
                        <AppText variant="serifItalic" size={18} color={Colors.ink} style={{ lineHeight: 26 }}>
                          "{ritual.text || 'Completed their ritual.'}"
                        </AppText>
                      </View>
                    </Swipeable>
                  );
                })}
            </ScrollView>
          ) : (
            <AppText variant="serifItalic" size={16} color={Colors.muted}>
              {showHiddenRituals ? "No hidden rituals." : "No recent rituals found."}
            </AppText>
          )}
        </View>
        <AppButton
          variant="solid"
          full
          size="lg"
          onPress={() => setSheet(null)}
          style={{ marginTop: 20 }}
        >
          Close
        </AppButton>
      </BottomSheet>


      {/* Sync score sheet */}

      <BottomSheet
        open={sheet === "sync"}
        onClose={() => setSheet(null)}
        kicker="THIS WEEK"
        title="Your Sync"
      >
        <View style={{ paddingHorizontal: 10, paddingBottom: 20 }}>
          {/* Big Score */}
          <View style={{ alignItems: "center", marginBottom: 12 }}>
            <AppText
              variant="display"
              size={92}
              color={Colors.ink}
              style={{ lineHeight: 88 }}
            >
              {weScore}
            </AppText>
          </View>

          {/* Subtitle */}
          <AppText
            variant="serifItalic"
            size={15}
            color={Colors.muted}
            style={{ textAlign: "center", lineHeight: 22, marginBottom: 32 }}
          >
            How in tune you two are this week, built from small acts. Tap any
            line to see what counts.
          </AppText>

          <Rule style={{ marginBottom: 24 }} />

          {/* WHAT GOES INTO IT */}
          <AppText
            variant="smallCaps"
            color={Colors.ink2}
            style={{ marginBottom: 16, fontSize: 10 }}
          >
            WHAT GOES INTO IT
          </AppText>

          {/* Breakdown Items */}
          <View style={{ gap: 20 }}>
            {/* Daily rituals */}
            <View
              style={{
                backgroundColor: "#EAE2D4",
                padding: 16,
                borderRadius: 10,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 6,
                }}
              >
                <AppText variant="heading" size={17}>
                  Daily rituals
                </AppText>
                <AppText variant="mono" color={Colors.muted} size={15}>
                  {syncData ? syncData.rituals.percentage : 25}%
                </AppText>
              </View>
              <View style={styles.progressBarContainer}>
                <View style={[styles.progressBar, { width: `${syncData ? syncData.rituals.percentage : 25}%` }]} />
              </View>
              <AppText
                variant="mono"
                color={Colors.muted}
                style={{ marginTop: 6, fontSize: 13 }}
              >
                {syncData ? `${syncData.rituals.count} of ${syncData.rituals.target} completed` : '0 of 14 completed'}
              </AppText>
            </View>

            {/* Daily check-in */}
            <View
              style={{
                backgroundColor: "#EAE2D4",
                padding: 16,
                borderRadius: 10,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 6,
                }}
              >
                <AppText variant="heading" size={17}>
                  Daily check-in
                </AppText>
                <AppText variant="mono" color={Colors.muted} size={15}>
                  {syncData ? syncData.checkins.percentage : 28}%
                </AppText>
              </View>
              <View style={styles.progressBarContainer}>
                <View style={[styles.progressBar, { width: `${syncData ? syncData.checkins.percentage : 28}%` }]} />
              </View>
              <AppText
                variant="mono"
                color={Colors.muted}
                style={{ marginTop: 6, fontSize: 13 }}
              >
                {syncData ? `${syncData.checkins.count} this week` : 'Not yet this week'}
              </AppText>
            </View>

            {/* Appreciations sent */}
            <View
              style={{
                backgroundColor: "#EAE2D4",
                padding: 16,
                borderRadius: 10,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 6,
                }}
              >
                <AppText variant="heading" size={17}>
                  Appreciations sent
                </AppText>
                <AppText variant="mono" color={Colors.muted} size={15}>
                  {syncData ? syncData.appreciations.percentage : 28}%
                </AppText>
              </View>
              <View style={styles.progressBarContainer}>
                <View style={[styles.progressBar, { width: `${syncData ? syncData.appreciations.percentage : 28}%` }]} />
              </View>
              <AppText
                variant="mono"
                color={Colors.muted}
                style={{ marginTop: 6, fontSize: 13 }}
              >
                {syncData ? `${syncData.appreciations.count} sent recently` : '2 sent recently'}
              </AppText>
            </View>

            {/* Thread activity */}
            <View
              style={{
                backgroundColor: "#EAE2D4",
                padding: 16,
                borderRadius: 10,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 6,
                }}
              >
                <AppText variant="heading" size={17}>
                  Thread activity
                </AppText>
                <AppText variant="mono" color={Colors.muted} size={15}>
                  {syncData ? syncData.threads.percentage : 15}%
                </AppText>
              </View>
              <View style={styles.progressBarContainer}>
                <View style={[styles.progressBar, { width: `${syncData ? syncData.threads.percentage : 15}%` }]} />
              </View>
              <AppText
                variant="mono"
                color={Colors.muted}
                style={{ marginTop: 6, fontSize: 13 }}
              >
                {syncData ? `${syncData.threads.count} entries this week` : '0 entries this week'}
              </AppText>
            </View>

            <View
              style={{
                padding: 16,
                borderRadius: 10,
                backgroundColor: "#ff4f281e",
              }}
            >
              <AppText
                variant="smallCaps"
                color={Colors.accent}
                style={{ marginBottom: 1, fontSize: 10 }}
              >
                HOW TO RAISE IT
              </AppText>
              <AppText
                variant="serifItalic"
                size={15}
                color={Colors.muted}
                style={{}}
              >
                Send an appreciation tonight, complete your evening ritual, or
                share a moment to Thread. Small acts compound.
              </AppText>
            </View>
          </View>
        </View>
      </BottomSheet>
      {/* Streak sheet */}
      <BottomSheet
        open={sheet === "streak"}
        onClose={() => setSheet(null)}
        kicker={`${streak} days strong`}
        title="Your streak"
      >
        <View style={{ alignItems: "center", paddingVertical: 20 }}>
          <AppText
            variant="display"
            size={84}
            color={Colors.accent}
            style={{ lineHeight: 84 }}
          >
            {streak}
          </AppText>
          <AppText
            variant="smallCaps"
            color={Colors.muted}
            style={{ marginTop: 8 }}
          >
            Days in a row
          </AppText>
        </View>
        <AppButton variant="outline" full onPress={() => setSheet(null)}>
          Close
        </AppButton>
      </BottomSheet>
      
      {/* Side-by-side sheet */}
      <BottomSheet
        open={sheet === "side-by-side"}
        onClose={() => setSheet(null)}
        kicker="CHECK IN - ◈"
        title="You're both here"
      >
        <AppText variant="serifItalic" size={15} color={Colors.muted} style={{ marginBottom: 24, lineHeight: 22 }}>
          A side-by-side look at how you're both doing this week.
        </AppText>
        
        {/* User Section */}
        <View style={{ borderWidth: 1, borderColor: Colors.rule, borderRadius: 0, marginBottom: 24 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", backgroundColor: "#EAE2D4", padding: 12, borderBottomWidth: 1, borderBottomColor: Colors.rule }}>
            <AppText variant="mono" size={11} color={Colors.ink2}>{userName.toUpperCase()}</AppText>
            <AppText variant="mono" size={11} color={Colors.muted}>Nº 01</AppText>
          </View>
          
          <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: Colors.rule }}>
            <AppText variant="mono" size={11} color={Colors.muted} style={{ marginBottom: 12 }}>01 FEELING</AppText>
            <AppText variant="serifItalic" size={16} color={Colors.ink}>"{checkinQ1}"</AppText>
          </View>
          
          <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: Colors.rule }}>
            <AppText variant="mono" size={11} color={Colors.muted} style={{ marginBottom: 12 }}>02 NEEDING</AppText>
            <AppText variant="serifItalic" size={16} color={Colors.ink}>"{checkinQ2}"</AppText>
          </View>
          
          <View style={{ padding: 16 }}>
            <AppText variant="mono" size={11} color={Colors.muted} style={{ marginBottom: 12 }}>03 ON MIND</AppText>
            <AppText variant="serifItalic" size={16} color={Colors.ink}>"{checkinQ3}"</AppText>
          </View>
        </View>

        {/* Partner Section */}
        <View style={{ borderWidth: 1, borderColor: Colors.rule, borderRadius: 0, marginBottom: 32 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", backgroundColor: "#EAE2D4", padding: 12, borderBottomWidth: 1, borderBottomColor: Colors.rule }}>
            <AppText variant="mono" size={11} color={Colors.ink2}>{partnerName.toUpperCase()}</AppText>
            <AppText variant="mono" size={11} color={Colors.muted}>Nº 02</AppText>
          </View>
          
          <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: Colors.rule }}>
            <AppText variant="mono" size={11} color={Colors.muted} style={{ marginBottom: 12 }}>01 FEELING</AppText>
            <AppText variant="serifItalic" size={16} color={Colors.ink}>"{partnerCheckin?.answer_1 || ""}"</AppText>
          </View>
          
          <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: Colors.rule }}>
            <AppText variant="mono" size={11} color={Colors.muted} style={{ marginBottom: 12 }}>02 NEEDING</AppText>
            <AppText variant="serifItalic" size={16} color={Colors.ink}>"{partnerCheckin?.answer_2 || ""}"</AppText>
          </View>
          
          <View style={{ padding: 16 }}>
            <AppText variant="mono" size={11} color={Colors.muted} style={{ marginBottom: 12 }}>03 ON MIND</AppText>
            <AppText variant="serifItalic" size={16} color={Colors.ink}>"{partnerCheckin?.answer_3 || ""}"</AppText>
          </View>
        </View>
        
        <AppButton variant="outline" full onPress={() => setSheet("checkin")}>
          NEW CHECK-IN
        </AppButton>
      </BottomSheet>
    
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bone },
  inner: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 20 },
  greeting: { paddingTop: 4, paddingBottom: 16 },
  sectionLabel: { marginBottom: 14, marginTop: 8 },

  usCard: {
    backgroundColor: Colors.bone,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.rule,
    overflow: "hidden",
    marginBottom: 8,
  },
  tabContainer: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: Colors.rule,
  },
  tab: {
    flex: 1,
    paddingVertical: 16,
    alignItems: "center",
    position: "relative",
  },
  tabIndicator: {
    position: "absolute",
    bottom: 0,
    height: 3,
    width: "60%",
    backgroundColor: Colors.ink,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
  },

  timeTab: { padding: 10 },
  milestoneRow: { flexDirection: "row", marginTop: 32, gap: 12 },
  milestoneBox: {
    flex: 1,

    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.rule,
  },

  datesTab: { padding: 10 },
  dateRow: {
    flexDirection: "row",
    justifyContent: "space-between",

    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: Colors.rule,
  },
  addDateButton: {
    paddingVertical: 10,
  },

  reunionTab: { padding: 24 },
  countdownGrid: { flexDirection: "row", gap: 12 },
  countdownBox: {
    flex: 1,
    backgroundColor: "#F9F7F4",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.rule,
  },

  card: {
    borderRadius: 14,
    marginBottom: 8,
    backgroundColor: Colors.bone,

    borderColor: Colors.rule,

    shadowColor: Colors.ink2,
    shadowOpacity: 0.04,

    elevation: 1,
  },
  card1: {
    borderRadius: 14,
    marginBottom: 8,
    backgroundColor: Colors.bone,
    borderWidth: 1,
    borderColor: Colors.rule,
    padding: 20,
    shadowColor: Colors.ink2,
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  heroCard: {
    flexDirection: "row",
    borderRadius: 14,
    marginBottom: 24,
    backgroundColor: Colors.bone,
    borderWidth: 1,
    borderColor: Colors.rule,
    overflow: "hidden",
    shadowColor: Colors.ink2,
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  scoreBlock: {
    paddingVertical: 20,
    paddingHorizontal: 16,
    borderRightWidth: 1,
    borderRightColor: Colors.rule,
    alignItems: "center",
    minWidth: 100,
  },
  ritualBlock: {
    flex: 1,
    paddingVertical: 20,
    paddingHorizontal: 18,
    justifyContent: "space-between",
  },
  ritualCta: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.rule,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  moodBlock: {
    flex: 1,
    padding: 20,
  },
  moodBorder: {
    borderRightWidth: 1,
    borderRightColor: Colors.rule,
  },
  moodOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.rule,
    gap: 16,
  },
  progressBarContainer: {
    height: 6,
    backgroundColor: Colors.bone,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressBar: {
    height: "100%",
    backgroundColor: Colors.sage,
    borderRadius: 3,
  },
  appreciationInput: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.rule,
    paddingVertical: 12,
    minHeight: 120,
  },
});

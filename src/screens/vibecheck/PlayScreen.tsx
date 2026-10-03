import React, { useState, useEffect } from "react";
import {
  View,
  ScrollView,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors } from "../../constants/colors";
import { AppText } from "../../components/ui/AppText";
import { AppButton } from "../../components/ui/AppButton";
import { BottomSheet } from "../../components/ui/BottomSheet";
import { ThisOrThatCard } from "../../components/vibecheck/ThisOrThatCard";
import {
  VibeTabParamList,
} from "../../types";
import SamVibeNav, { LiveCountdownNav } from "@/components/ui/SamVibeNav";
import { VibeRefreshControl } from "../../components/ui/VibeRefreshControl";
import { listVibeDates } from "../../services/vibeDatesApi";
import { useNavigation } from "@react-navigation/native";
import { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import {
  getVibeProfile,
  getDailyCards,
  submitVibeAnswers,
  getVibeResults,
  getConnections,
  releaseConnection,
  getVibeStreak
} from "../../services/vibeCheckApi";
import api from "../../services/api";

const DAILY_LIMIT = 3;

const CLOSING_MESSAGES = [
  "Come back tomorrow. The slowness is the point.",
  "Good things take time. See you tomorrow.",
  "Reflect on today's answers. Let them breathe.",
  "Connection is built in small, daily steps.",
  "That's enough for now. Rest your mind.",
  "A little bit every day builds a strong foundation."
];

// Helper to get a stable message of the day
const getDailyMessage = () => {
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  return CLOSING_MESSAGES[dayOfYear % CLOSING_MESSAGES.length];
};

const numberToWord = (num: number) => {
  const words = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];
  return words[num] || num.toString();
};

export const PlayScreen: React.FC = () => {
  const navigation = useNavigation<BottomTabNavigationProp<VibeTabParamList>>();
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  
  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    setRefreshKey(k => k + 1);
  }, []);
  const [dailyCards, setDailyCards] = useState<any[]>([]);
  const [cardsAnsweredToday, setCardsAnsweredToday] = useState(0);
  const [streak, setStreak] = useState(0);
  const [matchRate, setMatchRate] = useState(0);
  const [allResults, setAllResults] = useState<any[]>([]);
  
  const [activePartners, setActivePartners] = useState<any[]>([]);
  const [connectionsList, setConnectionsList] = useState<any[]>([]);
  const [partnerName, setPartnerName] = useState("Partner");
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [partnerSheet, setPartnerSheet] = useState(false);
  const [upcomingDate, setUpcomingDate] = useState<Date | null>(null);

  const [myPick, setMyPick] = useState<"a" | "b" | null>(null);
  const [theirPick, setTheirPick] = useState<"a" | "b" | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [debugText, setDebugText] = useState("");
  
  // A small local counter so we can show "Card 1 of 3" etc while moving through them
  // This is offset by cardsAnsweredToday on mount.
  const [localIndex, setLocalIndex] = useState(0);
  const currentCardIndex = cardsAnsweredToday + localIndex;

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setDailyCards([]);
      setMatchRate(0);
      setStreak(0);
      setAllResults([]);
      
      try {
        const [profile, connsData] = await Promise.all([
          getVibeProfile().catch(() => null),
          getConnections().catch(() => ({ data: [] }))
        ]);

        const allPartners = connsData?.data || [];
        if (profile) setMyUserId(profile.user_id);
        if (connsData?.data) setConnectionsList(connsData.data);
        
        let currentPId = partnerId;
        let currentPName = "Partner";
        if (allPartners.length > 0) {
          setActivePartners(allPartners);
          
          currentPId = partnerId || allPartners[0].user_id;
          currentPName = partnerId ? (allPartners.find((p: any) => p.user_id === partnerId)?.name || "Partner") : (allPartners[0].name || "Partner");
          
          setPartnerName(currentPName);
          if (!partnerId) {
            setPartnerId(currentPId);
          }

          const [dailyData, resultsData, streakData, datesRes] = await Promise.all([
            getDailyCards(currentPId).catch((e: any) => {
              return { questions: [] };
            }),
            getVibeResults(currentPId).catch((e: any) => {
              return { data: [] };
            }),
            getVibeStreak(currentPId).catch(() => ({ current_streak: 0, cards_answered_today: 0 })),
            listVibeDates(currentPId, 1, 100, Intl.DateTimeFormat().resolvedOptions().timeZone).catch(() => null)
          ]);
          
          if (datesRes?.data) {
             const upcoming = datesRes.data.filter((d: any) => d.status === "accepted" && new Date(`${d.date}T${d.time}`) >= new Date());
             if (upcoming.length > 0) {
                 upcoming.sort((a: any, b: any) => new Date(`${a.date}T${a.time}`).getTime() - new Date(`${b.date}T${b.time}`).getTime());
                 setUpcomingDate(new Date(`${upcoming[0].date}T${upcoming[0].time}`));
             } else {
                 setUpcomingDate(null);
             }
          } else {
             setUpcomingDate(null);
          }
          
          setAllResults(resultsData?.data || []);
          
          let partnerCardsAnsweredToday = 0;
          const currentPartnerResult = resultsData?.data?.find((r: any) => r.partner_name === currentPName);
          if (currentPartnerResult) {
             setMatchRate(currentPartnerResult.cumulative_match_percent || 0);
             
             if (dailyData?.questions) {
                 partnerCardsAnsweredToday = dailyData.questions.filter((q: any) => 
                     currentPartnerResult.matched_answers?.some((a: any) => a.question_id === q.id && a.my_selected_option)
                 ).length;
             }
          }
          setCardsAnsweredToday(partnerCardsAnsweredToday);
          
          if (dailyData?.questions?.length > 0 && currentPartnerResult) {
             const firstUnansweredIndex = partnerCardsAnsweredToday < 3 ? partnerCardsAnsweredToday : 2;
             const cardToPrePopulate = dailyData.questions[firstUnansweredIndex]?.id;
             const matchedAns = currentPartnerResult.matched_answers?.find((a: any) => a.question_id === cardToPrePopulate);
             if (matchedAns?.my_selected_option) {
                 setMyPick(matchedAns.my_selected_option.toLowerCase() as "a" | "b");
                 if (matchedAns.partner_selected_option) {
                     setTheirPick(matchedAns.partner_selected_option.toLowerCase() as "a" | "b");
                     setRevealed(true);
                 } else {
                     setTheirPick(null);
                     setRevealed(false);
                 }
             } else {
                 setMyPick(null);
                 setTheirPick(null);
                 setRevealed(false);
             }
          } else {
             setMyPick(null);
             setTheirPick(null);
             setRevealed(false);
          }
          setDailyCards(dailyData?.questions || []);
          setStreak(streakData?.current_streak || 0);
        }
      } catch (err) {
        console.log("Error loading PlayScreen data:", err);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    }
    loadData();
  }, [partnerId, refreshKey]); // Re-run loadData when partner changes or refreshed

  const hasNoPartners = activePartners.length === 0;
  const noCardsAvailable = !hasNoPartners && dailyCards.length === 0;
  const limitReached = currentCardIndex >= DAILY_LIMIT;
  const exhaustedDailyCards = !limitReached && dailyCards.length > 0 && currentCardIndex >= dailyCards.length;

  const showNoPartnersState = hasNoPartners;
  const showNoCardsState = noCardsAvailable || exhaustedDailyCards;
  const showLimitReachedState = limitReached;
  
  const card = (!showNoPartnersState && !showNoCardsState && !showLimitReachedState && dailyCards.length > 0) ? dailyCards[currentCardIndex] : null;

  // WebSocket / Polling for partner's answer
  useEffect(() => {
    let ws: WebSocket | null = null;
    let cancelled = false;
    let interval: NodeJS.Timeout | null = null;
    
    if (revealed && theirPick === null && card && partnerId && myUserId) {
      const cardId = card.id; // capture to avoid stale closures
      const currentPartnerId = partnerId;
      
      const checkPartnerAnswer = async () => {
        if (cancelled) return;
        try {
          setDebugText(`Polling... partnerId=${currentPartnerId}`);
          const results = await getVibeResults(currentPartnerId);
          if (cancelled) return;
          
          if (results?.data) {
            setAllResults(results.data);
            const partnerData = results.data.find((r: any) => r.partner_name === partnerName);
            const matchedAns = partnerData?.matched_answers?.find((a: any) => a.question_id === cardId);
            if (matchedAns && matchedAns.partner_selected_option) {
              setDebugText(`Found answer: ${matchedAns.partner_selected_option}`);
              setTheirPick(matchedAns.partner_selected_option.toLowerCase() as "a" | "b");
              if (interval) clearInterval(interval);
            } else {
              setDebugText(`Results fetched, no matchedAns for cardId=${cardId}. answers count: ${partnerData?.matched_answers?.length}`);
            }
          } else {
             setDebugText(`Results fetched, but length is 0 (or undefined).`);
          }
        } catch (e: any) {
          setDebugText(`Poll error: ${e.message}`);
        }
      };
      
      // Immediate first check
      checkPartnerAnswer();
      
      // Fix #6: Don't always poll — try WebSocket first, fall back to polling only on failure
      // Polling interval increased from 2s to 8s to reduce network pressure
      const POLL_INTERVAL = 8000;
      
      // Connect to WebSocket
      const baseUrl = api.defaults.baseURL || "http://localhost:8006";
      const wsUrl = `${baseUrl.replace('http', 'ws')}/vibecheck/cards/ws/${myUserId}`;
      
      try {
          ws = new WebSocket(wsUrl);

          ws.onopen = () => {
            console.log("WS Connected:", wsUrl);
            // WebSocket connected — stop polling if it was started
            if (interval) {
              clearInterval(interval);
              interval = null;
            }
          };

          ws.onmessage = (event) => {
            console.log("WS Message received:", event.data);
            try {
              if (typeof event.data !== 'string' || !event.data.trim()) return;
              const data = JSON.parse(event.data);
              if (data.type === "PARTNER_ANSWERED" && data.partner_id === currentPartnerId) {
                // Partner answered! Re-fetch the result
                checkPartnerAnswer();
              }
            } catch(e) {}
          };
          
          ws.onerror = (e: any) => {
            console.log("WebSocket error:", e.message || "Unknown error");
            if (!interval && !cancelled) {
                console.log("Falling back to polling...");
                interval = setInterval(checkPartnerAnswer, POLL_INTERVAL);
            }
          };

          ws.onclose = () => {
            console.log("WS Closed");
            if (!interval && !cancelled) {
                console.log("Falling back to polling...");
                interval = setInterval(checkPartnerAnswer, POLL_INTERVAL);
            }
          };
      } catch (e) {
          console.error("Failed to setup WS:", e);
          if (!interval && !cancelled) {
              interval = setInterval(checkPartnerAnswer, POLL_INTERVAL);
          }
      }
    }
    return () => {
      cancelled = true;
      if (ws) ws.close();
      if (interval) clearInterval(interval);
    };
  }, [revealed, theirPick, card, partnerId, myUserId, partnerName]);

  // Polling for Limit Reached State
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    let cancelled = false;

    if (showLimitReachedState && partnerId && allResults) {
      const partnerData = allResults.find((r: any) => r.partner_name === partnerName);
      // Only poll if both_finished is false
      if (partnerData && !partnerData.both_finished) {
        const checkResults = async () => {
          if (cancelled) return;
          try {
            const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
            const results = await getVibeResults(partnerId, tz);
            if (cancelled) return;
            if (results?.data) {
              setAllResults(results.data);
            }
          } catch (e) {
            console.log("Limit reached poll error:", e);
          }
        };

        // Poll every 3 seconds
        interval = setInterval(checkResults, 3000);
      }
    }

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [showLimitReachedState, partnerId, allResults, partnerName]);

  const matched = revealed && myPick !== null && theirPick !== null && myPick === theirPick;

  const handlePick = async (pick: "a" | "b") => {
    setMyPick(pick);
    if (!card) return;

    try {
      const option = pick === "a" ? "A" : "B";
      if (!partnerId) return;
      // Submit single answer to backend
      await submitVibeAnswers(partnerId, [{ question_id: card.id, selected_option: option }]);
      
      // Check if partner answered
      let foundMatch = false;
      const results = await getVibeResults(partnerId);
      if (results?.data) {
          setAllResults(results.data);
          const partnerData = results.data.find((r: any) => r.partner_name === partnerName);
          if (partnerData) {
              const matchedAns = partnerData.matched_answers?.find((a: any) => a.question_id === card.id);
              if (matchedAns?.partner_selected_option) {
                  setTheirPick(matchedAns.partner_selected_option.toLowerCase() as "a" | "b");
                  setRevealed(true);
                  foundMatch = true;
              }
          }
      }

      if (!foundMatch) {
          setTheirPick(null);
          setRevealed(true);
      }

    } catch (e) {
      console.error("Failed to submit answer", e);
      setRevealed(true);
    }
  };

  const handlePartnerSelect = (partner: any) => {
    setPartnerId(partner.user_id);
    setPartnerName(partner.name);
    setPartnerSheet(false);
    // Reset game state for new partner
    setMyPick(null);
    setTheirPick(null);
    setRevealed(false);
    setLocalIndex(0);
  };

  const handleRelease = async () => {
    if (!partnerId) return;
    try {
      await releaseConnection(partnerId);
      alert("Connection released. You can restore it from the Connections tab within 30 days.");
      navigation.navigate("Pulse");
    } catch (e: any) {
      alert("Failed to release: " + e.message);
    }
  };

  const nextCard = () => {
    setLocalIndex(prev => prev + 1);
    setMyPick(null);
    setTheirPick(null);
    setRevealed(false);
    
    // Pre-populate the NEXT card if already answered
    const nextCardData = dailyCards[currentCardIndex + 1];
    if (nextCardData && allResults.length > 0) {
       const partnerData = allResults.find((r: any) => r.partner_name === partnerName);
       if (partnerData) {
           const matchedAns = partnerData.matched_answers?.find((a: any) => a.question_id === nextCardData.id);
           if (matchedAns?.my_selected_option) {
               setMyPick(matchedAns.my_selected_option.toLowerCase() as "a" | "b");
               if (matchedAns.partner_selected_option) {
                   setTheirPick(matchedAns.partner_selected_option.toLowerCase() as "a" | "b");
                   setRevealed(true);
               } else {
                   setTheirPick(null);
                   setRevealed(false);
               }
           }
       }
    }
  };

  if (loading) {
      return (
          <SafeAreaView style={[styles.safe, { justifyContent: 'center', alignItems: 'center' }]}>
              <ActivityIndicator color={Colors.accent} size="large" />
          </SafeAreaView>
      );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <SamVibeNav 
        onPartnerChange={(newPartnerId) => {
          setPartnerId(newPartnerId);
          const p = activePartners.find(p => p.user_id === newPartnerId);
          if (p) {
            setPartnerName(p.name);
          }
          setMyPick(null);
          setTheirPick(null);
          setRevealed(false);
          setLocalIndex(0);
        }}
      />
      <VibeRefreshControl 
        showsVerticalScrollIndicator={false}
        refreshing={refreshing} 
        onRefresh={onRefresh}
        iconMark="◐"
      >
        {/* Stats strip */}
        <View style={styles.stats1}>
          <View style={styles.stats}>
            <View style={{ gap: 2 }}>
              <AppText variant="smallCaps" color={Colors.muted}>
                Streak
              </AppText>
              <AppText
                variant="display"
                size={22}
                color={Colors.ink}
                style={{ lineHeight: 22 }}
              >
                {streak}
                <AppText variant="mono" size={11} color={Colors.muted}>
                  {" "}
                  d
                </AppText>
              </AppText>
            </View>
            <View style={styles.divider} />
            <View style={{ gap: 2 }}>
              <AppText variant="smallCaps" color={Colors.muted}>
                Match
              </AppText>
              <AppText
                variant="display"
                size={22}
                color={Colors.accent}
                style={{ lineHeight: 22 }}
              >
                {Math.round(matchRate)}
                <AppText variant="mono" size={13} color={Colors.muted}>
                  %
                </AppText>
              </AppText>
            </View>
            <View style={styles.partnerPill}>
              {upcomingDate ? (
                  <LiveCountdownNav targetDate={upcomingDate} />
              ) : (
                  <AppText variant="mono" size={10} color={Colors.accent}>
                      NO UPCOMING DATES
                  </AppText>
              )}
            </View>
          </View>
        </View>

        <View style={styles.inner}>
          {/* Progress Bar */}
          {(() => {
             const conn = connectionsList.find(c => c.user_id === partnerId);
             const currentDay = conn?.current_journey_day || 1;
             return (
               <View style={{ marginBottom: 24 }}>
                 <AppText variant="smallCaps" color={Colors.muted} style={{ marginBottom: 8, textAlign: 'center' }}>
                   Day {currentDay} of 90
                 </AppText>
                 <View style={{ height: 4, backgroundColor: Colors.rule, borderRadius: 2, overflow: 'hidden' }}>
                   <View style={{ height: '100%', backgroundColor: Colors.accent, width: `${(currentDay / 90) * 100}%` }} />
                 </View>
               </View>
             );
          })()}

          {showNoPartnersState ? (
            <View style={styles.limitCard}>
              <AppText
                size={32}
                color={Colors.accent}
                style={{ marginBottom: 10 }}
              >
                ◓
              </AppText>
              <AppText
                variant="display"
                size={24}
                style={{ lineHeight: 28, marginBottom: 6, textAlign: "center" }}
              >
                No active partners.
              </AppText>
              <AppText
                variant="serifItalic"
                size={14}
                color={Colors.muted}
                style={{ textAlign: "center", lineHeight: 22, marginBottom: 20 }}
              >
                Add a partner to start playing and building connections.
              </AppText>
              <AppButton
                variant="outline"
                size="md"
                onPress={() => navigation.navigate("Pulse")}
              >
                Find Connections
              </AppButton>
            </View>
          ) : showNoCardsState ? (
            <View style={styles.limitCard}>
              <AppText
                size={32}
                color={Colors.accent}
                style={{ marginBottom: 10 }}
              >
                ◓
              </AppText>
              <AppText
                variant="display"
                size={24}
                style={{ lineHeight: 28, marginBottom: 6, textAlign: "center" }}
              >
                You're all caught up!
              </AppText>
              <AppText
                variant="serifItalic"
                size={14}
                color={Colors.muted}
                style={{ textAlign: "center", lineHeight: 22 }}
              >
                You've answered all available cards. Check back later for more!
              </AppText>
            </View>
          ) : showLimitReachedState ? (
            <>
              <View style={styles.limitCard}>
                <AppText
                  size={32}
                  color={Colors.accent}
                  style={{ marginBottom: 10 }}
                >
                  ◓
                </AppText>
                <AppText
                  variant="display"
                  size={24}
                  style={{ lineHeight: 28, marginBottom: 6, textAlign: "center" }}
                >
                  That's your{" "}
                  <AppText variant="serifItalic" size={24} color={Colors.accent}>
                    {numberToWord(DAILY_LIMIT)}
                  </AppText>{" "}
                  for today.
                </AppText>
                <AppText
                  variant="serifItalic"
                  size={14}
                  color={Colors.muted}
                  style={{ textAlign: "center", lineHeight: 22 }}
                >
                  {getDailyMessage()}
                </AppText>
              </View>

              {(() => {
                  const res = allResults?.find((r: any) => r.partner_name === partnerName);
                  if (res) {
                      return (
                          <View style={{ marginTop: 16, gap: 12 }}>
                              <View style={styles.limitCard}>
                                  <AppText variant="smallCaps" color={Colors.muted} style={{ marginBottom: 8 }}>
                                    Today's Vibe
                                  </AppText>
                                  {res.both_finished ? (
                                      <>
                                          <AppText variant="display" size={32} color={Colors.ink} style={{ marginBottom: 4 }}>
                                            {Math.round(res.daily_match_percent)}<AppText variant="display" size={20} color={Colors.muted}>%</AppText>
                                          </AppText>
                                          <AppText variant="serifItalic" size={14} color={Colors.muted}>
                                            In sync with {partnerName}
                                          </AppText>
                                      </>
                                  ) : (
                                      <AppText variant="serifItalic" size={14} color={Colors.muted} style={{ textAlign: 'center', marginTop: 8 }}>
                                        Waiting for {partnerName} to finish their cards today to see your match percentage.
                                      </AppText>
                                  )}
                              </View>

                              {/* Breakdown of today's cards */}
                              {res.matched_answers?.map((ans: any, idx: number) => (
                                  <View key={idx} style={[styles.limitCard, { padding: 16, gap: 12 }]}>
                                      <AppText variant="smallCaps" color={Colors.muted} size={11}>
                                        Card {idx + 1}
                                      </AppText>
                                      <AppText variant="heading" size={18} color={Colors.ink} style={{ textAlign: 'center' }}>
                                        {ans.question}
                                      </AppText>
                                      
                                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
                                          <View style={{ flex: 1, alignItems: 'flex-start' }}>
                                              <AppText variant="smallCaps" color={Colors.accent} size={10} style={{ marginBottom: 4 }}>
                                                You
                                              </AppText>
                                              <AppText color={Colors.ink} size={14} style={{ fontWeight: '600', marginBottom: 2 }}>
                                                {ans.my_answer}
                                              </AppText>
                                              {ans.my_answer_time && (
                                                  <AppText variant="serifItalic" color={Colors.muted} size={11}>
                                                    {new Date(ans.my_answer_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                  </AppText>
                                              )}
                                          </View>
                                          
                                          {/* MATCH/DIFFER PILL */}
                                          {ans.partner_answer && (
                                              <View style={{ 
                                                  paddingHorizontal: 8, 
                                                  paddingVertical: 4, 
                                                  backgroundColor: ans.is_match ? Colors.sage : Colors.rule,
                                                  borderRadius: 12,
                                                  marginHorizontal: 8,
                                                  alignSelf: 'center',
                                                  justifyContent: 'center'
                                              }}>
                                                  <AppText variant="mono" size={9} color={ans.is_match ? Colors.bone : Colors.muted}>
                                                      {ans.is_match ? "MATCH" : "DIFFER"}
                                                  </AppText>
                                              </View>
                                          )}

                                          <View style={{ flex: 1, alignItems: 'flex-end' }}>
                                              <AppText variant="smallCaps" color={Colors.muted} size={10} style={{ marginBottom: 4 }}>
                                                {partnerName}
                                              </AppText>
                                              {ans.partner_answer ? (
                                                  <View style={{ alignItems: 'flex-end' }}>
                                                      <AppText color={ans.is_match ? Colors.sage : Colors.ink} size={14} style={{ fontWeight: '600', marginBottom: 2, textAlign: 'right' }}>
                                                        {ans.partner_answer}
                                                      </AppText>
                                                      {ans.partner_answer_time && (
                                                          <AppText variant="serifItalic" color={Colors.muted} size={11}>
                                                            {new Date(ans.partner_answer_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                          </AppText>
                                                      )}
                                                  </View>
                                              ) : (
                                                  <AppText variant="serifItalic" color={Colors.muted} size={13}>
                                                    Waiting...
                                                  </AppText>
                                              )}
                                          </View>
                                      </View>
                                  </View>
                              ))}
                          </View>
                      );
                  }
                  return null;
              })()}
            </>
          ) : card ? (
            <>
              {/* Prompt */}
              <View style={styles.prompt}>
                <AppText
                  variant="smallCaps"
                  color={Colors.accent}
                  style={{ marginBottom: 10 }}
                >
                  Card {currentCardIndex + 1} of {DAILY_LIMIT}
                </AppText>
                <AppText
                  variant="display"
                  size={32}
                  style={{ lineHeight: 32, marginBottom: 6 }}
                >
                  This or that
                  <AppText size={32} color={Colors.accent}>
                    ?
                  </AppText>
                </AppText>
                <AppText variant="serifItalic" size={14} color={Colors.muted}>
                  {card.category} · pick the one that's more you
                </AppText>
              </View>

              {/* The card */}
              <ThisOrThatCard
                card={{ a: card.option_a, b: card.option_b, cat: card.category || "General" }}
                myPick={myPick}
                theirPick={theirPick}
                revealed={revealed}
                partnerName={partnerName}
                onPick={handlePick}
                allPartnerPicks={allResults
                  .map((r: any) => {
                    const matchedAns = r.matched_answers?.find((a: any) => a.question_id === card.id);
                    if (matchedAns && matchedAns.partner_selected_option) {
                      return {
                        name: r.partner_name,
                        pick: matchedAns.partner_selected_option.toLowerCase() as "a" | "b"
                      };
                    }
                    return null;
                  })
                  .filter((item): item is { name: string; pick: "a" | "b" } => item !== null)}
              />

              {/* Status */}
              {!myPick && (
                <AppText
                  variant="serifItalic"
                  size={15}
                  color={Colors.muted}
                  style={{
                    textAlign: "center",
                    lineHeight: 22,
                    marginBottom: 24,
                  }}
                >
                  Pick to lock in.
                </AppText>
              )}
              
              {myPick && !revealed && (() => {
                 const conn = connectionsList.find(c => c.partner_id === partnerId);
                 const stalledSince = conn?.stalled_since ? new Date(conn.stalled_since) : null;
                 const stalledDays = stalledSince ? Math.floor((Date.now() - stalledSince.getTime()) / 86400000) : 0;
                 const isStalled = card.is_anchor && stalledSince;

                 if (isStalled) {
                     return (
                         <View style={{ marginBottom: 24, alignItems: "center", backgroundColor: `${Colors.accent}10`, padding: 20, borderRadius: 14, borderWidth: 1, borderColor: `${Colors.accent}30` }}>
                             <AppText variant="smallCaps" color={Colors.accent} style={{ textAlign: "center", marginBottom: 12 }}>
                                 Anchor Point Reached
                             </AppText>
                             <AppText variant="serifItalic" color={Colors.ink} style={{ textAlign: "center", marginBottom: 16 }}>
                                 {stalledDays >= 4 
                                     ? "Still holding. Answer it, or release the connection." 
                                     : `Waiting on ${partnerName}...`}
                             </AppText>
                             {stalledDays >= 4 && (
                                 <AppButton variant="outline" onPress={handleRelease} style={{ borderColor: Colors.accent }}>
                                     <AppText color={Colors.accent}>Release Connection</AppText>
                                 </AppButton>
                             )}
                         </View>
                     );
                 }

                 return (
                    <AppText
                      variant="smallCaps"
                      color={Colors.accent}
                      style={{ textAlign: "center", marginBottom: 24 }}
                    >
                      Waiting for reveal...
                    </AppText>
                 );
              })()}
              {revealed && (
                <View style={{ marginBottom: 24, gap: 12 }}>
                  {activePartners.filter(p => p.user_id === partnerId).map((partner) => {
                      const pPickData = allResults
                        .map((r: any) => {
                          const matchedAns = r.matched_answers?.find((a: any) => a.question_id === card.id);
                          if (matchedAns && matchedAns.partner_selected_option) {
                            return {
                              name: r.partner_name,
                              pick: matchedAns.partner_selected_option.toLowerCase() as "a" | "b"
                            };
                          }
                          return null;
                        })
                        .filter(Boolean)
                        ?.find(p => p?.name === partner.name);
                      
                      if (!pPickData) {
                          return (
                              <View key={partner.user_id} style={[styles.resultCard, styles.resultDiffer]}>
                                  <AppText variant="display" size={24} color={Colors.ink} style={{ lineHeight: 28, textAlign: 'center' }}>
                                      Waiting for <AppText variant="serifItalic" size={24} color={Colors.accent}>{partner.name}</AppText>
                                  </AppText>
                                  <AppText variant="serifItalic" size={14} color={Colors.muted} style={{ marginTop: 6, textAlign: 'center' }}>
                                      We'll let you know when they answer.
                                  </AppText>
                              </View>
                          );
                      }
                      
                      const pMatched = pPickData.pick === myPick;
                      return (
                          <View key={partner.user_id} style={[styles.resultCard, pMatched ? styles.resultMatch : styles.resultDiffer]}>
                              <AppText
                                  variant="display"
                                  size={24}
                                  color={pMatched ? Colors.sage : Colors.ink}
                                  style={{ lineHeight: 28, textAlign: 'center' }}
                              >
                                  You {pMatched ? (
                                      <AppText variant="serifItalic" size={24} color={Colors.sage}>matched</AppText>
                                  ) : (
                                      <AppText variant="serifItalic" size={24} color={Colors.accent}>differ</AppText>
                                  )} with {partner.name}.
                              </AppText>
                              <AppText
                                  variant="serifItalic"
                                  size={14}
                                  color={Colors.muted}
                                  style={{ marginTop: 6, textAlign: 'center' }}
                              >
                                  {pMatched ? "Same energy." : "Worth a second look — or a laugh."}
                              </AppText>
                          </View>
                      );
                  })}
                  
                  <AppButton full variant="solid" size="lg" onPress={nextCard} style={{ marginTop: 12 }}>
                    Next card →
                  </AppButton>
                </View>
              )}
            </>
          ) : null}

          {/* Pulse teaser */}
          {(currentCardIndex > 0 || cardsAnsweredToday > 0) && (
            <Pressable
                style={styles.pulseTease}
                onPress={() => navigation.navigate("Pulse")}
            >
                <View style={{ flex: 1 }}>
                <AppText
                    variant="smallCaps"
                    color={Colors.accent}
                    style={{ marginBottom: 4 }}
                >
                    The Pulse · unlocked
                </AppText>

                <AppText
                    variant="heading"
                    size={16}
                    color={Colors.bone}
                    style={{ marginBottom: 2 }}
                >
                    You're {Math.round(matchRate)}% in sync
                </AppText>

                <AppText
                    variant="serifItalic"
                    size={13}
                    color={Colors.cream2}
                >
                    See your patterns →
                </AppText>
                </View>

                <AppText size={18} color={Colors.accent}>
                →
                </AppText>
            </Pressable>
          )}

          <AppText
            variant="serifItalic"
            color={Colors.muted}
            style={{ textAlign: "center", marginTop: 40, fontSize: 12 }}
          >
            One card a day. Build the streak.
          </AppText>
          <AppButton
            variant="outline"
            size="md"
            style={{ marginTop: 20 }}
            onPress={() => navigation.navigate("History")}
          >
            View History
          </AppButton>



          <View style={{ height: 80 }} />
        </View>
      </VibeRefreshControl>

      {/* Partner Selector Sheet */}
      <BottomSheet
        open={partnerSheet}
        onClose={() => setPartnerSheet(false)}
        title="Select Partner"
        kicker="PLAYING WITH"
      >
        <View style={{ gap: 12 }}>
          {activePartners.length === 0 && (
            <AppText color={Colors.muted} style={{ textAlign: 'center', marginVertical: 20 }}>
              No active partners found.
            </AppText>
          )}
          {activePartners.map((p, idx) => (
            <TouchableOpacity
              key={idx}
              style={[
                styles.partnerSelectBtn,
                partnerId === p.user_id && styles.partnerSelectBtnActive
              ]}
              onPress={() => handlePartnerSelect(p)}
            >
              <View>
                <AppText variant="heading" size={18} color={partnerId === p.user_id ? Colors.bone : Colors.ink}>
                  {p.name}
                </AppText>
                <AppText variant="mono" size={11} color={partnerId === p.user_id ? Colors.bone : Colors.muted}>
                  MATCH: {Math.round(p.match_percentage)}%  •  STREAK: {p.streak_days}d
                </AppText>
              </View>
              {partnerId === p.user_id && (
                <AppText color={Colors.bone} variant="mono" size={12}>
                  ACTIVE
                </AppText>
              )}
            </TouchableOpacity>
          ))}
        </View>
      </BottomSheet>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bone },
  stats: {
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
  },
  stats1: {
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.rule,
    paddingHorizontal: 20,
  },
  divider: { width: 1, height: 30, backgroundColor: Colors.rule },
  partnerPill: {
    marginLeft: "auto",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 99,
    backgroundColor: `${Colors.accent}15`,
    flexDirection: "row",
    alignItems: "center",
  },
  partnerSelectBtn: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.rule,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.cream,
  },
  partnerSelectBtnActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  inner: { padding: 24 },
  prompt: { textAlign: "center", alignItems: "center", marginBottom: 26 },
  limitCard: {
    padding: 32,
    borderRadius: 14,
    backgroundColor: Colors.cream,
    alignItems: "center",
    marginBottom: 24,
  },
  resultCard: {
    alignItems: "center",
    padding: 20,
    borderRadius: 14,
    marginBottom: 16,
  },
  resultMatch: { backgroundColor: `${Colors.sage}12` },
  resultDiffer: { backgroundColor: `${Colors.cream}99` },
  pulseTease: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: Colors.ink,
    borderRadius: 14,
    padding: 18,
    marginTop: 14,
    marginBottom: 30,
  },
});

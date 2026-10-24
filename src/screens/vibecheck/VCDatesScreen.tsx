import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  ScrollView,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
  RefreshControl,
  DeviceEventEmitter,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors } from "../../constants/colors";
import { AppText } from "../../components/ui/AppText";
import { AppButton } from "../../components/ui/AppButton";
import { AppTextInput } from "../../components/ui/AppTextInput";
import { BottomSheet } from "../../components/ui/BottomSheet";
import { AppDateTimePickerModal } from "../../components/ui/AppDateTimePickerModal";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRoute, RouteProp } from "@react-navigation/native";
import Swipeable from "react-native-gesture-handler/Swipeable";

import SamVibeNav from "@/components/ui/SamVibeNav";
import { getVibeProfile } from "../../services/vibeCheckApi";
import {
  proposeVibeDate,
  listVibeDates,
  updateVibeDate,
  deleteVibeDate,
  cancelVibeDate,
  respondToVibeDate,
  markDatesSeen,
  completeVibeDate,
  hideVibeDate,
  deleteVibeDateForMe,
} from "../../services/vibeDatesApi";

import { VCHiddenDatesBottomSheet } from "./VCHiddenDatesBottomSheet";
import { VibeRefreshControl } from "../../components/ui/VibeRefreshControl";

const getTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

const LiveCountdown = ({ targetDate }: { targetDate: Date }) => {
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    const updateTimer = () => {
      const now = new Date();
      const diff = targetDate.getTime() - now.getTime();
      
      if (diff <= -6 * 60 * 60 * 1000) {
        setTimeLeft("Date passed!");
        return;
      }
      
      if (diff <= 0) {
        setTimeLeft("Happening now!");
        return;
      }
      
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((diff / 1000 / 60) % 60);
      const seconds = Math.floor((diff / 1000) % 60);

      if (days > 0) {
        setTimeLeft(`You have a date in ${days} days, ${hours} hours`);
      } else {
        setTimeLeft(`You have a date in ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
      }
    };
    
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [targetDate]);

  return (
    <AppText variant="mono" size={12} color={Colors.accent} style={{ marginTop: 4 }}>
      {timeLeft}
    </AppText>
  );
};

export const VCDatesScreen: React.FC = () => {
  const [dates, setDates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  
  // Partner tracking to filter dates
  const [activePartners, setActivePartners] = useState<any[]>([]);
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [partnerName, setPartnerName] = useState("Partner");

  const [sheet, setSheet] = useState(false);
  const [cancelSheetDate, setCancelSheetDate] = useState<any>(null);
  const [editingDate, setEditingDate] = useState<any | null>(null);
  const [showHiddenSheet, setShowHiddenSheet] = useState(false);

  // Form States
  const [place, setPlace] = useState("");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedTime, setSelectedTime] = useState(new Date());
  const [meetType, setMeetType] = useState<"location" | "pickup" | "pickedup">("location");
  const [note, setNote] = useState("");

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const formatDisplayDate = (date: Date) => {
    return date.toLocaleDateString("en-US", {
      month: "2-digit",
      day: "2-digit",
      year: "numeric",
    });
  };

  const formatDisplayTime = (date: Date) => {
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setDates([]); // Clear previous state to prevent old data from flashing
      const profile = await getVibeProfile().catch(() => null);
      let currentPartnerId = partnerId;

      if (profile) {
        setMyUserId(profile.user_id);
        const allPartners = [
          ...(profile.active_users || []),
          ...(profile.inactive_users || []),
        ];
        setActivePartners(allPartners);

        if (allPartners.length > 0 && !currentPartnerId) {
          currentPartnerId = allPartners[0].user_id;
          setPartnerId(currentPartnerId);
          setPartnerName(allPartners[0].name);
        }
      }

      if (currentPartnerId) {
        const res = await listVibeDates(currentPartnerId, 1, 100, getTimezone()).catch(() => null);
        if (res?.data) {
          setDates(res.data);
        }
      }
      
      // Mark dates as seen so the badge clears when user views this screen
      await markDatesSeen().catch(() => null);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [partnerId]);

  useFocusEffect(
    useCallback(() => {
      fetchData();
      DeviceEventEmitter.emit("CLEAR_DATES_BADGE");
    }, [fetchData])
  );

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener("REFRESH_VIBE_DATA", fetchData);
    return () => {
      sub.remove();
    };
  }, [fetchData]);

  const route = useRoute<RouteProp<any, 'VCDates'>>();
  const deepLinkedDateId = (route.params as any)?.dateId;

  useEffect(() => {
    if (deepLinkedDateId && dates.length > 0 && !loading) {
       const dateToOpen = dates.find(d => d.id === deepLinkedDateId);
       if (dateToOpen) {
          setEditingDate(dateToOpen);
          setPlace(dateToOpen.where);
          setMeetType(dateToOpen.meet_type || "location");
          setNote(dateToOpen.proposer_note || "");
          
          const dt = new Date(dateToOpen.date);
          setSelectedDate(dt);
          setSelectedTime(dt);
          setSheet(true);
       }
    }
  }, [deepLinkedDateId, dates, loading]);

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const handlePartnerChange = (newPartnerId: string) => {
    setPartnerId(newPartnerId);
    const p = activePartners.find((ap) => ap.user_id === newPartnerId);
    if (p) {
      setPartnerName(p.name);
    }
  };


  const openNewSheet = () => {
    setEditingDate(null);
    setPlace("");
    setSelectedDate(new Date());
    setSelectedTime(new Date());
    setMeetType("location");
    setNote("");
    setSheet(true);
  };

  const openEditSheet = (d: any) => {
    setEditingDate(d);
    setPlace(d.where);
    const [year, month, day] = d.date.split("-");
    const [hour, minute] = d.time.split(":");
    setSelectedDate(new Date(parseInt(year), parseInt(month) - 1, parseInt(day)));
    const t = new Date();
    t.setHours(parseInt(hour), parseInt(minute), 0, 0);
    setSelectedTime(t);
    setMeetType(d.how_we_meet as any);
    setNote(d.note || "");
    setSheet(true);
  };

  const openCloneSheet = (d: any) => {
    setEditingDate(null);
    setPlace(d.where);
    setSelectedDate(new Date());
    setSelectedTime(new Date());
    setMeetType(d.how_we_meet as any);
    setNote(d.note || "");
    setSheet(true);
  };

  const saveDate = async () => {
    if (!partnerId) {
      Alert.alert("No Partner", "You need an active partner to propose a date.");
      return;
    }
    if (!place.trim()) {
      Alert.alert("Missing Info", "Please enter where you're going.");
      return;
    }

    const proposedDateTime = new Date(selectedDate);
    proposedDateTime.setHours(selectedTime.getHours(), selectedTime.getMinutes(), 0, 0);
    if (proposedDateTime < new Date()) {
      Alert.alert("Invalid Time", "You cannot propose a date in the past. Please update the date and time.");
      return;
    }

    const payload = {
      where: place.trim(),
      date: selectedDate.toISOString().split("T")[0],
      time: selectedTime.toTimeString().slice(0, 5),
      how_we_meet: meetType,
      note: note.trim() || undefined,
      timezone: getTimezone(),
    };

    try {
      if (editingDate) {
        if (editingDate.partner_id === myUserId) {
          await respondToVibeDate(editingDate.id, { ...payload, action: "proposed_changes" });
        } else {
          await updateVibeDate(editingDate.id, payload);
        }
      } else {
        await proposeVibeDate({ ...payload, partner_id: partnerId });
      }
      setSheet(false);
      fetchData();
      DeviceEventEmitter.emit("REFRESH_VIBE_DATA");
    } catch (e: any) {
      Alert.alert("Error", e.response?.data?.detail || e.message || "Failed to save date.");
    }
  };

  const handleCancelDate = (dateItem: any) => {
    setCancelSheetDate(dateItem);
  };

  const executeCancel = async (dateItem: any) => {
    try {
      if (dateItem.status === "accepted") {
        await cancelVibeDate(dateItem.id);
      } else {
        await deleteVibeDate(dateItem.id);
      }
      fetchData();
      DeviceEventEmitter.emit("REFRESH_VIBE_DATA");
    } catch (e: any) {
      Alert.alert("Error", e.response?.data?.detail || e.message || "Failed to cancel date.");
    }
  };

  const handleCompleteDate = async (dateItem: any) => {
    try {
      await completeVibeDate(dateItem.id);
      fetchData();
      DeviceEventEmitter.emit("REFRESH_VIBE_DATA");
    } catch (e: any) {
      Alert.alert("Error", e.response?.data?.detail || e.message || "Failed to mark date as completed.");
    }
  };

  const handleRespond = async (id: string, action: "accepted" | "rejected") => {
    try {
      await respondToVibeDate(id, { action });
      fetchData();
      DeviceEventEmitter.emit("REFRESH_VIBE_DATA");
    } catch (e: any) {
      Alert.alert("Error", e.response?.data?.detail || "Failed to respond.");
    }
  };

  const handleHideDate = async (dateId: string) => {
    setDates((prev) => prev.filter((d) => d.id !== dateId));
    try {
      await hideVibeDate(dateId);
      DeviceEventEmitter.emit("REFRESH_VIBE_DATA");
    } catch (e: any) {
      Alert.alert("Error", "Failed to hide date.");
      fetchData(); 
    }
  };

  const handleDeleteForMe = async (dateId: string) => {
    setDates((prev) => prev.filter((d) => d.id !== dateId));
    try {
      await deleteVibeDateForMe(dateId);
      DeviceEventEmitter.emit("REFRESH_VIBE_DATA");
    } catch (e: any) {
      Alert.alert("Error", "Failed to delete date.");
      fetchData(); 
    }
  };

  const renderRightActions = () => (
    <View style={[styles.hideActionContainer, { alignItems: 'flex-end', paddingRight: 24, flex: 1 }]}>
      <Ionicons name="eye-off-outline" size={20} color={Colors.muted} />
      <AppText color={Colors.muted} variant="mono" style={{ fontSize: 10, marginTop: 4, letterSpacing: 1 }}>HIDE</AppText>
    </View>
  );

  const renderLeftActions = () => (
    <View style={[styles.hideActionContainer, { alignItems: 'flex-start', paddingLeft: 24, flex: 1 }]}>
      <Ionicons name="trash-outline" size={20} color={'#D9534F'} />
      <AppText color={'#D9534F'} variant="mono" style={{ fontSize: 10, marginTop: 4, letterSpacing: 1 }}>DELETE</AppText>
    </View>
  );

  // Filter dates for the active partner
  const partnerDates = dates.filter(
    (d) => d.partner_id === partnerId || d.proposer_id === partnerId
  );

  const upcoming = partnerDates.filter((d) => 
    ["pending", "proposed_changes", "accepted"].includes(d.status)
  );

  const past = partnerDates.filter((d) => 
    ["rejected", "cancelled", "completed"].includes(d.status)
  );

  return (
    <SafeAreaView style={styles.safe}>
      <SamVibeNav onPartnerChange={handlePartnerChange} />
      <VibeRefreshControl 
        refreshing={refreshing} 
        onRefresh={onRefresh}
        iconMark="◇"
      >
        <View style={styles.inner}>
          <AppText
            variant="display"
            size={42}
            style={{ lineHeight: 42, marginBottom: 6 }}
          >
            Dates
            <AppText size={42} color={Colors.accent}>
              .
            </AppText>
          </AppText>
          <AppText
            variant="serifItalic"
            size={16}
            color={Colors.muted}
            style={{ lineHeight: 24, marginBottom: 24 }}
          >
            What's next between you two.
          </AppText>

          <AppText
            variant="smallCaps"
            color={Colors.ink2}
            style={{ marginBottom: 14 }}
          >
            Next up
          </AppText>

          {loading ? (
            <ActivityIndicator color={Colors.accent} style={{ marginVertical: 20 }} />
          ) : upcoming.length > 0 ? (
            upcoming.map((dateItem) => {
              const isMine = dateItem.proposer_id === myUserId;
              const isMyTurn = (isMine && dateItem.status === "proposed_changes") || (!isMine && dateItem.status === "pending");
              const isPending = dateItem.status === "pending" || dateItem.status === "proposed_changes";
              
              let statusLabel = "";
              let statusColor: any = Colors.muted;
              if (dateItem.status === "accepted") {
                  statusLabel = "● Confirmed";
                  statusColor = Colors.accent;
              } else if (dateItem.status === "pending") {
                  statusLabel = isMine ? "○ Proposed (Waiting for them)" : "● Proposed (Waiting for you)";
                  statusColor = isMine ? Colors.muted : Colors.sage;
              } else if (dateItem.status === "proposed_changes") {
                  statusLabel = isMine ? "● Changes Proposed (Waiting for you)" : "○ Changes Proposed (Waiting for them)";
                  statusColor = isMine ? Colors.sage : Colors.muted;
              }

              const [y, m, d] = dateItem.date.split("-").map(Number);
              const [h, min] = dateItem.time.split(":").map(Number);
              const targetDate = new Date(y, m - 1, d, h, min);

              return (
                <View key={dateItem.id} style={styles.upcomingCard}>
                  <AppText
                    variant="smallCaps"
                    color={statusColor}
                    style={{ marginBottom: 8 }}
                  >
                    {statusLabel}
                  </AppText>
                  <AppText
                    variant="display"
                    size={26}
                    style={{ lineHeight: 28, marginBottom: 8 }}
                  >
                    {dateItem.where}
                  </AppText>
                  <AppText
                    variant="serifItalic"
                    size={16}
                    color={Colors.muted}
                    style={{ marginBottom: 8 }}
                  >
                    {formatDisplayDate(new Date(dateItem.date))} · {dateItem.time}
                  </AppText>
                  {dateItem.note && (
                    <AppText
                      variant="serifItalic"
                      size={14}
                      color={Colors.ink2}
                      style={{
                        lineHeight: 22,
                        borderTopWidth: 1,
                        borderTopColor: Colors.rule,
                        paddingTop: 12,
                        marginTop: 4,
                      }}
                    >
                      "{dateItem.note}"
                    </AppText>
                  )}
                  {dateItem.status === "accepted" && (
                     <LiveCountdown targetDate={targetDate} />
                  )}

                  <View style={{ flexDirection: "row", gap: 8, marginTop: 16 }}>
                    {isMyTurn ? (
                      <>
                        <AppButton
                          variant="solid"
                          size="sm"
                          style={{ flex: 1 }}
                          onPress={() => handleRespond(dateItem.id, "accepted")}
                        >
                          Accept
                        </AppButton>
                        <AppButton
                          variant="outline"
                          size="sm"
                          style={{ flex: 1 }}
                          onPress={() => openEditSheet(dateItem)}
                        >
                          {isMine ? "Edit" : "Change"}
                        </AppButton>
                        <AppButton
                          variant="outline"
                          size="sm"
                          style={{ flex: 1 }}
                          onPress={() => handleRespond(dateItem.id, "rejected")}
                        >
                          Decline
                        </AppButton>
                      </>
                    ) : (
                      <>
                        {isMine && dateItem.status === "pending" && (
                          <AppButton
                            variant="outline"
                            size="sm"
                            style={{ flex: 1 }}
                            onPress={() => openEditSheet(dateItem)}
                          >
                            Edit
                          </AppButton>
                        )}
                        <AppButton
                          variant="outline"
                          size="sm"
                          style={{ flex: 1 }}
                          onPress={() => handleCancelDate(dateItem)}
                        >
                          Cancel
                        </AppButton>
                        {dateItem.status === "accepted" && (
                           dateItem.completion_requested_by?.includes(myUserId) ? (
                              <AppText variant="smallCaps" color={Colors.muted} style={{ alignSelf: 'center', flex: 1, textAlign: 'center' }}>
                                 Waiting for partner
                              </AppText>
                           ) : (
                              <AppButton
                                variant="solid"
                                size="sm"
                                style={{ flex: 1, backgroundColor: Colors.sage }}
                                onPress={() => handleCompleteDate(dateItem)}
                              >
                                {dateItem.completion_requested_by?.length ? "Confirm Complete" : "Mark Completed"}
                              </AppButton>
                           )
                        )}
                      </>
                    )}
                  </View>
                </View>
              );
            })
          ) : (
            <AppButton
              full
              variant="outline"
              size="lg"
              onPress={openNewSheet}
              style={{ marginBottom: 18 }}
            >
              + Plan something
            </AppButton>
          )}
          
          {upcoming.length > 0 && (
             <AppButton
                full
                variant="outline"
                size="md"
                onPress={openNewSheet}
                style={{ marginBottom: 18, marginTop: 8 }}
              >
                + Plan another
              </AppButton>
          )}

          <AppText
            variant="smallCaps"
            color={Colors.ink2}
            style={{ marginTop: 24, marginBottom: 14 }}
          >
            The history
          </AppText>
          {past.length === 0 ? (
             <AppText variant="serifItalic" color={Colors.muted} style={{ textAlign: 'center', marginTop: 12 }}>
                 No past dates recorded yet.
             </AppText>
          ) : (
             past.map((d, i) => (
                <View key={d.id || i} style={{ marginBottom: 10 }}>
                  <Swipeable
                    renderRightActions={renderRightActions}
                    renderLeftActions={renderLeftActions}
                    onSwipeableOpen={(direction) => {
                      if (direction === 'right') handleHideDate(d.id);
                      if (direction === 'left') handleDeleteForMe(d.id);
                    }}
                    overshootRight={true}
                    overshootLeft={true}
                    friction={1.5}
                  >
                    <Pressable onPress={() => openCloneSheet(d)} style={({ pressed }) => [styles.pastCard, pressed && { opacity: 0.7 }]}>
                      <View>
                        <AppText variant="heading" size={15}>
                          {d.where}
                        </AppText>
                        <AppText
                          variant="mono"
                          color={Colors.light}
                          style={{ fontSize: 9, marginTop: 2 }}
                        >
                          {new Date(d.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase()} · {d.status.toUpperCase()}
                        </AppText>
                        {d.note && (
                            <AppText
                              variant="serifItalic"
                              size={13}
                              color={Colors.muted}
                              style={{ marginTop: 4 }}
                            >
                              {d.note}
                            </AppText>
                        )}
                      </View>
                    </Pressable>
                  </Swipeable>
                </View>
             ))
          )}

          <AppButton
            variant="outline"
            size="sm"
            style={{ marginTop: 24, alignSelf: 'center', borderColor: Colors.rule }}
            onPress={() => setShowHiddenSheet(true)}
          >
            <AppText color={Colors.muted} variant="smallCaps" size={12}>View Hidden History</AppText>
          </AppButton>

          <View style={{ height: 80 }} />
        </View>
      </VibeRefreshControl>

      {/* Hidden Dates BottomSheet */}
      <VCHiddenDatesBottomSheet
        open={showHiddenSheet}
        onClose={() => setShowHiddenSheet(false)}
      />

      {/* Plan / Edit Date BottomSheet */}
      <BottomSheet
        open={sheet}
        onClose={() => setSheet(false)}
        kicker={editingDate ? "EDIT" : "NEW"}
        title={editingDate ? "Edit this date" : "Plan a date"}
      >
        <AppTextInput
          label="WHERE"
          n="01"
          value={place}
          onChangeText={setPlace}
          placeholder="The Fat Radish"
        />

        {/* Date Picker */}
        <View
          style={{
            borderBottomWidth: 1,
            borderBottomColor: Colors.rule,
            marginBottom: 20,
            paddingTop: 10,
          }}
        >
          <AppText
            variant="smallCaps"
            color={Colors.ink2}
            style={{ marginBottom: 8 }}
          >
            02 DATE
          </AppText>
          <Pressable
            style={styles.datePickerRow}
            onPress={() => setShowDatePicker(true)}
          >
            <AppText variant="display" size={20}>
              {formatDisplayDate(selectedDate)}
            </AppText>
            <Ionicons name="calendar-outline" size={26} color="#000" />
          </Pressable>
          <AppDateTimePickerModal
            visible={showDatePicker}
            mode="date"
            value={selectedDate}
            onConfirm={(d) => setSelectedDate(d)}
            onCancel={() => setShowDatePicker(false)}
          />
        </View>

        {/* Time Picker */}
        <View
          style={{
            borderBottomWidth: 1,
            borderBottomColor: Colors.rule,
            marginBottom: 20,
            paddingTop: 10,
          }}
        >
          <AppText
            variant="smallCaps"
            color={Colors.ink2}
            style={{ marginBottom: 8 }}
          >
            03 TIME
          </AppText>
          <Pressable
            style={styles.datePickerRow}
            onPress={() => setShowTimePicker(true)}
          >
            <AppText variant="display" size={20}>
              {formatDisplayTime(selectedTime)}
            </AppText>
            <Ionicons name="time-outline" size={26} color="#000" />
          </Pressable>
          <AppDateTimePickerModal
            visible={showTimePicker}
            mode="time"
            value={selectedTime}
            onConfirm={(t) => setSelectedTime(t)}
            onCancel={() => setShowTimePicker(false)}
          />
        </View>

        {/* How We Meet */}
        <AppText
          variant="smallCaps"
          color={Colors.ink2}
          style={{ marginBottom: 10 }}
        >
          04 HOW WE MEET
        </AppText>
        <View style={styles.meetOptions}>
          {[
            { label: "Meet at the location", value: "location" },
            { label: "I'll pick you up", value: "pickup" },
            { label: "Pick me up", value: "pickedup" },
          ].map((option) => (
            <Pressable
              key={option.value}
              style={[
                styles.meetOption,
                meetType === option.value && styles.meetSelected,
              ]}
              onPress={() => setMeetType(option.value as any)}
            >
              <AppText
              variant="mono"
                style={{
                  color: meetType === option.value ? "#fff" : Colors.ink,
                }}
              >
                {option.label}
              </AppText>
              <View
                style={[
                  styles.radio,
                  meetType === option.value && styles.radioSelected,
                ]}
              />
            </Pressable>
          ))}
        </View>

        <AppTextInput
          label="A NOTE (optional)"
          n="05"
          value={note}
          onChangeText={setNote}
          placeholder="Low key dinner..."
          multiline
        />

        <AppButton
          full
          variant="solid"
          size="lg"
          style={{ marginTop: 28 }}
          onPress={saveDate}
        >
          {editingDate ? "Update Date →" : "Propose Date →"}
        </AppButton>
      </BottomSheet>

      <BottomSheet
        open={!!cancelSheetDate}
        onClose={() => setCancelSheetDate(null)}
        kicker="CANCEL DATE"
        title="Are you sure?"
      >
        <AppText style={{ marginBottom: 24, fontSize: 16, color: Colors.ink2, lineHeight: 24 }}>
          This will cancel the date and notify {partnerName || "your partner"}.
        </AppText>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <AppButton
            variant="outline"
            style={{ flex: 1 }}
            onPress={() => setCancelSheetDate(null)}
          >
            Keep It
          </AppButton>
          <AppButton
            variant="solid"
            style={{ flex: 1, backgroundColor: Colors.accent }}
            onPress={() => {
              if (cancelSheetDate) executeCancel(cancelSheetDate);
              setCancelSheetDate(null);
            }}
          >
            Yes, Cancel
          </AppButton>
        </View>
      </BottomSheet>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bone },
  inner: { padding: 24 },
  upcomingCard: {
    borderRadius: 14,
    padding: 22,
    backgroundColor: Colors.bone,
    borderWidth: 1,
    borderColor: `${Colors.accent}30`,
    marginBottom: 12,
  },
  pastCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    backgroundColor: Colors.bone,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.rule,
    padding: 14,
    gap: 12,
  },
  datePickerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 8,
  },
  meetOptions: {
    marginBottom: 10,
    gap: 8,
  },
  meetOption: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 15,
    backgroundColor: "#EAE2D4",
    borderRadius: 12,
  },
  meetSelected: {
    backgroundColor: "#1C1C1E",
  },
  radio: {
    width: 6,
    height: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.rule,
  },
  radioSelected: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  hideActionContainer: {
    justifyContent: 'center',
    height: '100%',
    flex: 1,
  },
});

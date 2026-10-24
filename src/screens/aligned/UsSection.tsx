"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { View, StyleSheet, Pressable, Alert, DeviceEventEmitter } from "react-native";
import { Colors } from "../../constants/colors";
import { AppText } from "@/components/ui/AppText";
import { AppButton } from "@/components/ui/AppButton";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { CountdownBlock } from "@/components/home/CountdownBlock";
import { Calendar, DateData } from "react-native-calendars";
import { AppTextInput } from "@/components/ui/AppTextInput";
import { Ionicons } from "@expo/vector-icons";
import {
  getUsStats,
  updateStartDate,
  createMilestone,
  deleteMilestone,
  setNextMeet,
  updateNextMeet,
  getNextMeetCountdown,
} from "../../services/usApi";
import {
  createProposal,
  getPendingProposals,
  approveProposal,
  rejectProposal,
} from "../../services/proposalApi";
import { getMe } from "../../services/authApi";
import { triggerNotification } from "../../services/notificationApi";

type UsTab = "TIME" | "DATES" | "REUNION";
type ActiveSheet = "startDate" | "addMarkedDay" | "reunionEdit" | null;

const formatDisplayDate = (dateString: string | null): string => {
  if (!dateString) return "mm/dd/yyyy";
  // Handle both yyyy-mm-dd and mm.dd.yyyy formats
  if (dateString.includes("-")) {
    const [year, month, day] = dateString.split("-");
    return `${month}/${day}/${year}`;
  }
  const parts = dateString.split(".");
  return `${parts[0]}/${parts[1]}/${parts[2]}`;
};

const formatReadableDate = (dateString: string): string => {
  // Convert mm.dd.yyyy to readable "Month Day, Year"
  if (!dateString) return "";
  const parts = dateString.split(".");
  if (parts.length !== 3) return dateString;
  const d = new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1]));
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
};

const toApiDate = (dateString: string): string => {
  // Convert yyyy-mm-dd (from calendar) to mm.dd.yyyy (API format)
  if (dateString.includes("-")) {
    const [year, month, day] = dateString.split("-");
    return `${month}.${day}.${year}`;
  }
  return dateString;
};

const toCalendarDate = (dateString: string): string => {
  // Convert mm.dd.yyyy to yyyy-mm-dd (for calendar)
  if (dateString.includes(".")) {
    const parts = dateString.split(".");
    return `${parts[2]}-${parts[0]}-${parts[1]}`;
  }
  return dateString;
};

interface UsSectionProps {
  refreshTrigger?: number;
}

const UsSection: React.FC<UsSectionProps> = ({ refreshTrigger = 0 }) => {
  const [activeUsTab, setActiveUsTab] = useState<UsTab>("TIME");
  const [activeSheet, setActiveSheet] = useState<ActiveSheet>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Live data state
  const [totalDays, setTotalDays] = useState(0);
  const [monthsPassed, setMonthsPassed] = useState(0);
  const [relationshipStartDate, setRelationshipStartDate] = useState("11.14.2023");
  const [daysUntilAnniversary, setDaysUntilAnniversary] = useState(0);
  const [nextMilestone, setNextMilestone] = useState<any>(null);
  const [userMilestones, setUserMilestones] = useState<any[]>([]);
  const [pendingProposals, setPendingProposals] = useState<any[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [hasPartner, setHasPartner] = useState(false);

  // Reunion live data
  const [reunionData, setReunionData] = useState<any>(null);
  const [reunionTargetDate, setReunionTargetDate] = useState<Date>(new Date());

  // "Add a Marked Day" sheet state
  const [markedDayDate, setMarkedDayDate] = useState<string | null>(null);
  const [showMarkedCalendar, setShowMarkedCalendar] = useState(false);
  const [selectedMark, setSelectedMark] = useState<string | null>(null);
  const [markedDayTitle, setMarkedDayTitle] = useState("");
  const [deleteMilestoneTarget, setDeleteMilestoneTarget] = useState<{ id: string; title: string } | null>(null);
  const [isDeletingMilestone, setIsDeletingMilestone] = useState(false);

  // "Start Date" sheet state
  const [startDateEdit, setStartDateEdit] = useState<string>("2023-11-14");
  const [showStartCalendar, setShowStartCalendar] = useState(false);

  // "Reunion" sheet state
  const [reunionDateEdit, setReunionDateEdit] = useState<string>("");
  const [reunionCityEdit, setReunionCityEdit] = useState<string>("");
  const [reunionTimeEdit, setReunionTimeEdit] = useState<string>("12:00 PM");
  const [showReunionCalendar, setShowReunionCalendar] = useState(false);

  // Countdown timer ref
  const countdownInterval = useRef<any>(null);

  const loadData = useCallback(async () => {
    try {
      const statsRes = await getUsStats();
      if (statsRes.success && statsRes.data) {
        const d = statsRes.data;
        setTotalDays(d.total_days);
        setMonthsPassed(d.months_passed + d.years_passed * 12);
        setRelationshipStartDate(d.relationship_start_date);
        setDaysUntilAnniversary(d.days_until_anniversary);
        setStartDateEdit(toCalendarDate(d.relationship_start_date));

        // Find the next day-based milestone
        const daysMilestone = d.upcoming_milestones.find((m: any) => m.type === "days");
        setNextMilestone(daysMilestone || null);

        // User/custom milestones for DATES tab
        const custom = d.upcoming_milestones.filter(
          (m: any) => m.type === "custom" || m.type === "birthday"
        );
        setUserMilestones(custom);
      }
    } catch (e) {
      console.log("Error loading Us stats:", e);
    }

    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const countdownRes = await getNextMeetCountdown(tz);
      if (countdownRes.success && countdownRes.data) {
        setReunionData(countdownRes.data);
        // Build the target date from countdown data for CountdownBlock
        const cd = countdownRes.data;
        const calDate = toCalendarDate(cd.date);
        setReunionDateEdit(calDate);
        setReunionCityEdit(cd.city_name || "");
        // Set target date for the CountdownBlock
        const now = new Date();
        const target = new Date(
          now.getTime() +
            (cd.countdown.days * 86400 + cd.countdown.hours * 3600 + cd.countdown.minutes * 60 + cd.countdown.seconds) * 1000
        );
        setReunionTargetDate(target);
      }
    } catch (e) {
      console.log("Error loading countdown:", e);
    }

    try {
      const meData = await getMe();
      if (meData) {
        setCurrentUserId(meData.id);
        setHasPartner(!!meData.partner || meData.is_aligned);
      }
      
      const propsRes = await getPendingProposals();
      if (propsRes.success && propsRes.data) {
        setPendingProposals(propsRes.data);
      }
    } catch (e) {
      console.log("Error loading proposals:", e);
    }

    setIsLoading(false);
  }, []);

  const loadTimeoutRef = useRef<any>(null);
  const debouncedLoadData = useCallback(() => {
    if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current);
    loadTimeoutRef.current = setTimeout(() => {
      loadData();
    }, 300);
  }, [loadData]);

  useEffect(() => {
    loadData();

    const sub1 = DeviceEventEmitter.addListener('REFRESH_ALIGNED_DATA', debouncedLoadData);
    const sub2 = DeviceEventEmitter.addListener('US_SECTION_UPDATED', debouncedLoadData);
    const sub3 = DeviceEventEmitter.addListener('ALIGNMENT_BONDED', debouncedLoadData);
    const sub4 = DeviceEventEmitter.addListener('ALIGNMENT_BROKEN', debouncedLoadData);
    const sub5 = DeviceEventEmitter.addListener('SET_US_SECTION_TAB', (tab: UsTab) => {
      if (tab) {
        setActiveUsTab(tab);
      }
    });

    return () => {
      if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current);
      sub1.remove();
      sub2.remove();
      sub3.remove();
      sub4.remove();
      sub5.remove();
    };
  }, [debouncedLoadData, loadData, refreshTrigger]);

  const handleMarkedDayPress = (day: DateData) => {
    setMarkedDayDate(day.dateString);
    setShowMarkedCalendar(false);
  };

  const handleStartDatePress = (day: DateData) => {
    setStartDateEdit(day.dateString);
    setShowStartCalendar(false);
  };

  const handleReunionDatePress = (day: DateData) => {
    setReunionDateEdit(day.dateString);
    setShowReunionCalendar(false);
  };

  const handleCloseSheet = () => {
    setActiveSheet(null);
    setShowMarkedCalendar(false);
    setShowStartCalendar(false);
    setShowReunionCalendar(false);
  };

  const handleSaveStartDate = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const apiDate = toApiDate(startDateEdit);
      const res = await createProposal("start_date", { date: apiDate });
      if (res.success) {
        Alert.alert("Proposal Sent", "Your partner needs to approve this change.");
      } else {
        Alert.alert("Error", res.message);
      }
      handleCloseSheet();
      await loadData(); // refresh
    } catch (e) {
      console.log("Error saving start date:", e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddMilestone = async () => {
    if (isSubmitting || !markedDayTitle.trim() || !markedDayDate) return;
    setIsSubmitting(true);
    try {
      const apiDate = toApiDate(markedDayDate);
      await createMilestone({
        title: markedDayTitle,
        date: apiDate,
        description: selectedMark || "◈",
        type: "custom",
      });
      triggerNotification("Date Added", `Added ${markedDayTitle} to the timeline`).catch(() => {});
      // Reset form
      setMarkedDayTitle("");
      setMarkedDayDate(null);
      setSelectedMark(null);
      handleCloseSheet();
      await loadData(); // refresh
    } catch (e) {
      console.log("Error adding milestone:", e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteMilestone = async (id: string) => {
    try {
      await deleteMilestone(id);
      await loadData();
    } catch (e) {
      console.log("Error deleting milestone:", e);
    }
  };

  const handleReunionSave = async () => {
    if (isSubmitting || !reunionDateEdit) return;
    setIsSubmitting(true);
    try {
      const apiDate = toApiDate(reunionDateEdit);
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

      const payload = {
        date: apiDate,
        time: reunionTimeEdit || "12:00 PM",
        timezone: tz,
        city_name: reunionCityEdit || "TBD",
      };
      
      const res = await createProposal("reunion_date", payload);
      if (res.success) {
        Alert.alert("Proposal Sent", "Your partner needs to approve this change.");
      } else {
        Alert.alert("Error", res.message);
      }

      handleCloseSheet();
      await loadData();
    } catch (e) {
      console.log("Error saving reunion:", e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const MARKS = ["◆", "○", "◉", "◇", "□", "🜂", "✦", "·"];

  // Proposal helpers
  const pendingStartDateProposal = pendingProposals.find((p: any) => p.type === "start_date");
  const pendingReunionProposal = pendingProposals.find((p: any) => p.type === "reunion_date");
  const isPartnerProposal = (proposal: any) => proposal?.partner_id === currentUserId;

  const handleApproveProposal = async (proposalId: string) => {
    try {
      const res = await approveProposal(proposalId);
      if (res.success) {
        Alert.alert("Approved", "The change has been applied.");
        await loadData();
      } else {
        Alert.alert("Error", res.message);
      }
    } catch (e) {
      console.log("Error approving proposal:", e);
    }
  };

  const handleRejectProposal = async (proposalId: string) => {
    try {
      const res = await rejectProposal(proposalId);
      if (res.success) {
        Alert.alert("Rejected", "The proposed change was rejected.");
        await loadData();
      } else {
        Alert.alert("Error", res.message);
      }
    } catch (e) {
      console.log("Error rejecting proposal:", e);
    }
  };

  return (
    <View>
      <View style={styles.headerRow}>
        <AppText
          variant="smallCaps"
          color={Colors.ink2}
          style={styles.sectionLabel}
        >
          Us
        </AppText>
        {hasPartner && (
          <Pressable onPress={() => setActiveSheet("startDate")}>
            <AppText variant="mono" color={Colors.accent} style={styles.editBtn}>
              EDIT
            </AppText>
          </Pressable>
        )}
      </View>

      <View style={styles.usCard}>
        {!hasPartner ? (
          <View style={[styles.card, { padding: 32, alignItems: 'center', marginTop: 20 }]}>
            <AppText variant="serifItalic" size={18} color={Colors.muted} style={{ textAlign: "center", lineHeight: 26 }}>
              Align with a partner to unlock your shared timeline, dates, and reunions.
            </AppText>
          </View>
        ) : (
          <>
            {/* Tabs */}
            <View style={styles.tabContainer}>
          {(["TIME", "DATES", "REUNION"] as const).map((tab) => (
            <Pressable
              key={tab}
              style={styles.tab}
              onPress={() => setActiveUsTab(tab)}
            >
              <AppText
                variant="smallCaps"
                color={activeUsTab === tab ? Colors.ink : Colors.muted}
                style={{ fontSize: 12, letterSpacing: 0.5 }}
              >
                {tab}
              </AppText>
              {activeUsTab === tab && <View style={styles.tabIndicator} />}
            </Pressable>
          ))}
        </View>

        {activeUsTab === "TIME" && (
          <View style={styles.timeTab}>
            <View style={[styles.card, { marginTop: 10 }]}>
              <View style={styles.daysCounterRow}>
                <AppText
                  variant="display"
                  size={totalDays >= 1000 ? 54 : totalDays >= 100 ? 64 : 74}
                  style={[
                    styles.daysNumber,
                    { lineHeight: totalDays >= 1000 ? 58 : totalDays >= 100 ? 68 : 78 },
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {totalDays}
                </AppText>
                <View style={styles.daysLabelCol}>
                  <AppText variant="serifItalic" size={20} color={Colors.muted} style={styles.daysText}>
                    days
                  </AppText>
                  <AppText variant="smallCaps" color={Colors.accent} size={11} style={styles.countingText}>
                    & counting
                  </AppText>
                </View>
              </View>
              <AppText
                variant="serifItalic"
                size={14}
                color={Colors.muted}
                style={{ marginTop: 10, lineHeight: 20 }}
              >
                Since{" "}
                <AppText variant="serifItalic" size={14} color={Colors.ink}>
                  {formatReadableDate(relationshipStartDate)}
                </AppText>{" "}
                — the day it all began.
              </AppText>
            </View>

            <View style={styles.milestoneRow}>
              {[
                { value: nextMilestone ? `${nextMilestone.days_left}` : "—", label: nextMilestone ? `DAYS TO\n${nextMilestone.title.toUpperCase()}` : "MILESTONE" },
                { value: `${daysUntilAnniversary}d`, label: "NEXT ANNIVERSARY" },
                { value: `${monthsPassed}`, label: "MONTHS" },
              ].map(({ value, label }, index, array) => (
                <View
                  key={label}
                  style={[
                    styles.milestoneBox1,
                    index < array.length - 1 && styles.milestoneBorder,
                  ]}
                >
                  <AppText variant="display" size={28} numberOfLines={1} adjustsFontSizeToFit>
                    {value}
                  </AppText>
                  <AppText
                    variant="mono"
                    color={Colors.muted}
                    style={{ fontSize: 9.5, marginTop: 4, textAlign: 'center', lineHeight: 13 }}
                  >
                    {label}
                  </AppText>
                </View>
              ))}
            </View>

            {/* Pending Start Date Proposal Banner */}
            {pendingStartDateProposal && (
              <View style={{ backgroundColor: '#FFF3E0', borderRadius: 8, padding: 12, marginTop: 12, borderWidth: 1, borderColor: '#FFE0B2' }}>
                <AppText variant="mono" color={Colors.ink2} style={{ fontSize: 10, marginBottom: 6 }}>
                  {isPartnerProposal(pendingStartDateProposal)
                    ? "YOUR PARTNER PROPOSED A NEW START DATE"
                    : "AWAITING PARTNER APPROVAL"}
                </AppText>
                <AppText variant="serifItalic" size={15} color={Colors.ink}>
                  Proposed: {formatReadableDate(pendingStartDateProposal.payload?.date || "")}
                </AppText>
                {isPartnerProposal(pendingStartDateProposal) ? (
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                    <Pressable
                      style={{ flex: 1, backgroundColor: Colors.ink, borderRadius: 6, paddingVertical: 10, alignItems: 'center' }}
                      onPress={() => handleApproveProposal(pendingStartDateProposal.id)}
                    >
                      <AppText variant="mono" color={Colors.bone} style={{ fontSize: 11 }}>APPROVE</AppText>
                    </Pressable>
                    <Pressable
                      style={{ flex: 1, backgroundColor: '#f5f0eb', borderRadius: 6, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: Colors.rule }}
                      onPress={() => handleRejectProposal(pendingStartDateProposal.id)}
                    >
                      <AppText variant="mono" color={Colors.accent} style={{ fontSize: 11 }}>REJECT</AppText>
                    </Pressable>
                  </View>
                ) : (
                  <AppText variant="mono" color={Colors.muted} style={{ fontSize: 10, marginTop: 6 }}>
                    Waiting for your partner to respond...
                  </AppText>
                )}
              </View>
            )}
          </View>
        )}

        {activeUsTab === "DATES" && (
          <View style={styles.datesTab}>
            {userMilestones.length > 0 ? (
              userMilestones.map((milestone, index) => (
                <View
                  key={milestone.id}
                  style={styles.dateRow}
                >
                  <View
                    style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}
                  >
                    <AppText size={18}>{milestone.description || "◈"}</AppText>
                    <View style={{ flex: 1 }}>
                      <AppText variant="heading" size={17}>
                        {milestone.title}
                      </AppText>
                      <AppText variant="mono" color={Colors.muted}>
                        {formatReadableDate(milestone.date).toUpperCase().split(",")[0]}
                      </AppText>
                    </View>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                    <AppText variant="mono" color={Colors.muted}>
                      #{String(index + 1).padStart(2, "0")}
                    </AppText>
                    <Pressable
                      hitSlop={10}
                      onPress={() => setDeleteMilestoneTarget({ id: milestone.id, title: milestone.title })}
                      style={{ padding: 4 }}
                    >
                      <Ionicons name="trash-outline" size={16} color="#D9534F" />
                    </Pressable>
                  </View>
                </View>
              ))
            ) : (
              <View style={{ padding: 20, alignItems: "center" }}>
                <AppText
                  variant="serifItalic"
                  size={15}
                  color={Colors.muted}
                  style={{ textAlign: "center", lineHeight: 22 }}
                >
                  No dates marked yet. Add one below.
                </AppText>
              </View>
            )}

            <Pressable
              style={styles.addDateButton}
              onPress={() => setActiveSheet("addMarkedDay")}
            >
              <AppText
                variant="mono"
                color={Colors.accent}
                style={{ fontSize: 10 }}
              >
                + ADD A DATE
              </AppText>
            </Pressable>
          </View>
        )}

        {activeUsTab === "REUNION" && (
          <View style={styles.reunionTab}>
            {reunionData ? (
              <>
                <View style={styles.card}>
                  <AppText
                    variant="serifItalic"
                    size={15}
                    color={Colors.muted}
                    style={{ marginBottom: 18, lineHeight: 22 }}
                  >
                    Until you hold each other again, there is a quiet countdown.
                  </AppText>
                  <CountdownBlock targetDate={reunionTargetDate} />
                </View>

                <View style={styles.reunionFooter}>
                  <AppText
                    variant="mono"
                    color={Colors.muted}
                    style={{ fontSize: 10 }}
                  >
                    {reunionData.date} · {(reunionData.city_name || "").toUpperCase()}
                  </AppText>
                  <Pressable onPress={() => setActiveSheet("reunionEdit")}>
                    <AppText
                      variant="mono"
                      color={Colors.accent}
                      style={{ fontSize: 10 }}
                    >
                      EDIT
                    </AppText>
                  </Pressable>
                </View>
              </>
            ) : (
              <View style={[styles.card, { padding: 32, alignItems: 'center' }]}>
                <AppText
                  variant="serifItalic"
                  size={16}
                  color={Colors.muted}
                  style={{ textAlign: "center", marginBottom: 16 }}
                >
                  No reunion date has been set or approved yet.
                </AppText>
                <AppButton variant="outline" size="sm" onPress={() => setActiveSheet("reunionEdit")}>
                  Propose Reunion Date
                </AppButton>
              </View>
            )}

            {/* Pending Reunion Proposal Banner */}
            {pendingReunionProposal && (
              <View style={{ backgroundColor: '#FFF3E0', borderRadius: 8, padding: 12, marginTop: 12, borderWidth: 1, borderColor: '#FFE0B2' }}>
                <AppText variant="mono" color={Colors.ink2} style={{ fontSize: 10, marginBottom: 6 }}>
                  {isPartnerProposal(pendingReunionProposal)
                    ? "YOUR PARTNER PROPOSED A NEW REUNION DATE"
                    : "AWAITING PARTNER APPROVAL"}
                </AppText>
                <AppText variant="serifItalic" size={15} color={Colors.ink}>
                  Proposed: {formatReadableDate(pendingReunionProposal.payload?.date || "")}
                  {pendingReunionProposal.payload?.city_name ? ` in ${pendingReunionProposal.payload.city_name}` : ""}
                </AppText>
                {isPartnerProposal(pendingReunionProposal) ? (
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                    <Pressable
                      style={{ flex: 1, backgroundColor: Colors.ink, borderRadius: 6, paddingVertical: 10, alignItems: 'center' }}
                      onPress={() => handleApproveProposal(pendingReunionProposal.id)}
                    >
                      <AppText variant="mono" color={Colors.bone} style={{ fontSize: 11 }}>APPROVE</AppText>
                    </Pressable>
                    <Pressable
                      style={{ flex: 1, backgroundColor: '#f5f0eb', borderRadius: 6, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: Colors.rule }}
                      onPress={() => handleRejectProposal(pendingReunionProposal.id)}
                    >
                      <AppText variant="mono" color={Colors.accent} style={{ fontSize: 11 }}>REJECT</AppText>
                    </Pressable>
                  </View>
                ) : (
                  <AppText variant="mono" color={Colors.muted} style={{ fontSize: 10, marginTop: 6 }}>
                    Waiting for your partner to respond...
                  </AppText>
                )}
              </View>
            )}
          </View>
        )}
          </>
        )}
      </View>

      {/* Start Date Sheet */}
      <BottomSheet
        open={activeSheet === "startDate"}
        onClose={handleCloseSheet}
        kicker="PAGE 02"
        title="Our beginning"
      >
        <View>
          <AppText
            variant="serifItalic"
            size={15}
            color={Colors.muted}
            style={{ marginBottom: 24, marginTop: 15 }}
          >
            When did your story begin?
          </AppText>

          <AppText
            variant="smallCaps"
            color={Colors.ink2}
            style={styles.sheetLabel}
          >
            01 START DATE
          </AppText>

          <View style={styles.datePickerRow}>
            <AppText variant="display" style={{ letterSpacing: 1 }} size={20}>
              {formatDisplayDate(startDateEdit)}
            </AppText>
            <Pressable onPress={() => setShowStartCalendar((v) => !v)}>
              <Ionicons name="calendar-outline" size={26} color="#000" />
            </Pressable>
          </View>

          {showStartCalendar && (
            <View style={styles.calendarWrapper}>
              <Calendar
                current={startDateEdit}
                onDayPress={handleStartDatePress}
                markedDates={
                  startDateEdit
                    ? {
                        [startDateEdit]: {
                          selected: true,
                          selectedColor: Colors.accent,
                        },
                      }
                    : {}
                }
                theme={{
                  todayTextColor: Colors.accent,
                  arrowColor: Colors.accent,
                }}
              />
            </View>
          )}

          <AppButton
            variant="solid"
            full
            size="lg"
            style={{ marginTop: 20 }}
            onPress={handleSaveStartDate}
            disabled={isSubmitting || !!pendingStartDateProposal}
          >
            {isSubmitting ? "SENDING..." : pendingStartDateProposal ? "PROPOSAL PENDING..." : "PROPOSE CHANGE →"}
          </AppButton>
        </View>
      </BottomSheet>

      {/* Add a Date Sheet */}
      <BottomSheet
        open={activeSheet === "addMarkedDay"}
        onClose={handleCloseSheet}
        kicker="DATES"
        title="Add a marked day"
      >
        <View style={{ marginTop: 8 }}>
          <View>
            <AppTextInput
              label="What it is"
              n="01"
              placeholder="First Trip Together"
              value={markedDayTitle}
              onChangeText={setMarkedDayTitle}
            />
          </View>

          {/* 02 Date */}
          <View style={{ marginBottom: 28 }}>
            <AppText
              variant="smallCaps"
              color={Colors.ink2}
              style={styles.sheetLabel}
            >
              02 WHEN
            </AppText>
            <View style={styles.datePickerRow}>
              <AppText
                variant="display"
                size={20}
                color={markedDayDate ? Colors.ink : Colors.muted}
              >
                {formatDisplayDate(markedDayDate)}
              </AppText>
              <Pressable onPress={() => setShowMarkedCalendar((v) => !v)}>
                <Ionicons name="calendar-outline" size={26} color="#000" />
              </Pressable>
            </View>

            {showMarkedCalendar && (
              <View style={styles.calendarWrapper}>
                <Calendar
                  onDayPress={handleMarkedDayPress}
                  markedDates={
                    markedDayDate
                      ? {
                          [markedDayDate]: {
                            selected: true,
                            selectedColor: Colors.accent,
                          },
                        }
                      : {}
                  }
                  theme={{
                    todayTextColor: Colors.accent,
                    arrowColor: Colors.accent,
                  }}
                />
              </View>
            )}
          </View>

          <View>
            <AppText
              variant="smallCaps"
              color={Colors.ink2}
              style={styles.sheetLabel}
            >
              03 MARK
            </AppText>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              {MARKS.map((mark) => (
                <Pressable
                  key={mark}
                  onPress={() => setSelectedMark(mark)}
                  style={[
                    styles.markBox,
                    selectedMark === mark && styles.markBoxActive,
                  ]}
                >
                  <AppText size={26}>{mark}</AppText>
                </Pressable>
              ))}
            </View>
          </View>

          <AppButton
            variant="solid"
            full
            size="lg"
            style={{ marginTop: 40 }}
            onPress={handleAddMilestone}
            disabled={isSubmitting || !markedDayTitle.trim() || !markedDayDate}
          >
            {isSubmitting ? "ADDING..." : "ADD →"}
          </AppButton>
        </View>
      </BottomSheet>

      {/* Reunion Edit Sheet */}
      <BottomSheet
        open={activeSheet === "reunionEdit"}
        onClose={handleCloseSheet}
        kicker="REUNION"
        title="Next time, together"
      >
        <View>
          <AppText
            variant="serifItalic"
            size={15}
            color={Colors.muted}
            style={{ marginBottom: 24 }}
          >
            The date you'll next hold each other.
          </AppText>

          <AppText
            variant="smallCaps"
            color={Colors.ink2}
            style={styles.sheetLabel}
          >
            01 REUNION DATE
          </AppText>

          <View style={styles.datePickerRow}>
            <AppText variant="display" size={32}>
              {formatDisplayDate(reunionDateEdit)}
            </AppText>
            <Pressable onPress={() => setShowReunionCalendar((v) => !v)}>
              <Ionicons name="calendar-outline" size={26} color="#000" />
            </Pressable>
          </View>

          {showReunionCalendar && (
            <View style={styles.calendarWrapper}>
              <Calendar
                current={reunionDateEdit}
                onDayPress={handleReunionDatePress}
                markedDates={
                  reunionDateEdit
                    ? {
                        [reunionDateEdit]: {
                          selected: true,
                          selectedColor: Colors.accent,
                        },
                      }
                    : {}
                }
                theme={{
                  todayTextColor: Colors.accent,
                  arrowColor: Colors.accent,
                }}
              />
            </View>
          )}

          <AppTextInput
            label="City"
            n="02"
            placeholder="Tulum"
            value={reunionCityEdit}
            onChangeText={setReunionCityEdit}
          />

          <AppButton
            variant="solid"
            full
            size="lg"
            style={{ marginTop: 40 }}
            onPress={handleReunionSave}
            disabled={isSubmitting || !reunionDateEdit || !!pendingReunionProposal}
          >
            {isSubmitting ? "SENDING..." : pendingReunionProposal ? "PROPOSAL PENDING..." : "PROPOSE CHANGE →"}
          </AppButton>
        </View>
      </BottomSheet>

      {/* Delete Marked Date Confirmation Sheet */}
      <BottomSheet
        open={!!deleteMilestoneTarget}
        onClose={() => setDeleteMilestoneTarget(null)}
        kicker="DELETE DATE"
        title="Remove marked date"
      >
        <View style={{ paddingVertical: 10, gap: 14 }}>
          <AppText variant="serifItalic" size={15} color={Colors.ink2}>
            Are you sure you want to remove &ldquo;{deleteMilestoneTarget?.title}&rdquo; from your marked dates? Your partner will receive an alert and notification.
          </AppText>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
            <AppButton
              variant="outline"
              size="md"
              style={{ flex: 1 }}
              onPress={() => setDeleteMilestoneTarget(null)}
              disabled={isDeletingMilestone}
            >
              Cancel
            </AppButton>
            <AppButton
              variant="solid"
              size="md"
              style={{ flex: 1, backgroundColor: '#D9534F' }}
              textStyle={{ color: '#FFF' }}
              disabled={isDeletingMilestone}
              onPress={async () => {
                if (!deleteMilestoneTarget) return;
                setIsDeletingMilestone(true);
                try {
                  await handleDeleteMilestone(deleteMilestoneTarget.id);
                  setDeleteMilestoneTarget(null);
                } catch (e) {
                  console.log("Error deleting milestone:", e);
                } finally {
                  setIsDeletingMilestone(false);
                }
              }}
            >
              {isDeletingMilestone ? "Removing..." : "Delete Date"}
            </AppButton>
          </View>
        </View>
      </BottomSheet>
    </View>
  );
};

export default UsSection;

const styles = StyleSheet.create({
  sectionLabel: { marginBottom: 4, marginTop: 8 },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  editBtn: { fontSize: 10 },

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
    paddingVertical: 10,
    alignItems: "center",

    position: "relative",
  },
  tabIndicator: {
    position: "absolute",
    bottom: 0,
    height: 3,
    width: "60%",
    backgroundColor: Colors.accent,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
  },

  timeTab: { paddingHorizontal: 12, paddingVertical: 10 },
  daysCounterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  daysNumber: {
    flexShrink: 1,
  },
  daysLabelCol: {
    flexShrink: 0,
    justifyContent: "center",
  },
  daysText: {
    lineHeight: 22,
  },
  countingText: {
    letterSpacing: 0.8,
    lineHeight: 14,
    marginTop: 2,
  },
  milestoneRow: {
    flexDirection: "row",
    marginTop: 24,
    marginHorizontal: 4,
  },

  milestoneBox1: {
    flex: 1,
    paddingVertical: 14,
    alignItems: "center",
    borderTopWidth: 1,
    borderColor: Colors.rule,
    paddingHorizontal: 4,
  },

  milestoneBorder: {
    borderRightWidth: 1,
    borderColor: Colors.rule,
  },
  datesTab: { padding: 10 },
  dateRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: Colors.rule,
  },
  addDateButton: { paddingVertical: 16, alignItems: "center" },

  reunionTab: { padding: 24 },
  reunionFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 15,
  },

  card: {
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },

  sheetLabel: { fontSize: 12, marginBottom: 8 },
  datePickerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  calendarWrapper: {
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.rule,
    overflow: "hidden",
  },

  markBox: {
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.rule,
  },
  markBoxActive: {
    borderColor: Colors.accent,
    backgroundColor: Colors.bone,
  },
});

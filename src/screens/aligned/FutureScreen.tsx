import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  Pressable,
  Alert,
  ActivityIndicator,
  RefreshControl,
  DeviceEventEmitter,
  TextInput,
  ScrollView,
  Platform,
} from 'react-native';
import { Colors } from '../../constants/colors';
import { AppText } from '../../components/ui/AppText';
import { AppButton } from '../../components/ui/AppButton';
import { AppTextInput } from '../../components/ui/AppTextInput';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { MilestoneCard } from '../../components/future/MilestoneRow';
import { Milestone } from '../../types';
import AlignedNav from '@/components/ui/AlignedNav';
import { Ionicons } from '@expo/vector-icons';
import { useRoute } from '@react-navigation/native';
import {
  createMilestone as createMilestoneApi,
  listMilestones,
  getMilestone,
  deleteMilestone,
  addMilestoneStep,
  deleteMilestoneStep,
  toggleStepCompletion,
  unlockMilestone,
} from '../../services/milestoneApi';
import { getMe } from '../../services/authApi';
import Svg, { Path, Circle, Polygon } from 'react-native-svg';

const FilterIcon = ({ color = Colors.ink, size = 15 }: { color?: string; size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
    <Polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
  </Svg>
);

const SortChapterIcon = ({ color = Colors.bone, size = 15 }: { color?: string; size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <Path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
  </Svg>
);

const SortProgressIcon = ({ color = Colors.bone, size = 15 }: { color?: string; size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
    <Path d="M22 12A10 10 0 0 0 12 2v10z" />
  </Svg>
);

const SortStepsIcon = ({ color = Colors.bone, size = 15 }: { color?: string; size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M9 11l3 3L22 4" />
    <Path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
  </Svg>
);

const ICONS = ['◈', '◇', '✦', '◆', '◐', '❦'];
const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

const FILTER_TYPES = ['All', 'In Progress', 'Completed', 'Private', 'Shared'] as const;
type FilterType = typeof FILTER_TYPES[number];

const SORT_OPTIONS = ['Chapter', 'Progress', 'Steps Left'] as const;
type SortType = typeof SORT_OPTIONS[number];

const mapBackendToFrontend = (m: any, index: number): Milestone => {
  return {
    id: m.id,
    label: m.name || '',
    icon: ICONS[index % ICONS.length],
    description: m.why_it_matters || '',
    private: m.is_private ?? false,
    custom: m.creator_id !== undefined,
    isLocked: m.is_locked ?? false,
    steps: (m.steps || []).map((s: any) => ({
      id: s.id,
      text: s.text || '',
      done: s.is_completed ?? false,
    })),
  };
};

export const FutureScreen: React.FC = () => {
  const route = useRoute<any>();
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [isAligned, setIsAligned] = useState<boolean>(true);
  const [selected, setSelected] = useState<Milestone | null>(null);
  const [sheet, setSheet] = useState<string | null>(null);
  const [newStep, setNewStep] = useState('');
  const [pinInput, setPinInput] = useState('');
  const [verifiedPins, setVerifiedPins] = useState<Record<string, string>>({});

  // Filter, Search, and Sort state (matching Dates, Thread, Map)
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<FilterType>('All');
  const [sortOrder, setSortOrder] = useState<SortType>('Chapter');
  const [showFilterBar, setShowFilterBar] = useState(false);

  // Form State for New Milestone
  const [newMilestoneName, setNewMilestoneName] = useState('');
  const [newMilestoneDesc, setNewMilestoneDesc] = useState('');
  const [newMilestonePin, setNewMilestonePin] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isConfirmingDeleteMilestone, setIsConfirmingDeleteMilestone] = useState(false);
  const [isDeletingMilestone, setIsDeletingMilestone] = useState(false);

  const checkAlignment = async () => {
    try {
      const meData = await getMe();
      const aligned = !!(meData && (meData.is_aligned || meData.partner));
      setIsAligned(aligned);
    } catch (e) {
      console.log('Failed to check alignment in FutureScreen', e);
    }
  };

  const fetchMilestones = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    try {
      const res = await listMilestones(1, 100, null, userTimezone);
      if (res && res.data) {
        const mapped = res.data.map((m: any, idx: number) => mapBackendToFrontend(m, idx));
        setMilestones(mapped);
      }
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to load milestones.');
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchMilestones(true), checkAlignment()]);
    setRefreshing(false);
  };

  useEffect(() => {
    fetchMilestones();
    checkAlignment();

    const sub1 = DeviceEventEmitter.addListener('REFRESH_ALIGNED_DATA', () => {
      fetchMilestones(true);
      checkAlignment();
    });
    const sub2 = DeviceEventEmitter.addListener('ALIGNMENT_BONDED', () => {
      fetchMilestones(true);
      checkAlignment();
    });
    const sub3 = DeviceEventEmitter.addListener('ALIGNMENT_BROKEN', () => {
      fetchMilestones(true);
      checkAlignment();
    });

    return () => {
      sub1.remove();
      sub2.remove();
      sub3.remove();
    };
  }, [fetchMilestones]);

  // Deep Link Handling from Notifications
  useEffect(() => {
    if (route.params?.milestoneId && milestones.length > 0) {
      const target = milestones.find((m) => m.id === route.params.milestoneId);
      if (target) {
        openMilestone(target);
      }
    }
  }, [route.params?.milestoneId, milestones]);

  const handleToggleStep = async (mId: string, sId: string) => {
    try {
      const pin = verifiedPins[mId] || null;
      const res = await toggleStepCompletion(mId, sId, pin, userTimezone);
      const idx = milestones.findIndex((m) => m.id === mId);
      const mapped = mapBackendToFrontend(res, idx);
      setMilestones((p) => p.map((m) => (m.id === mId ? mapped : m)));
      setSelected(mapped);
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to toggle step completion.');
    }
  };

  const addStep = async () => {
    if (!newStep.trim() || !selected) return;
    try {
      const pin = verifiedPins[selected.id] || null;
      const res = await addMilestoneStep(selected.id, { text: newStep.trim(), timezone: userTimezone }, pin);
      const idx = milestones.findIndex((m) => m.id === selected.id);
      const mapped = mapBackendToFrontend(res, idx);
      setMilestones((p) => p.map((m) => (m.id === selected.id ? mapped : m)));
      setSelected(mapped);
      setNewStep('');
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to add step.');
    }
  };

  const confirmDeleteStep = (mId: string, sId: string) => {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm('Are you sure you want to delete this step?')) {
        performDeleteStep(mId, sId);
      }
      return;
    }
    Alert.alert('Delete Step', 'Are you sure you want to delete this step?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => performDeleteStep(mId, sId) },
    ]);
  };

  const performDeleteStep = async (mId: string, sId: string) => {
    try {
      const pin = verifiedPins[mId] || null;
      const res = await deleteMilestoneStep(mId, sId, pin, userTimezone);
      const idx = milestones.findIndex((m) => m.id === mId);
      const mapped = mapBackendToFrontend(res, idx);
      setMilestones((p) => p.map((m) => (m.id === mId ? mapped : m)));
      setSelected(mapped);
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to delete step.');
    }
  };

  const checkPin = async (milestone: Milestone) => {
    if (!pinInput.trim() || pinInput.length !== 4) {
      Alert.alert('Validation Error', 'Please enter a 4-digit PIN.');
      return;
    }
    try {
      const res = await unlockMilestone(milestone.id, { pin: pinInput });
      setVerifiedPins((p) => ({ ...p, [milestone.id]: pinInput }));
      const idx = milestones.findIndex((m) => m.id === milestone.id);
      const mapped = mapBackendToFrontend(res, idx);
      setSelected(mapped);
      setSheet('detail');
      setPinInput('');
    } catch (e) {
      console.error(e);
      Alert.alert('Incorrect PIN', 'Please try again.');
      setPinInput('');
    }
  };

  const openMilestone = async (milestone: Milestone) => {
    if (milestone.private && !verifiedPins[milestone.id]) {
      setSelected(milestone);
      setSheet('pin');
    } else {
      try {
        const pin = verifiedPins[milestone.id] || null;
        const res = await getMilestone(milestone.id, pin, userTimezone);
        const idx = milestones.findIndex((m) => m.id === milestone.id);
        const mapped = mapBackendToFrontend(res, idx);
        setSelected(mapped);
        setSheet('detail');
      } catch (e) {
        console.error(e);
        Alert.alert('Error', 'Failed to fetch milestone details.');
      }
    }
  };

  const handleCreateMilestone = async () => {
    if (!isAligned) {
      Alert.alert('Partner Required', 'Please connect with your partner first to create milestones.');
      return;
    }
    if (!newMilestoneName.trim()) {
      Alert.alert('Validation Error', 'Please enter a name for the milestone.');
      return;
    }
    if (isPrivate && (!newMilestonePin.trim() || newMilestonePin.length !== 4)) {
      Alert.alert('Validation Error', 'A 4-digit PIN is required for private milestones.');
      return;
    }

    setIsCreating(true);
    try {
      const res = await createMilestoneApi({
        name: newMilestoneName.trim(),
        why_it_matters: newMilestoneDesc.trim(),
        is_private: isPrivate,
        pin: isPrivate ? newMilestonePin : undefined,
        timezone: userTimezone,
      });

      if (isPrivate) {
        setVerifiedPins((p) => ({ ...p, [res.id]: newMilestonePin }));
      }

      setNewMilestoneName('');
      setNewMilestoneDesc('');
      setNewMilestonePin('');
      setIsPrivate(false);
      setSheet(null);
      await fetchMilestones();
    } catch (e: any) {
      console.error(e);
      Alert.alert('Error', e?.response?.data?.detail || 'Failed to create milestone.');
    } finally {
      setIsCreating(false);
    }
  };

  const confirmDeleteMilestone = (mId: string) => {
    setIsConfirmingDeleteMilestone(true);
  };

  const performDeleteMilestone = async (mId: string) => {
    setIsDeletingMilestone(true);
    try {
      const pin = verifiedPins[mId] || null;
      await deleteMilestone(mId, pin);
      setIsConfirmingDeleteMilestone(false);
      setSheet(null);
      setSelected(null);
      fetchMilestones();
    } catch (e: any) {
      console.error(e);
      Alert.alert('Error', e?.response?.data?.detail || 'Failed to delete milestone.');
    } finally {
      setIsDeletingMilestone(false);
    }
  };

  // Filter and Sort Calculations
  const filteredMilestones = useMemo(() => {
    let result = [...milestones];

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (m) =>
          m.label.toLowerCase().includes(q) ||
          m.description.toLowerCase().includes(q) ||
          m.steps.some((s) => s.text.toLowerCase().includes(q))
      );
    }

    // Status filter
    if (statusFilter === 'In Progress') {
      result = result.filter((m) => {
        const done = m.steps.filter((s) => s.done).length;
        const total = m.steps.length;
        return !m.isLocked && (total === 0 || done < total);
      });
    } else if (statusFilter === 'Completed') {
      result = result.filter((m) => {
        const done = m.steps.filter((s) => s.done).length;
        const total = m.steps.length;
        return !m.isLocked && total > 0 && done === total;
      });
    } else if (statusFilter === 'Private') {
      result = result.filter((m) => m.private);
    } else if (statusFilter === 'Shared') {
      result = result.filter((m) => !m.private);
    }

    // Sort order
    if (sortOrder === 'Progress') {
      result.sort((a, b) => {
        const aDone = a.steps.filter((s) => s.done).length;
        const aPct = a.isLocked ? 0 : aDone / Math.max(a.steps.length, 1);
        const bDone = b.steps.filter((s) => s.done).length;
        const bPct = b.isLocked ? 0 : bDone / Math.max(b.steps.length, 1);
        return bPct - aPct;
      });
    } else if (sortOrder === 'Steps Left') {
      result.sort((a, b) => {
        const aLeft = a.steps.filter((s) => !s.done).length;
        const bLeft = b.steps.filter((s) => !s.done).length;
        return bLeft - aLeft;
      });
    }

    return result;
  }, [milestones, searchQuery, statusFilter, sortOrder]);

  // Overall milestone statistics for the header card
  const totalMilestones = milestones.length;
  const completedMilestones = milestones.filter((m) => {
    const total = m.steps.length;
    const done = m.steps.filter((s) => s.done).length;
    return !m.isLocked && total > 0 && done === total;
  }).length;
  const totalSteps = milestones.reduce((acc, m) => acc + m.steps.length, 0);
  const completedSteps = milestones.reduce(
    (acc, m) => acc + m.steps.filter((s) => s.done).length,
    0
  );

  const listHeaderNode = (
    <View style={styles.headerWrapper}>
      {/* FLOATING RECTANGULAR CARD MATCHING DATES, THREAD & MAP */}
      <View style={styles.floatingHeaderCard}>
        {/* Row 1: Header Title, Subtitle & Refresh Icon */}
        <View style={styles.headerTopRow}>
          <View>
            <AppText variant="display" size={24} style={{ lineHeight: 26 }}>
              Future<AppText size={24} color={Colors.accent}>.</AppText>
            </AppText>
            <AppText variant="serifItalic" size={12} color={Colors.muted} style={{ lineHeight: 16 }}>
              Milestones, shared dreams & horizons.
            </AppText>
          </View>

          <Pressable style={styles.iconBtn} onPress={onRefresh} hitSlop={8}>
            <Ionicons name="refresh-outline" size={16} color={Colors.ink} />
          </Pressable>
        </View>

        {/* Row 2: Action Row (New Milestone [Primary] & Progress Stat Pill [Sub]) */}
        <View style={styles.actionRow}>
          {/* Primary: New Milestone */}
          <Pressable
            style={({ pressed }) => [
              styles.primaryCreateBtn,
              pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] },
            ]}
            onPress={() => {
              if (!isAligned) {
                Alert.alert('Partner Required', 'Please connect with your partner first to create milestones.');
                return;
              }
              setSheet('new');
            }}
          >
            <Ionicons name="add" size={14} color="#FFFFFF" style={{ marginRight: 4 }} />
            <AppText variant="smallCaps" size={10} style={{ color: '#FFFFFF', fontWeight: '700', letterSpacing: 0.6 }}>
              New Milestone
            </AppText>
          </Pressable>

          {/* Sub Stat Pill */}
          <View style={styles.subStatPill}>
            <AppText style={{ fontSize: 11, marginRight: 4, color: Colors.accent }}>✦</AppText>
            <AppText variant="smallCaps" size={10} color={Colors.ink} style={{ letterSpacing: 0.5 }}>
              {completedMilestones}/{totalMilestones} Reached · {completedSteps}/{totalSteps} Steps
            </AppText>
          </View>
        </View>

        {/* Row 3: Compact Search Box, Circular Filter Button & Circular Sort Button */}
        <View style={styles.searchSortRow}>
          <View style={styles.compactSearchBox}>
            <Ionicons name="search" size={13} color={Colors.muted} style={{ marginRight: 4 }} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search chapters, steps..."
              placeholderTextColor={Colors.muted}
              style={styles.compactSearchInput}
              autoCorrect={false}
              returnKeyType="search"
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={() => setSearchQuery('')} hitSlop={6}>
                <Ionicons name="close-circle" size={14} color={Colors.muted} />
              </Pressable>
            )}
          </View>

          {/* Circular Filter Button */}
          <Pressable
            onPress={() => setShowFilterBar(prev => !prev)}
            style={[
              styles.circleActionBtn,
              (showFilterBar || statusFilter !== 'All') && styles.circleActionBtnActive
            ]}
            hitSlop={6}
          >
            <FilterIcon
              color={(showFilterBar || statusFilter !== 'All') ? Colors.bone : Colors.ink}
              size={15}
            />
            {statusFilter !== 'All' && <View style={styles.filterActiveDot} />}
          </Pressable>

          {/* Circular Sort Button (Cycles: Chapter -> Progress -> Steps Left) */}
          <Pressable
            onPress={() => {
              setSortOrder((prev) =>
                prev === 'Chapter' ? 'Progress' : prev === 'Progress' ? 'Steps Left' : 'Chapter'
              );
            }}
            style={[styles.circleActionBtn, styles.circleActionBtnActive]}
            hitSlop={6}
          >
            {sortOrder === 'Chapter' && <SortChapterIcon color={Colors.bone} size={15} />}
            {sortOrder === 'Progress' && <SortProgressIcon color={Colors.bone} size={15} />}
            {sortOrder === 'Steps Left' && <SortStepsIcon color={Colors.bone} size={15} />}
          </Pressable>
        </View>

        {/* Row 4: Horizontal Status Filter Chips (Toggled via Filter Button) */}
        {showFilterBar && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterScrollContent}
          >
            {FILTER_TYPES.map((status) => {
              const isActive = statusFilter === status;
              return (
                <Pressable
                  key={status}
                  onPress={() => setStatusFilter(status)}
                  style={[styles.floatingFilterChip, isActive && styles.floatingFilterChipActive]}
                >
                  <AppText
                    variant="smallCaps"
                    style={{
                      color: isActive ? '#FFFFFF' : Colors.ink,
                      fontSize: 10,
                      letterSpacing: 0.5,
                    }}
                  >
                    {status}
                  </AppText>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </View>
    </View>
  );

  const listFooterNode = <View style={{ height: 90 }} />;

  const listEmptyComponent = () => {
    if (loading) {
      return (
        <View style={styles.centerEmpty}>
          <ActivityIndicator color={Colors.accent} size="large" />
          <AppText variant="serifItalic" size={14} color={Colors.muted} style={{ marginTop: 12 }}>
            Loading your shared horizons...
          </AppText>
        </View>
      );
    }
    return (
      <View style={styles.emptyCard}>
        <AppText style={{ fontSize: 28, color: Colors.accent, marginBottom: 8 }}>✦</AppText>
        <AppText variant="heading" size={18} color={Colors.ink} style={{ marginBottom: 4 }}>
          {searchQuery ? 'No matching milestones' : 'No milestones yet'}
        </AppText>
        <AppText variant="serifItalic" size={13} color={Colors.muted} style={{ textAlign: 'center', lineHeight: 18, marginBottom: 16 }}>
          {searchQuery
            ? `No chapters found matching "${searchQuery}". Clear your search to view all.`
            : 'Chart the chapters of your journey together — trips, dreams, and life milestones.'}
        </AppText>
        {searchQuery ? (
          <AppButton variant="outline" size="sm" onPress={() => setSearchQuery('')}>
            Clear Search
          </AppButton>
        ) : (
          <AppButton
            variant="solid"
            size="sm"
            style={{ backgroundColor: Colors.ink }}
            onPress={() => {
              if (!isAligned) {
                Alert.alert('Partner Required', 'Please connect with your partner first.');
                return;
              }
              setSheet('new');
            }}
          >
            + Create First Milestone
          </AppButton>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <AlignedNav />

      <FlatList
        data={filteredMilestones}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <View style={{ paddingHorizontal: 12 }}>
            <MilestoneCard
              milestone={item}
              index={index}
              onPress={() => openMilestone(item)}
            />
          </View>
        )}
        ListHeaderComponent={listHeaderNode}
        ListFooterComponent={listFooterNode}
        ListEmptyComponent={listEmptyComponent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[Colors.accent]}
            tintColor={Colors.accent}
          />
        }
      />

      {/* ==================== PIN UNLOCK SHEET ==================== */}
      <BottomSheet
        open={sheet === 'pin' && !!selected}
        onClose={() => {
          setSheet(null);
          setPinInput('');
        }}
        kicker="PRIVATE CHAPTER"
        title="Enter PIN to Unlock"
      >
        <View style={{ paddingVertical: 10 }}>
          <AppText variant="serifItalic" size={14} color={Colors.muted} style={{ marginBottom: 20 }}>
            This chapter is confidential. Enter your 4-digit PIN to access steps and notes.
          </AppText>

          <AppTextInput
            label="4-DIGIT PIN"
            value={pinInput}
            onChangeText={setPinInput}
            placeholder="••••"
            keyboardType="numeric"
            secureTextEntry
            maxLength={4}
          />

          <AppButton
            full
            variant="solid"
            size="lg"
            style={{ marginTop: 24, backgroundColor: Colors.ink }}
            onPress={() => checkPin(selected!)}
          >
            Unlock Chapter →
          </AppButton>
        </View>
      </BottomSheet>

      {/* ==================== MILESTONE DETAIL SHEET ==================== */}
      <BottomSheet
        open={sheet === 'detail' && !!selected}
        onClose={() => {
          setSheet(null);
          setNewStep('');
          setIsConfirmingDeleteMilestone(false);
        }}
        kicker={`CHAPTER · ${selected?.icon ?? '◈'}`}
        title={selected?.label ?? ''}
      >
        {selected && (() => {
          const doneCount = selected.steps.filter((s) => s.done).length;
          const totalCount = selected.steps.length;
          const detailPct = Math.round((doneCount / Math.max(totalCount, 1)) * 100);

          return (
            <View style={{ paddingVertical: 4 }}>
              {/* Description */}
              <AppText
                variant="serifItalic"
                size={15}
                color={Colors.ink2}
                style={{ lineHeight: 22, marginBottom: 18 }}
              >
                {selected.description || 'A shared horizon to reach together, step by step.'}
              </AppText>

              {/* Progress Summary Card */}
              <View style={styles.detailProgressCard}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <AppText variant="smallCaps" color={Colors.accent} size={11} style={{ letterSpacing: 0.8 }}>
                    PROGRESS · {doneCount}/{totalCount} COMPLETED
                  </AppText>
                  <AppText variant="mono" color={doneCount === totalCount && totalCount > 0 ? Colors.sage : Colors.accent} size={11} style={{ fontWeight: '700' }}>
                    {detailPct}%
                  </AppText>
                </View>

                <View style={styles.detailTrack}>
                  <View
                    style={[
                      styles.detailFill,
                      {
                        width: `${detailPct}%`,
                        backgroundColor: doneCount === totalCount && totalCount > 0 ? Colors.sage : Colors.accent,
                      },
                    ]}
                  />
                </View>
              </View>

              {/* Steps Header */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <AppText variant="smallCaps" color={Colors.muted} style={{ letterSpacing: 1 }}>
                  STEPS & ACTIONS
                </AppText>
                <AppText variant="mono" color={Colors.muted} size={11}>
                  {totalCount} total
                </AppText>
              </View>

              {/* Steps List */}
              {selected.steps.length === 0 ? (
                <View style={styles.noStepsBox}>
                  <AppText variant="serifItalic" size={13} color={Colors.muted}>
                    No steps added yet. Add your first step below!
                  </AppText>
                </View>
              ) : (
                selected.steps.map((s, i) => (
                  <View key={s.id} style={styles.stepRow}>
                    <Pressable
                      onPress={() => handleToggleStep(selected.id, s.id)}
                      style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 }}
                    >
                      <AppText variant="mono" color={Colors.muted} style={{ fontSize: 10, width: 20 }}>
                        {String(i + 1).padStart(2, '0')}
                      </AppText>

                      <View style={[styles.stepCheck, s.done && styles.stepCheckDone]}>
                        {s.done && <AppText size={12} color="#ffffff" style={{ fontWeight: '700' }}>✓</AppText>}
                      </View>

                      <AppText
                        variant="heading"
                        size={15}
                        color={s.done ? Colors.muted : Colors.ink}
                        style={{
                          flex: 1,
                          lineHeight: 20,
                          textDecorationLine: s.done ? 'line-through' : 'none',
                        }}
                      >
                        {s.text}
                      </AppText>
                    </Pressable>

                    <Pressable
                      onPress={() => confirmDeleteStep(selected.id, s.id)}
                      hitSlop={8}
                      style={{ padding: 4, marginLeft: 6 }}
                    >
                      <Ionicons name="trash-outline" size={16} color={Colors.light} />
                    </Pressable>
                  </View>
                ))
              )}

              {/* Add New Step Form */}
              <View style={styles.addStepContainer}>
                <AppTextInput
                  label="ADD A STEP"
                  value={newStep}
                  onChangeText={setNewStep}
                  placeholder="e.g. Book reservations, plan itinerary..."
                  returnKeyType="done"
                  onSubmitEditing={addStep}
                />
                <AppButton
                  variant="outline"
                  full
                  size="md"
                  onPress={addStep}
                  disabled={!newStep.trim()}
                  style={{ marginTop: 10, borderColor: Colors.rule }}
                >
                  + Add Step
                </AppButton>
              </View>

              {/* Delete Milestone Section */}
              {isConfirmingDeleteMilestone ? (
                <View style={{
                  marginTop: 18,
                  padding: 14,
                  borderRadius: 12,
                  backgroundColor: 'rgba(217, 83, 79, 0.08)',
                  borderWidth: 1,
                  borderColor: 'rgba(217, 83, 79, 0.3)',
                  gap: 10
                }}>
                  <AppText variant="heading" size={15} color={Colors.ink}>
                    Delete this milestone?
                  </AppText>
                  <AppText variant="serifItalic" size={13} color={Colors.ink2}>
                    This will permanently remove &ldquo;{selected.label}&rdquo; and all its progress for both of you.
                  </AppText>
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                    <AppButton
                      variant="outline"
                      size="sm"
                      style={{ flex: 1 }}
                      onPress={() => setIsConfirmingDeleteMilestone(false)}
                      disabled={isDeletingMilestone}
                    >
                      Cancel
                    </AppButton>
                    <AppButton
                      variant="solid"
                      size="sm"
                      style={{ flex: 1, backgroundColor: '#D9534F' }}
                      textStyle={{ color: '#FFF' }}
                      disabled={isDeletingMilestone}
                      onPress={() => performDeleteMilestone(selected.id)}
                    >
                      {isDeletingMilestone ? "Deleting..." : "Confirm Delete"}
                    </AppButton>
                  </View>
                </View>
              ) : (
                <Pressable
                  onPress={() => setIsConfirmingDeleteMilestone(true)}
                  style={styles.deleteMilestoneBtn}
                >
                  <Ionicons name="trash-outline" size={15} color="#D9534F" style={{ marginRight: 6 }} />
                  <AppText color="#D9534F" variant="smallCaps" style={{ fontSize: 12, fontWeight: '600' }}>
                    Delete Milestone
                  </AppText>
                </Pressable>
              )}
            </View>
          );
        })()}
      </BottomSheet>

      {/* ==================== NEW MILESTONE SHEET ==================== */}
      <BottomSheet
        open={sheet === 'new'}
        onClose={() => setSheet(null)}
        kicker="NEW CHAPTER"
        title="Compose a milestone"
      >
        <View style={{ paddingVertical: 4 }}>
          <AppTextInput
            label="NAME"
            n="01"
            value={newMilestoneName}
            onChangeText={setNewMilestoneName}
            placeholder="e.g. Dream Vacation to Kyoto"
          />

          <View style={{ marginTop: 12 }}>
            <AppTextInput
              label="WHY IT MATTERS"
              n="02"
              value={newMilestoneDesc}
              onChangeText={setNewMilestoneDesc}
              placeholder="What does reaching this together mean to you both?"
              multiline
            />
          </View>

          {/* Private Toggle */}
          <Pressable style={styles.privateRow} onPress={() => setIsPrivate(!isPrivate)}>
            <View>
              <AppText variant="heading" size={15} color={Colors.ink}>
                Confidential Chapter
              </AppText>
              <AppText variant="serifItalic" size={12} color={Colors.muted} style={{ marginTop: 2 }}>
                Lock with a 4-digit PIN for privacy.
              </AppText>
            </View>

            <View style={[styles.checkbox, isPrivate && styles.checkboxActive]}>
              {isPrivate && <AppText style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>✓</AppText>}
            </View>
          </Pressable>

          {isPrivate && (
            <View style={{ marginTop: 6, marginBottom: 12 }}>
              <AppTextInput
                label="SET 4-DIGIT PIN"
                n="03"
                value={newMilestonePin}
                onChangeText={setNewMilestonePin}
                placeholder="e.g. 1234"
                keyboardType="numeric"
                secureTextEntry
                maxLength={4}
              />
            </View>
          )}

          <AppButton
            full
            variant="solid"
            size="lg"
            onPress={handleCreateMilestone}
            disabled={isCreating || !newMilestoneName.trim()}
            style={{ marginTop: 20, backgroundColor: Colors.ink }}
          >
            {isCreating ? 'Creating...' : 'Create Milestone →'}
          </AppButton>
        </View>
      </BottomSheet>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.bone,
  },
  headerWrapper: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 14,
  },
  floatingHeaderCard: {
    backgroundColor: 'rgba(247, 243, 236, 0.94)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(216, 207, 196, 0.85)',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
    shadowColor: Colors.ink,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    gap: 8,
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#EAE2D4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  primaryCreateBtn: {
    flex: 1.2,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1C1C1E',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    shadowColor: Colors.ink,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  subStatPill: {
    flex: 1.8,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#EAE2D4',
    borderWidth: 1,
    borderColor: 'rgba(216, 207, 196, 0.75)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  searchSortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  compactSearchBox: {
    flex: 1,
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFE9DE',
    borderRadius: 18,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: 'rgba(216, 207, 196, 0.75)',
  },
  compactSearchInput: {
    flex: 1,
    height: '100%',
    fontSize: 13,
    color: Colors.ink,
    paddingVertical: 0,
    paddingHorizontal: 4,
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
  circleActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EAE2D4',
    borderWidth: 1,
    borderColor: 'rgba(216, 207, 196, 0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  circleActionBtnActive: {
    backgroundColor: '#1C1C1E',
    borderColor: '#1C1C1E',
  },
  filterActiveDot: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.accent,
  },
  filterScrollContent: {
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 2,
  },
  floatingFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: '#EAE2D4',
    gap: 5,
  },
  floatingFilterChipActive: {
    backgroundColor: '#1C1C1E',
  },
  centerEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  emptyCard: {
    marginHorizontal: 12,
    marginTop: 18,
    padding: 24,
    borderRadius: 16,
    backgroundColor: '#FAF6F0',
    borderWidth: 1,
    borderColor: Colors.rule,
    alignItems: 'center',
  },
  detailProgressCard: {
    backgroundColor: 'rgba(238, 230, 219, 0.55)',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.rule,
    marginBottom: 20,
  },
  detailTrack: {
    height: 6,
    backgroundColor: Colors.rule,
    borderRadius: 3,
    overflow: 'hidden',
  },
  detailFill: {
    height: '100%',
    borderRadius: 3,
  },
  noStepsBox: {
    paddingVertical: 18,
    alignItems: 'center',
    backgroundColor: 'rgba(238, 230, 219, 0.35)',
    borderRadius: 10,
    marginBottom: 16,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.rule,
  },
  stepCheck: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: Colors.rule,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  stepCheckDone: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  addStepContainer: {
    marginTop: 20,
    backgroundColor: 'rgba(238, 230, 219, 0.35)',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.rule,
  },
  deleteMilestoneBtn: {
    marginTop: 24,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: 1,
    borderTopColor: Colors.rule,
  },
  privateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.rule,
    marginVertical: 14,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: Colors.rule,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  checkboxActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
});
import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, Pressable, Alert, ActivityIndicator, RefreshControl, DeviceEventEmitter } from 'react-native';
import { Colors } from '../../constants/colors';
import { AppText } from '../../components/ui/AppText';
import { AppButton } from '../../components/ui/AppButton';
import { AppTextInput } from '../../components/ui/AppTextInput';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { MilestoneRow } from '../../components/future/MilestoneRow';
import { Milestone } from '../../types';
import AlignedNav from '@/components/ui/AlignedNav';
import {
  createMilestone as createMilestoneApi,
  listMilestones,
  getMilestone,
  deleteMilestone,
  addMilestoneStep,
  deleteMilestoneStep,
  toggleStepCompletion,
  unlockMilestone
} from '../../services/milestoneApi';
import { getMe } from '../../services/authApi';

const ICONS = ['◈', '◇', '✦', '◆'];
const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

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
      done: s.is_completed ?? false
    }))
  };
};

export const FutureScreen: React.FC = () => {
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [isAligned, setIsAligned] = useState<boolean>(true);
  const [selected, setSelected] = useState<Milestone | null>(null);
  const [sheet, setSheet] = useState<string | null>(null);
  const [newStep, setNewStep] = useState('');
  const [pinInput, setPinInput] = useState('');
  const [verifiedPins, setVerifiedPins] = useState<Record<string, string>>({});

  const [newMilestoneName, setNewMilestoneName] = useState('');
  const [newMilestoneDesc, setNewMilestoneDesc] = useState('');
  const [newMilestonePin, setNewMilestonePin] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);

  const checkAlignment = async () => {
    try {
      const meData = await getMe();
      const aligned = !!(meData && (meData.is_aligned || meData.partner));
      setIsAligned(aligned);
    } catch (e) {
      console.log('Failed to check alignment in FutureScreen', e);
    }
  };

  const fetchMilestones = async (isSilent = false) => {
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
  };

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
  }, []);

  const handleToggleStep = async (mId: string, sId: string) => {
    try {
      const pin = verifiedPins[mId] || null;
      const res = await toggleStepCompletion(mId, sId, pin, userTimezone);
      const idx = milestones.findIndex(m => m.id === mId);
      const mapped = mapBackendToFrontend(res, idx);
      setMilestones(p => p.map(m => m.id === mId ? mapped : m));
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
      const idx = milestones.findIndex(m => m.id === selected.id);
      const mapped = mapBackendToFrontend(res, idx);
      setMilestones(p => p.map(m => m.id === selected.id ? mapped : m));
      setSelected(mapped);
      setNewStep('');
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to add step.');
    }
  };

  const confirmDeleteStep = (mId: string, sId: string) => {
    Alert.alert(
      'Delete Step',
      'Are you sure you want to delete this step?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => performDeleteStep(mId, sId) },
      ]
    );
  };

  const performDeleteStep = async (mId: string, sId: string) => {
    try {
      const pin = verifiedPins[mId] || null;
      const res = await deleteMilestoneStep(mId, sId, pin, userTimezone);
      const idx = milestones.findIndex(m => m.id === mId);
      const mapped = mapBackendToFrontend(res, idx);
      setMilestones(p => p.map(m => m.id === mId ? mapped : m));
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
      setVerifiedPins(p => ({ ...p, [milestone.id]: pinInput }));
      const idx = milestones.findIndex(m => m.id === milestone.id);
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
        const idx = milestones.findIndex(m => m.id === milestone.id);
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
    if (!newMilestoneName.trim()) return;
    if (isPrivate && (!newMilestonePin.trim() || newMilestonePin.length !== 4)) {
      Alert.alert('Validation Error', 'A 4-digit PIN is required for private milestones.');
      return;
    }

    try {
      const res = await createMilestoneApi({
        name: newMilestoneName.trim(),
        why_it_matters: newMilestoneDesc.trim(),
        is_private: isPrivate,
        pin: isPrivate ? newMilestonePin : undefined,
        timezone: userTimezone
      });

      if (isPrivate) {
        setVerifiedPins(p => ({ ...p, [res.id]: newMilestonePin }));
      }

      setNewMilestoneName('');
      setNewMilestoneDesc('');
      setNewMilestonePin('');
      setIsPrivate(false);
      setSheet(null);
      fetchMilestones();
    } catch (e: any) {
      console.error(e);
      Alert.alert('Error', e?.response?.data?.detail || 'Failed to create milestone.');
    }
  };

  const confirmDeleteMilestone = (mId: string) => {
    Alert.alert(
      'Delete Milestone',
      'Are you sure you want to delete this milestone? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => performDeleteMilestone(mId) },
      ]
    );
  };

  const performDeleteMilestone = async (mId: string) => {
    try {
      const pin = verifiedPins[mId] || null;
      await deleteMilestone(mId, pin);
      setSheet(null);
      setSelected(null);
      fetchMilestones();
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to delete milestone.');
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <AlignedNav></AlignedNav>
      <ScrollView 
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[Colors.accent]}
            tintColor={Colors.accent}
          />
        }
      >
        <View style={styles.inner}>
          <AppText variant="display" size={42} style={{ lineHeight: 42, marginBottom: 6 }}>
            Future<AppText size={42} color={Colors.accent}>.</AppText>
          </AppText>
          <AppText variant="serifItalic" size={16} color={Colors.muted} style={{ lineHeight: 24, marginBottom: 28 }}>
            Milestones, step by step.
          </AppText>

          <AppText variant="smallCaps" color={Colors.ink2} style={{ marginBottom: 8 }}>Relationship</AppText>
          
          {loading && milestones.length === 0 ? (
            <View style={{ marginVertical: 40 }}>
              <ActivityIndicator color={Colors.accent} size="large" />
            </View>
          ) : (
            <View style={{ borderTopWidth: 1, borderTopColor: Colors.rule }}>
              {milestones.map(m => (
                <MilestoneRow
                  key={m.id}
                  milestone={m}
                  onPress={() => openMilestone(m)}
                />
              ))}
            </View>
          )}

          <Pressable style={styles.addBtn} onPress={() => {
            if (!isAligned) {
              Alert.alert('Partner Required', 'Please connect with your partner first to create milestones.');
              return;
            }
            setSheet('new');
          }}>
            <AppText variant="smallCaps" color={Colors.accent}>+ Create a milestone</AppText>
          </Pressable>

          <View style={{ height: 80 }} />
        </View>
      </ScrollView>

      {/* PIN Screen for Private Milestones */}
      <BottomSheet
        open={sheet === 'pin' && !!selected}
        onClose={() => { setSheet(null); setPinInput(''); }}
        kicker="PRIVATE"
        title="Enter PIN to Continue"
      >
        <AppTextInput
          label="PIN"
          value={pinInput}
          onChangeText={setPinInput}
          placeholder="1234"
          keyboardType="numeric"
          secureTextEntry
          maxLength={4}
        />
        <AppButton 
          full 
          variant="solid" 
          size="lg" 
          style={{ marginTop: 20 }}
          onPress={() => checkPin(selected!)}
        >
          Unlock
        </AppButton>
      </BottomSheet>

      {/* Milestone Detail Sheet */}
      <BottomSheet
        open={sheet === 'detail' && !!selected}
        onClose={() => { setSheet(null); setNewStep(''); }}
        kicker={`CHAPTER · ${selected?.icon ?? ''}`}
        title={selected?.label ?? ''}
      >
        {selected && (
          <>
            <AppText variant="serifItalic" size={17} color={Colors.ink2} style={{ lineHeight: 26, marginBottom: 24 }}>
              {selected.description}
            </AppText>

            <AppText variant="smallCaps" color={Colors.muted} style={{ marginBottom: 12 }}>STEPS</AppText>
            
            {selected.steps.map((s, i) => (
              <View key={s.id} style={styles.stepRow}>
                <Pressable onPress={() => handleToggleStep(selected.id, s.id)} style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 14 }}>
                  <AppText variant="mono" color={Colors.light} style={{ fontSize: 9, width: 24 }}>
                    {String(i + 1).padStart(2, '0')}
                  </AppText>
                  <View style={[styles.stepCheck, s.done && styles.stepCheckDone]}>
                    {s.done && <AppText size={11} color={Colors.bone}>✓</AppText>}
                  </View>
                  <AppText variant="heading" size={16} style={{ flex: 1, textDecorationLine: s.done ? 'line-through' : 'none' }}>
                    {s.text}
                  </AppText>
                </Pressable>
                
                <Pressable onPress={() => confirmDeleteStep(selected.id, s.id)} style={{ padding: 6 }}>
                  <AppText color={Colors.accent} size={18}>×</AppText>
                </Pressable>
              </View>
            ))}

            {/* Add New Step */}
            <View style={{ marginTop: 20 }}>
              <AppTextInput
                label="Add a step"
                value={newStep}
                onChangeText={setNewStep}
                placeholder="Next thing to do..."
              />
              <AppButton variant="outline" full size="lg" onPress={addStep} style={{ marginTop: 10 }}>
                + Add Step
              </AppButton>
            </View>

            {/* Delete Milestone */}
            <Pressable 
              onPress={() => confirmDeleteMilestone(selected.id)} 
              style={{ marginTop: 28, paddingVertical: 12, alignItems: 'center', borderTopWidth: 1, borderTopColor: Colors.rule }}
            >
              <AppText color={Colors.accent} variant="smallCaps">Delete Milestone</AppText>
            </Pressable>
          </>
        )}
      </BottomSheet>

      {/* New Milestone Sheet */}
      <BottomSheet open={sheet === 'new'} onClose={() => setSheet(null)} kicker="NEW" title="Compose a milestone">
        <AppTextInput
          label="Name" n="01"
          value={newMilestoneName}
          onChangeText={setNewMilestoneName}
          placeholder="Dream Vacation to Japan"
        />
        <AppTextInput
          label="Why it matters" n="02"
          value={newMilestoneDesc}
          onChangeText={setNewMilestoneDesc}
          placeholder="What does this mean to you both?"
          multiline
        />

        <Pressable style={styles.privateRow} onPress={() => setIsPrivate(!isPrivate)}>
          <AppText>Make this private</AppText>
          <View style={[styles.checkbox, isPrivate && styles.checkboxActive]}>
            {isPrivate && <AppText style={{ color: '#fff' }}>✓</AppText>}
          </View>
        </Pressable>

        {isPrivate && (
          <AppTextInput
            label="Set 4-Digit PIN"
            value={newMilestonePin}
            onChangeText={setNewMilestonePin}
            placeholder="e.g. 1234"
            keyboardType="numeric"
            secureTextEntry
            maxLength={4}
          />
        )}

        <AppButton full variant="solid" size="lg" onPress={handleCreateMilestone} style={{ marginTop: 20 }}>
          Create Milestone
        </AppButton>
      </BottomSheet>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bone },
  inner: { padding: 24 },
  addBtn: {
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.rule,
    marginTop: 8,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.rule,
  },
  stepCheck: {
    width: 20,
    height: 20,
    borderWidth: 1,
    borderColor: Colors.rule,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepCheckDone: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  privateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: Colors.rule,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
});
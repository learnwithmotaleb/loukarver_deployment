import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Colors } from '../../constants/colors';
import { AppText } from '../ui/AppText';
import { Milestone } from '../../types';

export interface MilestoneCardProps {
  milestone: Milestone;
  index: number;
  onPress: () => void;
}

export const MilestoneCard: React.FC<MilestoneCardProps> = ({ milestone: m, index, onPress }) => {
  const done = m.steps.filter((s) => s.done).length;
  const total = m.steps.length;
  const pct = m.isLocked ? 0 : Math.round((done / Math.max(total, 1)) * 100);
  const isComplete = !m.isLocked && total > 0 && done === total;
  const nextIncompleteStep = m.steps.find((s) => !s.done);

  const statusColor = m.isLocked
    ? Colors.light
    : isComplete
    ? Colors.sage
    : pct > 0
    ? Colors.accent
    : Colors.muted;

  const statusBadge = m.isLocked
    ? 'LOCKED'
    : isComplete
    ? 'DONE'
    : `${pct}%`;

  const ctaText = m.isLocked
    ? 'ENTER PIN TO UNLOCK'
    : isComplete
    ? 'CHAPTER COMPLETED'
    : total === 0
    ? 'ADD FIRST STEP'
    : 'VIEW & EDIT STEPS';

  return (
    <Pressable
      style={({ pressed }) => [
        styles.heroCard,
        pressed && { opacity: 0.92, transform: [{ scale: 0.995 }] },
      ]}
      onPress={onPress}
    >
      {/* Left Column: Index Number, CHAPTER label & Status (Matches DateCard scoreBlock) */}
      <View style={styles.scoreBlock}>
        <AppText
          variant="display"
          size={28}
          color={Colors.ink}
          style={{ lineHeight: 30 }}
        >
          {String(index + 1).padStart(2, '0')}
        </AppText>

        <AppText
          variant="smallCaps"
          color={Colors.muted}
          style={{ marginTop: 2, letterSpacing: 0.8, fontSize: 8.5 }}
        >
          CHAPTER
        </AppText>

        <View style={styles.scoreDivider} />

        <AppText
          variant="mono"
          color={statusColor}
          style={{ fontSize: 8.5, letterSpacing: 0.5, textAlign: 'center', fontWeight: '700' }}
          numberOfLines={1}
        >
          {m.isLocked ? '🔒 ' : isComplete ? '✓ ' : ''}{statusBadge}
        </AppText>
      </View>

      {/* Right Column: Meta, Title, Subtitle, Progress & Bottom CTA (Matches DateCard ritualBlock) */}
      <View style={styles.ritualBlock}>
        {/* Top Meta: Icon · Private · Steps Count */}
        <View style={styles.metaRow}>
          <AppText
            variant="smallCaps"
            size={9}
            color={Colors.accent}
            style={{ letterSpacing: 0.7 }}
          >
            {m.icon || '◈'} CHAPTER
          </AppText>

          {m.private && (
            <>
              <AppText variant="smallCaps" size={9} color={Colors.muted} style={{ marginHorizontal: 3 }}>
                ·
              </AppText>
              <AppText variant="smallCaps" size={9} color={Colors.accent} style={{ letterSpacing: 0.5 }}>
                PRIVATE
              </AppText>
            </>
          )}

          <AppText variant="smallCaps" size={9} color={Colors.muted} style={{ marginHorizontal: 3 }}>
            ·
          </AppText>
          <AppText variant="smallCaps" size={9} color={Colors.muted} style={{ letterSpacing: 0.5 }}>
            {done}/{total} STEPS
          </AppText>
        </View>

        {/* Title */}
        <AppText
          variant="heading"
          size={16}
          style={{ lineHeight: 19, marginBottom: 2 }}
          numberOfLines={1}
        >
          {m.label}
        </AppText>

        {/* Subtitle / Why it matters */}
        <AppText
          variant="serifItalic"
          size={12}
          color={Colors.muted}
          style={{ lineHeight: 15 }}
          numberOfLines={2}
        >
          {m.description || 'A shared horizon to reach together, step by step.'}
        </AppText>

        {/* Progress Bar */}
        <View style={styles.progressTrack}>
          {!m.isLocked && (
            <View
              style={[
                styles.progressFill,
                {
                  width: `${Math.max(pct, total === 0 ? 0 : 4)}%`,
                  backgroundColor: isComplete ? Colors.sage : Colors.accent,
                },
              ]}
            />
          )}
        </View>

        {/* Next Step Preview */}
        {!m.isLocked && nextIncompleteStep && (
          <View style={styles.nextStepRow}>
            <View style={styles.stepDot} />
            <AppText variant="serifItalic" size={11} color={Colors.ink2} numberOfLines={1} style={{ flex: 1 }}>
              Next: {nextStepPreview(nextIncompleteStep.text)}
            </AppText>
          </View>
        )}

        {/* Bottom CTA (Matches DateCard ritualCta) */}
        <View style={styles.ritualCta}>
          <AppText
            variant="mono"
            color={statusColor}
            style={{ fontSize: 9.5, letterSpacing: 0.7 }}
          >
            {ctaText}
          </AppText>

          <AppText color={statusColor} size={14}>
            →
          </AppText>
        </View>
      </View>
    </Pressable>
  );
};

// Backward-compatibility alias
export const MilestoneRow: React.FC<{ milestone: Milestone; index?: number; onPress: () => void }> = ({
  milestone,
  index = 0,
  onPress,
}) => <MilestoneCard milestone={milestone} index={index} onPress={onPress} />;

function nextStepPreview(text: string) {
  if (!text) return '';
  return text.length > 38 ? `${text.slice(0, 38)}...` : text;
}

const styles = StyleSheet.create({
  heroCard: {
    flexDirection: 'row',
    borderRadius: 14,
    marginBottom: 10,
    backgroundColor: Colors.bone,
    borderWidth: 1,
    borderColor: Colors.rule,
    overflow: 'hidden',
    shadowColor: Colors.ink2,
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  scoreBlock: {
    width: 68,
    backgroundColor: 'rgba(238, 230, 219, 0.55)',
    borderRightWidth: 1,
    borderRightColor: Colors.rule,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  scoreDivider: {
    width: 24,
    height: 1,
    backgroundColor: Colors.rule,
    marginVertical: 6,
  },
  ritualBlock: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    justifyContent: 'space-between',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  progressTrack: {
    height: 4,
    backgroundColor: Colors.rule,
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: 8,
    marginBottom: 6,
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  nextStepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  stepDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: Colors.accent,
  },
  ritualCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: Colors.rule,
    paddingTop: 8,
    marginTop: 8,
  },
});
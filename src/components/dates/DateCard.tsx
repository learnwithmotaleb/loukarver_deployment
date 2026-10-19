import React from 'react';
import { View, Pressable, StyleSheet, Image } from 'react-native';
import { Colors } from '../../constants/colors';
import { AppText } from '../ui/AppText';
import { DateEntry } from '../../types';
import { formatDateShort, format24to12 } from '../../utils/dateUtils';
import api from '../../services/api';

interface DateCardProps {
  entry: DateEntry;
  index: number;
  onPress: () => void;
}

const STATUS_COLOR: Record<string, string> = {
  completed: Colors.accent,
  accepted: Colors.accent,
  proposed: Colors.muted,
  invited: Colors.accent,
  cancelled: Colors.light,
  cancelrequested: Colors.accent,
  rejected: Colors.light,
};

export const DateCard: React.FC<DateCardProps> = ({ entry: d, index, onPress }) => {
  const getFullUrl = (url?: string) =>
    url?.startsWith('/') ? `${api.defaults.baseURL?.replace('/api/v1', '')}${url}` : url;

  const statusKey = (d.status || '').toLowerCase();
  const statusColor = STATUS_COLOR[statusKey] || Colors.accent;

  const validReviews = d.reviews?.filter((r) => r.text && r.text.trim() !== '') || [];
  const legacyMemory = d.memory && d.memory.trim() !== '' ? d.memory : null;
  const reviewText = validReviews[0]?.text || legacyMemory;
  const allPhotos = d.reviews?.flatMap((r) => r.photos || []) || [];

  const ctaText =
    d.status === 'completed'
      ? d.averageRating
        ? `${'★'.repeat(Math.round(d.averageRating))} REVIEWED`
        : 'VIEW MEMORIES'
      : (d.status as string) === 'invited' || (d.status as string) === 'proposed'
      ? 'VIEW PROPOSAL'
      : d.status === 'accepted'
      ? 'VIEW UPCOMING'
      : 'VIEW DETAILS';

  return (
    <Pressable
      style={({ pressed }) => [
        styles.heroCard,
        pressed && { opacity: 0.92, transform: [{ scale: 0.995 }] }
      ]}
      onPress={onPress}
    >
      {/* Left Column: Index Number, DATE label & Status (Matches Today Screen scoreBlock) */}
      <View style={styles.scoreBlock}>
        <AppText
          variant="display"
          size={30}
          color={Colors.ink}
          style={{ lineHeight: 32 }}
        >
          {String(index + 1).padStart(2, '0')}
        </AppText>

        <AppText
          variant="smallCaps"
          color={Colors.muted}
          style={{ marginTop: 2, letterSpacing: 0.8, fontSize: 8.5 }}
        >
          DATE
        </AppText>

        <View style={styles.scoreDivider} />

        <AppText
          variant="mono"
          color={statusColor}
          style={{ fontSize: 8.5, letterSpacing: 0.5, textAlign: 'center' }}
          numberOfLines={1}
        >
          {d.status === 'completed' && d.averageRating
            ? `${d.averageRating.toFixed(1)} ★`
            : (d.status || '').toUpperCase()}
        </AppText>
      </View>

      {/* Right Column: Meta, Title, Subtitle, Memories & Bottom CTA (Matches Today Screen ritualBlock) */}
      <View style={styles.ritualBlock}>
        {/* Top Meta: Status · Date · Time */}
        <View style={styles.metaRow}>
          <AppText
            variant="smallCaps"
            size={9}
            color={statusColor}
            style={{ letterSpacing: 0.7 }}
          >
            {(d.status || '').toUpperCase()}
          </AppText>

          {d.date ? (
            <>
              <AppText variant="smallCaps" size={9} color={Colors.muted} style={{ marginHorizontal: 3 }}>
                ·
              </AppText>
              <AppText variant="smallCaps" size={9} color={Colors.muted} style={{ letterSpacing: 0.5 }}>
                {formatDateShort(d.date)}
              </AppText>
            </>
          ) : null}

          {d.exactTime ? (
            <>
              <AppText variant="smallCaps" size={9} color={Colors.muted} style={{ marginHorizontal: 3 }}>
                ·
              </AppText>
              <AppText variant="smallCaps" size={9} color={Colors.muted} style={{ letterSpacing: 0.5 }}>
                {d.exactTime.includes('AM') || d.exactTime.includes('PM')
                  ? d.exactTime
                  : format24to12(d.exactTime)}
              </AppText>
            </>
          ) : null}
        </View>

        {/* Title */}
        <AppText
          variant="heading"
          size={16}
          style={{ lineHeight: 19, marginBottom: 2 }}
          numberOfLines={1}
        >
          {d.title || d.venue}
        </AppText>

        {/* Subtitle */}
        <AppText
          variant="serifItalic"
          size={12}
          color={Colors.muted}
          style={{ lineHeight: 15 }}
          numberOfLines={1}
        >
          {d.title && d.venue ? d.venue : (d as any).city || 'A shared moment together.'}
        </AppText>

        {/* Review / Memory Quote if available */}
        {reviewText ? (
          <View style={styles.memory}>
            <AppText variant="serifItalic" size={11.5} color={Colors.ink2} numberOfLines={1}>
              "{reviewText}"
            </AppText>
          </View>
        ) : null}

        {/* Photos Strip if available */}
        {allPhotos.length > 0 ? (
          <View style={styles.photoStrip}>
            {allPhotos.slice(0, 3).map((photo, pIdx) => (
              <Image
                key={pIdx}
                source={{ uri: getFullUrl(photo) }}
                style={styles.photoThumb}
              />
            ))}
          </View>
        ) : null}

        {/* Bottom CTA (Matches Today Screen ritualCta) */}
        <View style={styles.ritualCta}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <AppText
              variant="mono"
              color={statusColor}
              style={{ fontSize: 9.5, letterSpacing: 0.7 }}
            >
              {ctaText}
            </AppText>

            {(d.myPhoto || d.partnerPhoto) && (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 4 }}>
                {d.myPhoto && (
                  <Image
                    source={{ uri: getFullUrl(d.myPhoto) }}
                    style={styles.avatarMini}
                  />
                )}
                {d.partnerPhoto && (
                  <Image
                    source={{ uri: getFullUrl(d.partnerPhoto) }}
                    style={[styles.avatarMini, d.myPhoto && { marginLeft: -6 }]}
                  />
                )}
              </View>
            )}
          </View>

          <AppText color={statusColor} size={14}>
            →
          </AppText>
        </View>
      </View>
    </Pressable>
  );
};

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
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRightWidth: 1,
    borderRightColor: Colors.rule,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 72,
    backgroundColor: '#F3EDE2',
  },
  scoreDivider: {
    width: '100%',
    height: 1,
    backgroundColor: Colors.rule,
    marginVertical: 6,
  },
  ritualBlock: {
    flex: 1,
    paddingVertical: 11,
    paddingHorizontal: 13,
    justifyContent: 'space-between',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginBottom: 3,
  },
  memory: {
    marginTop: 4,
    paddingLeft: 8,
    borderLeftWidth: 2,
    borderLeftColor: Colors.accent,
  },
  photoStrip: {
    flexDirection: 'row',
    gap: 5,
    marginTop: 6,
  },
  photoThumb: {
    width: 36,
    height: 36,
    borderRadius: 6,
    backgroundColor: Colors.rule,
  },
  avatarMini: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: Colors.bone,
  },
  ritualCta: {
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: Colors.rule,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
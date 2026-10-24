import { DeviceEventEmitter } from 'react-native';

export interface NotificationPayload {
  id?: string;
  type?: string;
  title?: string;
  message?: string;
  metadata?: any;
}

/**
 * Accurately navigates/deeplinks to the target screen, tab, or bottom sheet based on notification payload.
 */
export const handleNotificationDeepLink = (
  notification: NotificationPayload,
  navigation: any,
  onSheetClose?: () => void
) => {
  if (onSheetClose) {
    try {
      onSheetClose();
    } catch (_) {}
  }

  const type = notification.type || '';
  const metadata = notification.metadata || {};
  const screen = metadata.screen;

  // 1. Thread Messages & Notes
  if (
    type === 'Thread Message' ||
    type === 'Thread' ||
    type === 'new_thread_message' ||
    screen === 'Thread' ||
    metadata.category
  ) {
    const category = (metadata.category || 'all').toLowerCase();
    navigation.navigate('AlignedApp', {
      screen: 'Thread',
      params: { activeCategory: category, messageId: metadata.message_id },
    });
    return;
  }

  // 2. Dates, Proposals & Date Completion
  if (
    type.includes('Date') ||
    type === 'Proposal' ||
    type === 'Date Added' ||
    type === 'Date Completion Request' ||
    screen === 'Dates' ||
    metadata.date_id ||
    metadata.action === 'ping_late' ||
    metadata.action === 'upcoming_reminder'
  ) {
    navigation.navigate('AlignedApp', {
      screen: 'Dates',
      params: { dateId: metadata.date_id, action: metadata.action },
    });
    return;
  }

  // 3. Map Places & Pins
  if (type.includes('Map') || screen === 'Map') {
    navigation.navigate('AlignedApp', {
      screen: 'Map',
      params: { pinId: metadata.place_id || metadata.pin_id },
    });
    return;
  }

  // 4. Milestones & Steps (Future Screen)
  if (type.includes('Milestone') || screen === 'Future') {
    navigation.navigate('AlignedApp', {
      screen: 'Future',
      params: { milestoneId: metadata.milestone_id },
    });
    return;
  }

  // 5. Confidential / Secret Messages / Rewatch
  if (
    type.includes('Confidential') ||
    type.includes('Rewatch') ||
    screen === 'SecretHistory' ||
    metadata.secret_id
  ) {
    navigation.navigate('SecretHistory', { secretId: metadata.secret_id });
    return;
  }

  // 6. Alignment Connection Requests
  if (type === 'Alignment Request' || screen === 'AlignmentRequests') {
    navigation.navigate('AlignmentRequests');
    return;
  }

  // 7. Partner Check-in
  if (type === 'Partner Check-in' || metadata.action === 'checkin_created') {
    navigation.navigate('AlignedApp', { screen: 'Home' });
    setTimeout(() => {
      DeviceEventEmitter.emit('OPEN_CHECKIN_SHEET', metadata.sheet || 'side-by-side');
    }, 150);
    return;
  }

  // 8. Ritual Completed
  if (type === 'Ritual Completed') {
    navigation.navigate('AlignedApp', { screen: 'Home' });
    setTimeout(() => {
      DeviceEventEmitter.emit('OPEN_PARTNER_RITUALS');
    }, 150);
    return;
  }

  // 9. Cycle Update / Her Rhythm
  if (type === 'Cycle Update' || metadata.section === 'cycle') {
    navigation.navigate('AlignedApp', { screen: 'Home' });
    setTimeout(() => {
      DeviceEventEmitter.emit('OPEN_RHYTHMS_CYCLE');
    }, 150);
    return;
  }

  // 10. Mood Change
  if (type === 'Mood Change' || metadata.section === 'mood') {
    navigation.navigate('AlignedApp', { screen: 'Home' });
    setTimeout(() => {
      DeviceEventEmitter.emit('OPEN_MOOD_SELECTOR');
    }, 150);
    return;
  }

  // 11. Silent Ping / Moment
  if (
    type === 'Thinking of You' ||
    metadata.section === 'moment' ||
    metadata.action === 'silent_ping'
  ) {
    navigation.navigate('AlignedApp', { screen: 'Home' });
    setTimeout(() => {
      DeviceEventEmitter.emit('OPEN_MOMENT_PING');
    }, 150);
    return;
  }

  // 12. Watch Together Session
  if (type === 'Watch Together' || metadata.section === 'watch') {
    navigation.navigate('AlignedApp', { screen: 'Home' });
    setTimeout(() => {
      DeviceEventEmitter.emit('OPEN_WATCH_TOGETHER');
    }, 150);
    return;
  }

  // 13. State Update / Energy
  if (type === 'State Update' || metadata.section === 'energy') {
    navigation.navigate('AlignedApp', { screen: 'Home' });
    setTimeout(() => {
      DeviceEventEmitter.emit('OPEN_YOUR_STATE');
    }, 150);
    return;
  }

  // 14. Us Section / Reunion / Anniversary
  if (
    type === 'Reunion' ||
    type === 'Anniversary' ||
    type === 'Us Section Update' ||
    metadata.section === 'us'
  ) {
    const targetTab = type === 'Reunion' ? 'REUNION' : type === 'Anniversary' ? 'TIME' : 'DATES';
    navigation.navigate('AlignedApp', { screen: 'Home' });
    setTimeout(() => {
      DeviceEventEmitter.emit('SET_US_SECTION_TAB', targetTab);
    }, 150);
    return;
  }

  // 15. Playlist Update
  if (type === 'Playlist Update' || metadata.section === 'playlist') {
    navigation.navigate('AlignedApp', { screen: 'Home' });
    setTimeout(() => {
      DeviceEventEmitter.emit('OPEN_PLAYLIST_SHEET');
    }, 150);
    return;
  }

  // Fallback: Default to Home
  navigation.navigate('AlignedApp', { screen: 'Home' });
};

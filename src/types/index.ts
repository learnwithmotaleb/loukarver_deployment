// ─── Shared ───────────────────────────────────────────────────────────────
export type UserId = 'lou' | 'amanda';

export interface User {
  name: string;
  city: string;
  shortCity: string;
  tz: number;
  initial: string;
}

// ─── Mood ─────────────────────────────────────────────────────────────────
export interface Mood {
  mark: string;
  label: string;
}

// ─── Thread ───────────────────────────────────────────────────────────────
export type ThreadEntryType =
  | 'letter' | 'voice' | 'photo' | 'prompt' | 'appreciation' | 'checkin';

export interface ThreadEntry {
  id: number;
  from: UserId;
  type: ThreadEntryType;
  text: string;
  date: string;
  time: string;
  transcript?: string;
  caption?: string;
  emoji?: string;
  category?: string;
  heat?: number;
  feeling?: string;
  need?: string;
  thought?: string;
}

// ─── Activities ───────────────────────────────────────────────────────────
export type ActivityStatus = 'active' | 'completed' | 'pending';

export interface Activity {
  id: number;
  label: string;
  duration: string;
  description: string;
  cat: string;
  status: ActivityStatus;
  louDone: boolean;
  amandaDone: boolean;
  mark: string;
  completedDate?: string;
  memory?: string;
  createdAt?: string;
}

// ─── Dates ────────────────────────────────────────────────────────────────
export type DateStatus = 'proposed' | 'accepted' | 'completed' | 'cancelled' | 'cancelrequested' | 'rejected';

export interface DateReview {
  user_id: string;
  user_name: string;
  rating: number;
  text: string;
  photos?: string[];
  created_at?: string;
}

export interface DateEntry {
  id: string;
  creator_id?: string;
  proposed_by?: string;
  status: DateStatus;
  venue: string;
  date?: string;
  exactTime?: string;
  meetType?: 'location' | 'pickup' | 'pickedup';
  title?: string;
  rating?: number;
  memory?: string;
  completedDate?: string;
  lateMinutes?: number;
  lateNote?: string;
  cancelReason?: string;
  cancel_requested_by?: string;
  cancel_reason?: string;
  utc_timestamp?: string;
  photos?: string[];
  averageRating?: number;
  completed_by?: string[];
  myPhoto?: string;
  partnerPhoto?: string;
  reviews?: DateReview[];
  photo_delete_requests?: string[];
}

// ─── Milestones ───────────────────────────────────────────────────────────
export interface MilestoneStep {
  id: string;
  text: string;
  done: boolean;
}

export interface Milestone {
  id: string;
  label: string;
  icon: string;
  description: string;
  private: boolean;
  custom: boolean;
  steps: MilestoneStep[];
  isLocked?: boolean;
}

// ─── Map Pins ─────────────────────────────────────────────────────────────
export type PinType = 'home' | 'together' | 'upcoming' | 'bucket';

export interface MapPin {
  id: number;
  city: string;
  country: string;
  lat: number;
  lng: number;
  type: PinType;
  owner?: UserId;
  note?: string;
  dates?: string;
  photos?: string[];
  completed_by?: string[];
}

// ─── Playlist ─────────────────────────────────────────────────────────────
export type MusicService = 'spotify' | 'apple' | 'youtube';

export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: string;
  addedBy: UserId;
  addedAt: string;
  available: MusicService[];
  isrc?: string;
}

// ─── Vibe Check ───────────────────────────────────────────────────────────
export interface ThisOrThatCard {
  a: string;
  b: string;
  cat: string;
}

export interface PlayHistoryEntry {
  card: ThisOrThatCard;
  myPick: 'a' | 'b';
  theirPick: 'a' | 'b';
  date: string;
  at?: string;
}

export interface VCConnection {
  id: string;
  partnerName: string;
  daysConnected: number;
  matchRate: number;
  solo: boolean;
  preAligned: boolean;
}

export interface Flag {
  id: number;
  type: 'green' | 'yellow' | 'red';
  text: string;
  date: string;
}

// ─── Navigation ───────────────────────────────────────────────────────────
export type AppMode = 'aligned' | 'becoming';
export type AppScreen = 'mode' | 'welcome' | 'onboarding' | 'app';

export type RootStackParamList = {
  ModeSelector: { autoSelect?: 'vibe' | 'aligned' } | undefined;
  Login: { returnTo?: 'vibe' | 'aligned'; email?: string; initialEmail?: string } | undefined;
  Signup: { email?: string; initialEmail?: string } | undefined;
  VerifyEmail: { email: string };
  ForgotPassword: { email?: string; initialEmail?: string } | undefined;
  ResetPassword: { email: string };
  AlignedWelcome: undefined;
  AlignedOnboarding: undefined;
  AlignedApp: undefined;
  AlignedProfile: undefined;
  AlignedQRScanner: { onScan?: (data: string) => void } | undefined;
  AlignmentRequests: undefined;
  VibeWelcome: undefined;
  VibeOnboarding: { inviteCode?: string } | undefined;
  VibeApp: undefined;
  VibeProfile: undefined;
  SecretHistory: undefined;
  Legal: { type: 'privacy' | 'terms' };
  Report: undefined;
  ReportChat: { reportId: string };
};

export type AlignedTabParamList = {
  Home: undefined;
  Connect?: undefined;
  Dates: undefined;
  Thread: undefined;
  Future: undefined;
  Map: undefined;
};

export type VibeTabParamList = {
  Play: undefined;
  VCDates: undefined;
  History: undefined;
  Pulse: undefined;
};
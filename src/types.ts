export type WagerStatus = 'pending' | 'awaiting_payment' | 'won' | 'lost' | 'settled';

export interface UserProfile {
  id: string;          // Supabase auth user id
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  avatarId: number;
  profilePicture?: string; // base64 jpeg or null
}

export interface Wager {
  id: string;
  creatorId: string;   // owner's profile id
  title: string;
  friends: string[];   // one or more opponent names
  stake: string;
  status: WagerStatus;
  deadline: string;
  condition: string;
  result?: 'won' | 'lost';
}

export interface Friend {
  id: string;
  name: string;
  avatar: string;
  phone?: string;
  profileId?: string;  // set if this friend is a registered BetBuddy user
}

export interface LeaderboardEntry {
  id: string;
  firstName: string;
  lastName: string;
  avatarId: number;
  wins: number;
  decided: number;
  total: number;
}

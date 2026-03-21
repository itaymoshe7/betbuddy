export type WagerStatus = 'pending' | 'awaiting_payment' | 'won' | 'lost' | 'settled';

export interface UserProfile {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  avatarId: number;
  profilePicture?: string; // base64 jpeg, 200x200, stored in localStorage
}

export interface Wager {
  id: string;
  title: string;
  friends: string[];       // one or more opponents
  stake: string;           // free text, e.g. "Dinner at Taizu"
  status: WagerStatus;
  deadline: string;        // ISO datetime string e.g. "2026-03-28T20:00"
  condition: string;
  result?: 'won' | 'lost';
}

export interface Friend {
  id: string;
  name: string;
  avatar: string; // 2-letter initials
  phone?: string;
}

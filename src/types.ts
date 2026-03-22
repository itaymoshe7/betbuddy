export type WagerStatus =
  | 'pending_approval'   // waiting for participant(s) to accept
  | 'pending'            // active / in-progress (legacy label)
  | 'active'             // active / in-progress (new label — DB may store either)
  | 'overdue'            // deadline passed but no result declared (client-side derived)
  | 'awaiting_payment'   // creator declared won, waiting to collect
  | 'won'
  | 'lost'
  | 'settled'            // fully closed
  | 'declined';          // a participant rejected it

export interface UserProfile {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  avatarId: number;
  profilePicture?: string;
  memberSince?: string;  // ISO timestamp from profiles.created_at
}

export interface Wager {
  id: string;
  creatorId: string;
  creatorName: string;      // first+last name from profiles JOIN
  title: string;
  friends: string[];
  stake: string;
  stakeType: 'money' | 'other';
  monetaryValue?: number;   // ILS amount, only when stakeType === 'money'
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

export interface WagerApproval {
  id: string;
  wagerId: string;
  profileId: string;
  status: 'pending' | 'approved' | 'declined';
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

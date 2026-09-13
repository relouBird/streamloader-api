// database/types.ts

// ==========================
// ENUMS / UNIONS
// ==========================

export type UserPlan = "free" | "premium";

export type TransactionStatus = "pending" | "completed" | "failed";

export type TransactionPlan = "monthly" | "yearly" | string; // élargi si tu ajoutes d'autres plans

export type DownloadStatus = "pending" | "completed" | "failed" | string;

export type ReviewStatus = "pending" | "approved" | "rejected";

// ==========================
// USERS
// ==========================

/** User complet retourné par getUserByEmail (avec password) */
export interface UserWithPassword {
  id: string;
  email: string;
  password: string;
  plan: UserPlan; // calculé via CASE (peut renvoyer 'free' si expiré)
  premium_until: string | null; // ISO string (TEXT en DB)
  trim_trials_used: number;
  created_at: string | Date;
  updated_at: string | Date;
}

/** User public retourné par getUserById (sans password) */
export interface UserPublic {
  id: string;
  email: string;
  plan: UserPlan;
  premium_until: string | null;
  trim_trials_used: number;
  created_at: string | Date;
}

// ==========================
// TRANSACTIONS
// ==========================

export interface Transaction {
  id: string;
  user_id: string;
  provider: string;
  amount: number;
  plan: TransactionPlan;
  status: TransactionStatus;
  created_at: string | Date;
  updated_at: string | Date;
}

// ==========================
// DOWNLOADS
// ==========================

export interface DownloadLog {
  id: number;
  user_id: string | null;
  client_key: string | null;
  url: string;
  format: string | null;
  title: string | null;
  status: DownloadStatus;
  subtitled: 0 | 1; // TINYINT(1) -> 0/1 renvoyé par le driver
  created_at: string | Date;
}

/** Résultat d'un INSERT — adapte selon ton driver (mysql2 / better-sqlite3 / D1) */
export interface InsertResult {
  insertId?: number;
  lastInsertRowid?: number;
  affectedRows?: number;
  changes?: number;
}

// ==========================
// REVIEWS
// ==========================

export interface PendingReview {
  id: number;
  rating: number;
  comment: string | null;
  created_at: string | Date;
}

export interface ApprovedReview {
  rating: number;
  comment: string | null;
  created_at: string | Date;
}

export interface ReviewStats {
  count: number;
  average: number | null; // AVG() renvoie NULL s'il n'y a aucune review
}

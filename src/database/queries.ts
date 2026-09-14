// database/queries.ts

import { db } from "./index";

import type {
  UserWithPassword,
  UserPublic,
  Transaction,
  DownloadLog,
  InsertResult,
  PendingReview,
  ApprovedReview,
  ReviewStats,
} from "../types/database.type";

// Helper pour caster le tuple [rows, fields] renvoyé par db.execute
function first<T>(rows: unknown): T | null {
  return (rows as T[])[0] ?? null;
}

function all<T>(rows: unknown): T[] {
  return (rows as T[]) ?? [];
}

export const queries = {
  // ==========================
  // USERS
  // ==========================

  async createUser(id: string, email: string, password: string): Promise<void> {
    await db.execute(
      `INSERT INTO users (id, email, password)
       VALUES (?, ?, ?)`,
      [id, email, password],
    );
  },

  async getUserByEmail(email: string): Promise<UserWithPassword | null> {
    const [rows] = await db.execute(
      `SELECT
          id,
          email,
          password,

          CASE
            WHEN plan = 'premium'
              AND premium_until IS NOT NULL
              AND premium_until <= NOW()
            THEN 'free'
            ELSE plan
          END AS plan,

          premium_until,
          trim_trials_used,
          created_at,
          updated_at

       FROM users

       WHERE email = ?`,
      [email],
    );

    return first<UserWithPassword>(rows);
  },

  async getUserById(id: string): Promise<UserPublic | null> {
    const [rows] = await db.execute(
      `SELECT
          id,
          email,

          CASE
            WHEN plan = 'premium'
              AND premium_until IS NOT NULL
              AND premium_until <= NOW()
            THEN 'free'
            ELSE plan
          END AS plan,

          premium_until,
          trim_trials_used,
          created_at

       FROM users

       WHERE id = ?`,
      [id],
    );

    return first<UserPublic>(rows);
  },

  async upgradeToPremium(id: string, months: number): Promise<void> {
    await db.execute(
      `UPDATE users

       SET
         plan = 'premium',

         premium_until =
           CASE
             WHEN premium_until IS NOT NULL
                  AND premium_until > NOW()
             THEN DATE_ADD(premium_until, INTERVAL ? MONTH)

             ELSE DATE_ADD(NOW(), INTERVAL ? MONTH)
           END,

         updated_at = NOW()

       WHERE id = ?`,
      [months, months, id],
    );
  },

  async incrementTrimTrial(id: string): Promise<void> {
    await db.execute(
      `UPDATE users

       SET
         trim_trials_used = trim_trials_used + 1,
         updated_at = NOW()

       WHERE id = ?`,
      [id],
    );
  },

  // ==========================
  // TRANSACTIONS
  // ==========================

  async createTransaction(
    id: string,
    userId: string,
    provider: string,
    amount: number,
    plan: string,
  ): Promise<void> {
    await db.execute(
      `INSERT INTO transactions (
         id,
         user_id,
         provider,
         amount,
         plan
       )
       VALUES (?, ?, ?, ?, ?)`,
      [id, userId, provider, amount, plan],
    );
  },

  async getTransaction(id: string): Promise<Transaction | null> {
    const [rows] = await db.execute(
      `SELECT *
       FROM transactions
       WHERE id = ?`,
      [id],
    );

    return first<Transaction>(rows);
  },

  async completeTransaction(id: string): Promise<void> {
    await db.execute(
      `UPDATE transactions

       SET
         status = 'completed',
         updated_at = NOW()

       WHERE id = ?`,
      [id],
    );
  },

  async failTransaction(id: string): Promise<void> {
    await db.execute(
      `UPDATE transactions

       SET
         status = 'failed',
         updated_at = NOW()

       WHERE id = ?`,
      [id],
    );
  },

  // ==========================
  // DOWNLOADS
  // ==========================

  async logDownload(
    userId: string | null,
    clientKey: string,
    url: string,
    format: string,
    title: string,
    subtitled: boolean,
  ): Promise<InsertResult> {
    const [result] = await db.execute(
      `INSERT INTO downloads_log (
         user_id,
         client_key,
         url,
         format,
         title,
         subtitled
       )
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, clientKey, url, format, title, subtitled ? 1 : 0],
    );

    return result as InsertResult;
  },

  async updateDownloadStatus(id: number, status: string): Promise<void> {
    await db.execute(
      `UPDATE downloads_log
       SET status = ?
       WHERE id = ?`,
      [status, id],
    );
  },

  async countDailyDownloads(clientKey: string): Promise<number> {
    const [rows] = await db.execute(
      `SELECT COUNT(*) AS count

       FROM downloads_log

       WHERE client_key = ?

         AND created_at >= CURRENT_DATE()`,
      [clientKey],
    );

    return first<{ count: number }>(rows)?.count ?? 0;
  },

  async countDailySubtitleDownloads(clientKey: string): Promise<number> {
    const [rows] = await db.execute(
      `SELECT COUNT(*) AS count

       FROM downloads_log

       WHERE client_key = ?

         AND subtitled = 1

         AND created_at >= CURRENT_DATE()`,
      [clientKey],
    );

    return first<{ count: number }>(rows)?.count ?? 0;
  },

  // ==========================
  // REVIEWS
  // ==========================

  async createReview(
    clientKey: string,
    rating: number,
    comment: string,
  ): Promise<void> {
    await db.execute(
      `INSERT INTO reviews (
         client_key,
         rating,
         comment
       )
       VALUES (?, ?, ?)`,
      [clientKey, rating, comment],
    );
  },

  async countPendingReviewsToday(clientKey: string): Promise<number> {
    const [rows] = await db.execute(
      `SELECT COUNT(*) AS count

       FROM reviews

       WHERE client_key = ?

         AND created_at >= CURRENT_DATE()`,
      [clientKey],
    );

    return first<{ count: number }>(rows)?.count ?? 0;
  },

  async listPendingReviews(): Promise<PendingReview[]> {
    const [rows] = await db.execute(
      `SELECT
         id,
         rating,
         comment,
         created_at

       FROM reviews

       WHERE status = 'pending'

       ORDER BY created_at ASC`,
    );

    return all<PendingReview>(rows);
  },

  async approveReview(id: number): Promise<void> {
    await db.execute(
      `UPDATE reviews
       SET status = 'approved'
       WHERE id = ?`,
      [id],
    );
  },

  async rejectReview(id: number): Promise<void> {
    await db.execute(
      `UPDATE reviews
       SET status = 'rejected'
       WHERE id = ?`,
      [id],
    );
  },

  async getReviewStats(): Promise<ReviewStats> {
    const [rows] = await db.execute(
      `SELECT
         COUNT(*) AS count,
         AVG(rating) AS average

       FROM reviews

       WHERE status = 'approved'`,
    );

    return (
      first<ReviewStats>(rows) ?? {
        count: 0,
        average: null,
      }
    );
  },

  async listApprovedReviews(limit: number): Promise<ApprovedReview[]> {
    const [rows] = await db.execute(
      `SELECT
         rating,
         comment,
         created_at

       FROM reviews

       WHERE status = 'approved'

       ORDER BY created_at DESC

       LIMIT ?`,
      [limit],
    );

    return all<ApprovedReview>(rows);
  },
} as const;

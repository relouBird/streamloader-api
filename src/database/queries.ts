// database/queries.ts

import { db } from "./index";

import type {
  UserWithPassword,
  UserPublic,
  Transaction,
  InsertResult,
  PendingReview,
  ApprovedReview,
  ReviewStats,
  DailyDownloadLimit,
} from "../types/database.type";

type SqlRows<T> = T[];

type SqlResult = {
  affectedRows?: number;
  insertId?: number | bigint;
};

function first<T>(rows: unknown): T | null {
  return (rows as SqlRows<T>)[0] ?? null;
}

function all<T>(rows: unknown): T[] {
  return (rows as SqlRows<T>) ?? [];
}

function toNumber(value: unknown): number {
  return typeof value === "bigint" ? Number(value) : Number(value);
}

export const queries = {
  async ensureTelegramUser(telegramId: number): Promise<void> {
    await db.execute(
      `INSERT INTO telegram_users (telegram_id, first_seen_at, last_seen_at)
       VALUES (?, NOW(), NOW())
       ON DUPLICATE KEY UPDATE last_seen_at = NOW()`,
      [telegramId],
    );
  },

  async claimSiteOffer(
    telegramId: number,
    intervalHours: number,
  ): Promise<{ offered: boolean; lastOfferAt: Date | null }> {
    await this.ensureTelegramUser(telegramId);
    const [result] = await db.execute(
      `UPDATE telegram_users
          SET last_offer_at = NOW()
        WHERE telegram_id = ?
          AND (last_offer_at IS NULL
               OR last_offer_at <= DATE_SUB(NOW(), INTERVAL ? HOUR))`,
      [telegramId, intervalHours],
    );
    const update = result as SqlResult;
    const [rows] = await db.execute(
      `SELECT last_offer_at FROM telegram_users WHERE telegram_id = ? LIMIT 1`,
      [telegramId],
    );
    const row = first<{ last_offer_at: Date | null }>(rows);
    return {
      offered: update.affectedRows === 1,
      lastOfferAt: row?.last_offer_at ?? null,
    };
  },

  async createSiteOfferEvent(event: {
    telegramId: number;
    jti: string;
    tokenHash: string;
    offeredAt: Date;
    expiresAt: Date;
  }): Promise<void> {
    await db.execute(
      `INSERT INTO telegram_site_offer_events
        (telegram_id, campaign, jti, token_hash, offered_at, expires_at)
       VALUES (?, 'site_visit', ?, ?, ?, ?)`,
      [
        event.telegramId,
        event.jti,
        event.tokenHash,
        event.offeredAt,
        event.expiresAt,
      ],
    );
  },

  async verifySiteOffer(jti: string): Promise<{
    telegram_id: number;
    campaign: string;
    expires_at: Date;
    verified_at: Date | null;
  } | null> {
    const [rows] = await db.execute(
      `SELECT telegram_id, campaign, expires_at, verified_at
         FROM telegram_site_offer_events
        WHERE jti = ?
        LIMIT 1`,
      [jti],
    );
    const event = first<{
      telegram_id: number;
      campaign: string;
      expires_at: Date;
      verified_at: Date | null;
    }>(rows);
    if (!event) return null;
    if (!event.verified_at) {
      await db.execute(
        `UPDATE telegram_site_offer_events
            SET verified_at = NOW()
          WHERE jti = ? AND verified_at IS NULL`,
        [jti],
      );
    }
    return event;
  },
  // =========================================================
  // USERS
  // =========================================================

  async createUser(id: string, email: string, password: string): Promise<void> {
    await db.execute(
      `
        INSERT INTO users (
          id,
          email,
          password
        )
        VALUES (?, ?, ?)
      `,
      [id, email, password],
    );
  },

  async getUserByEmail(email: string): Promise<UserWithPassword | null> {
    const [rows] = await db.execute(
      `
        SELECT
          id,
          email,
          telegram_id,
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
        WHERE email = ?
        LIMIT 1
      `,
      [email],
    );

    return first<UserWithPassword>(rows);
  },

  async getUserById(id: string): Promise<UserPublic | null> {
    const [rows] = await db.execute(
      `
        SELECT
          id,
          email,
          telegram_id,

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
        WHERE id = ?
        LIMIT 1
      `,
      [id],
    );

    return first<UserPublic>(rows);
  },

  async upgradeToPremium(id: string, months: number): Promise<void> {
    if (!Number.isInteger(months) || months <= 0) {
      throw new Error("The number of months must be a positive integer");
    }

    await db.execute(
      `
        UPDATE users
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

        WHERE id = ?
      `,
      [months, months, id],
    );
  },

  async incrementTrimTrial(id: string): Promise<void> {
    await db.execute(
      `
        UPDATE users
        SET
          trim_trials_used = trim_trials_used + 1,
          updated_at = NOW()
        WHERE id = ?
      `,
      [id],
    );
  },

  // =========================================================
  // API KEYS
  // =========================================================

  async setApiKey(
    userId: string,
    apiKeyHash: string,
    apiKeyPrefix: string,
  ): Promise<void> {
    await db.execute(
      `
        UPDATE users
        SET
          api_key_hash = ?,
          api_key_prefix = ?,
          api_key_created_at = NOW(),
          updated_at = NOW()
        WHERE id = ?
      `,
      [apiKeyHash, apiKeyPrefix, userId],
    );
  },

  async revokeApiKey(userId: string): Promise<void> {
    await db.execute(
      `
        UPDATE users
        SET
          api_key_hash = NULL,
          api_key_prefix = NULL,
          api_key_created_at = NULL,
          updated_at = NOW()
        WHERE id = ?
      `,
      [userId],
    );
  },

  async getApiKeyInfo(userId: string): Promise<{
    api_key_prefix: string | null;
    api_key_created_at: string | Date | null;
  } | null> {
    const [rows] = await db.execute(
      `
        SELECT
          api_key_prefix,
          api_key_created_at
        FROM users
        WHERE id = ?
        LIMIT 1
      `,
      [userId],
    );

    return first<{
      api_key_prefix: string | null;
      api_key_created_at: string | Date | null;
    }>(rows);
  },

  async getUserByApiKeyHash(apiKeyHash: string): Promise<UserPublic | null> {
    const [rows] = await db.execute(
      `
        SELECT
          id,
          email,
          telegram_id,

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
        WHERE api_key_hash = ?
        LIMIT 1
      `,
      [apiKeyHash],
    );

    return first<UserPublic>(rows);
  },

  async getUserByTelegramId(telegramId: number): Promise<UserPublic | null> {
    const [rows] = await db.execute(
      `SELECT id, email, telegram_id,
              CASE
                WHEN plan = 'premium' AND premium_until IS NOT NULL
                     AND premium_until <= NOW()
                THEN 'free'
                ELSE plan
              END AS plan,
              premium_until, trim_trials_used, created_at, updated_at
         FROM users
        WHERE telegram_id = ?
        LIMIT 1`,
      [telegramId],
    );
    return first<UserPublic>(rows);
  },

  async linkTelegramAccount(
    apiKeyHash: string,
    telegramId: number,
  ): Promise<UserPublic | null> {
    const [result] = await db.execute(
      `UPDATE users
          SET telegram_id = ?, updated_at = NOW()
        WHERE api_key_hash = ?
          AND (telegram_id IS NULL OR telegram_id = ?)`,
      [telegramId, apiKeyHash, telegramId],
    );
    const update = result as SqlResult;
    if (!update.affectedRows) return null;
    return this.getUserByTelegramId(telegramId);
  },

  // =========================================================
  // TRANSACTIONS
  // =========================================================

  async createTransaction(
    id: string,
    userId: string,
    provider: string,
    amount: number,
    currency: string,
    plan: string,
  ): Promise<void> {
    await db.execute(
      `
        INSERT INTO transactions (
          id,
          user_id,
          provider,
          amount,
          currency,
          plan
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      [id, userId, provider, amount, currency, plan],
    );
  },

  async getTransaction(id: string): Promise<Transaction | null> {
    const [rows] = await db.execute(
      `
        SELECT *
        FROM transactions
        WHERE id = ?
        LIMIT 1
      `,
      [id],
    );

    return first<Transaction>(rows);
  },

  async completeTransaction(id: string): Promise<void> {
    await db.execute(
      `
        UPDATE transactions
        SET
          status = 'completed',
          updated_at = NOW()
        WHERE id = ?
      `,
      [id],
    );
  },

  async failTransaction(id: string): Promise<void> {
    await db.execute(
      `
        UPDATE transactions
        SET
          status = 'failed',
          updated_at = NOW()
        WHERE id = ?
      `,
      [id],
    );
  },

  // =========================================================
  // DOWNLOADS
  // =========================================================

  async logDownload(
    userId: string | null,
    clientKey: string,
    url: string,
    format: string,
    title: string,
    subtitled: boolean,
  ): Promise<InsertResult> {
    const [result] = await db.execute(
      `
        INSERT INTO downloads_log (
          user_id,
          client_key,
          url,
          format,
          title,
          subtitled
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      [userId, clientKey, url, format, title, subtitled ? 1 : 0],
    );

    return result as InsertResult;
  },

  async updateDownloadStatus(id: number, status: string): Promise<void> {
    await db.execute(
      `
        UPDATE downloads_log
        SET status = ?
        WHERE id = ?
      `,
      [status, id],
    );
  },

  async countDailyDownloads(clientKey: string): Promise<number> {
    const [rows] = await db.execute(
      `
        SELECT COUNT(*) AS count
        FROM downloads_log
        WHERE client_key = ?
          AND created_at >= CURRENT_DATE()
      `,
      [clientKey],
    );

    const result = first<{ count: number | string }>(rows);

    return result ? toNumber(result.count) : 0;
  },

  async countDailySubtitleDownloads(clientKey: string): Promise<number> {
    const [rows] = await db.execute(
      `
        SELECT COUNT(*) AS count
        FROM downloads_log
        WHERE client_key = ?
          AND subtitled = 1
          AND created_at >= CURRENT_DATE()
      `,
      [clientKey],
    );

    const result = first<{ count: number | string }>(rows);

    return result ? toNumber(result.count) : 0;
  },

  async consumeDailyDownload(
    telegramId: number,
    userId: string | null,
    dailyLimit: number,
  ): Promise<{ allowed: boolean; usedCount: number }> {
    if (!Number.isInteger(dailyLimit) || dailyLimit <= 0) {
      throw new Error("Daily download limit must be a positive integer");
    }

    await db.execute(
      `INSERT INTO daily_download_limits
        (user_id, telegram_id, quota_date, used_count)
       VALUES (?, ?, CURRENT_DATE(), 1)
       ON DUPLICATE KEY UPDATE
         user_id = COALESCE(VALUES(user_id), user_id),
         used_count = IF(used_count < ?, used_count + 1, ? + 1)`,
      [userId, telegramId, dailyLimit, dailyLimit],
    );

    const [rows] = await db.execute(
      `SELECT id, user_id, telegram_id, quota_date, used_count
         FROM daily_download_limits
        WHERE telegram_id = ? AND quota_date = CURRENT_DATE()
        LIMIT 1`,
      [telegramId],
    );
    const limit = first<DailyDownloadLimit>(rows);
    if (!limit) throw new Error("Daily download quota could not be loaded");
    return {
      allowed: limit.used_count <= dailyLimit,
      usedCount: limit.used_count,
    };
  },

  // =========================================================
  // REVIEWS
  // =========================================================

  async createReview(
    clientKey: string,
    rating: number,
    comment: string,
  ): Promise<void> {
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new Error("Rating must be between 1 and 5");
    }

    await db.execute(
      `
        INSERT INTO reviews (
          client_key,
          rating,
          comment
        )
        VALUES (?, ?, ?)
      `,
      [clientKey, rating, comment],
    );
  },

  async countPendingReviewsToday(clientKey: string): Promise<number> {
    const [rows] = await db.execute(
      `
        SELECT COUNT(*) AS count
        FROM reviews
        WHERE client_key = ?
          AND status = 'pending'
          AND created_at >= CURRENT_DATE()
      `,
      [clientKey],
    );

    const result = first<{ count: number | string }>(rows);

    return result ? toNumber(result.count) : 0;
  },

  async listPendingReviews(): Promise<PendingReview[]> {
    const [rows] = await db.execute(
      `
        SELECT
          id,
          client_key,
          rating,
          comment,
          status,
          created_at

        FROM reviews
        WHERE status = 'pending'
        ORDER BY created_at ASC
      `,
    );

    return all<PendingReview>(rows);
  },

  async approveReview(id: number): Promise<void> {
    await db.execute(
      `
        UPDATE reviews
        SET
          status = 'approved'
        WHERE id = ?
      `,
      [id],
    );
  },

  async rejectReview(id: number): Promise<void> {
    await db.execute(
      `
        UPDATE reviews
        SET
          status = 'rejected'
        WHERE id = ?
      `,
      [id],
    );
  },

  async getReviewStats(): Promise<ReviewStats> {
    const [rows] = await db.execute(
      `
        SELECT
          COUNT(*) AS count,
          AVG(rating) AS average
        FROM reviews
        WHERE status = 'approved'
      `,
    );

    const result = first<{
      count: number | string;
      average: number | string | null;
    }>(rows);

    return {
      count: result ? toNumber(result.count) : 0,
      average:
        result?.average === null || result?.average === undefined
          ? null
          : Number(result.average),
    };
  },

  async listApprovedReviews(limit: number): Promise<ApprovedReview[]> {
    if (!Number.isInteger(limit) || limit <= 0) {
      throw new Error("Limit must be a positive integer");
    }

    const [rows] = await db.execute(
      `
        SELECT
          rating,
          comment,
          created_at

        FROM reviews
        WHERE status = 'approved'
        ORDER BY created_at DESC
        LIMIT ?
      `,
      [limit],
    );

    return all<ApprovedReview>(rows);
  },
} as const;

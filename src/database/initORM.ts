// database/initORM.ts
import { db } from "./index";

type SqlRow = Record<string, unknown>;

function rowsOf<T extends SqlRow>(rows: unknown): T[] {
  return Array.isArray(rows) ? (rows as T[]) : [];
}

async function columnExists(
  tableName: string,
  columnName: string,
): Promise<boolean> {
  const [rows] = await db.execute(
    `
      SELECT 1
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
      LIMIT 1
    `,
    [tableName, columnName],
  );

  return rowsOf(rows).length > 0;
}

async function indexExists(
  tableName: string,
  indexName: string,
): Promise<boolean> {
  const [rows] = await db.execute(
    `
      SELECT 1
      FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND INDEX_NAME = ?
      LIMIT 1
    `,
    [tableName, indexName],
  );

  return rowsOf(rows).length > 0;
}

async function addColumnIfMissing(
  tableName: string,
  columnName: string,
  definition: string,
): Promise<void> {
  const exists = await columnExists(tableName, columnName);

  if (exists) {
    return;
  }

  await db.execute(`
    ALTER TABLE \`${tableName}\`
    ADD COLUMN \`${columnName}\` ${definition}
  `);
}

async function addIndexIfMissing(
  tableName: string,
  indexName: string,
  definition: string,
): Promise<void> {
  const exists = await indexExists(tableName, indexName);

  if (exists) {
    return;
  }

  await db.execute(`
    CREATE INDEX \`${indexName}\`
    ON \`${tableName}\` ${definition}
  `);
}

export async function initializeDatabase(): Promise<void> {
  // =========================================================
  // USERS
  // =========================================================

  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(36) PRIMARY KEY,

      email VARCHAR(255) NOT NULL UNIQUE,

      password VARCHAR(255) NOT NULL,

      plan ENUM('free', 'premium')
        NOT NULL DEFAULT 'free',

      premium_until DATETIME NULL,

      trim_trials_used INT UNSIGNED
        NOT NULL DEFAULT 0,

      api_key_hash CHAR(64) NULL,

      api_key_prefix VARCHAR(32) NULL,

      api_key_created_at DATETIME NULL,

      created_at TIMESTAMP
        NOT NULL DEFAULT CURRENT_TIMESTAMP,

      updated_at TIMESTAMP
        NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB
      DEFAULT CHARACTER SET utf8mb4
      COLLATE utf8mb4_unicode_ci
  `);

  // =========================================================
  // TRANSACTIONS
  // =========================================================

  await db.execute(`
    CREATE TABLE IF NOT EXISTS transactions (
      id VARCHAR(36) PRIMARY KEY,

      user_id VARCHAR(36) NOT NULL,

      provider VARCHAR(100) NOT NULL,

      amount DECIMAL(12, 2) NOT NULL,

      currency VARCHAR(10) NOT NULL,

      plan VARCHAR(50)
        NOT NULL DEFAULT 'monthly',

      status ENUM('pending', 'completed', 'failed')
        NOT NULL DEFAULT 'pending',

      created_at TIMESTAMP
        NOT NULL DEFAULT CURRENT_TIMESTAMP,

      updated_at TIMESTAMP
        NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

      CONSTRAINT fk_transactions_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
    ) ENGINE=InnoDB
      DEFAULT CHARACTER SET utf8mb4
      COLLATE utf8mb4_unicode_ci
  `);

  // =========================================================
  // DOWNLOADS
  // =========================================================

  await db.execute(`
    CREATE TABLE IF NOT EXISTS downloads_log (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

      user_id VARCHAR(36) NULL,

      client_key VARCHAR(255) NULL,

      url TEXT NOT NULL,

      format VARCHAR(50) NULL,

      title VARCHAR(255) NULL,

      status VARCHAR(50)
        NOT NULL DEFAULT 'pending',

      subtitled TINYINT(1)
        NOT NULL DEFAULT 0,

      created_at TIMESTAMP
        NOT NULL DEFAULT CURRENT_TIMESTAMP,

      CONSTRAINT fk_downloads_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE SET NULL
        ON UPDATE CASCADE
    ) ENGINE=InnoDB
      DEFAULT CHARACTER SET utf8mb4
      COLLATE utf8mb4_unicode_ci
  `);

  // =========================================================
  // REVIEWS
  // =========================================================

  await db.execute(`
    CREATE TABLE IF NOT EXISTS reviews (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

      client_key VARCHAR(255) NULL,

      rating TINYINT UNSIGNED NOT NULL,

      comment TEXT NULL,

      status ENUM('pending', 'approved', 'rejected')
        NOT NULL DEFAULT 'pending',

      created_at TIMESTAMP
        NOT NULL DEFAULT CURRENT_TIMESTAMP,

      CONSTRAINT chk_reviews_rating
        CHECK (rating BETWEEN 1 AND 5)
    ) ENGINE=InnoDB
      DEFAULT CHARACTER SET utf8mb4
      COLLATE utf8mb4_unicode_ci
  `);

  // =========================================================
  // MIGRATIONS DES ANCIENNES BASES
  // =========================================================

  await addColumnIfMissing(
    "users",
    "premium_until",
    "DATETIME NULL",
  );

  await addColumnIfMissing(
    "users",
    "trim_trials_used",
    "INT UNSIGNED NOT NULL DEFAULT 0",
  );

  await addColumnIfMissing(
    "users",
    "api_key_hash",
    "CHAR(64) NULL",
  );

  await addColumnIfMissing(
    "users",
    "api_key_prefix",
    "VARCHAR(32) NULL",
  );

  await addColumnIfMissing(
    "users",
    "api_key_created_at",
    "DATETIME NULL",
  );

  await addColumnIfMissing(
    "transactions",
    "currency",
    "VARCHAR(10) NOT NULL DEFAULT 'XAF'",
  );

  await addColumnIfMissing(
    "transactions",
    "plan",
    "VARCHAR(50) NOT NULL DEFAULT 'monthly'",
  );

  await addColumnIfMissing(
    "transactions",
    "status",
    "ENUM('pending', 'completed', 'failed') NOT NULL DEFAULT 'pending'",
  );

  await addColumnIfMissing(
    "downloads_log",
    "client_key",
    "VARCHAR(255) NULL",
  );

  await addColumnIfMissing(
    "downloads_log",
    "subtitled",
    "TINYINT(1) NOT NULL DEFAULT 0",
  );

  await addColumnIfMissing(
    "reviews",
    "status",
    "ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending'",
  );

  // =========================================================
  // INDEX
  // =========================================================

  await addIndexIfMissing(
    "users",
    "idx_users_email",
    "(email)",
  );

  await addIndexIfMissing(
    "users",
    "idx_users_api_key_hash",
    "(api_key_hash)",
  );

  await addIndexIfMissing(
    "transactions",
    "idx_tx_user",
    "(user_id)",
  );

  await addIndexIfMissing(
    "downloads_log",
    "idx_dl_user",
    "(user_id)",
  );

  await addIndexIfMissing(
    "downloads_log",
    "idx_dl_client",
    "(client_key, created_at)",
  );

  await addIndexIfMissing(
    "reviews",
    "idx_reviews_status",
    "(status, created_at)",
  );

  await addIndexIfMissing(
    "reviews",
    "idx_reviews_client_created",
    "(client_key, created_at)",
  );

  console.log("✅ Database initialized");
}
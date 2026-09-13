// database/initORM.ts
import { db } from "./index";

export async function initializeDatabase() {
  /** ---------------------- Migration pour les utilisateurs ---------------- */
  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(36) PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      plan ENUM('free', 'premium') NOT NULL DEFAULT 'free',
      premium_until TEXT,
      trim_trials_used INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  /** ---------------------- Migration pour les transactions ---------------- */
  await db.execute(`
    CREATE TABLE IF NOT EXISTS transactions (
      id VARCHAR(36) PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL,
      provider VARCHAR(100) NOT NULL,
      amount INT NOT NULL,
      plan VARCHAR(50) NOT NULL DEFAULT 'monthly',
      status ENUM('pending', 'completed', 'failed')
        NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

      CONSTRAINT fk_transactions_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
    )
  `);

  /** ---------------------- Migration pour les logs de téléchargements ---------------- */
  await db.execute(`
    CREATE TABLE IF NOT EXISTS downloads_log (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id VARCHAR(36),
      client_key TEXT,
      url TEXT NOT NULL,
      format VARCHAR(50),
      title VARCHAR(255),
      status VARCHAR(50) NOT NULL DEFAULT 'pending',
      subtitled TINYINT(1) NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

      CONSTRAINT fk_downloads_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE SET NULL
        ON UPDATE CASCADE
    )
  `);

  /** ---------------------- Migration pour les avis clients ---------------- */
  await db.execute(`
    CREATE TABLE IF NOT EXISTS reviews (
      id INT AUTO_INCREMENT PRIMARY KEY,
      client_key TEXT,
      rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
      comment TEXT,
      status VARCHAR(50) NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  /**
   * Migrations de compatibilité pour les bases déjà existantes.
   *
   * MySQL ne permet pas toujours d'utiliser directement
   * "ADD COLUMN IF NOT EXISTS" selon la version utilisée.
   * On conserve donc les try/catch comme dans ton ancienne version.
   */

  try {
    await db.execute(`
      ALTER TABLE downloads_log
      ADD COLUMN client_key TEXT
    `);
  } catch {}

  try {
    await db.execute(`
      ALTER TABLE transactions
      ADD COLUMN plan VARCHAR(50) NOT NULL DEFAULT 'monthly'
    `);
  } catch {}

  try {
    await db.execute(`
      ALTER TABLE users
      ADD COLUMN premium_until TEXT
    `);
  } catch {}

  try {
    await db.execute(`
      ALTER TABLE downloads_log
      ADD COLUMN subtitled TINYINT(1) NOT NULL DEFAULT 0
    `);
  } catch {}

  try {
    await db.execute(`
      ALTER TABLE users
      ADD COLUMN trim_trials_used INT NOT NULL DEFAULT 0
    `);
  } catch {}

  /**
   * Index.
   *
   * Les erreurs sont ignorées afin que l'initialisation ne plante pas
   * si l'index existe déjà.
   */

  try {
    await db.execute(`
      CREATE INDEX idx_users_email
      ON users(email)
    `);
  } catch {}

  try {
    await db.execute(`
      CREATE INDEX idx_tx_user
      ON transactions(user_id)
    `);
  } catch {}

  try {
    await db.execute(`
      CREATE INDEX idx_dl_user
      ON downloads_log(user_id)
    `);
  } catch {}

  try {
    await db.execute(`
      CREATE INDEX idx_reviews_status
      ON reviews(status, created_at)
    `);
  } catch {}

  try {
    await db.execute(`
      CREATE INDEX idx_dl_client
      ON downloads_log(client_key(191), created_at)
    `);
  } catch {}

  console.log("✅ Database initialized");
}

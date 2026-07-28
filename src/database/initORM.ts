// database/initORM.ts
import { db } from "./index";

export async function initializeDatabase() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(36) PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      plan ENUM('free','premium') DEFAULT 'free',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS transactions (
      id VARCHAR(36) PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL,
      provider VARCHAR(100) NOT NULL,
      amount INT NOT NULL,
      status ENUM('pending','completed','failed') DEFAULT 'pending',

      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS downloads_log (
      id INT AUTO_INCREMENT PRIMARY KEY,

      user_id VARCHAR(36),

      url TEXT NOT NULL,
      format VARCHAR(50),
      title VARCHAR(255),
      status VARCHAR(50) DEFAULT 'pending',

      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  await db.execute(`
      CREATE INDEX idx_users_email
      ON users(email)
  `).catch(() => {});

  await db.execute(`
      CREATE INDEX idx_tx_user
      ON transactions(user_id)
  `).catch(() => {});

  await db.execute(`
      CREATE INDEX idx_dl_user
      ON downloads_log(user_id)
  `).catch(() => {});

  console.log("✅ Database initialized");
}
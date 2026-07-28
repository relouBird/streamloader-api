// database/queries.ts
import { db } from "./index";

export const queries = {
  // ==========================
  // USERS
  // ==========================

  async createUser(id: string, email: string, password: string) {
    await db.execute(
      `INSERT INTO users(id,email,password)
       VALUES(?,?,?)`,
      [id, email, password],
    );
  },

  async getUserByEmail(email: string) {
    const [rows] = await db.execute(
      `SELECT *
       FROM users
       WHERE email=?`,
      [email],
    );

    return (rows as any[])[0] ?? null;
  },

  async getUserById(id: string) {
    const [rows] = await db.execute(
      `
      SELECT id,email,plan,created_at
      FROM users
      WHERE id=?
      `,
      [id],
    );

    return (rows as any[])[0] ?? null;
  },

  async upgradeToPremium(id: string) {
    await db.execute(
      `
      UPDATE users
      SET plan='premium'
      WHERE id=?
      `,
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
  ) {
    await db.execute(
      `
      INSERT INTO transactions
      (id,user_id,provider,amount)
      VALUES(?,?,?,?)
      `,
      [id, userId, provider, amount],
    );
  },

  async getTransaction(id: string) {
    const [rows] = await db.execute(
      `
      SELECT *
      FROM transactions
      WHERE id=?
      `,
      [id],
    );

    return (rows as any[])[0] ?? null;
  },

  async completeTransaction(id: string) {
    await db.execute(
      `
      UPDATE transactions
      SET status='completed'
      WHERE id=?
      `,
      [id],
    );
  },

  // ==========================
  // DOWNLOADS
  // ==========================

  async logDownload(
    userId: string | null,
    url: string,
    format: string,
    title: string,
  ) {
    const [result] = await db.execute(
      `
      INSERT INTO downloads_log
      (user_id,url,format,title)
      VALUES(?,?,?,?)
      `,
      [userId, url, format, title],
    );

    return result;
  },

  async updateDownloadStatus(id: number, status: string) {
    await db.execute(
      `
      UPDATE downloads_log
      SET status=?
      WHERE id=?
      `,
      [status, id],
    );
  },
};

// utils/premium.ts
import { queries } from "../database/queries";
 
export async function activatePremium(txId: string) {
  try {
    const tx = await queries.getTransaction(txId);
    if (tx && tx.status !== "completed") {
      await queries.completeTransaction(txId);
      await queries.upgradeToPremium(tx.user_id);
      console.log(`[PREMIUM] Activé — user:${tx.user_id} tx:${txId}`);
    }
  } catch (e: any) {
    console.error("[activatePremium]", e.message);
  }
}
 
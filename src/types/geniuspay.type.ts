// types/geniuspay.ts

export interface GeniusPayWebhookPayload {
  id: string;
  event:
    | "payment.success"
    | "payment.failed"
    | "payment.cancelled"
    | "payment.refunded"
    | "payment.expired"
    | "webhook.test"
    | (string & {}); // tolère d'autres événements futurs
  timestamp: number;
  created_at: string;
  data: {
    object: "transaction";
    id: number;
    reference: string;
    amount: number;
    currency: string;
    fees: number;
    net_amount: number;
    status: string;
    payment_method: string;
    provider: string;
    customer_name: string;
    customer_phone: string;
    merchant_id: number;
    metadata: Record<string, unknown>;
  };
  environment: "sandbox" | "live";
  api_version: string;
}
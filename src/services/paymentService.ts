export interface PaymentPayload {
  transactionId: string;
  merchantId: string;
  amount?: number;
  currencyDetails?: {
    amount: number;
    currencyType: string;
  };
}

export class PaymentService {
  public validateTransaction(payload: PaymentPayload): boolean {
    if (!payload.transactionId || !payload.merchantId) {
      throw new Error('Missing mandatory transaction identifiers.');
    }

    // Legacy (V1) clients send `amount` at the root; modern (V2) clients nest
    // it in `currencyDetails`. Per the Core Payments runbook, fall back to the
    // root `amount` when `currencyDetails` is absent.
    const transactionAmount = payload.currencyDetails
      ? payload.currencyDetails.amount
      : payload.amount;

    if (transactionAmount === undefined || transactionAmount <= 0) {
      throw new Error('Invalid transaction amount.');
    }

    return true;
  }
}

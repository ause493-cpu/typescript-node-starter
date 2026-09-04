export interface PaymentPayload {
    transactionId: string;
    merchantId: string;
    amount?: number;
    currencyDetails?: {
        amount: number;
        currencyType: string;
    }
}

export class PaymentService {
    public validateTransaction(payload: PaymentPayload): boolean {
        if (!payload.transactionId || !payload.merchantId) {
            throw new Error('Missing mandatory transaction identifiers.');
        }

        // Modern (V2) clients nest the amount under `currencyDetails`; legacy (V1)
        // clients send a flat root-level `amount` that implies USD. Resolve the
        // nested value first and fall back to the root so both shapes are accepted.
        const transactionAmount = payload.currencyDetails?.amount ?? payload.amount;

        if (
            typeof transactionAmount !== 'number' ||
            !Number.isFinite(transactionAmount) ||
            transactionAmount <= 0
        ) {
            throw new Error('Invalid transaction amount.');
        }

        return true;
    }
}

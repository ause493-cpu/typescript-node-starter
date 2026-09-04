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

        const transactionAmount = payload.currencyDetails?.amount ?? payload.amount;

        if (transactionAmount === undefined || transactionAmount <= 0) {
            throw new Error('Invalid transaction amount.');
        }

        return true;
    }
}


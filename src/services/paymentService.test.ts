import { PaymentPayload, PaymentService } from './paymentService';

describe('PaymentService', () => {
  const paymentService = new PaymentService();

  it.each<[string, PaymentPayload]>([
    [
      'legacy_v1',
      {
        transactionId: 'txn_legacy_1',
        merchantId: 'merchant_legacy_1',
        amount: 450,
      },
    ],
    [
      'modern_v2',
      {
        transactionId: 'txn_modern_1',
        merchantId: 'merchant_modern_1',
        currencyDetails: {
          amount: 450,
          currencyType: 'EUR',
        },
      },
    ],
  ])('validates a %s payload', (_clientVersion, payload) => {
    expect(paymentService.validateTransaction(payload)).toBe(true);
  });
});


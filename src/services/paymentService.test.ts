import { PaymentService, PaymentPayload } from './paymentService';

describe('PaymentService.validateTransaction', () => {
  let service: PaymentService;

  beforeEach(() => {
    service = new PaymentService();
  });

  describe('legacy V1 payloads (flat root-level amount)', () => {
    it('accepts a legacy payload where the amount sits at the root', () => {
      const payload: PaymentPayload = {
        transactionId: 'txn_prod_991823',
        merchantId: 'merch_5592',
        amount: 450,
      };

      expect(service.validateTransaction(payload)).toBe(true);
    });

    it('does not throw a TypeError when currencyDetails is absent', () => {
      // Exact payload captured by Sentry on the production 500s (client_version: legacy_v1).
      const payload: PaymentPayload = {
        transactionId: 'txn_prod_991823',
        merchantId: 'merch_5592',
        amount: 450,
      };

      expect(() => service.validateTransaction(payload)).not.toThrow();
    });

    it('rejects a legacy payload with a non-positive amount', () => {
      const payload: PaymentPayload = {
        transactionId: 'txn_8484920',
        merchantId: 'merch_11A',
        amount: 0,
      };

      expect(() => service.validateTransaction(payload)).toThrow('Invalid transaction amount.');
    });
  });

  describe('modern V2 payloads (nested currencyDetails)', () => {
    it('accepts a modern payload with nested currencyDetails', () => {
      const payload: PaymentPayload = {
        transactionId: 'txn_8484920',
        merchantId: 'merch_11A',
        currencyDetails: { amount: 1500.5, currencyType: 'EUR' },
      };

      expect(service.validateTransaction(payload)).toBe(true);
    });

    it('prefers currencyDetails.amount over the root amount when both are present', () => {
      const payload: PaymentPayload = {
        transactionId: 'txn_8484920',
        merchantId: 'merch_11A',
        amount: -1,
        currencyDetails: { amount: 1500.5, currencyType: 'EUR' },
      };

      expect(service.validateTransaction(payload)).toBe(true);
    });

    it('rejects a modern payload with a non-positive nested amount', () => {
      const payload: PaymentPayload = {
        transactionId: 'txn_8484920',
        merchantId: 'merch_11A',
        currencyDetails: { amount: -10, currencyType: 'EUR' },
      };

      expect(() => service.validateTransaction(payload)).toThrow('Invalid transaction amount.');
    });
  });

  describe('shared validation rules', () => {
    it('rejects a payload with no amount in either shape', () => {
      const payload: PaymentPayload = {
        transactionId: 'txn_8484920',
        merchantId: 'merch_11A',
      };

      expect(() => service.validateTransaction(payload)).toThrow('Invalid transaction amount.');
    });

    it('rejects a payload with a non-numeric amount', () => {
      const payload = {
        transactionId: 'txn_8484920',
        merchantId: 'merch_11A',
        amount: '450',
      } as unknown as PaymentPayload;

      expect(() => service.validateTransaction(payload)).toThrow('Invalid transaction amount.');
    });

    it('rejects a payload missing mandatory identifiers', () => {
      const payload = {
        merchantId: 'merch_11A',
        amount: 450,
      } as unknown as PaymentPayload;

      expect(() => service.validateTransaction(payload)).toThrow(
        'Missing mandatory transaction identifiers.',
      );
    });
  });
});

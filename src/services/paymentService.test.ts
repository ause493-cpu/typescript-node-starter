import { PaymentPayload, PaymentService } from './paymentService';

describe('PaymentService.validateTransaction', () => {
  let service: PaymentService;

  beforeEach(() => {
    service = new PaymentService();
  });

  describe('legacy payload (V1 clients — flat `amount`, implied USD)', () => {
    it('accepts a valid legacy payload', () => {
      const legacyPayload: PaymentPayload = {
        transactionId: 'txn_8484920',
        merchantId: 'merch_11A',
        amount: 1500.5,
      };

      expect(service.validateTransaction(legacyPayload)).toBe(true);
    });

    it('accepts the exact production payload captured in Sentry (client_version: legacy_v1)', () => {
      // Regression guard for TYPESCRIPT-NODE-STARTER-1: this payload used to
      // crash with "Cannot read properties of undefined (reading 'amount')".
      const sentryPayload: PaymentPayload = {
        transactionId: 'txn_prod_991823',
        merchantId: 'merch_5592',
        amount: 450,
      };

      expect(() => service.validateTransaction(sentryPayload)).not.toThrow(
        TypeError
      );
      expect(service.validateTransaction(sentryPayload)).toBe(true);
    });

    it('rejects a legacy payload with a non-positive amount', () => {
      const legacyPayload: PaymentPayload = {
        transactionId: 'txn_8484920',
        merchantId: 'merch_11A',
        amount: 0,
      };

      expect(() => service.validateTransaction(legacyPayload)).toThrow(
        'Invalid transaction amount.'
      );
    });

    it('rejects a legacy payload with no amount at all', () => {
      const legacyPayload: PaymentPayload = {
        transactionId: 'txn_8484920',
        merchantId: 'merch_11A',
      };

      expect(() => service.validateTransaction(legacyPayload)).toThrow(
        'Invalid transaction amount.'
      );
    });
  });

  describe('modern payload (V2 clients — nested `currencyDetails`)', () => {
    it('accepts a valid modern payload', () => {
      const modernPayload: PaymentPayload = {
        transactionId: 'txn_8484920',
        merchantId: 'merch_11A',
        currencyDetails: {
          amount: 1500.5,
          currencyType: 'EUR',
        },
      };

      expect(service.validateTransaction(modernPayload)).toBe(true);
    });

    it('rejects a modern payload with a non-positive nested amount', () => {
      const modernPayload: PaymentPayload = {
        transactionId: 'txn_8484920',
        merchantId: 'merch_11A',
        currencyDetails: {
          amount: -25,
          currencyType: 'EUR',
        },
      };

      expect(() => service.validateTransaction(modernPayload)).toThrow(
        'Invalid transaction amount.'
      );
    });

    it('uses the nested amount and does not fall back to a root amount when currencyDetails is present', () => {
      const mixedPayload: PaymentPayload = {
        transactionId: 'txn_8484920',
        merchantId: 'merch_11A',
        amount: 1500.5,
        currencyDetails: {
          amount: 0,
          currencyType: 'EUR',
        },
      };

      expect(() => service.validateTransaction(mixedPayload)).toThrow(
        'Invalid transaction amount.'
      );
    });
  });

  describe('mandatory identifiers (both client versions)', () => {
    it('rejects a payload missing transactionId', () => {
      const payload = {
        merchantId: 'merch_11A',
        amount: 100,
      } as unknown as PaymentPayload;

      expect(() => service.validateTransaction(payload)).toThrow(
        'Missing mandatory transaction identifiers.'
      );
    });

    it('rejects a payload missing merchantId', () => {
      const payload = {
        transactionId: 'txn_8484920',
        currencyDetails: { amount: 100, currencyType: 'USD' },
      } as unknown as PaymentPayload;

      expect(() => service.validateTransaction(payload)).toThrow(
        'Missing mandatory transaction identifiers.'
      );
    });
  });
});

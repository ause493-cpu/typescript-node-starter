import { PaymentPayload, PaymentService } from './paymentService';

describe('PaymentService.validateTransaction', () => {
  const service = new PaymentService();
  const identifiers = {
    transactionId: 'txn_test',
    merchantId: 'merch_test',
  };
  const payloads: [string, PaymentPayload][] = [
    ['legacy_v1', { ...identifiers, amount: 450 }],
    [
      'modern_v2',
      {
        ...identifiers,
        currencyDetails: { amount: 1500.5, currencyType: 'EUR' },
      },
    ],
  ];

  it.each(payloads)('accepts the documented %s payload', (_, payload) => {
    expect(service.validateTransaction(payload)).toBe(true);
  });

  it('falls back to the legacy amount when currencyDetails is null', () => {
    const payload: PaymentPayload = JSON.parse(
      JSON.stringify({ ...identifiers, amount: 450, currencyDetails: null })
    );

    expect(service.validateTransaction(payload)).toBe(true);
  });

  it('uses the modern amount when both formats are present', () => {
    expect(
      service.validateTransaction({
        ...identifiers,
        amount: 0,
        currencyDetails: { amount: 1500.5, currencyType: 'EUR' },
      })
    ).toBe(true);
  });

  it.each([0, -1])('rejects a legacy amount of %s', (amount) => {
    expect(() =>
      service.validateTransaction({ ...identifiers, amount })
    ).toThrow('Invalid transaction amount.');
  });

  it.each([0, -1])(
    'rejects a modern amount of %s even with a valid legacy amount',
    (amount) => {
      expect(() =>
        service.validateTransaction({
          ...identifiers,
          amount: 450,
          currencyDetails: { amount, currencyType: 'EUR' },
        })
      ).toThrow('Invalid transaction amount.');
    }
  );

  it('rejects a payload without an amount', () => {
    expect(() => service.validateTransaction(identifiers)).toThrow(
      'Invalid transaction amount.'
    );
  });

  it('does not use a legacy amount to mask incomplete modern details', () => {
    const payload: PaymentPayload = JSON.parse(
      JSON.stringify({
        ...identifiers,
        amount: 450,
        currencyDetails: { currencyType: 'EUR' },
      })
    );

    expect(() => service.validateTransaction(payload)).toThrow(
      'Invalid transaction amount.'
    );
  });

  it.each(['transactionId', 'merchantId'])(
    'preserves validation of a missing %s',
    (identifier) => {
      expect(() =>
        service.validateTransaction({
          ...identifiers,
          [identifier]: '',
          amount: 450,
        })
      ).toThrow('Missing mandatory transaction identifiers.');
    }
  );
});

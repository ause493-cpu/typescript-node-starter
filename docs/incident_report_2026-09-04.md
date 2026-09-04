# Incident Resolution Report

**Date:** 2026-09-04
**Affected Tag:** legacy_v1

## Root Cause Analysis

Commit `dc21271` ("refactor: update payment validation to use nested currencyDetails") changed `PaymentService.validateTransaction` to read the transaction amount exclusively from `payload.currencyDetails.amount`, removing the root-level `amount` fallback that the Core Payments runbook requires for V1 clients. Legacy payloads carry no `currencyDetails` object, so that property access threw an uncaught `TypeError: Cannot read properties of undefined (reading 'amount')` on every V1 request to `POST /api/v1/payments/validate`, which the service surfaced to clients as a 500 Internal Server Error.

## Code Fix & Validation

Updated lines in `src/services/paymentService.ts` (the `PaymentPayload` interface and the method signature are unchanged):

```typescript
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
```

Unit test added at `src/services/paymentService.test.ts` validating both legacy and modern payloads:

```typescript
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
```

Validation results: `npx jest` — 2 suites, 10 tests, all passing; `npx tsc --noEmit` — clean.

## Security & Reliability Recommendations

Introduce an explicit, versioned JSON Schema for `POST /api/v1/payments/validate` and enforce it at the edge before the request reaches `PaymentService`, with `additionalProperties: false` and `oneOf` branches for the V1 (root `amount`) and V2 (`currencyDetails`) shapes. OWASP API8:2023 (Security Misconfiguration) calls for restricting incoming data formats to those the business actually requires, and OWASP API3:2023 (Broken Object Property Level Authorization) — which absorbed the former Mass Assignment risk — is defeated precisely by allowlisting properties rather than accepting whatever the client sends; a schema that lists the expected fields but omits `additionalProperties: false` still lets unexpected fields through to application code. Enforcing the schema at the gateway would have rejected an unsupported payload shape with a deterministic `400 Bad Request` instead of letting an unvalidated property access become an unhandled `TypeError` and a `500`, which also stops exception traces from leaking to clients.

## Pull Request Description

**Title:** fix(payments): restore legacy V1 payload support in validateTransaction

**Summary:** Restores backward-compatible amount resolution in the Core Payments validation endpoint so V1 and V2 clients are both accepted. **Automated incident resolution complete. Backward compatibility restored for legacy_v1 payloads.**

**Root Cause:** Commit `dc21271` made `validateTransaction` read the amount only from `payload.currencyDetails.amount`, so legacy V1 payloads — which have no `currencyDetails` — threw an uncaught `TypeError` that surfaced as a 500.

**Fix:** Resolve the amount as `payload.currencyDetails?.amount ?? payload.amount` and type-guard the result, restoring the V1 fallback without changing the `PaymentPayload` interface or the method signature.

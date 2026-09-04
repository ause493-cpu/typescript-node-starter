# Incident Resolution Report

**Date:** 2026-09-04
**Affected Tag:** legacy_v1

## Root Cause Analysis
Sentry event `1ba5870574744dce85e2f0f3b0ce0b5f` captured a production `legacy_v1` request with a root-level `amount` against release `dc21271812ea667b78076b6c69b16ac33a480e4e`. The Core Payments runbook requires that legacy payloads fall back to the root `amount`, but that release unconditionally dereferenced `currencyDetails.amount`, causing the 500 errors when `currencyDetails` was absent.

## Code Fix & Validation
```typescript
const transactionAmount = payload.currencyDetails?.amount ?? payload.amount;
```

```typescript
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
```

## Security & Reliability Recommendations
Add a centralized server-side JSON Schema gate for this endpoint with explicit `oneOf` legacy and modern payload shapes, allowlisted properties, strict types and length/range/enum constraints, and a deterministic 400 response before service code runs; this follows OWASP guidance to validate untrusted input early at both syntactic and semantic levels and to reject unexpected content ([Input Validation Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html), [REST Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html)).

## Pull Request Description
**Title:** Restore legacy payment payload compatibility
**Summary:** **Automated incident resolution complete. Backward compatibility restored for legacy_v1 payloads.**
**Root Cause:** Release `dc21271812ea667b78076b6c69b16ac33a480e4e` unconditionally read `currencyDetails.amount`, so legacy payloads without `currencyDetails` threw before validation completed.
**Fix:** Resolve the transaction amount from the modern nested field when present and otherwise fall back to the legacy root field, with a parameterized regression test covering both shapes.


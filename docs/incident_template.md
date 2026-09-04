# Incident Resolution Report

**Date:** 2026-09-04
**Affected Tag:** `legacy_v1`

## Root Cause Analysis
The [Sentry event](https://augusto-tq.sentry.io/issues/7708322836/events/1ba5870574744dce85e2f0f3b0ce0b5f/) at 2026-09-02 22:22:24 UTC records `client_version=legacy_v1`, a root-level `amount` of 450, no `currencyDetails`, and release [`dc21271812ea667b78076b6c69b16ac33a480e4e`](https://github.com/ause493-cpu/typescript-node-starter/commit/dc21271812ea667b78076b6c69b16ac33a480e4e), while the [Core Payments runbook](https://app.notion.com/p/3cfd473a25a48073830bcf949d1544ef) explicitly requires the legacy fallback and implicit USD. That commit replaced `payload.amount` with unguarded `payload.currencyDetails.amount` in `PaymentService.validateTransaction`, causing the locally reproduced undefined-property `TypeError` before business validation; the Sentry event is informational with no exception stack or HTTP 500 metrics, so production impact cannot be quantified from it.

## Code Fix & Validation
```typescript
const transactionAmount =
  payload.currencyDetails == null
    ? payload.amount
    : payload.currencyDetails.amount;
```
```typescript
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
```

Validation: the 12 new payment tests and the existing test all pass (13/13) on Node 16.20.2 and Node 24.19.0; the standard Jest configuration was used after the fix, with 100% statement, branch, function, and line coverage for `paymentService.ts`. Before the fix, TypeScript reported TS2532 and the same regression suite reproduced five failures with diagnostics disabled solely to exercise the faulty runtime path. `tsc --noEmit`, full-repository ESLint, and `npm run build` pass; Windows checkout line endings were normalized locally without unrelated source changes, and Node 16 used `--preserve-symlinks --preserve-symlinks-main` to avoid a sandbox parent-directory lookup error. The exported interface, method signature, boolean result, and existing validation error messages are unchanged; only absent/null details trigger fallback, and invalid modern amounts cannot be masked by a valid root amount.

Production status: **not verified and not announced as recovered**. The [repository](https://github.com/ause493-cpu/typescript-node-starter) exposes no HTTP server, route, or health endpoint in its checked-out code; GitHub returned no deployments, no workflow runs, and no commit statuses for the reviewed main commit `40e3915083a347a21523ba9d615b891429192f27`. This branch is a tested code-level remediation, not a deployment; the required completion wording below refers only to that code-level result. After review and deployment, the Core FinTech Squad must smoke-test both documented payload shapes at the real endpoint and verify request success/500 metrics by client version over an agreed observation window before sending a fully-operational notice in Notion; absence of new Sentry events alone is insufficient.

## Security & Reliability Recommendations
Introduce one contract-aware request-validation boundary before payment processing, using a maintained JSON Schema validator for the documented V1 and V2 shapes: validate object structure, required identifiers and their approved length limits, finite positive numeric amounts within business-approved bounds, and supported currency codes; retain V1 implicit USD and the current modern-payload precedence rather than coercing or silently falling back from malformed modern data. Bound request bytes and nesting, map failures through the agreed API error contract (413 for oversized bodies), and log only redacted validation reasons plus client/release tags. Have the Core FinTech Squad compare schemas against client fixtures and shadow-mode traffic before enforcing stricter unknown-field rules, then require positive/negative contract tests in CI. This is a proposed follow-up, not part of the compatibility hotfix, based on OWASP guidance checked 2026-09-04: [Input Validation](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html), [REST Security](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html), and [API4:2023 Unrestricted Resource Consumption](https://owasp.org/API-Security/editions/2023/en/0xa4-unrestricted-resource-consumption/).

## Pull Request Description
**Title:** fix(payments): restore legacy payload compatibility
**Summary:** **Automated incident resolution complete. Backward compatibility restored for legacy_v1 payloads.**
**Root Cause:** The nested-currency refactor dereferenced optional `currencyDetails` without the legacy fallback required by the runbook.
**Fix:** Select the root amount only for absent/null `currencyDetails`, preserve modern precedence and existing interfaces, and add regression tests for both client payload versions.

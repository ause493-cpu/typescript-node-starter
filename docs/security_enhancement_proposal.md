# Security Enhancement Proposal: Schema-Enforced Payload Validation for Core Payments

**Author:** Core FinTech Squad (drafted during incident TYPESCRIPT-NODE-STARTER-1)
**Date:** 2026-09-04
**Status:** Proposed
**Scope:** `POST /api/v1/payments/validate` and, by extension, every Core Payments endpoint that accepts a JSON body.

## Why now

The 2026-09-02 incident was, at its heart, a payload-shape problem: the service assumed the modern (V2) `currencyDetails` object was always present and dereferenced it without checking, so every legacy (V1) request crashed with an unhandled `TypeError` and surfaced as a 500. The bug was caught by the TypeScript compiler (`TS2532: Object is possibly 'undefined'`) but nothing in the pipeline stopped it from shipping, and nothing at the HTTP boundary translated the crash into a controlled 4xx. Our current validation is hand-written, lives inside business logic, and reasons about one field at a time. OWASP's current guidance points to a different model: declare the allowed shape of every payload up front, enforce it at the boundary before any business code runs, and reject anything that does not match.

## What OWASP currently recommends

The OWASP REST Security Cheat Sheet is explicit: "Do not trust input parameters/objects", "Validate input: length / range / format and type", "Achieve an implicit input validation by using strong types like numbers, booleans, dates, times or fixed data ranges in API parameters", and "Reject unexpected/illegal content". It also asks APIs to "Define an appropriate request size limit and reject requests exceeding the limit with HTTP response status 413", to reject unexpected or missing `Content-Type` headers with 406/415, and, on the error side, to "Respond with generic error messages" and "not pass technical details (e.g. call stacks or other internal hints) to the client".

The OWASP Input Validation Cheat Sheet adds that allowlist validation "is appropriate for all input fields provided by the user", that structured input should be validated "against JSON Schema", that validation "should happen as early as possible in the data flow, preferably as soon as the data is received from the external party", and that it "must be implemented on the server-side before any data is processed by an application's functions".

The OWASP API Security Top 10 (2023 edition, still the current edition on owasp.org) reinforces this from three angles. API3:2023 (Broken Object Property Level Authorization) says to avoid functions "that automatically bind a client's input into code variables, internal objects, or object properties" and to "allow changes only to the object's properties that should be updated by the client". API4:2023 (Unrestricted Resource Consumption) says to "define and enforce a maximum size of data on all incoming parameters and payloads, such as maximum length for strings, maximum number of elements in arrays". API8:2023 (Security Misconfiguration) says to "restrict incoming content types" and to "define and enforce all API response payload schemas, including error responses, to prevent exception traces and other valuable information from being sent back to attackers".

## The recommendation

Adopt a single, allowlist, schema-based validation layer at the HTTP boundary of the Core Payments API, and make it the only place a raw request body is ever touched.

Concretely, this means one declared schema per accepted payload version, expressed as a discriminated union so that a request is either a well-formed V1 body or a well-formed V2 body and nothing in between. Using Zod (or JSON Schema with Ajv, if the team prefers a language-neutral artifact that can also be published to clients), the two shapes we support today would be declared roughly as follows:

```ts
import { z } from 'zod';

const Identifiers = {
  transactionId: z.string().regex(/^txn_[A-Za-z0-9_]{1,64}$/),
  merchantId: z.string().regex(/^merch_[A-Za-z0-9_]{1,32}$/),
};

// Positive, finite, at most two decimal places, bounded to a sane business ceiling.
const Money = z.number().finite().positive().max(1_000_000_000).multipleOf(0.01);

const LegacyPayloadSchema = z
  .object({ ...Identifiers, amount: Money })
  .strict(); // unknown properties are rejected, not silently dropped

const ModernPayloadSchema = z
  .object({
    ...Identifiers,
    currencyDetails: z
      .object({ amount: Money, currencyType: z.enum(['USD', 'EUR', 'GBP', 'BRL']) })
      .strict(),
  })
  .strict();

export const PaymentPayloadSchema = z.union([ModernPayloadSchema, LegacyPayloadSchema]);
```

Around that schema, the boundary layer should do four things in order. First, reject requests whose `Content-Type` is not `application/json` with 415 and reject bodies above a fixed size (a few kilobytes is generous for this endpoint) with 413, before the body is parsed at all. Second, parse and validate with the schema, and on failure return a 400 with a stable error code and the list of offending field paths, never the raw exception message or stack. Third, hand only the validated, typed value to `PaymentService.validateTransaction`, so the service can drop its defensive `undefined` checks over time and concentrate on business rules such as merchant limits and currency support. Fourth, log every validation failure with the endpoint, client version tag and field path, and alert when a single client produces a burst of them, in line with the cheat sheet's advice that "someone who is performing hundreds of failed input validations per second is up to no good".

## Why this specific change

It closes the class of bug behind this incident rather than the single instance. Any future payload-shape drift (a V3 client, a renamed field, a nested object made optional) is caught at the boundary with a 400 instead of surfacing as a 500 from deep inside the service. It also fixes latent weaknesses in the current hand-rolled checks that the incident did not trigger but that exist today: a string `amount` such as `"abc"` passes `transactionAmount <= 0` because the comparison is `false`, `NaN` passes for the same reason, `currencyType` is never validated at all, and unknown properties are accepted silently, which is the mass-assignment pattern API3:2023 warns about. Strict schemas with strong numeric types remove all four.

It is also low-risk with respect to backward compatibility. The schema encodes the exact two contracts documented in the Core Payments runbook, so any V1 or V2 client that is compliant today keeps working. Clients that are currently sending malformed bodies that happen to pass would start receiving 400s, which is the intended behaviour and should be announced through the normal deprecation channel with a short observation window in which violations are logged but not yet rejected.

## Rollout plan

Phase one (one sprint): add the schema and boundary middleware in report-only mode, logging validation failures to Sentry with the `client_version` and `endpoint` tags we already use, so we can measure how many real clients would be affected. Phase two (following sprint): switch to enforce mode once the failure rate for compliant clients is zero, add the 413 and 415 guards, and add a global error handler that maps unhandled exceptions to a generic 500 body with a correlation id and no stack trace. Phase three: wire `tsc --noEmit` and `npm test` into CI as required checks on every pull request, since the compiler already flagged this incident's bug and only the absence of a gate let it merge. As a companion, publish the schemas (or the JSON Schema export) as part of the API documentation so client teams validate against the same artifact the server enforces.

## Success criteria

No 5xx responses attributable to payload shape over a 30-day window after enforce mode is enabled; 100% of malformed bodies answered with 400/413/415 and a stable error code; zero occurrences of exception text or stack frames in response bodies (verified by a contract test); `tsc` and the unit test suite blocking merges in CI.

## Sources

- OWASP REST Security Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html
- OWASP Input Validation Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html
- OWASP API Security Top 10 (2023 edition, current): https://owasp.org/API-Security/
- API3:2023 Broken Object Property Level Authorization: https://owasp.org/API-Security/editions/2023/en/0xa3-broken-object-property-level-authorization/
- API4:2023 Unrestricted Resource Consumption: https://owasp.org/API-Security/editions/2023/en/0xa4-unrestricted-resource-consumption/
- API8:2023 Security Misconfiguration: https://owasp.org/API-Security/editions/2023/en/0xa8-security-misconfiguration/

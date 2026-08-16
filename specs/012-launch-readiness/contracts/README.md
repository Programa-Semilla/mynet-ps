# Contracts — 012 Launch Readiness

**None. No route is added, removed or altered, and `contracts/openapi.json` is unchanged.**

Stated rather than omitted, because this feature *reasons about* the contract twice without
changing it.

## The contract is a guard here, not a deliverable

**FR-1141 depends on `/events` returning a bare array**, and Phase 0 found that this is already
enforced — by accident. `packages/data/src/contract.ts` carries
`Satisfies<EventsResponse[number], Event>`, and indexing with `number` only typechecks while the
response is an array. Verified against the repo's own TypeScript:

```
error TS2537: Type 'EventsResponse' has no matching index signature for type 'number'.
```

So a pagination envelope on `/events` **already fails the build**, at the earliest gate — and
**nothing records that this line serves that purpose.** A refactor "tidying" it would remove the
withdrawn-conference erasure's only existing protection with every test green. FR-1141's first act
is to name it, not to build something new.

That is the same shape as 010's precache guard read from the other end: a check that *does* run,
protecting something nobody knows it protects.

## What FR-1141 adds

A compile-time binding asserting `/events` takes no query parameters, a route-schema assertion that
it declares no `querystring` and no pagination-shaped property, and one integration case proving a
conference that has already ended is still listed. Three mechanisms because Phase 0 established
that **no single one reaches all four break modes** — and a claim that one does is the thing to be
suspicious of.

None of these changes the contract. They pin it.

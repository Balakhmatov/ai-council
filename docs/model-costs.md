# Model costs and monetization

Rates per 1,000,000 tokens. DDTokens rates below are effective RUB prices inferred
from owner receipts dated 2026-10-31, not official USD/RUB exchange rates. They
are estimates for the named groups; dynamic pricing or a group change requires
reconciliation with fresh receipts. Historical calls retain their stored price.

| Model / route | Input | Cache read | Output | Cache write 5m | Cache write 1h |
| --- | ---: | ---: | ---: | ---: | ---: |
| gpt-6-luna / OpenAI | USD 0.10 | USD 0.01 | USD 0.50 | — | — |
| mistral-large-2512 / Mistral | USD 0.50 | USD 0.05 | USD 1.50 | — | — |
| grok-4.7 / DDTokens, existing heavy group estimate | CNY 0.60 | CNY 0.15 | CNY 1.80 | — | — |
| gemini-4-argon-high / DDTokens Gemini(Antigravity)4 ×0.6 | RUB 15.192 | unknown | RUB 75.96 | — | — |
| claude-sonnet-5-5 / DDTokens Claude(Fool) ×1 | RUB 25.32 | RUB 1.266 | RUB 126.60 | RUB 31.65 | RUB 50.64 |

USD and CNY rates use the persisted CBR quote in the existing accounting system.
RUB rates do not require an FX quote and must not be multiplied by a group
coefficient a second time. Gemini cache reads stay unknown when reported:
they are not assumed to be free or billed at ordinary input rates.

## Receipt reconciliation

| Model | Ordinary input | Cache read | Cache write 5m | Output | Receipt RUB | Estimate RUB |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Gemini | 3754 | 0 | 0 | 68 | 0.062186 | 0.062196 |
| Gemini | 7532 | 0 | 0 | 3379 | 0.371090 | 0.371095 |
| Gemini | 4946 | 0 | 0 | 1791 | 0.211194 | 0.211184 |
| Gemini | 2869 | 0 | 0 | 1546 | 0.161010 | 0.161020 |
| Claude | 58 | 8798 | 70 | 1905 | 0.255985 | 0.255995 |
| Claude | 76 | 11452 | 92 | 2412 | 0.324704 | 0.324694 |

Residuals are below RUB 0.00002 per supplied call. These receipts do not prove
future prices or a fixed price per discussion. Anthropic input_tokens excludes
cache reads and writes; those token categories must be added separately, whereas
OpenAI prompt_tokens includes cached reads.

## Monetization model

Meter each call: sum(tokens in each category × category rate) / 1,000,000.
Sum every recorded call for a discussion, including final synthesis and retries.
Mark missing usage or tariffs as unknown instead of claiming a zero cost.
Do not multiply the first call's price by round count: shared context grows.

Before a discussion, show an estimate based on chosen models, round count,
context budget and an output allowance. After a discussion, display recorded
cost and the number of calls without a cost estimate. A provider receipt remains
the authority for billed cost; calculated token costs are estimates.

For a target margin m and payment commission c, an initial price model is
(API cost + allocated infrastructure + other variable costs) / (1 - m - c).
Use measured upper-percentile discussion costs and bounded token/round budgets
before fixing package prices; do not infer a safe unlimited plan from six calls.

## Deployment

The release imports and preserves the VPS email-auth/monthly-quota changes while
retaining the newer GitHub request audit. Use deploy/reconcile-vps.py once to
back up the reviewed local snapshot and fast-forward the checkout to main.
It refuses changed/unreviewed files and then invokes the existing deploy service.
Further releases use the normal main/timer path; the dirty-check guard remains.

## DDTokens catalog rates shared 2026-11-01

| Model | Input RUB/1M | Output RUB/1M | Cached |
|---|---:|---:|---|
| qwen3.7-plus | 15.192 | 60.768 | Unknown |
| deepseek-v4.1-flash | 5.6717 | 17.015 | Unknown |

These are catalog-derived dynamic group rates, subject to tier changes and provider billing rules. No cache discount assumed. Applies only when corresponding BASE_URL uses ddtnew.com. Historical entries with unknown cost are deliberately not rewritten.

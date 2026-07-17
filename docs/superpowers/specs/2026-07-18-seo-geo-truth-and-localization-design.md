# SEO/GEO Truth and Localization Hardening Design

## Context

The Search Console window inspected on 2026-07-18 covers 2026-06-19 through 2026-07-16. The 2026-07-17 release already changed the Osaka and cost landing content, so this batch must not repeat that pre-release experiment. It addresses independent, currently verifiable defects found in the live source: stale price copy, inconsistent breed facts, localized legal/trust drift, localized schema drift, and incomplete automated coverage.

## Goals

- Keep public copy, JSON-LD, `llms-full.txt`, translated article data, listing cards, and search records on one factual contract.
- Preserve the strong-performing weight/growth title while correcting the underlying adult-weight facts.
- Make localized waitlist and healthy-kitten pages convey the same legal and semantic meaning as Japanese pages.
- Make the existing weekly SEO/GEO quality workflow execute the new truth and localization contracts.

## Decisions

1. Adult Siberian weight uses the current CFA breed profile as the cited authority: mature males 12–18 lb and females 8–12 lb, rendered as approximately 5.4–8.2 kg and 3.6–5.4 kg. Pages must label these as breed-level reference ranges, not individual health targets.
2. Fuluck genetic-testing copy says parent cats are tested. It must never claim that every kitten receives a genetic test. Kitten-specific vaccination, microchip, health-check, and price details remain tied to the individual kitten page or written handoff records.
3. The price guide loses the stale 2025 label and unsupported “latest market data” framing. It must state that current Fuluck prices vary by kitten and link to current kitten/price guidance rather than present an untraceable fixed Fuluck price.
4. EN/ZH waitlist pages must explicitly preserve the Japanese rule: LINE video may be used for a preliminary online viewing, but the kitten must still be inspected in person and the contract explained face to face before sale.
5. Localized article JSON-LD uses the localized headline, description, breadcrumb labels, and `inLanguage`. Localized waitlist links use the existing `/en/blog/` and `/zh/blog/` pages.
6. No Worker, KV, R2, Admin, DNS, booking data, animal records, or production API is changed. No raw GSC query export is committed.

## Verification

- New tests fail before production edits and pass afterward.
- `node --test tests/*.test.js`
- `node tools/seo-geo-audit.js`
- `node tools/verify-generated.js`
- `git diff --check`
- Desktop/mobile smoke on changed live routes after Pages deploy.


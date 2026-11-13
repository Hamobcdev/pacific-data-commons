# Synergy Pacific Content Engine

**Status:** Foundation / planning  
**Owner:** Synergy Pacific  
**Repository:** `Hamobcdev/pacific-data-commons`  
**Brand model:** Synergy Pacific master brand; Pacific Data Commons (PDC) and applications are sub-brands  
**Publishing authority:** Human approval required before every publication

## Purpose

The Synergy Pacific Content Engine is the repeatable editorial and distribution operating system for the company's public communications. It turns verified company knowledge, product progress, research and approved announcements into useful, original, platform-adapted content that grows the audience and drives relevant people towards our applications, partnerships and opportunities.

It is an editorial subsystem, not part of PDC's runtime payment, data marketplace or agent execution paths. Its first implementation is documentation-led and Markdown-native. It must not add runtime dependencies, database migrations, production environment variables or deployment changes to PDC.

## Decisions

1. **Brand architecture:** Synergy Pacific is the master brand. PDC and each application are product/sub-brands, not competing corporate identities.
2. **Storage:** Markdown files in this repository are the initial canonical content system.
3. **Publishing:** AI may research, draft, adapt, package and recommend. A designated human must approve the final asset and caption before anything is published.
4. **Multi-model workflow:** Claude, Gemini and ChatGPT are interchangeable assistants, not sources of truth. Approved source material and content records live in the repository.
5. **Gemini material:** Additional Gemini research will be incorporated after it is supplied and reviewed; it is not assumed or fabricated in this foundation.
6. **Distribution:** One verified story may be adapted for Facebook, Instagram, LinkedIn and other channels, but each platform version must be reviewed for fit.
7. **Measurement:** Track audience growth, qualified/eligible views where available, watch time, engagement, referrals and meaningful product outcomes. Do not treat a weekly platform challenge as proof of monetization eligibility or earnings.

## Start here

- [Architecture](./ARCHITECTURE.md)
- [Implementation plan](./IMPLEMENTATION_PLAN.md)
- [Editorial standards](./EDITORIAL_STANDARDS.md)
- [Weekly operating workflow](./WEEKLY_WORKFLOW.md)
- [Content item template](./templates/CONTENT_ITEM_TEMPLATE.md)

## Initial editorial pillars

1. Pacific digital sovereignty and infrastructure
2. Pacific Data Commons and trusted data
3. AI, financial technology and digital payments
4. AI agents, engineering and practical innovation
5. Pacific partnerships, pilots and regional development
6. Product education, demonstrations and adoption

## Current implementation boundary

The foundation phase creates the governance, templates and operating process only. It does not publish to social platforms, connect platform credentials, ingest private project data automatically, or make claims about monetization eligibility. Those capabilities require separate design, explicit approval and security review.

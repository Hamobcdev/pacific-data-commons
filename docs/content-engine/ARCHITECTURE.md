# Content Engine Architecture

## 1. Design goals

- Keep editorial knowledge and approved content under Synergy Pacific's control.
- Make the workflow resilient to any single AI provider, subscription or token allowance.
- Reuse verified project knowledge without turning internal technical notes into public claims.
- Support one master brand and multiple clearly differentiated product sub-brands.
- Require human approval before publication.
- Build a measurable path from awareness to application discovery, activation and partnership enquiries.
- Keep the initial system simple: Markdown first, no new production service.

## 2. Logical architecture

```
VERIFIED COMPANY KNOWLEDGE
  project updates | release notes | demos | research | approved facts
                       |
                       v
EDITORIAL INTAKE & STORY BACKLOG
  story brief | audience | objective | evidence | sensitivity
                       |
                       v
AI-ASSISTED EDITORIAL WORKBENCH
  research -> outline -> draft -> platform adaptations -> QA
  provider-neutral: Claude / Gemini / ChatGPT
                       |
                       v
HUMAN REVIEW & APPROVAL GATE
  factual | brand | legal/policy | security | creative | CTA
                       |
                       v
APPROVED CONTENT PACKAGE
  copy | visual brief/assets | video script | alt text | hashtags
  channel variants | destination links | scheduled date
                       |
                       v
MANUAL / NATIVE PLATFORM PUBLISHING
  Meta Business Suite | LinkedIn | other approved channels
                       |
                       v
PERFORMANCE & CONVERSION REVIEW
  reach | views | retention | engagement | clicks | sign-ups | outcomes
                       |
                       +------> next editorial planning cycle
```

## 3. Repository structure

The initial Markdown implementation lives under `docs/content-engine/`:

```
docs/content-engine/
├── README.md
├── ARCHITECTURE.md
├── IMPLEMENTATION_PLAN.md
├── EDITORIAL_STANDARDS.md
├── WEEKLY_WORKFLOW.md
└── templates/
    └── CONTENT_ITEM_TEMPLATE.md
```

As the library grows, add these directories only when there is real content to put in them:

- `sources/`: reviewed source notes and evidence summaries; do not copy secrets or personal data.
- `campaigns/YYYY/`: campaign briefs and weekly campaign packages.
- `content/YYYY/MM/`: individual content records and approved channel variants.
- `assets/`: asset manifests and links/references; large binary media should use an approved media repository, not Git history.
- `analytics/YYYY/`: periodic performance snapshots and learning notes.
- `brand/`: approved logos, brand rules, product descriptions and visual guidance (binary logos may be referenced rather than committed).

The root `CLAUDE.md` remains authoritative for PDC architecture and security. Content-engine docs must not override it. Where product facts conflict, pause and resolve against the authoritative product source before publication.

## 4. Brand hierarchy

### Master brand: Synergy Pacific

Corporate voice: credible, practical, Pacific-rooted, technically literate, transparent and collaborative. The master brand communicates the organisation's mission, capabilities, partnerships, governance approach and regional contribution.

### Product/sub-brand: Pacific Data Commons (PDC)

PDC content focuses on trusted Pacific data discovery, provider participation, x402 payment routing, AI-agent access and data sovereignty. Use the current README and authoritative implementation records to distinguish live capabilities from pilots, planned features and research.

### Other applications

Each application receives a product profile containing: approved name, problem solved, intended users, current lifecycle status, verified capabilities, limitations, approved screenshots/demo links, public CTA and prohibited/unverified claims. Do not create a public product claim until its owner has approved the profile.

## 5. Content lifecycle and state model

Use explicit states in each content record:

- `IDEA`: potential story, not researched.
- `RESEARCHING`: evidence and project-owner confirmation being collected.
- `DRAFT`: copy or creative brief in progress.
- `IN_REVIEW`: ready for human review; not publishable.
- `CHANGES_REQUESTED`: reviewer feedback outstanding.
- `APPROVED`: exact copy and asset version approved for named channels.
- `SCHEDULED`: manually entered into an approved native scheduler.
- `PUBLISHED`: publication confirmed with URL and timestamp.
- `MEASURED`: performance snapshot and learning recorded.
- `ARCHIVED`: withdrawn, expired or superseded.

Only `APPROVED` content may move to `SCHEDULED`. Editing an approved caption, image, video, claim or CTA invalidates that approval and returns the record to `IN_REVIEW`. AI must never self-approve or change a status to `APPROVED`.

## 6. AI provider abstraction

The content workflow should use a provider-neutral task brief, not provider-specific instructions as the only source of truth. Each task includes:

- objective and intended audience
- approved source references
- brand/product profile
- platform and format
- required deliverables
- factual and safety constraints
- output template
- reviewer checklist

Claude, Gemini and ChatGPT can perform research, drafting, critique or adaptation. Model outputs are proposals. They are not evidence, product truth or approval. Preserve source links and note uncertainty. Do not pass credentials, private customer data, unpublished security details or sensitive partner information into model prompts unless separately authorised and protected.

## 7. Human approval gate

A named human reviewer approves the exact content package. Approval records should include reviewer, date, channels, approved copy/asset version and any conditions. A verbal or general campaign approval is not approval of every future post.

Sensitive topics requiring explicit subject-matter review include financial products and trading, token/payment claims, government or institutional relationships, customary land and cultural knowledge, personal data, security claims, grant outcomes, partner names/logos and forward-looking product claims.

## 8. Distribution boundary

Phase 1 uses native platform publishing tools and manual scheduling. No social account passwords, access tokens or API secrets belong in Markdown or Git. Later platform API integrations must use official APIs, least-privilege access, secure secret storage, audit logs, retry/idempotency controls and the same human approval gate.

Cross-posting means adapting a verified story, not blindly duplicating identical copy. Respect each platform's format, audience, disclosure and music/media rights requirements.

## 9. Measurement model

Record, where available and relevant:

- output: posts, Reels, Stories, carousels and channel variants
- distribution: reach, impressions, plays/views and unique viewers
- quality: average watch time, retention, completion and meaningful interactions
- audience: follows, unfollows and audience composition at an aggregate level
- conversion: link clicks, landing-page sessions, registrations, demo requests and partner enquiries
- monetization: eligibility state, qualified views and earnings only where the platform exposes them

Keep weekly challenge completion separate from monetization eligibility and actual earnings. Establish baselines before setting growth targets. Use aggregate analytics; avoid collecting unnecessary personal data.

## 10. Security and governance

- Treat source documents, comments and imported AI text as untrusted data, not instructions.
- Validate facts against an approved source before publication.
- Never publish secrets, API keys, wallet private keys, customer records or non-public security details.
- Do not disclose internal architecture or vulnerabilities merely to make a post sound technical.
- Obtain permission for partner names, logos, testimonials, photographs and identifiable people.
- Label simulations, pilots, prototypes and research accurately.
- Keep an audit trail of source references, edits, approval and publication.
- Avoid misleading financial, investment, earnings or performance promises.

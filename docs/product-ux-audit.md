# Product UX Audit

_Last updated: 2026-05-01_

## Scope

This audit reviews the current MVP experience visible from the app code, focused on the path from first visit to a useful next-quarter class plan. It is intended to close or advance GitHub issue #7: Product audit of current MVP UX.

Reviewed surfaces:

- `app/page.tsx`
- `components/onboarding.tsx`
- `components/ai-panel.tsx`
- `components/chat.tsx`
- `components/profile-card.tsx`
- `components/workspace-tabs.tsx`
- `components/degree-audit-tab.tsx`
- `components/suggested-schedule-card.tsx`
- `components/schedule-planner/*` via source inspection
- `lib/system-prompt.ts`

## Executive summary

The MVP already has unusually strong raw capability: onboarding, major/year selection, transcript parsing, blocked-time setup, degree audit, chat, schedule planner, discovery, schedule health checks, course cards, and schedule blocks. The biggest UX gap is not feature absence. It is that the product does not yet strongly guide a student toward the pilot promise: **get a personalized, explainable next-quarter/Fall class plan quickly and know what to verify before registration.**

The product currently feels like a powerful academic planning workspace plus chatbot. The pilot needs it to feel like a guided planning outcome.

## What is working

### 1. Strong planning primitives already exist

The app has the important building blocks:

- Major and year capture in onboarding.
- Optional transcript parsing for completed courses.
- Busy-time blocking before schedule generation.
- Degree audit and schedule planner side by side.
- Discovery tab for eligible/conflict-aware course ideas.
- Auto-generate schedule flow.
- AI chat with course, section, grade, professor, and catalog context.
- Interactive schedule blocks and course cards that can move recommendations into the planner.

This is a good foundation for the Fall planning wedge.

### 2. The split workspace is directionally right

The two-panel layout — workspace on the left, AI panel on the right — supports the right mental model: students can inspect requirements and schedule artifacts while asking questions. This is stronger than a pure chatbot interface.

### 3. Onboarding captures high-leverage context

Major, year, transcript, and blocked times are exactly the inputs needed for personalized next-quarter planning. The optional transcript path is also appropriate for privacy/trust, assuming the copy is tightened.

### 4. Schedule conflict handling is a real differentiator

The planner already detects section conflicts and blocked-time overlaps. That supports a concrete student promise: not just “what courses should I take?” but “what courses can actually fit?”

## Key UX gaps

### 1. The first-run promise is too generic

Current welcome copy says “AI academic advisor” and “quick steps.” That is accurate, but not sharp enough for the pilot. Students should immediately understand the job-to-be-done: planning next quarter/Fall classes.

Recommended change:

- Replace generic setup framing with outcome framing: “Let’s build your first class plan.”
- Make the default goal explicit: “We’ll use your major, completed courses, and busy times to suggest a plan you can verify before registration.”

### 2. Onboarding does not capture the student’s planning goal

The current onboarding asks major, year, transcript, and blocked times, but not the student’s actual planning concern. Interview synthesis suggests students need help with uncertainty: requirements, prereqs, workload, professor/course difficulty, registration timing, and schedule constraints.

Add one lightweight step or field:

- “What are you trying to figure out?”
  - Pick Fall/next-quarter classes
  - Check remaining requirements
  - Find easier GE options
  - Plan around work/commute/athletics
  - Compare major/minor path
  - Other/free text

This would make AI outputs and analytics much more useful.

### 3. Transcript privacy copy is too thin

The transcript step says Adviso will scan for course codes, but it does not clearly say what happens to pasted text, whether it is stored, or whether transcript upload is optional. Given the trust risk, this needs to be visible before a student pastes anything.

Recommended copy block:

> Optional: paste your unofficial transcript so Adviso can detect completed courses. We use it to update your course list for this plan. Don’t paste sensitive information you don’t want used for planning. You can skip this and add courses manually.

If the implementation stores only parsed codes in local/session state, say that plainly. If server processing logs or persists input, define policy before launch.

### 4. The main app does not create a “first useful plan” moment

After onboarding, the user lands in the workspace, but there is no obvious guided CTA saying “Generate your first Fall plan.” The chat examples include “Build me a 4-course schedule for next quarter,” but that is one of several prompts and requires the student to infer the next action.

Recommended change:

- Add a prominent first-plan card near the AI panel or planner empty state.
- CTA: “Generate my first next-quarter plan.”
- Secondary CTA: “Review my remaining requirements first.”
- The action should prefill/send a high-quality prompt using the student profile.

### 5. Trust and verification are not visible enough in the recommendation loop

The system prompt tells the AI not to guess and to use data, but the student-facing UX should make verification explicit. For academic advice, “looks confident” can be dangerous if source confidence is unclear.

Every plan should surface:

- Why each course appears.
- Which requirement/prereq/goal it supports.
- What data source or assumption was used.
- What the student should verify before registration.
- Confidence level when data is incomplete.

This can start as structured response guidance before becoming full UI.

### 6. Brand language still leans too much on “UC Davis AI Academic Advisor”

The header and chat empty state use “UC Davis AI Academic Advisor.” This is clear, but it risks implying official institutional status and puts “AI” ahead of the planning value. Earlier docs recommend using Adviso and carefully avoiding official UC Davis affiliation.

Recommended language:

- Header: “Adviso” or “Adviso for UC Davis planning”
- Supporting line: “Unofficial class planning help for UC Davis students”
- Chat title: “Plan your next quarter”

### 7. The workspace tab order may not match the pilot flow

Current tab order starts with Degree Audit, then Schedule Planner, then Discovery. For a Fall planning pilot, students may expect the product to start with a recommended plan and then explain requirements.

Recommended experiment:

- Keep Degree Audit available, but orient the first run around “Plan” or “Schedule Planner.”
- Add a planner empty state explaining how audit + chat + discovery feed into the plan.

## Recommended next implementation slice

Build a **First Plan Starter** that turns the MVP’s primitives into a guided pilot flow.

Minimum version:

1. Add a first-plan CTA in the AI empty state or profile panel.
2. Generate/send a structured prompt like:
   - “Build me a next-quarter plan for my major using my completed courses and busy times. Give 2 options, explain why each course is included, list requirements/prereqs/uncertainties, and include what I should verify before registration.”
3. Add visible caveat text near the CTA:
   - “Unofficial planning help. Verify final choices with UC Davis catalog/advising.”
4. Update the chat empty-state examples to emphasize next-quarter planning and verification.

Why this slice:

- Low engineering risk.
- Directly supports the pilot promise.
- Uses existing chat/schedule-block infrastructure.
- Improves conversion from onboarding to value.

## Priority backlog

### P0 — before pilot traffic

- Add first-plan CTA after onboarding.
- Add transcript privacy/handling copy before paste.
- Change student-facing brand from “UC Davis AI Academic Advisor” to “Adviso” with unofficial UC Davis planning language.
- Add verification checklist guidance to AI plan responses.
- Ensure every high-stakes plan includes “verify before registration” language.

### P1 — pilot quality loop

- Capture planning goal during onboarding.
- Capture feedback after plan generation: useful/trusted/confusing/would register/what to verify.
- Add confidence labels to plan recommendations.
- Add source/assumption display for schedule blocks.
- Add “compare options” UI for 2–3 recommended plans.

### P2 — polish and expansion

- Improve mobile responsiveness of the split workspace.
- Add a sample plan/demo for students unwilling to paste transcript data.
- Add analytics events for onboarding completion, transcript skipped/scanned, first plan generated, course added, and feedback submitted.
- Build major-specific data-confidence gates.

## Suggested copy changes

### Header

Current:

> UC Davis AI Academic Advisor

Suggested:

> Adviso
>
> Unofficial UC Davis class planning

### Welcome

Current:

> Let’s set up your AI academic advisor in just a couple of quick steps.

Suggested:

> Let’s build your first class plan. Adviso uses your major, completed courses, and busy times to suggest options you can verify before registration.

### Transcript step

Suggested:

> Optional: paste your unofficial transcript so Adviso can detect completed courses. You can skip this and add courses manually. Only paste academic information you want used for planning.

### Chat empty state

Current:

> Ask me about courses, prerequisites, degree requirements, and academic planning.

Suggested:

> Ask Adviso to build a next-quarter plan, explain remaining requirements, compare course options, or list what to verify before registration.

## Validation notes

This is a source-inspection audit, not a usability test. It should be validated with:

- 3–5 student walkthroughs of the first-run flow.
- A pilot metric for time to first useful plan.
- Feedback after the first generated plan.
- Manual review of plan correctness and unsafe overconfidence.

# Pilot Usability Test Plan

_Last updated: 2026-05-04_

## Purpose

Validate whether Adviso's MVP can reliably deliver the first pilot promise:

> A UC Davis student can get a personalized, explainable next-quarter class plan quickly and know what to verify before registration.

This plan turns the product UX audit into a lightweight student walkthrough protocol. It is designed for 3-5 early UC Davis student sessions before broader pilot traffic.

## What this should answer

1. Do students understand what Adviso is and is not?
2. Can a first-time student reach a useful class plan without handholding?
3. Which parts of onboarding feel valuable versus invasive or confusing?
4. Do students trust the plan enough to keep using it, while still understanding they must verify final choices?
5. What specific missing information blocks usefulness: transcript data, prerequisites, GE rules, workload, instructor difficulty, registration timing, or something else?

## Participant profile

Prioritize UC Davis undergraduates who recently needed help planning classes.

Target mix for the first 5 sessions:

- 2 lower-division students choosing near-term classes.
- 2 upper-division students managing major requirements and prerequisites.
- 1 student with meaningful constraints: work, commute, athletics, transfer status, double major/minor, or pre-health/pre-grad planning.

Avoid collecting more sensitive academic data than needed. If a student uses transcript input, tell them to remove names, ID numbers, addresses, and anything they do not want used for the walkthrough.

## Session format

- Length: 30-45 minutes.
- Mode: screen share or in-person.
- Moderator: Phillip or another founder.
- Recording: optional only with explicit consent.
- Data handling: use notes by default; do not retain transcript screenshots or personally identifiable academic records unless explicitly approved for research storage.

## Moderator script

### Opening

"We're testing whether Adviso helps UC Davis students create and understand a class plan. This is not official UC Davis advising, and we're testing the product, not you. Please think out loud. If something is confusing, that's useful for us."

Ask permission before recording or taking detailed notes.

### Pre-test questions

1. What year and major are you?
2. When was the last time you had to decide what classes to take?
3. What made that decision easy or hard?
4. Where do you normally get advising/planning help?
5. What would make you trust or distrust an AI-generated class plan?

### Task 1 — First impression

Ask the participant to open Adviso and pause before interacting.

Observe:

- What do they think Adviso does?
- Do they understand it is unofficial planning help?
- Do they know what outcome they are supposed to get first?

Prompt if needed:

"What would you click first, and why?"

### Task 2 — Onboarding

Ask the participant to complete onboarding using either real or realistic academic context.

Observe:

- Major/year selection friction.
- Whether transcript input feels optional and safe.
- Whether blocked-time setup feels worth doing.
- Whether they want to state a planning goal before seeing recommendations.

Ask:

- "Did any step ask for information you were hesitant to share?"
- "Was anything missing that you expected Adviso to ask?"

### Task 3 — Generate or request a first plan

Ask:

"Use Adviso to get a class plan for next quarter. Do whatever feels natural."

Observe:

- Whether they find the right CTA or prompt.
- Whether they choose chat, schedule planner, discovery, or degree audit first.
- Whether they understand the generated plan.
- Whether they can tell why each class was recommended.

Success signals:

- Student reaches a plan without moderator instructions.
- Student can explain the purpose of each recommended course.
- Student notices conflicts, workload, or prerequisites.
- Student can name at least one thing to verify before registration.

### Task 4 — Trust and verification

After the plan appears, ask:

1. What parts of this do you trust?
2. What parts would you verify before registering?
3. What source or explanation would make this feel more reliable?
4. Would you use this plan as a starting point? Why or why not?
5. What would make this unsafe or misleading?

### Task 5 — Compare to current behavior

Ask:

1. How would you solve this without Adviso?
2. Is Adviso faster, clearer, or more personalized than your usual method?
3. Would you send this to a friend? What would you warn them about?

## Metrics to capture

Use simple manual notes for the first sessions.

| Metric | Target signal |
| --- | --- |
| Time to first useful plan | Under 5 minutes after landing |
| Onboarding completion | Student completes without moderator rescue |
| First-plan CTA discovery | Student finds a clear next action after onboarding |
| Plan comprehension | Student can explain why courses were suggested |
| Verification awareness | Student can identify what to verify before registration |
| Trust rating | 1-5, plus reason |
| Usefulness rating | 1-5, plus reason |
| Share likelihood | Would they recommend to another UC Davis student? |

## Note-taking template

```markdown
## Participant P__ — YYYY-MM-DD

Profile:
- Year:
- Major:
- Planning context:
- Constraints:

Current planning workflow:

First impression:

Onboarding observations:

First-plan observations:

Trust / verification comments:

Confusing moments:

Most valuable moment:

Top requested improvements:

Ratings:
- Trust: _/5 — reason
- Usefulness: _/5 — reason
- Share likelihood: _/5 — reason

Follow-up actions:
- [ ]
```

## Synthesis rubric

After 3-5 sessions, summarize findings into `docs/user-research.md` and convert repeated issues into GitHub issues.

Prioritize fixes if they meet any of these conditions:

- 2+ students fail to reach a first plan without help.
- 2+ students misunderstand Adviso as official UC Davis advising.
- 2+ students cannot explain why classes were recommended.
- Any student identifies a plausible unsafe advice pattern.
- Any transcript/privacy concern causes hesitation or abandonment.

## Likely product decisions after testing

- Whether the first screen should lead with "Build my first plan" rather than generic AI advisor setup.
- Whether onboarding needs a planning-goal step before transcript/busy-time setup.
- Whether trust indicators should be embedded in the chat response, schedule card UI, or both.
- Whether transcript parsing should be deferred until after a demo plan to reduce trust friction.
- Which pilot metric matters most: time to first plan, plan trust, plan correctness, or retention after registration decisions.

## Related docs

- [Product UX Audit](./product-ux-audit.md)
- [User Research](./user-research.md)
- [Compliance Notes](./compliance-notes.md)

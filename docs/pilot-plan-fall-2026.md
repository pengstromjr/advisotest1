# Fall 2026 Pilot Plan

## Pilot thesis

Adviso helps UC Davis students choose Fall quarter classes by combining major requirements, completed coursework, prerequisites, schedule constraints, and course/professor context into a clear, cited academic plan.

## Positioning

Primary promise:

> Get a personalized Fall quarter class plan before registration — with reasons, requirements, prereqs, and schedule tradeoffs explained clearly.

Avoid promising:

- Official UC Davis advising
- Guaranteed graduation accuracy
- Full replacement for advisors
- Perfect support for every major/pathway on day one

## Pilot format

Recommended model: **waitlist + controlled cohort**

- Waitlist can accept students from all UC Davis majors.
- Initial active pilot should select a smaller cohort for higher-touch review.
- Start with 10–25 students.
- Prefer majors where data confidence is high and student pain is clear.
- Expand only after checking quality and repeated failure modes.

## Target users

Best early users:

- UC Davis undergraduates planning Fall quarter
- Students who need next-quarter course guidance now
- Students with scheduling constraints
- Students unsure how requirements, prereqs, GEs, and professor/course difficulty fit together
- Students considering major/minor changes, but this should be treated as a higher-risk path

## Core pilot flow

1. Student joins waitlist.
2. Student provides major, year, goals, and planning concern.
3. Student optionally provides transcript/completed courses.
4. Student adds blocked times and preferences.
5. Adviso generates 2–3 Fall class plan options.
6. Each option explains:
   - why these courses
   - which requirements they may satisfy
   - prereq assumptions
   - schedule/workload notes
   - source basis
   - uncertainty or “verify with advisor/catalog” warnings
7. Student gives feedback on usefulness, trust, and next action.

## Success metrics

- Time to first useful plan under 5 minutes
- 70%+ of pilot users say the plan was useful
- 60%+ say they understand their requirements better after using Adviso
- 50%+ say they would use Adviso before Pass 1 registration
- Zero high-confidence unsafe recommendations discovered in review
- Track all incorrect, uncertain, or unverifiable recommendations

## Data to capture

Waitlist fields:

- UC Davis email or student email
- Major(s)
- Minor/double-major interest
- Year/class standing
- Planning for Fall? yes/no
- Biggest scheduling/planning concern
- Willing to upload/paste unofficial transcript? yes/no
- Willing to do 15-minute feedback interview? yes/no

Product feedback:

- Was the plan useful?
- Did you trust it?
- What would you verify before acting?
- What was confusing?
- What course or requirement did Adviso miss?
- Would you use this again during registration?

## Risks and mitigations

- **Accuracy risk:** show citations, source categories, and uncertainty.
- **Privacy risk:** make transcript handling explicit; do not store more than needed.
- **Trust risk:** use student testimonials, transparent methodology, and careful language.
- **Scope risk:** waitlist can be broad; active pilot must stay narrow enough to review.
- **Institutional risk:** do not imply official UC Davis affiliation unless approved.

## Immediate build priorities

1. Merge safety/privacy/onboarding PRs.
2. Add waitlist landing page.
3. Add Fall planning intake questions.
4. Improve first-plan generation and source display.
5. Add feedback capture after plan generation.
6. Use data audit output to avoid overconfident advice in low-confidence majors/requirements.

# Onboarding to First Useful Plan

Adviso should not end onboarding with a blank chatbot. The first post-onboarding experience should make the next action obvious: turn the student's major, year, completed courses, and availability into a useful first academic plan.

## Current Improvement

The empty chat state now includes a featured **Build my first academic plan** call-to-action above the smaller example prompts.

The generated prompt asks Adviso to:

- use the selected major and year,
- include completed courses if the student added or parsed them,
- start with the next 3-5 actions,
- flag assumptions or missing information,
- suggest a reasonable next-quarter course direction.

This turns onboarding inputs into an immediate planning conversation instead of leaving the student to invent the first question.

## Why This Matters

A student trying Adviso for the first time is likely asking, “What should I do next?” A strong first-run path should quickly demonstrate value while still preserving safety and uncertainty.

The first plan should be:

- **Actionable**: concrete next steps, not a generic welcome.
- **Provisional**: clear about missing catalog year, transfer/AP/IB credit, petitions, repeated courses, and official advisor verification.
- **Grounded**: based on the student profile and available catalog/course data.
- **Easy to continue**: naturally leads into degree audit, schedule planning, or follow-up questions.

## Follow-Up Ideas

1. After onboarding, automatically highlight the AI panel's first-plan CTA or open the chat panel focused on it.
2. Add a first-run checklist next to the degree audit: verify completed courses, review remaining requirements, build next-quarter schedule.
3. Add lightweight telemetry for which starter prompts students click, once analytics/privacy posture is approved.
4. Add regression examples for first-plan responses across freshman, transfer, senior, and undeclared/uncertain profiles.

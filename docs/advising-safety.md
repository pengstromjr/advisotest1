# Advising Safety Notes

Adviso should be useful and confident where the data supports it, but conservative when a student may make enrollment, prerequisite, or graduation decisions from the answer.

## Product posture

- Adviso is not an official UC Davis advisor.
- Requirement and prerequisite guidance should be grounded in available catalog/course/section data.
- Plans are provisional when student context is incomplete, including catalog year, transfer credit, AP/IB credit, petitions, repeated courses, grades, or emphasis/specialization.
- The assistant should distinguish official/source-backed facts from recommendations and assumptions.

## Current first-pass guardrails

- System prompt explicitly says not to claim official advisor status.
- System prompt requires uncertainty when reference data is missing or incomplete.
- System prompt asks responses to include basis/source context for advising claims.
- Home chat screen now displays a visible non-official-advisor disclaimer.

## Follow-up work

- Add source links/citations in the UI when data includes official URLs.
- Improve prerequisite parsing/validation before suggesting enrollment order.
- Add transcript privacy disclosure around uploads.
- Add a confidence/verification pattern for generated quarter plans.

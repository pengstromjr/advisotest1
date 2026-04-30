# Source and Citation Pattern

Adviso should make academic advice traceable without pretending to be an official UC Davis system. The goal is not legalistic footnotes; it is enough source visibility that a student can tell whether a claim came from catalog data, section data, historical grades, reviews, or inference.

## Current Source Categories

- **Local UC Davis course catalog data**: course titles, units, descriptions, prerequisites, GE areas, and offered terms from `data/courses.json` and `data/courses-full.json`.
- **Retrieved UC Davis catalog / degree text**: RAG snippets from `data/embeddings.json`, usually generated from catalog/program requirement snapshots.
- **Spring 2026 section snapshot**: section times, CRNs, instructors, seats, and locations from `data/sections/spring-2026.json`.
- **CattleLog historical grade data**: historical GPA and grade distributions from `data/grades.json`; should be framed as context, not prediction.
- **Rate My Professors student-review data**: review-derived instructor ratings from `data/rmp.json`; should be framed as student-review signal, not official quality measurement.

## Product Rule

When Adviso answers an advising-sensitive question, it should include a short **What I’m basing this on** section whenever it uses catalog, course, section, grade, or review data.

Good examples:

- “What I’m basing this on: local UC Davis course catalog data for ECS 036A and retrieved UC Davis catalog requirement text for Computer Science, B.S.”
- “What I’m basing this on: Spring 2026 section snapshot for CRN/time/instructor data; CattleLog historical grade data for grade distribution context.”

Avoid:

- Citing source categories that were not actually present in the model context.
- Treating CattleLog or RMP as official UC Davis advice.
- Hiding uncertainty behind confident language.
- Using source notes as a substitute for official verification when a decision affects enrollment, graduation, prerequisites, petitions, or transfer/AP/IB credit.

## Implementation Notes

The chat route now annotates retrieved course, section, grade, and RAG snippets with source notes before they enter the model prompt. The system prompt asks the model to surface the relevant source categories in its answer.

This is an MVP pattern. A stronger future version should pass structured source metadata through the API and render citations in the UI instead of relying entirely on model text generation.

## Next Improvements

1. Add source URLs for program/catalog pages where available in `data/majors/*.json`.
2. Render source badges or expandable citations in message bubbles.
3. Add regression examples for high-stakes answers: prerequisites, remaining requirements, GE fulfillment, transfer/AP/IB credit, and quarter plans.
4. Track source freshness dates for section, grade, and scraped catalog datasets.

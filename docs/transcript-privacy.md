# Transcript Privacy Behavior

Adviso lets a student paste unofficial transcript text during onboarding so the app can detect completed UC Davis course codes and pre-fill the degree audit.

This is useful, but transcript text can contain sensitive academic and personal information. Treat this as privacy-sensitive even before Adviso has formal legal/compliance review.

## Current Product Behavior

- Transcript paste is optional and skippable.
- The transcript parser extracts course codes and returns a unique sorted list.
- The frontend stores completed course codes in the student profile state.
- The parser response does not return the original transcript text.
- The parser endpoint now sends `Cache-Control: no-store` on responses.
- The parser rejects very large pasted transcripts over 50,000 characters and asks the student to paste only the completed-course section or add courses manually.
- The onboarding UI now warns students to avoid unnecessary personal details such as SSNs, student IDs, addresses, and other identifiers.

## Product Principle

Adviso should prefer data minimization:

1. Ask for only what is needed.
2. Keep derived academic planning facts where possible, not raw sensitive documents.
3. Explain what is happening in plain language before the student pastes anything.
4. Make manual entry and skipping easy.

## Current Gaps / Follow-Up

- Confirm whether completed courses persist only locally or are saved server-side in any future account system.
- Add a formal privacy policy before any broad pilot.
- Add a deletion/export path if transcripts, completed-course lists, or advising profiles become account-backed.
- Avoid sending raw transcript text to third-party LLMs unless the user explicitly opts in and the privacy policy supports it.
- Add test coverage for parser limits and `Cache-Control: no-store` behavior.

## Suggested User-Facing Copy

> Paste only what you’re comfortable sharing. Adviso uses this text to detect completed course codes, then keeps only the detected course list in your profile. Avoid including SSNs, student IDs, addresses, or other unnecessary personal details.

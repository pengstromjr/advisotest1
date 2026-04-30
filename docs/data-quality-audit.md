# Program Requirement Data Quality Audit

This first-pass audit checks whether course references in `data/majors/*.json` can be resolved against the local course catalog datasets (`data/courses.json` and `data/courses-full.json`). It is intended to support issue #3: verifying UC Davis program requirement data before students rely on degree-audit or planning output.

## How to Reproduce

Run:

```bash
npm run audit-program-data
```

The script scans all major/program JSON files and reports unresolved course references, grouped by likely cleanup category and by affected program.

## Snapshot Results

Audit date: 2026-04-29.

- Program files scanned: **237**
- Local course codes loaded: **10,462**
- Requirement course references scanned: **16,288**
- Resolved references: **15,585**
- Unresolved references: **703**
- Coverage: **95.7%**

## Main Finding

Most unresolved references do not look like missing UC Davis courses. They look like scraper/normalization issues that can cause Adviso to misunderstand requirement structure:

| Category | Count | Meaning |
| --- | ---: | --- |
| Concatenated course sequence | 389 | Multiple courses were fused into one string, e.g. `MAT 021AMAT 021BMAT 021C`. |
| Other format | 158 | Cross-listed, unusual, or malformed references that need parser-specific handling. |
| Discontinued or annotated | 72 | Requirement entries include status notes like `DISCONTINUED FOR WINTER 2026`. |
| Missing from course catalog | 63 | Single course-like references that were not found in local catalog data. |
| Concatenated same-subject sequence | 21 | Same-subject sequences were fused, e.g. `ANS 041041L`. |

## Programs With Most Unresolved References

Top affected programs in the current snapshot:

1. International Relations, B.A. — 26
2. Applied Chemistry, B.S. — 24
3. Environmental Science & Management, B.S. — 22
4. Music, B.A. — 22
5. Genetics & Genomics, B.S. — 21
6. Neurobiology, Physiology, & Behavior, B.S. — 21
7. Psychology, B.S. — 18
8. Geology, B.S. — 17
9. Human Biology, B.S. — 17
10. Marine & Coastal Science, B.S. — 17

## Examples

- `EAE 130AEAE 130B` should likely be split into `EAE 130A` and `EAE 130B`.
- `MAT 017AMAT 017BMAT 017C` should likely be split into the MAT 017 series.
- `CHE 002ACHE 002BCHE 002C` should likely be split into the CHE 002 series.
- `ABT/LED 150/LDA 150 DISCONTINUED FOR WINTER 2026 **` should preserve discontinuation metadata separately from course identity.
- `PSC 123/NPB 152` is cross-listed but needs expansion/normalization before matching.

## Product Risk

If left uncleaned, these issues can make Adviso:

- undercount completed requirements,
- recommend a course sequence as if it were one course,
- miss valid cross-listed courses,
- fail to explain choice groups correctly,
- overstate confidence in degree-audit output.

For advising-sensitive answers, Adviso should continue to say plans are provisional and ask students to verify against official UC Davis sources.

## Recommended Next Steps

1. Improve scraper normalization for concatenated course sequences.
2. Add explicit support for cross-listed courses where departments differ but the course number is shared.
3. Store discontinued/annotation text as metadata instead of inside the course code string.
4. Re-run `npm run audit-program-data` after cleanup and track unresolved count toward zero.
5. Add this audit to a lightweight data QA checklist before any pilot or public launch.

# Non–excellent-fit tendency (baseline)

Analysis of **where doctors that are not excellent fits** tend to appear in our top 3, 5, and 12. Source: `excellent-fit-baseline.json` (V2, N=150).

---

## Summary

- **75 of 100** test cases have at least one non–excellent-fit doctor in the top 12.
- **245** non–excellent-fit labels in total across those cases.
- Non–excellent fits are **spread across all ranks**; they appear **more often in the lower half** (ranks 6–12) than in the top 3.

---

## Rank distribution (where they show up)

| Rank | Count (non–excellent) |
|------|------------------------|
| 1    | 12 |
| 2    | 14 |
| 3    | 21 |
| 4    | 18 |
| 5    | 22 |
| 6    | 21 |
| 7    | 19 |
| 8    | 24 |
| 9    | 15 |
| 10   | 26 |
| 11   | 27 |
| 12   | 26 |

**Tendency:** Ranks 8, 10, 11, 12 have the highest counts (24–27 each). Top 3 (ranks 1–3) has 47 total; ranks 6–12 have 158. So non–excellent fits are **more mixed into the bottom of the list (6–12)** than concentrated in the very top (1–3).

---

## By slice (top 3 vs top 5 vs top 12)

| Slice   | Non–excellent occurrences | % of slots that are non–excellent | Cases with ≥1 non–excellent in slice |
|---------|----------------------------|-----------------------------------|--------------------------------------|
| Top 3   | 47                         | 15.7%                             | 35% (35/100) |
| Top 5   | 87 (47 + 40 in 4–5)        | 17.4%                             | 53% (53/100) |
| Top 12  | 245                        | 20.4%                             | 75% (75/100) |

- **Top 3:** 15.7% of top-3 slots are non–excellent; 35% of cases have at least one in the top 3.
- **Top 5:** 17.4% of top-5 slots are non–excellent; 53% of cases have at least one in the top 5.
- **Top 12:** 20.4% of top-12 slots are non–excellent; 75% of cases have at least one in the top 12.

So the **tendency** is: the more slots we show (3 → 5 → 12), the more non–excellent fits get mixed in both in **share of slots** (15.7% → 17.4% → 20.4%) and in **how many cases are affected** (35% → 53% → 75%). Non–excellent fits are mixed in across the list, with a slight tilt toward the **lower ranks (6–12)**.

---

## How to re-run

```bash
node analyze-non-excellent-fit-ranks.js [--input=excellent-fit-baseline.json]
```

Use `--input=excellent-fit-evaluation.json` (or another run) to compare after tuning.

# Testing Metrics Explained

## Overview

The testing framework uses standard information retrieval metrics to evaluate ranking quality. These metrics help you understand how well the algorithm performs and identify areas for improvement.

---

## Metrics Overview

| Metric | What It Measures | Range | Higher is Better |
|--------|-----------------|-------|------------------|
| **Precision@K** | Are top K results relevant? | 0.0 - 1.0 | ✅ Yes |
| **Recall@K** | Are relevant results found? | 0.0 - 1.0 | ✅ Yes |
| **MRR** | Position of first correct result | 0.0 - 1.0 | ✅ Yes |
| **NDCG** | Position-weighted relevance | 0.0 - 1.0 | ✅ Yes |

---

## Precision@K

### What It Measures

**Precision@K** = Fraction of top K results that are relevant (ground truth)

### Formula

```
Precision@K = (relevant items in top K) / K
```

### Example

**Ground Truth**: `["Dr A", "Dr B", "Dr C"]`

**Top 3 Results**:
1. Dr A ✅ (ground truth)
2. Dr X ❌ (not ground truth)
3. Dr B ✅ (ground truth)

**Precision@3** = 2/3 = **0.667** (66.7%)

### Interpretation

- **1.0**: Perfect - all top K are relevant
- **0.5**: Half are relevant
- **0.0**: None are relevant

**Use Case**: Measures ranking quality - are top results good?

---

## Recall@K

### What It Measures

**Recall@K** = Fraction of ground truth items found in top K results

### Formula

```
Recall@K = (relevant items found in top K) / (total ground truth items)
```

### Example

**Ground Truth**: `["Dr A", "Dr B", "Dr C", "Dr D", "Dr E"]` (5 items)

**Top 5 Results**:
1. Dr A ✅
2. Dr X ❌
3. Dr B ✅
4. Dr C ✅
5. Dr Y ❌

**Recall@5** = 3/5 = **0.60** (60%)

### Interpretation

- **1.0**: Perfect - all ground truth found
- **0.5**: Half found
- **0.0**: None found

**Use Case**: Measures coverage - are we finding relevant results?

---

## MRR (Mean Reciprocal Rank)

### What It Measures

**MRR** = Average of 1/(position of first correct result) across queries

### Formula

```
MRR = (1 / position of first correct result)
```

### Example

**Ground Truth**: `["Dr A", "Dr B", "Dr C"]`

**Results**:
1. Dr X ❌
2. Dr A ✅ (first correct at position 2)

**MRR** = 1/2 = **0.5**

**Another Query**:
1. Dr B ✅ (first correct at position 1)

**MRR** = 1/1 = **1.0**

**Average MRR** = (0.5 + 1.0) / 2 = **0.75**

### Interpretation

- **1.0**: Perfect - first result is always correct
- **0.5**: First correct result at position 2 on average
- **0.33**: First correct result at position 3 on average
- **0.0**: No correct results found

**Use Case**: Measures how quickly we find the first relevant result.

---

## NDCG (Normalized Discounted Cumulative Gain)

### What It Measures

**NDCG** = Position-weighted relevance score (higher positions weighted more)

### Formula

```
DCG = Σ (relevance / log2(rank + 1))
NDCG = DCG / IDCG (where IDCG is ideal DCG)
```

### Example

**Ground Truth**: `["Dr A", "Dr B", "Dr C"]`

**Top 5 Results**:
1. Dr A ✅ (relevance = 1)
2. Dr X ❌ (relevance = 0)
3. Dr B ✅ (relevance = 1)
4. Dr Y ❌ (relevance = 0)
5. Dr C ✅ (relevance = 1)

**DCG** = 1/log2(2) + 0/log2(3) + 1/log2(4) + 0/log2(5) + 1/log2(6)
       = 1/1 + 0 + 1/2 + 0 + 1/2.58
       = 1 + 0.5 + 0.39
       = 1.89

**IDCG** (perfect ranking: all relevant first):
       = 1/log2(2) + 1/log2(3) + 1/log2(4)
       = 1 + 0.63 + 0.5
       = 2.13

**NDCG** = 1.89 / 2.13 = **0.887**

### Interpretation

- **1.0**: Perfect ranking
- **0.8+**: Very good ranking
- **0.5-0.8**: Good ranking
- **<0.5**: Poor ranking

**Use Case**: Measures overall ranking quality considering position.

---

## Position Metrics

Additional metrics provided:

### Average Position

Average rank of all ground truth items found.

**Example**: Ground truth found at positions [1, 3, 5] → Average = 3.0

### Min Position

Best (lowest) rank of any ground truth item.

**Example**: Ground truth found at positions [1, 3, 5] → Min = 1

### In Top 3 / Top 5 / Top 10

Count of ground truth items in each range.

**Example**: 2 ground truth items in top 3, 3 in top 5 → `inTop3: 2/3`, `inTop5: 3/3`

---

## Using Metrics to Improve Ranking

### High Precision@K, Low Recall@K

**Problem**: Top results are good, but missing relevant results.

**Solution**:
- Expand query terms
- Reduce BM25 strictness
- Increase retrieval pool (top N)

### Low Precision@K, High Recall@K

**Problem**: Finding relevant results, but ranking them low.

**Solution**:
- Improve intent classification
- Better expansion terms
- Improve rescoring weights

### Low MRR

**Problem**: First relevant result appears too far down.

**Solution**:
- Improve anchor phrase boosting
- Better intent term matching
- Increase negative term penalties (if query is clear)

### Low NDCG

**Problem**: Overall ranking quality is poor.

**Solution**:
- Review all of the above
- Check query clarity detection
- Verify intent classification accuracy

---

## Benchmark Evaluation

When running batch evaluation:

### Summary Statistics

- **Average Precision@3**: Average across all test cases
- **Average Precision@5**: Average across all test cases
- **Average Recall@5**: Average across all test cases
- **Average MRR**: Average across all test cases
- **Average NDCG**: Average across all test cases

### Comparing Variants

Compare metrics across variants:
- **Algorithmic**: Baseline (no AI expansion)
- **Parallel (No Negatives)**: Parallel AI, adaptive negative terms
- **Parallel (Goal/Specificity)**: Parallel AI, always-on negative terms

**Best variant**: Highest average metrics across all test cases.

---

## Manual Evaluation

### Relevance Flags

Flag results that seem irrelevant:
- Helps identify false positives
- Track patterns in errors
- Improve intent classification

### Booking Proxy

Mark which doctor you'd actually choose:
- Measures real-world utility
- Complements precision/recall metrics
- Helps validate ranking quality

---

## Example Interpretation

### Test Case: "I need SVT ablation"

**Results**:
- Precision@3: 0.67 (2 of 3 are relevant)
- Recall@5: 0.60 (3 of 5 ground truth found)
- MRR: 0.5 (first relevant at position 2)
- NDCG: 0.75 (good ranking quality)

**Interpretation**:
- ✅ Good precision - top results are relevant
- ⚠️ Moderate recall - missing some relevant results
- ⚠️ Moderate MRR - first relevant not at top
- ✅ Good NDCG - overall ranking is solid

**Action Items**:
- Improve recall: Expand query terms or increase retrieval pool
- Improve MRR: Boost anchor phrases or improve intent matching

---

## Related Documentation

- [ALGORITHM_EXPLANATION.md](ALGORITHM_EXPLANATION.md) - How the algorithm works
- [testing/README.md](../testing/README.md) - Testing framework guide
- [NEGATIVE_KEYWORDS.md](NEGATIVE_KEYWORDS.md) - Negative keyword impact on metrics

---

**Understanding metrics helps you improve ranking quality!**

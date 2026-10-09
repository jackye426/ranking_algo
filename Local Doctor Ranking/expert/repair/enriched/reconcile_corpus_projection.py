"""Reconcile actual corpus coverage with reviewed pure preparation omissions.

Raw-token diagnostics intentionally still flag entity decoding, BOM removal and
deduplicated complete statements. This report accepts only those exact reviewed
differences; it does not replace the original diagnostic receipt.
"""
import argparse
import hashlib
import json
from collections import Counter
from pathlib import Path


def read(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def reconcile(corpus_file, pure_file, decisions_file, review_file, output):
    corpus, pure, disposition, independent = map(read, [corpus_file, pure_file, decisions_file, review_file])
    output = Path(output)
    if output.exists():
        raise ValueError("Choose a new immutable reconciliation receipt")
    if corpus["packetSha256"] != pure["packetSha256"] or disposition["packetSha256"] != pure["packetSha256"] or not disposition["completenessAccountingPassed"]:
        raise ValueError("Source packets or preparation disposition do not match")
    by_pure = {item["reviewId"]: item for item in pure["findings"]}
    reviewed = {item["reviewId"]: item for item in independent["decisions"]}
    unexpected, decisions = [], []
    actual_missing = {item["reviewId"] for item in corpus["missing"]}
    expected_missing = {item["reviewId"] for item in pure["findings"] if item["state"] == "missing"}
    if actual_missing != expected_missing:
        unexpected.append({"issue": "Different missing item set", "added": sorted(actual_missing - expected_missing), "removed": sorted(expected_missing - actual_missing)})
    for item in corpus["tokenCoverageNeedsReview"]:
        previous = by_pure.get(item["reviewId"])
        extra = Counter(item["missingTokens"]) - Counter((previous or {}).get("missingTokens", {}))
        action = "same-explicit-preparation-exclusion"
        if extra:
            prior = reviewed.get(item["reviewId"])
            same_review = prior and prior["textSha256"] == item["textSha256"]
            if set(extra) == {"\ufeff"}:
                action = "source-BOM-normalization"
            elif same_review and prior["decision"] == "benign-complete-entity-decoding" and not (extra - Counter(prior["missingTokens"])):
                action = "independently-reviewed-genuine-entity-decoding"
            elif same_review and prior["decision"] == "duplicate-complete-claim-reduction" and not (extra - Counter(prior["missingTokens"])):
                action = "independently-reviewed-complete-statement-deduplication"
            else:
                action = "unresolved-corpus-difference"
                unexpected.append({"reviewId": item["reviewId"], "sourceRecordId": item["sourceRecordId"], "extraMissingTokens": dict(extra)})
        decisions.append({"sourceRecordId": item["sourceRecordId"], "reviewId": item["reviewId"], "textSha256": item["textSha256"], "action": action, "additionalRawTokenDifference": dict(extra)})
    receipt = dict(schemaVersion=1, passed=not unexpected, packetSha256=pure["packetSha256"], corpusVersion=corpus["corpusVersion"], counts=corpus["counts"], diagnosticMissingItems=len(corpus["missing"]), diagnosticPartialItems=len(decisions), actionCounts=dict(Counter(d["action"] for d in decisions)), unexpected=unexpected, decisions=decisions, rawDiagnosticRetained=True, noSourceMutation=True, retrievalAcceptanceClaimed=False, inputSha256={str(Path(name).name): hashlib.sha256(Path(name).read_bytes()).hexdigest() for name in [corpus_file, pure_file, decisions_file, review_file]})
    output.write_text(json.dumps(receipt, ensure_ascii=False, indent=2), encoding="utf-8")
    return {key: value for key, value in receipt.items() if key != "decisions"}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    for name in ["corpus", "pure", "dispositions", "independent-review", "output"]:
        parser.add_argument("--" + name, required=True)
    args = parser.parse_args()
    print(json.dumps(reconcile(args.corpus, args.pure, args.dispositions, args.independent_review, args.output)))

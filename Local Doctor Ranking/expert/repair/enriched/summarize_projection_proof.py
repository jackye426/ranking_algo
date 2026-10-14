"""Explain literal preparation omissions, never relabel source or ranking tests.

The proof's exact rejected segments must account for every missing token. This
is completeness accounting: conservative mixed-block exclusions can still lose
useful context and are reported as source-recovery backlog, not fabricated data.
"""
import argparse
import hashlib
import json
import re
from collections import Counter
from pathlib import Path


def read(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def summarize(proof_file, reviews, output):
    proof_file, reviews, output = Path(proof_file), Path(reviews), Path(output)
    if output.exists():
        raise ValueError("Choose a new immutable proof summary")
    proof = read(proof_file)
    short = {(d["reviewId"], d["text"]): d for name in ["short-about-independent-review-b.json", "new-short-independent-review-b-v10a.json"] for d in read(reviews / name)["decisions"]}
    # The later paragraph review explicitly superseded the earlier fragment
    # proposal in these two cases. Do not restore a malformed shared paragraph.
    overrides = {
        ("detail-081470bb7b65ac02bb60be6c6c38", "C).") : "withhold-malformed-parent-paragraph",
        ("detail-2a2a389b2e1b11f517c6b2ba7469", "Consultant"): "standalone-residual-heading",
    }
    categories = {
        "filter-1": "empty-placeholder-or-nonsemantic-marker",
        "filter-2": "contact-details",
        "filter-3": "contact-details",
        "filter-4": "personal-or-mixed-personal-source",
        "filter-5": "personal-or-mixed-personal-source",
        "filter-6": "personal-or-mixed-personal-source",
        "filter-7": "navigation-or-mixed-navigation-source",
        "filter-8": "navigation-or-mixed-navigation-source",
        "filter-9": "standalone-source-heading",
        "filter-10": "promotional-source",
        "filter-11": "unreviewed-corrupt-legacy-source",
        "filter-12": "source-native-fragment-corruption",
        "filter-13": "administrative-or-mixed-administrative-source",
        "filter-14": "billing-or-administration",
        "filter-15": "administrative-link",
        "filter-16": "nonexpertise-boilerplate",
        "filter-17": "administrative-consultation-heading",
        "filter-18": "known-corrupt-source-fragment",
    }
    decisions, unexplained, short_unreviewed = [], [], []
    totals = Counter()
    for item in proof["findings"]:
        rejected = [p for p in item["pieces"] if p["rejectionReason"]]
        tokens = Counter(re.findall(r"\w+|[^\w\s]", "\n".join(p["text"] for p in rejected)))
        residual = {word: count - tokens[word] for word, count in item["missingTokens"].items() if count > tokens[word]}
        if residual:
            unexplained.append({"reviewId": item["reviewId"], "residualMissingTokens": residual})
        dispositions = []
        for piece in rejected:
            rule = piece["rejectionReason"]
            action = categories.get(rule)
            if rule == "filter-19":
                action = overrides.get((item["reviewId"], piece["text"]))
                original = short.get((item["reviewId"], piece["text"]))
                if not action and original and original["decision"] in ["no-expertise-content", "withhold-for-source-review", "withhold-entire-source-context"]:
                    action = original["decision"]
                if not action:
                    short_unreviewed.append({"sourceRecordId": item["sourceRecordId"], "reviewId": item["reviewId"], "text": piece["text"]})
                    action = "unresolved-short-context"
            if not action:
                raise ValueError("Unmapped preparation rule: " + rule)
            totals[action] += 1
            dispositions.append({"text": piece["text"], "rule": rule, "disposition": action})
        decisions.append({"sourceRecordId": item["sourceRecordId"], "reviewId": item["reviewId"], "sourceTextSha256": item["sourceTextSha256"], "sourceProvenance": item["sourceProvenance"], "kind": item["kind"], "state": item["state"], "rejectedSegments": dispositions, "residualMissingTokens": residual})
    report = dict(schemaVersion=1, proofSha256=hashlib.sha256(proof_file.read_bytes()).hexdigest(), packetSha256=proof["packetSha256"], runtimeDataSha256=proof["runtimeDataSha256"], counts=proof["counts"], segmentDispositionCounts=dict(totals), missingItemsAccounted=len(decisions), unexplainedTokenLoss=unexplained, unreviewedShortPieces=short_unreviewed, completenessAccountingPassed=not unexplained and not short_unreviewed, retrievalOrDeploymentAcceptanceClaimed=False, limitations="Mixed administrative/personal/navigation paragraphs remain conservatively withheld. Restoring their useful portions requires source-bound review; zero unexplained loss is not a claim of complete raw-source indexing.", decisions=decisions)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return {key: value for key, value in report.items() if key != "decisions"}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    for name in ["proof", "reviews", "output"]:
        parser.add_argument("--" + name, required=True)
    args = parser.parse_args()
    print(json.dumps(summarize(args.proof, args.reviews, args.output)))

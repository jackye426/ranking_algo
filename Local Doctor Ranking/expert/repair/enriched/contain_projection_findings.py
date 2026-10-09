"""Withhold newly reviewed unsafe source blocks without altering frozen packets.

Exact source-owned review IDs and narrowly bound source markers are mandatory.
This never guesses a completion or rewrites a mixed testimonial/personal block.
"""
import argparse
import hashlib
import json
import re
from pathlib import Path
from prepare_sources import EVIDENCE_FIELDS, all_text, digest, hash_value, load, save


FINDINGS = [
    ("bupa_18624", "detail-d344a614647e2890d0a8f5ee9dd0", "testimonial-and-truncated-source", r"what patients say|she has her\s*[•*]?\s*$"),
    ("bupa_9818", "detail-df034cdce03963c15026aaab2eb8", "patient-testimonials", r"patient feedback\s*:"),
    ("bupa_24911", "detail-80d47cabd00561730efd301c8a99", "personal-family-and-upbringing", r"\bfamily man\b|newcastle born and bred"),
    ("bupa_23874", "detail-abcc25171e1a98149f40ecaa25d5", "personal-age-and-schooling", r"\bI am now 55\b|grammar[- ]school"),
    ("bupa_28202", "detail-7cd7c61e91b921a3c32f6de2cb4f", "source-native-truncated-tail", r"\bPhyloge\s*$"),
    ("bupa_10492", "detail-ee7b4cf1f8cd27d546bfc0418d8e", "source-native-truncated-tail", r"\bIn 201\s*$"),
]


def value_at(row, field):
    value = row
    for part in field.split("."):
        value = value.get(part) if isinstance(value, dict) else None
    return value


def prepare(baseline_path, source_path, output_path, findings=None):
    source_path, output_path = Path(source_path), Path(output_path)
    if output_path.exists():
        raise ValueError("Choose a new immutable output directory")
    baseline = load(baseline_path)
    packet = load(source_path / "repairs.json")
    original_sha = digest(source_path / "repairs.json")
    rows = {row["id"]: row for row in baseline["rows"]}
    patches = {(item["sourceRecordId"], item["field"]): item for item in packet["patches"]}
    suppressions = {(item["sourceRecordId"], item["field"]): item for item in packet["suppressions"]}
    removed_ids, withdrawn_keys, decisions = set(), set(), []
    for record, review_id, reason, pattern in FINDINGS if findings is None else findings:
        context_patch = patches[(record, "professional_context")]
        exact = [item for item in context_patch["value"] if item["provenance"]["reviewId"] == review_id]
        if len(exact) != 1 or not re.search(pattern, exact[0]["text"], re.I):
            raise ValueError("Reviewed source binding no longer matches: " + review_id)
        item = exact[0]
        removed = [value for value in context_patch["value"] if value["provenance"]["reviewId"] == review_id or re.search(pattern, value["text"], re.I)]
        context_patch["value"] = [value for value in context_patch["value"] if value not in removed]
        for value in removed:
            removed_ids.add(value["provenance"]["reviewId"])
        matches = []
        row = rows[record]
        for field in EVIDENCE_FIELDS:
            keys = [field + "." + key for key in (row.get(field) or {}) if re.fullmatch(r"[A-Za-z0-9_-]+", key)] if field == "about_alternatives" else [field]
            for key in keys:
                ident = (record, key)
                original = value_at(row, key)
                patch = patches.get(ident)
                current = patch["value"] if patch else original
                if not any(re.search(pattern, text, re.I) for text in all_text(current)):
                    continue
                if ident not in suppressions:
                    decision_id = "projection-scope-" + hashlib.sha256((record + "|" + key + "|" + hash_value(original)).encode()).hexdigest()[:24]
                    suppressions[ident] = dict(sourceRecordId=record, field=key, beforeHash=hash_value(original), approved=True, reason="Source-reviewed complete field withheld: " + reason, reviewId=decision_id, sourceEvidence=[dict(snapshotSha256=item["provenance"]["snapshotSha256"], sourceField=item["provenance"]["sourceField"], sourceRecordId=record)])
                    if patch:
                        withdrawn_keys.add(ident)
                    state = "new-exclusion-and-patch-withdrawal" if patch else "new-exclusion"
                else:
                    state = "already-source-excluded"
                matches.append(dict(field=key, beforeHash=hash_value(original), evaluatedHash=hash_value(current), disposition=state, suppressionReviewId=suppressions[ident]["reviewId"]))
        decisions.append(dict(sourceRecordId=record, originalReviewId=review_id, reason=reason, sourceMarker=pattern, acceptedSourceTextSha256=hashlib.sha256(item["text"].encode()).hexdigest(), provenance=item["provenance"], omittedContext=[dict(reviewId=value["provenance"]["reviewId"], kind=value["kind"], textSha256=hashlib.sha256(value["text"].encode()).hexdigest()) for value in removed], matchingBaselineFields=matches, disposition="complete-context-withheld; no reconstruction", reconsideration="Recover an intact professional-only block from a verified source with explicit boundaries; do not reconstruct the missing wording."))
    packet["patches"] = [item for item in packet["patches"] if (item["sourceRecordId"], item["field"]) not in withdrawn_keys]
    packet["suppressions"] = list(suppressions.values())
    safe = load(source_path / "safe-r1" / "repairs.json")
    safe["patches"] = [item for item in safe["patches"] if (item["sourceRecordId"], item["field"]) not in suppressions]
    safe["suppressions"] = packet["suppressions"]
    ledger = load(source_path / "review-ledger.json")
    filtered_ledger = [item for item in ledger if item["reviewId"] not in removed_ids]
    output_path.mkdir(parents=True)
    (output_path / "safe-r1").mkdir()
    save(output_path / "repairs.json", packet)
    save(output_path / "safe-r1" / "repairs.json", safe)
    save(output_path / "review-ledger.json", filtered_ledger)
    save(output_path / "suppression-ledger.json", packet["suppressions"])
    save(output_path / "projection-remediation.json", decisions)
    report = dict(schemaVersion=1, status="staged; requires adapter, corpus and independent disposition verification", baselineSha256=digest(baseline_path), previousPacketSha256=original_sha, repairsSha256=digest(output_path / "repairs.json"), safeBaselinePacketSha256=digest(output_path / "safe-r1" / "repairs.json"), omittedSourceContextItems=len(removed_ids), omittedReviewIds=sorted(removed_ids), acceptedNewContextItems=len(filtered_ledger), contextItems=sum(len(item["value"]) for item in packet["patches"] if item["field"] == "professional_context"), suppressedFields=len(suppressions), affectedSuppressedRows=len({record for record, _ in suppressions}), newSuppressedFields=len(suppressions) - len(load(source_path / "repairs.json")["suppressions"]), withdrawnEarlierPatches=[dict(sourceRecordId=record, field=field) for record, field in sorted(withdrawn_keys)], identitiesChanged=False, sourcesRewritten=False, databaseWrites=0, packetHistoryPreserved=digest(source_path / "repairs.json") == original_sha, inheritedReceiptDirectory=str(source_path), allHistoricalSourceReviewReceiptsRetained=True)
    save(output_path / "report.json", report)
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--baseline", required=True)
    parser.add_argument("--source", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    print(json.dumps(prepare(args.baseline, args.source, args.output)))

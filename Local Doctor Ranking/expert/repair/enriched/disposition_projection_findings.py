"""Account for every diagnostic item without relabelling initial failures.

This is a review/disposition report, not a source rewrite or release signoff.
Runtime remediation must be checked against a newly prepared corpus.
"""
import argparse
import hashlib
import json
import re
from collections import Counter
from pathlib import Path


def read(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def disposition(directory, source_packet_report, output):
    directory, output = Path(directory), Path(output)
    if output.exists():
        raise ValueError("Use a new immutable disposition receipt")
    files = ["context-projection-r3-v9-diagnostics.json", "short-about-independent-review-b.json", "no-filter-independent-review-b.json", "mixed-residual-independent-review-b.json", "semicolon-context-review-v9.json", "partial-token-residual-v9.json"]
    data = {name: read(directory / name) for name in files}
    diagnostics = data[files[0]]
    short = {(d["reviewId"], d["text"]): d for d in data[files[1]]["decisions"]}
    residual = {d["reviewId"]: d for name in files[2:4] for d in data[name]["decisions"]}
    removed = set(read(source_packet_report)["omittedReviewIds"])
    semicolons = {(d["sourceRecordId"], d["text"]): d for d in data[files[4]]["decisions"]}
    exceptional_contact = {"detail-b4e3e437136bffc4fd4c86f0609d", "detail-10830be7071eb96ed6b529261a54", "research-block-d8585ab0fddad414e9551e2a62"}
    outcomes = []
    for item in diagnostics["findings"]:
        segments = []
        for segment in item["segments"]:
            rule, text = segment["reason"], segment["text"]
            if not rule:
                continue
            reason = ""
            if rule == "filter-1":
                if re.search(r"[A-Za-z]{2}", text) and not re.fullmatch(r"null|none|unknown|n/?a|not available|undefined", text, re.I):
                    action, reason = "restore-recorded-short-entry", "A meaningful recorded short entry must not be rejected merely for two-character length; retain its source classification."
                else:
                    action, reason = "retain-with-source-context-or-omit-formatting", "A bullet, reference number, punctuation or incomplete one-letter fragment is not standalone expertise; do not change its nearby source context."
            elif rule == "filter-11":
                if (item["sourceRecordId"], text) not in semicolons:
                    raise ValueError("Unreviewed approved-context semicolon rejection")
                action, reason = "restore-reviewed-source-context", "This exact complete chunk was read and approved as intact professional wording; keep the weak heuristic on legacy unreviewed fields."
            elif rule == "filter-13":
                if re.match(r"^(?:Books?(?:\b|Yvonne)|Callus\b|Calleary\b|Contact\s+(?:(?:and occupational )?(?:dermatitis|allergy))|Clicking\b)", text, re.I) and not re.match(r"^Book\s+(?:an?\b|your\b|now\b|online\b|and\s+appointment\b)", text, re.I):
                    action, reason = "restore-medical-or-bibliographic-prefix", "The prefix is a condition, service, book/publication heading or author name, not an instruction to contact/book. Preserve source-reported rather than verified authorship meaning."
                else:
                    action, reason = "safely-withheld-administrative-or-link-lead", "The source chunk is a booking/contact command, navigation lead or fees message; a source-linked lead alone is not expertise proof."
            elif rule == "filter-19":
                decision = short.get((item["reviewId"], text))
                if not decision:
                    raise ValueError("Missing independent short-entry decision")
                action, reason = decision["decision"], decision["reason"]
            elif rule == "filter-3" and item["reviewId"] in exceptional_contact:
                action, reason = "restore-professional-contact-or-mobile-context", "Medical Contact Lens plus appointment-year ranges, or mobile-bearing knee research plus citation numbers, is not personal contact information."
            else:
                action, reason = "safely-withheld-nonexpertise-or-mixed-source-block", "Retain the existing professional-only exclusion for contacts, personal material, empty cross-references, marketing or administrative text. Recover any mixed professional portion only through reliable source boundaries."
            segments.append({**segment, "action": action, "reason": reason})
        actions = sorted({s["action"] for s in segments})
        detail = residual.get(item["reviewId"])
        if detail:
            actions.append(detail["decision"])
        if item["reviewId"] in removed:
            outcome = "withheld-in-source-preparation-v9-final"
        elif any("restore" in action or action in {"source-context-fragment-loss", "critical-inequality-corruption", "retain-as-recorded-professional-entry", "retain-with-source-context"} for action in actions):
            outcome = "runtime-repair-required-before-promotion"
        elif any(action == "withhold-for-source-review" for action in actions):
            outcome = "retain-qualified-context-and-withhold-ambiguous-fragment"
        else:
            outcome = "explained-safe-filter-formatting-or-complete-claim-deduplication"
        if not actions:
            raise ValueError("Unaccounted projection finding " + item["reviewId"])
        outcomes.append({"sourceRecordId": item["sourceRecordId"], "reviewId": item["reviewId"], "kind": item["kind"], "initialIssue": item["issue"], "sourceTextSha256": item["textSha256"], "sourceProvenance": item["provenance"], "outcome": outcome, "segmentDispositions": segments, "independentResidualDecision": detail, "actions": sorted(set(actions))})
    assert len(outcomes) == 1540
    result = dict(schemaVersion=1, status="Every initial item has a disposition; this is not a passing runtime or release receipt", initialMissingItems=705, initialPartialTokenItems=835, items=len(outcomes), outcomeCounts=dict(Counter(o["outcome"] for o in outcomes)), actionCounts=dict(Counter(a for o in outcomes for a in o["actions"])), sourcePacketReportSha256=sha(source_packet_report), inputSha256={name: sha(directory / name) for name in files}, promotionReady=False, decisions=outcomes)
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"items": len(outcomes), "outcomes": result["outcomeCounts"], "output": str(output), "promotionReady": False}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--directory", required=True)
    parser.add_argument("--source-packet-report", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    print(json.dumps(disposition(args.directory, args.source_packet_report, args.output)))

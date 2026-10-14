"""Close the final two reviewed projection cases without changing source text."""
import argparse
import hashlib
import json
from pathlib import Path
from contain_projection_findings import prepare
from prepare_sources import load, save, digest


def finalize(baseline, source, decision_file, output):
    source, output = Path(source), Path(output)
    decision = load(decision_file)
    # The reviewer approved this complete original paragraph, not an isolated
    # procedure fragment or an assertion of performed activity.
    source_id = "bupa_28441"
    review_id = "detail-b61e2ab146a6782ed00b4e692333"
    packet = load(source / "repairs.json")
    patch = next(p for p in packet["patches"] if p["sourceRecordId"] == source_id and p["field"] == "professional_context")
    item = next(i for i in patch["value"] if i["provenance"]["reviewId"] == review_id)
    approved = next(item for item in decision["decisions"] if item["decision"] == "approved-source-bound-context")
    if approved["sourceRecordId"] != source_id or approved["reviewId"] != review_id or approved["textSha256"] != hashlib.sha256(item["text"].encode()).hexdigest():
        raise ValueError("Independent complete-paragraph review is not source bound")
    span = approved["span"]
    if span["mode"] != "source-context" or span["text"] != "Microsurgical reversal of vasectomy;" or not item["text"].endswith(span["text"]):
        raise ValueError("Not the exact reviewed final paragraph")
    withdrawn = next(item for item in decision["decisions"] if item["decision"] == "withhold-entire-source-context")
    if withdrawn["sourceRecordId"] != "bupa_3418" or withdrawn["reviewId"] != "detail-c2ded1f6d7f1c5a6fa537550b09d":
        raise ValueError("Unbound context withholding")
    held = next(i for p in packet["patches"] if p["sourceRecordId"] == withdrawn["sourceRecordId"] and p["field"] == "professional_context" for i in p["value"] if i["provenance"]["reviewId"] == withdrawn["reviewId"])
    if hashlib.sha256(held["text"].encode()).hexdigest() != withdrawn["textSha256"]:
        raise ValueError("Withheld source text changed")
    report = prepare(baseline, source, output, findings=[(withdrawn["sourceRecordId"], withdrawn["reviewId"], "flattened-bibliography-source-boundaries-unavailable", r"BackgroundDr Charis Costopoulos|2014J;55:77-9")])
    prepared = load(output / "repairs.json")
    live = next(i for p in prepared["patches"] if p["sourceRecordId"] == source_id and p["field"] == "professional_context" for i in p["value"] if i["provenance"]["reviewId"] == review_id)
    if "segmentationPolicy" in live:
        raise ValueError("Unexpected existing source policy")
    live["segmentationPolicy"] = dict(schemaVersion=1, reviewId=review_id, textSha256=approved["textSha256"], spans=[span])
    save(output / "repairs.json", prepared)
    save(output / "final-projection-review.json", decision)
    policies = [i["segmentationPolicy"] for p in prepared["patches"] if p["field"] == "professional_context" for i in p["value"] if "segmentationPolicy" in i]
    report.update(repairsSha256=digest(output / "repairs.json"), segmentationPolicies=len(policies), reviewedSpans=sum(len(p["spans"]) for p in policies), finalIndependentDecisionSha256=digest(decision_file), status="staged; final source dispositions require independent adapter verification and complete runtime/corpus checks")
    save(output / "report.json", report)
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    for name in ["baseline", "source", "decision-file", "output"]:
        parser.add_argument("--" + name, required=True)
    args = parser.parse_args()
    print(json.dumps(finalize(args.baseline, args.source, args.decision_file, args.output)))

"""Apply independently approved exact paragraph policies and new source holds.

Frozen source packets and review receipts are read-only. No wording is rewritten.
This produces a staged packet, not retrieval or deployment acceptance.
"""
import argparse
import copy
import hashlib
from pathlib import Path
from contain_projection_findings import prepare
from prepare_sources import load, save, digest

FINDINGS = [
    ("bupa_28071", "detail-e4ddad3dfa6bb554922ce5c56c2b", "personal-outside-medicine-and-damaged-source", r"outside medicine|mount kilimanjaro|everest base camp"),
    ("bupa_15885", "detail-5b7c971677963532979494e0790d", "personal-birth-date-and-damaged-source", r"born\s+\d{1,2}\s+[A-Za-z]+\s+\d{4}"),
    ("bupa_21524", "detail-4c15cee1c77f07246b81c390c9c7", "patient-ratings-and-promotional-source", r"4\.86\s*/\s*5|98%\s+satisfaction|\bbottom line\b"),
]


def finalize(baseline, source, reviews, output):
    source, reviews, output = Path(source), Path(reviews), Path(output)
    packet = load(source / "repairs.json")
    contexts = {item["provenance"]["reviewId"]: (patch["sourceRecordId"], item) for patch in packet["patches"] if patch["field"] == "professional_context" for item in patch["value"]}
    policies, receipts, decisions = {}, {}, []
    for filename, reviewname in [("reviewed-segmentation-overlay-v1.json", "reviewed-segmentation-overlay-v1-independent-review-b.json"), ("reviewed-segmentation-overlay-v2-additions.json", "reviewed-segmentation-overlay-v2-additions-independent-review-b.json")]:
        overlay, review = load(reviews / filename), load(reviews / reviewname)
        if overlay["sourcePacketSha256"] != digest(source / "repairs.json") or review["overlaySha256"] != digest(reviews / filename):
            raise ValueError("Overlay or independent review is not bound to this source packet")
        receipts[filename], receipts[reviewname] = digest(reviews / filename), digest(reviews / reviewname)
        judged = {(d["reviewId"], d["spanIndex"]): d for d in review["decisions"]}
        for proposal in overlay["policies"]:
            policy = proposal["segmentationPolicy"]
            record, item = contexts[policy["reviewId"]]
            if record != proposal["sourceRecordId"] or hashlib.sha256(item["text"].encode()).hexdigest() != policy["textSha256"]:
                raise ValueError("Source owner or wording mismatch")
            target = policies.setdefault(policy["reviewId"], {**copy.deepcopy(policy), "spans": []})
            for index, original in enumerate(policy["spans"]):
                decision = judged[(policy["reviewId"], index)]
                if decision["spanSha256"] != hashlib.sha256(original["text"].encode()).hexdigest():
                    raise ValueError("Independent span review hash mismatch")
                decisions.append(decision)
                if decision["decision"] == "withhold-policy-span":
                    continue
                if decision["decision"] == "replace-with-complete-source-context":
                    span = decision["replacementSpan"]
                elif decision["decision"] == "approved-source-bound-context":
                    span = original
                else:
                    raise ValueError("Unapproved paragraph policy")
                if span not in target["spans"]:
                    target["spans"].append(copy.deepcopy(span))
    policies = {key: value for key, value in policies.items() if value["spans"]}
    for policy in policies.values():
        policy["spans"].sort(key=lambda span: span["start"])
        if any(a["end"] > b["start"] for a, b in zip(policy["spans"], policy["spans"][1:])):
            raise ValueError("Overlapping reviewed paragraphs")
    report = prepare(baseline, source, output, findings=FINDINGS)
    repaired = load(output / "repairs.json")
    attached = []
    for patch in repaired["patches"]:
        if patch["field"] != "professional_context":
            continue
        for item in patch["value"]:
            policy = policies.get(item["provenance"]["reviewId"])
            if policy:
                item["segmentationPolicy"] = policy
                attached.append({"sourceRecordId": patch["sourceRecordId"], "reviewId": policy["reviewId"], "textSha256": policy["textSha256"], "spans": len(policy["spans"])})
    if len(attached) != len(policies):
        raise ValueError("A reviewed policy attempted to restore a withheld source")
    save(output / "repairs.json", repaired)
    save(output / "segmentation-policy-receipt.json", dict(schemaVersion=1, receipts=receipts, decisions=decisions, attached=attached, unchangedSourceWording=True, sharedDatabaseWrites=0))
    report.update(repairsSha256=digest(output / "repairs.json"), segmentationPolicies=len(attached), reviewedSpans=sum(p["spans"] for p in attached), segmentationReceiptSha256=digest(output / "segmentation-policy-receipt.json"), status="staged; source claims unchanged, requires adapter/pure preparation/independent verification and complete corpus validation")
    save(output / "report.json", report)
    return report


if __name__ == "__main__":
    import json
    parser = argparse.ArgumentParser()
    for name in ["baseline", "source", "reviews", "output"]:
        parser.add_argument("--" + name, required=True)
    args = parser.parse_args()
    print(json.dumps(finalize(args.baseline, args.source, args.reviews, args.output)))

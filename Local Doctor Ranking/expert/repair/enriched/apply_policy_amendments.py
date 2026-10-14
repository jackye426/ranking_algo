"""Apply reviewed paragraph-boundary amendments in a new immutable packet.

Only segmentationPolicy may change. Source text, ownership, corrections,
exclusions and the rollback packet must remain exactly equal to the input.
"""
import argparse
import copy
import hashlib
import json
from pathlib import Path
from prepare_sources import load, save, digest


def apply(source, review_file, output):
    source, output = Path(source), Path(output)
    if output.exists():
        raise ValueError("Choose a new immutable output directory")
    review = load(review_file)
    if review["sourcePacketSha256"] != digest(source / "repairs.json"):
        raise ValueError("Independent amendment review has another source packet")
    packet = load(source / "repairs.json")
    original = copy.deepcopy(packet)
    contexts = {(p["sourceRecordId"], i["provenance"]["reviewId"]): i for p in packet["patches"] if p["field"] == "professional_context" for i in p["value"]}
    changed = []
    for decision in review["decisions"]:
        if decision["decision"] != "replace-exact-segmentation-policy":
            continue
        item = contexts[(decision["sourceRecordId"], decision["reviewId"])]
        if decision["textSha256"] != hashlib.sha256(item["text"].encode()).hexdigest():
            raise ValueError("Source text does not match the independently reviewed amendment")
        policy = decision["replacementPolicy"]
        if policy["reviewId"] != decision["reviewId"] or policy["textSha256"] != decision["textSha256"]:
            raise ValueError("Amendment policy ownership mismatch")
        item["segmentationPolicy"] = copy.deepcopy(policy)
        changed.append(dict(sourceRecordId=decision["sourceRecordId"], reviewId=decision["reviewId"]))
    if not changed:
        raise ValueError("No independently approved amendments")
    # Removing only display policies must leave every original claim and
    # repair decision identical, not just produce similar rendered wording.
    def without_policy(value):
        result = copy.deepcopy(value)
        for patch in result["patches"]:
            if patch["field"] == "professional_context":
                for item in patch["value"]:
                    item.pop("segmentationPolicy", None)
        return result
    if without_policy(original) != without_policy(packet):
        raise ValueError("A display amendment changed source claims")
    output.mkdir(parents=True)
    (output / "safe-r1").mkdir()
    for filename in ["review-ledger.json", "suppression-ledger.json"]:
        (output / filename).write_bytes((source / filename).read_bytes())
    (output / "safe-r1" / "repairs.json").write_bytes((source / "safe-r1" / "repairs.json").read_bytes())
    save(output / "repairs.json", packet)
    save(output / "segmentation-amendments.json", review)
    policies = [i["segmentationPolicy"] for p in packet["patches"] if p["field"] == "professional_context" for i in p["value"] if "segmentationPolicy" in i]
    report = {**load(source / "report.json"), "previousPacketSha256": digest(source / "repairs.json"), "repairsSha256": digest(output / "repairs.json"), "safeBaselinePacketSha256": digest(output / "safe-r1" / "repairs.json"), "inheritedReceiptDirectory": str(source), "policyAmendments": changed, "independentAmendmentReviewSha256": digest(review_file), "segmentationPolicies": len(policies), "reviewedSpans": sum(len(p["spans"]) for p in policies), "sourceClaimsUnchanged": True, "newSuppressedFields": 0, "omittedSourceContextItems": 0, "omittedReviewIds": [], "status": "staged; independently reviewed display amendments, runtime proof pending"}
    save(output / "report.json", report)
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    for name in ["source", "review-file", "output"]:
        parser.add_argument("--" + name, required=True)
    args = parser.parse_args()
    print(json.dumps(apply(args.source, args.review_file, args.output)))

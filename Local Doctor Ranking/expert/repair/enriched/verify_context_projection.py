"""Verify every approved professional-context item remains source-addressable.

Checks the complete checksum-verified prepared corpus, including deduplicated
provenance. Token coverage is diagnostic, not a substitute for semantic review.
Preserves held/excluded decisions; never treats their withheld evidence as a loss.
"""
import argparse
import hashlib
import json
import re
from collections import Counter, defaultdict
from pathlib import Path


def sha(data):
    return hashlib.sha256(data).hexdigest()


def verify(packet_path, manifest_path, output_path):
    packet_path, manifest_path, output_path = map(Path, (packet_path, manifest_path, output_path))
    if output_path.exists():
        raise ValueError("Use a new report path; preserve prior checks")
    packet_bytes, manifest_bytes = packet_path.read_bytes(), manifest_path.read_bytes()
    packet, manifest = json.loads(packet_bytes), json.loads(manifest_bytes)

    def rows(field):
        count = 0
        for entry in manifest["fields"][field]["segments"]:
            if Path(entry["file"]).name != entry["file"]:
                raise ValueError("Unsafe segment filename")
            data = (manifest_path.parent / entry["file"]).read_bytes()
            if len(data) != entry["bytes"] or sha(data) != entry["sha256"]:
                raise ValueError("Segment checksum mismatch")
            values = json.loads(data)
            assert len(values) == entry["count"]
            count += len(values)
            yield from values
        assert count == manifest["fields"][field]["count"]

    ownership = {}
    for candidate in rows("candidates"):
        for source_id in candidate["sourceRecordIds"]:
            ownership[source_id] = (candidate["id"], candidate["needsIdentityReview"])
    by_key = defaultdict(list)
    for passage in rows("passages"):
        keys = set()
        for source in [passage, *passage.get("sources", [])]:
            if source.get("field", "").startswith("professional_context."):
                review = source.get("repairProvenance", {}).get("reviewId")
                keys.add((source["sourceRecordId"], review, source["field"]))
        for key in keys:
            by_key[key].append((passage["id"], passage["text"]))

    counts = Counter()
    categories = defaultdict(Counter)
    missing, incomplete = [], []
    normalize = lambda text: " ".join(str(text).split())
    # Counting words rather than joining passages avoids treating a safe display
    # newline or sentence split as a changed source fact. Exact fixture checks
    # separately establish source order, negation and short modality preservation.
    tokens = lambda text: Counter(re.findall(r"\w+|[^\w\s]", normalize(text), re.UNICODE))
    for patch in packet["patches"]:
        if patch["field"] != "professional_context":
            continue
        for item in patch["value"]:
            record = patch["sourceRecordId"]
            review = item["provenance"]["reviewId"]
            kind = item["kind"]
            counts["totalAcceptedContextItems"] += 1
            categories[kind]["accepted"] += 1
            candidate, held = ownership.get(record, (None, True))
            if held:
                counts["withheldByIdentity"] += 1
                categories[kind]["withheldByIdentity"] += 1
                continue
            evidence = by_key.get((record, review, "professional_context." + kind), [])
            basis = dict(sourceRecordId=record, candidateId=candidate, kind=kind, reviewId=review, textSha256=sha(item["text"].encode()))
            if not evidence:
                missing.append(basis)
                counts["missingEligibleContextItems"] += 1
                categories[kind]["missing"] += 1
                continue
            counts["representedEligibleContextItems"] += 1
            categories[kind]["represented"] += 1
            remaining = tokens(item["text"]) - tokens(" ".join(text for _, text in evidence))
            if remaining:
                incomplete.append({**basis, "missingTokens": dict(remaining), "evidenceIds": [eid for eid, _ in evidence]})
                categories[kind]["tokenCoverageNeedsReview"] += 1
            else:
                counts["fullTokenCoverageItems"] += 1
    result = dict(schemaVersion=1, purpose="Complete source-context projection coverage; diagnostic token check, not semantic approval", packetSha256=sha(packet_bytes), manifestSha256=sha(manifest_bytes), dataReleaseId=packet["releaseId"], corpusVersion=manifest["metadata"]["version"], counts=dict(counts), categories={k: dict(v) for k, v in categories.items()}, missing=missing, tokenCoverageNeedsReview=incomplete, sourceMutation=False, networkCalls=0, modelCalls=0, passed=not missing and not incomplete)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"passed": result["passed"], **dict(counts), "tokenCoverageNeedsReview": len(incomplete), "output": str(output_path)}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--packet", required=True)
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    print(json.dumps(verify(args.packet, args.manifest, args.output)))

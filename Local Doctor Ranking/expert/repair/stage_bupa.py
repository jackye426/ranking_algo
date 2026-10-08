"""Offline staged repair packets. Original HTML/data are always opened read-only.

No scraper/importer imports, model calls, database writes or network requests.
All review labels distinguish deterministic comparisons from human review.
"""
from __future__ import annotations
import argparse
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
import csv
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import random
import re
import shutil
import time
import ijson

from bupa_parser import (FIELD_HEADINGS, PARSER_VERSION, MOJIBAKE, canonical_json,
                         collapse, hash_value, normalized_name, parse_snapshot)

SOURCE_SHA = "f1af82cf966703e1d58abc833892386210629c98b69298e8033736bce8a84f7d"
MANDATORY_HOLDS = {"bupa_6445", "bupa_26882", "bupa_22318"}
TARGETS = {"bupa_10089", "bupa_10092", "bupa_10012"}
SEED = 20261008
FIELDS = tuple(FIELD_HEADINGS)


def file_hash(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for block in iter(lambda: stream.read(8 * 1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def write_json(path, value):
    Path(path).write_text(json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2), encoding="utf-8")


def row_id(index):
    return f"bupa_{index}"


def historical_conflicts(csv_path, branch_path):
    """Same narrow seven-digit disagreement predicate as the audited URL branch.

    Only public professional identifiers and existing links enter this join; no
    contacts, Reddit material or other record fields are retained or exported.
    """
    by_url = defaultdict(set)
    csv.field_size_limit(16 * 1024 * 1024)
    with Path(csv_path).open(encoding="utf-8-sig", newline="") as stream:
        for row in csv.DictReader(stream):
            url = (row.get("bupa_url") or row.get("bupa_profile_url") or "").strip()
            gmc = (row.get("gmc_number") or "").strip()
            if url:
                by_url[url].add(gmc)
    conflicts = set()
    with Path(branch_path).open("rb") as stream:
        for row in ijson.items(stream, "records.item"):
            url = row.get("bupa_url") or row.get("bupa_profile_url") or ""
            gmc = str(row.get("gmc_number") or "")
            prior = by_url.get(url, set())
            if (re.fullmatch(r"\d{7}", gmc) and prior and
                    all(re.fullmatch(r"\d{7}", value) and value != gmc for value in prior)):
                conflicts.add(row["id"])
    return sorted(conflicts)


def snapshot_name(row):
    return str(row.get("html_snapshot") or "").replace("\\", "/").rsplit("/", 1)[-1]


def choose_pilot(profiles, conflicts):
    """40 explicit risk selections, followed by 60 seeded random controls."""
    chosen = []
    reasons = {}
    def add(index, reason):
        if index not in reasons and len(chosen) < 40:
            chosen.append(index)
            reasons[index] = reason
    for index in [10089, 10092, 10012, 6445, 26882]:
        add(index, "named-regression-or-mandatory-hold")
    for rid in conflicts[:5]:
        if rid.startswith("bupa_"):
            add(int(rid.split("_")[1]), "historical-url-conflict")
    pools = [
        ("encoding-indicator", [i for i, r in enumerate(profiles) if MOJIBAKE.search(" ".join(str(r.get(k) or "") for k in FIELDS))]),
        ("fragment-indicator", [i for i, r in enumerate(profiles) if len(re.findall(r"[a-z]{1,4};\s+[a-z]{1,5}\b", str(r.get("clinical_interests") or ""))) >= 4]),
        ("long-biography", sorted(range(len(profiles)), key=lambda i: len(str(profiles[i].get("about") or "")), reverse=True)),
    ]
    for reason, pool in pools:
        added = 0
        for index in pool:
            before = len(chosen)
            add(index, reason)
            added += len(chosen) > before
            if added == 10 or len(chosen) == 40:
                break
    for index in range(len(profiles)):
        add(index, "risk-pool-fill")
        if len(chosen) == 40:
            break
    controls = random.Random(SEED).sample([i for i in range(len(profiles)) if i not in reasons], 60)
    reasons.update({index: "seeded-control" for index in controls})
    return chosen + controls, reasons


def evaluate_row(index, frozen, baseline, parsed, conflicts):
    rid = row_id(index)
    outcome = {"sourceRecordId": rid, "sourceArrayIndex": index, "snapshotFile": snapshot_name(frozen),
        "snapshotSha256": parsed.get("snapshotSha256"), "name": frozen.get("name") or "", "fields": {},
        "review": {"kind": "deterministic-source-comparison", "humanReviewed": False}}
    global_reasons = []
    if rid in MANDATORY_HOLDS:
        global_reasons.append("mandatory-identity-hold")
    outcome["historicalUrlConflict"] = rid in conflicts
    global_reasons.extend(parsed.get("errors", []))
    if baseline is None:
        global_reasons.append("missing-baseline-record")
    else:
        name = normalized_name(frozen.get("name"))
        if not name or name != normalized_name(baseline.get("name")) or name != normalized_name(parsed.get("name")):
            global_reasons.append("source-name-binding-failed")
        fg = str(frozen.get("gmc_number") or "").strip()
        bg = str(baseline.get("gmc_number") or "").strip()
        hg = parsed.get("gmcNumbers", [])
        if fg and (fg != bg or hg != [fg]):
            global_reasons.append("source-gmc-binding-failed")
        elif not fg and hg:
            global_reasons.append("unexpected-snapshot-gmc")
    outcome["identityChecks"] = {"frozenNameEqualsBaseline": baseline is not None and normalized_name(frozen.get("name")) == normalized_name(baseline.get("name")),
        "snapshotNameEqualsFrozen": normalized_name(frozen.get("name")) == normalized_name(parsed.get("name")),
        "frozenGmcPresent": bool(frozen.get("gmc_number")), "snapshotGmcCount": len(parsed.get("gmcNumbers", []))}
    provider_ids = parsed.get("providerIds", [])
    outcome["storedUrlMetadata"] = {"providerIdCount": len(provider_ids), "present": bool(provider_ids)}
    patches, holds = [], []
    if global_reasons:
        outcome.update(status="held", reasons=sorted(set(global_reasons)))
        if rid in MANDATORY_HOLDS:
            holds.append({"sourceRecordId": rid, "reason": "; ".join(outcome["reasons"])})
        return outcome, patches, holds
    for field, heading in FIELD_HEADINGS.items():
        before = baseline.get(field)
        old = frozen.get(field)
        section = parsed.get("sections", {}).get(heading)
        record = {"beforeHash": hash_value(before), "frozenValueHash": hash_value(old)}
        reasons = []
        if before != old:
            reasons.append("baseline-field-not-frozen-bupa-value")
        if section is None:
            if old:
                reasons.append("missing-source-section")
            record.update(status="held" if reasons else "unchanged", reasons=reasons)
            outcome["fields"][field] = record
            continue
        reasons.extend(section.get("errors", []))
        legacy = section.get("legacy", {}).get(field)
        if legacy is None or legacy != old:
            # Null/empty is not enough to fill a missing source field: absence
            # may reflect a previous exclusion and needs its own approval.
            reasons.append("legacy-html-reproduction-mismatch")
        record.update(sourceLine=section.get("sourceLine"), locator=section.get("locator"), checks=section.get("checks", {}),
                      sectionHtmlSha256=section.get("sectionHtmlSha256"), legacyBranch=section.get("legacy", {}).get("legacyBranch"))
        new_text = section.get("text", "")
        if not new_text:
            reasons.append("empty-recovery")
        if reasons:
            record.update(status="held", reasons=sorted(set(reasons)))
            outcome["fields"][field] = record
            continue
        # Keep a contextual source section together. Do not infer comma or
        # semicolon item boundaries; the original punctuation remains literal.
        after = [new_text] if field == "areas_of_interest" else new_text
        material_before = "; ".join(before) if isinstance(before, list) else before
        if material_before == new_text or ("\n" not in new_text and collapse(material_before) == collapse(new_text)):
            record.update(status="unchanged", reasons=[])
        else:
            review_id = "bupa-review-" + hash_value([rid, field, parsed["snapshotSha256"], PARSER_VERSION])[:24]
            # Source URL is evidence metadata only, never a profile identity
            # URL. Require matching typed GMC as well as the snapshot/name join.
            source_url = None
            typed_matches = []
            for body, field_name in [("GMC", "gmc_number"), ("HCPC", "hcpc_number"), ("GDC", "gdc_number")]:
                value = str(baseline.get(field_name) or "").replace(" ", "").upper()
                if value and parsed.get("typedRegistrations", {}).get(body) == [value]:
                    typed_matches.append(body)
            if len(provider_ids) == 1 and typed_matches:
                source_url = "https://www.finder.bupa.co.uk/Consultant/view/" + provider_ids[0] + "/"
            if not source_url:
                record.update(status="held", reasons=["no-typed-identity-bound-evidence-url"])
                outcome["fields"][field] = record
                continue
            provenance = {"sourceUrl": source_url, "sourceLabel": "Bupa saved professional profile",
                "sourceDate": None, "observedAt": None, "snapshotSha256": parsed["snapshotSha256"],
                "parserVersion": PARSER_VERSION, "reviewId": review_id}
            patch = {"sourceRecordId": rid, "field": field, "beforeHash": hash_value(before),
                "value": after, "provenance": provenance, "approved": True}
            patches.append(patch)
            record.update(status="proposed", reasons=[], afterHash=hash_value(after), reviewId=review_id,
                          characterCount=len(new_text), changedBoundaryCount=new_text.count("\n"),
                          urlVerification="stored-print-route-only-not-live-verified", typedIdentityBodies=typed_matches)
        outcome["fields"][field] = record
    field_statuses = [item["status"] for item in outcome["fields"].values()]
    outcome["status"] = "proposed-with-field-holds" if patches and "held" in field_statuses else "proposed" if patches else "held" if "held" in field_statuses else "unchanged"
    outcome["reasons"] = sorted({reason for item in outcome["fields"].values() for reason in item.get("reasons", [])})
    # Field-level data-quality holds are audit outcomes, not identity flags.
    # Only the explicitly agreed source-record identity holds enter the packet.
    return outcome, patches, holds


def source_review_packet(outcome, patches, parsed, selection):
    # Professional subtrees only; contact-flagged sections are never copied.
    sections = {heading: {"sourceLine": section.get("sourceLine"), "text": section.get("text"),
        "serializedSourceMarkup": section.get("sourceMarkup"), "legacyReproduction": section.get("legacy"),
        "checks": section.get("checks"), "errors": section.get("errors"),
        "sectionHtmlSha256": section.get("sectionHtmlSha256")}
        for heading, section in parsed.get("sections", {}).items() if not {"contact-content", "personal-content"}.intersection(section.get("errors", []))}
    return {"sourceRecordId": outcome["sourceRecordId"], "selection": selection, "name": outcome["name"],
        "snapshotFile": outcome["snapshotFile"], "snapshotSha256": outcome["snapshotSha256"],
        "reviewKind": "automated-direct-source-comparison", "humanReviewed": False,
        "identityChecks": outcome["identityChecks"], "sections": sections,
        "fieldOutcomes": outcome["fields"], "proposedFields": [p["field"] for p in patches]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("baseline", "source-json", "source-jsonl", "snapshots", "backup-manifest", "conflicts", "output-dir", "release-id"):
        parser.add_argument("--" + name, required=True)
    parser.add_argument("--phase", choices=("pilot", "full"), required=True)
    parser.add_argument("--provisional", action="store_true", help="Input is an audited cache, pending comparison with a fresh reader baseline")
    parser.add_argument("--workers", type=int, default=4)
    args = parser.parse_args()
    started = time.monotonic()
    baseline_path, source_path, snapshot_root = Path(args.baseline), Path(args.source_json), Path(args.snapshots)
    output = Path(args.output_dir)
    if not all(Path(p).is_file() for p in [args.baseline, args.source_json, args.source_jsonl, args.conflicts]) or not snapshot_root.is_dir():
        raise SystemExit("All input files and the snapshot directory must exist with the declared type")
    if not Path(args.backup_manifest).is_file():
        raise SystemExit("An existing independent-backup completion manifest is required")
    backup = json.loads(Path(args.backup_manifest).read_text(encoding="utf-8-sig"))
    complete_inventory = (isinstance(backup.get("files"), list) and backup.get("count", 0) > 0 and
                          backup["count"] == len(backup["files"]) and all(item.get("sha256") for item in backup["files"]))
    if backup.get("status") != "complete" and not complete_inventory:
        raise SystemExit("A complete checksummed backup inventory is required")
    backup_snapshots = {str(item["path"]).replace("\\", "/").rsplit("/", 1)[-1]: item["sha256"]
        for item in backup.get("files", []) if "/BUPA/data/html_snapshots/" in str(item["path"]).replace("\\", "/")}
    if len(backup_snapshots) != 37358:
        raise SystemExit("Backup manifest must account for the complete 37,358 current Bupa snapshots")
    if output.exists() or output.resolve().is_relative_to(snapshot_root.resolve()):
        raise SystemExit("Output must be a new directory outside the original snapshots")
    if file_hash(source_path) != SOURCE_SHA:
        raise SystemExit("Frozen source array hash disagrees; positional IDs cannot be reused")
    baseline_sha = file_hash(baseline_path)
    baseline_envelope = json.loads(baseline_path.read_text(encoding="utf-8"))
    rows = baseline_envelope["rows"]
    baseline = {str(row["id"]): row for row in rows}
    if len(baseline) != len(rows):
        raise SystemExit("Duplicate baseline record IDs")
    profiles = json.loads(source_path.read_text(encoding="utf-8"))["profiles"]
    if len(profiles) != 37195:
        raise SystemExit("Frozen source row count disagrees")
    conflict_data = json.loads(Path(args.conflicts).read_text(encoding="utf-8"))
    conflicts = set(conflict_data["sourceRecordIds"])
    if len(conflicts) != 37:
        raise SystemExit("Expected the independently audited 37 historical URL conflicts")
    pilot, selection_reasons = choose_pilot(profiles, sorted(conflicts))
    indices = pilot if args.phase == "pilot" else list(range(len(profiles)))
    followup = set(random.Random(SEED + 1).sample([i for i in range(len(profiles)) if i not in set(pilot)], 200)) if args.phase == "full" else set()
    review_indices = set(pilot) | followup
    output.mkdir(parents=True, exist_ok=False)
    (output / "baseline").mkdir()
    shutil.copyfile(baseline_path, output / "baseline" / "raw.json")
    manifest_info = {"baselineSha256": baseline_sha, "sourceArraySha256": SOURCE_SHA,
        "backupManifestSha256": file_hash(args.backup_manifest), "parserVersion": PARSER_VERSION,
        "parserSha256": file_hash(Path(__file__).with_name("bupa_parser.py")), "stagerSha256": file_hash(__file__),
        "phase": args.phase, "provisionalBaseline": args.provisional, "baselineFetchedAt": baseline_envelope.get("fetchedAt"),
        "selectionSeed": SEED, "selection": {row_id(i): selection_reasons.get(i, "followup-seeded" if i in followup else "full-census") for i in indices if i in review_indices}}
    write_json(output / "run-inputs.json", manifest_info)
    patches, holds = [], []
    counts = Counter()
    field_counts = defaultdict(Counter)
    references = Counter(snapshot_name(p) for p in profiles)
    def read(index):
        filename = snapshot_name(profiles[index])
        path = snapshot_root / filename
        if not filename or not path.is_file() or path.resolve().parent != snapshot_root.resolve():
            return index, {"errors": ["missing-or-unsafe-snapshot-path"]}
        parsed = parse_snapshot(path.read_bytes())
        if parsed.get("snapshotSha256") != backup_snapshots.get(filename):
            parsed.setdefault("errors", []).append("snapshot-backup-hash-mismatch")
        return index, parsed
    with (output / "row-outcomes.jsonl").open("w", encoding="utf-8") as outcomes_file, (output / "source-reviews.jsonl").open("w", encoding="utf-8") as review_file:
        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            for batch_start in range(0, len(indices), 1000):
                batch = indices[batch_start:batch_start + 1000]
                for index, parsed in pool.map(read, batch):
                    outcome, proposed, rejected = evaluate_row(index, profiles[index], baseline.get(row_id(index)), parsed, conflicts)
                    patches.extend(proposed)
                    holds.extend(rejected)
                    counts[outcome["status"]] += 1
                    counts["rows"] += 1
                    counts["rowsWithoutUrlMetadata"] += not outcome["storedUrlMetadata"]["present"]
                    for field, record in outcome["fields"].items():
                        field_counts[field][record["status"]] += 1
                        for reason in record.get("reasons", []):
                            field_counts[field]["reason:" + reason] += 1
                    outcomes_file.write(canonical_json(outcome) + "\n")
                    if index in review_indices:
                        review = source_review_packet(outcome, proposed, parsed, selection_reasons.get(index, "followup-seeded"))
                        review_file.write(canonical_json(review) + "\n")
                        counts["directSourceComparisonReviews"] += 1
                print(json.dumps({"processed": counts["rows"], "total": len(indices), "proposedFields": len(patches), "elapsedSeconds": round(time.monotonic() - started, 1)}), flush=True)
                outcomes_file.flush()
                review_file.flush()
    invalid = []
    nonempty = valid = 0
    with Path(args.source_jsonl).open(encoding="utf-8", errors="strict") as stream:
        for physical_line, line in enumerate(stream, 1):
            if not line.strip():
                continue
            nonempty += 1
            try:
                json.loads(line)
                valid += 1
            except json.JSONDecodeError as error:
                invalid.append({"physicalLine": physical_line, "nonemptyLine": nonempty, "reason": error.msg, "column": error.colno,
                    "lineSha256": hashlib.sha256(line.encode("utf-8")).hexdigest(), "status": "held-malformed-original-no-positional-reindex"})
    filenames = {p.name for p in snapshot_root.glob("*.html")}
    accounting = {"sourceRows": len(profiles), "jsonlNonemptyLines": nonempty, "jsonlValidLines": valid,
        "invalidJsonlLines": invalid, "uniqueReferencedSnapshots": len(references),
        "duplicateSnapshotReferences": [{"snapshotFile": name, "rowIndices": [i for i, p in enumerate(profiles) if snapshot_name(p) == name], "status": "retained-existing-mapping"} for name, n in references.items() if n > 1],
        "duplicateReferenceExtraRows": sum(n - 1 for n in references.values()),
        "orphanSnapshots": [{"snapshotFile": name, "status": "held-unmapped-not-imported"} for name in sorted(filenames - references.keys())],
        "missingReferencedSnapshots": sorted(references.keys() - filenames), "historicalUrlConflictCount": len(conflicts)}
    write_json(output / "source-accounting.json", accounting)
    repairs = {"schemaVersion": 1, "releaseId": args.release_id, "baselineSha256": baseline_sha, "patches": patches, "holds": holds}
    # A bounded pilot may not sample a separately confirmed identity conflict;
    # its release still carries every explicitly required hold.
    present_holds = {item["sourceRecordId"] for item in holds}
    for rid in sorted(MANDATORY_HOLDS - present_holds):
        if rid not in baseline:
            raise SystemExit("Mandatory identity hold absent from baseline")
        holds.append({"sourceRecordId": rid, "reason": "mandatory-confirmed-identity-hold"})
    write_json(output / "repairs.json", repairs)
    manifest = {"schemaVersion": 1, "releaseId": args.release_id, "projectionVersion": "expert-repair-v1",
        "baseline": {"path": "baseline/raw.json", "sha256": baseline_sha},
        "repairs": {"path": "repairs.json", "sha256": file_hash(output / "repairs.json")}}
    write_json(output / "manifest.json", manifest)
    summary = {"phase": args.phase, "provisionalBaseline": args.provisional, "counts": dict(counts), "fields": {k: dict(v) for k, v in field_counts.items()},
        "proposedPatches": len(patches), "holdEntries": len(holds), "humanReviewed": False,
        "reviewMethod": "Automated direct HTML comparison with strict field lineage, character and boundary conservation; not human approval",
        "elapsedSeconds": round(time.monotonic() - started, 2),
        "accounting": {"invalidJsonl": len(invalid), "duplicateExtraRows": accounting["duplicateReferenceExtraRows"], "orphanSnapshots": len(accounting["orphanSnapshots"]), "missingReferencedSnapshots": len(accounting["missingReferencedSnapshots"])}}
    write_json(output / "summary.json", summary)
    print(json.dumps(summary, indent=2), flush=True)


if __name__ == "__main__":
    main()

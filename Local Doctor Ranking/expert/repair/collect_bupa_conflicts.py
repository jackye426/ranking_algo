"""Extract only the audited historical URL-conflict IDs; no source edits."""
import argparse
from pathlib import Path
from stage_bupa import historical_conflicts, write_json, file_hash

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--csv", required=True)
    parser.add_argument("--branch", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    output = Path(args.output)
    if output.exists():
        raise SystemExit("Refusing to overwrite conflict evidence")
    ids = historical_conflicts(args.csv, args.branch)
    if len(ids) != 37:
        raise SystemExit(f"Conflict count changed: {len(ids)}; requires reconciliation")
    output.parent.mkdir(parents=True, exist_ok=True)
    write_json(output, {"sourceRecordIds": ids, "count": len(ids), "csvSha256": file_hash(args.csv),
        "branchSha256": file_hash(args.branch), "rule": "same linked historical URL, all source GMCs differ, both sides seven digits",
        "status": "held-historical-registration-conflict-not-used-for-new-url-recovery"})
    print(f"Recorded {len(ids)} historical URL conflicts; no contact fields exported")

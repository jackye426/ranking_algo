"""Prepare source-bound workflow specimens, not retrieval acceptance labels.

All professional evidence stays in the private output directory. Reads a
checksum-verified segmented corpus one segment at a time, preserving exact
passages and their source receipts. No network, models, database or ranking.
"""
import argparse
import hashlib
import json
from pathlib import Path


def digest(data):
    return hashlib.sha256(data).hexdigest()


def read(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def specifications():
    # Source selectors, not expected ranks or a held-out evaluation set.
    return [
        dict(id="biography-source-date", record="bupa_31942", kind="biography", contains="Endovascular Aneurysm Repair", section="about", categories=["biography", "PHIN-source-date"], request="Vascular surgeons with experience in endovascular aneurysm repair", intendedUse="Documented professional activity and dated source background", limit="The PHIN date is a source-reported profile update; it is not the activity reporting period, current-practice verification or availability."),
        dict(id="qualification-profession", record="bupa_33673", kind="qualification", contains="Speech and Language Therapy BSc (Hons)", section="qualifications", categories=["qualification", "non-doctor-profession"], request="Speech and language therapists interested in developmental language disorder", intendedUse="Intact qualification and professional context while assessing clinical interests", limit="This source qualification is not current registration verification. Profession must come from the attributable professional record, never an assumed GMC identity."),
        dict(id="clinical-interest-condition", record="bupa_1529", kind="clinical-interest", contains="Heart Muscle Disease/Cardiomyopathy", section="clinicalInterests", categories=["clinical-interest", "condition"], request="Cardiologists with interests in cardiomyopathy", intendedUse="Direct support for an interest/topic request", limit="A listed subspecialty or condition does not establish a procedure performed, its volume or its currentness.", additional=[dict(kind="condition", contains="Cardiomyopathy")]),
        dict(id="procedure-listing", record="bupa_1585", kind="recorded-procedure", contains="Hysteroscopic Resection of Fibroids", section="procedures", categories=["recorded-procedure"], request="Gynaecologists with experience in hysteroscopic resection of fibroids", intendedUse="Specific procedure discovery, visibly distinguished from an explicit performed-activity statement", limit="A recorded procedure listing is not an observed procedure count or proof of recent performance."),
        dict(id="treatment-listing", record="circle_0", kind="treatment-listing", contains="Extracorporeal shockwave therapy", section="procedures", categories=["treatment-listing"], request="Physiotherapists interested in extracorporeal shockwave therapy", intendedUse="Treatment-topic discovery and background", limit="A generic provider Treatments list is not promoted to documented performed activity."),
        dict(id="language-proficiency", record="bupa_22062", kind="language", contains="Portuguese - Fluent", section="languages", categories=["language", "proficiency"], request="Orthopaedic surgeons who speak Portuguese fluently", intendedUse="Requested language and exact recorded proficiency", limit="Retain Fluent because this source says it; never add fluency to unqualified language listings."),
        dict(id="consultation-service", record="bupa_6908", kind="service", contains="Video and telephone consultations", section="services", categories=["consultation-service"], request="Haematologists offering video consultations", intendedUse="Explicit requested consultation format", limit="A listed service does not establish present availability or clinical experience beyond the separate clinical evidence."),
        dict(id="population", record="bupa_6473", kind="population", contains="Paediatric", section="populations", categories=["population"], request="Paediatric allergy specialists", intendedUse="Explicit recorded patient population alongside separately sourced clinical interests", limit="A general paediatric age-group field does not prove paediatric use of every procedure mentioned elsewhere."),
        dict(id="industry-service", record="bda_1", kind="service", contains="Product development", section="services", categories=["industry-service"], request="Dietitians offering food-industry services such as product development", intendedUse="Source-listed service background useful for locating a professional with relevant offerings", limit="Product development is a recorded service; it is not regulatory expertise, clinical qualification or manufacturer independence."),
        dict(id="literal-industry-service", record="bda_1", kind="service", contains="Product development", section="services", categories=["industry-service"], request="Professionals offering product development", intendedUse="An exact requested offering can use its attributable service listing without inventing a professional role or a broader industry alias", limit="This positive service probe is separate from the preserved original broader-query failure. A service listing does not establish current availability, regulatory expertise or registered dietitian status."),
        dict(id="professional-body", record="bupa_777", kind="professional-body", contains="Royal College of Radiologists, BMA", section="about", categories=["professional-body"], request="Radiologists interested in musculoskeletal imaging", intendedUse="Optional professional background after clinical discovery", limit="A mixed professional-body list is not independently verified membership or current registration; it must not satisfy imaging practice."),
        dict(id="academic-background", record="bupa_777", kind="academic-background", contains="fellowship in musculoskeletal imaging", section="qualifications", categories=["academic-background"], request="Radiologists interested in musculoskeletal imaging", intendedUse="Recorded academic/training context relevant to a topic request", limit="The source section remains neutral academic background; its historical fellowship does not establish current reporting activity."),
        dict(id="affiliation", record="bupa_818", kind="affiliation", contains="Consultant Gastroenterologist/Hepatologist, Ipswich Hospital NHS Trust", section="affiliations", categories=["affiliation"], request="Gastroenterologists with experience in hepatology", intendedUse="Recorded organisational role as supporting professional context", limit="An undated role listing is not verification of a current appointment, availability or independence."),
        dict(id="research-background", record="nuffield_240", kind="research-background", contains="A 10% increase in step rate", section="research", categories=["research-background"], request="Physiotherapists interested in running biomechanics research", intendedUse="A source-reported bibliography provides a research-topic lead for review", limit="The bibliography is not independently verified authorship, study participation, appraisal competence or an exact trial role."),
        dict(id="research-interest", record="bupa_2587", kind="biography", contains="My research interests are in arrhythmias", section="about", categories=["research-interest"], request="Cardiologists with research interests in atrial fibrillation", intendedUse="An explicit research-interest statement can support an interest request", limit="Research interest does not establish study leadership, methods experience or participation in a particular trial."),
    ]


def prepare(manifest_path, packet_path, ledger_path, output):
    output = Path(output)
    if output.exists():
        raise ValueError("Use a new output directory; do not overwrite specimen receipts")
    manifest_path = Path(manifest_path)
    manifest = read(manifest_path)
    specs = specifications()
    records = {spec["record"] for spec in specs}

    def segments(field):
        for descriptor in manifest["fields"][field]["segments"]:
            path = manifest_path.parent / descriptor["file"]
            data = path.read_bytes()
            if len(data) != descriptor["bytes"] or digest(data) != descriptor["sha256"]:
                raise ValueError("Corpus segment checksum mismatch")
            for row in json.loads(data):
                yield row

    candidates = {c["id"]: c for c in segments("candidates") if records.intersection(c["sourceRecordIds"])}
    if any(c["needsIdentityReview"] for c in candidates.values()):
        raise ValueError("A utility example belongs to a held identity")
    passages = {candidate_id: [] for candidate_id in candidates}
    for passage in segments("passages"):
        if passage["candidateId"] in passages:
            passages[passage["candidateId"]].append(passage)
    ledger = {row["reviewId"]: row for row in read(ledger_path)}
    packet = read(packet_path)
    contexts = {}
    for patch in packet["patches"]:
        if patch["field"] == "professional_context" and patch["sourceRecordId"] in records:
            for item in patch["value"]:
                contexts[item["provenance"]["reviewId"]] = {"sourceRecordId": patch["sourceRecordId"], **item}
    result = []
    for spec in specs:
        candidate = next(c for c in candidates.values() if spec["record"] in c["sourceRecordIds"])
        pool = passages[candidate["id"]]
        selected = []
        for selector in [spec, *spec.get("additional", [])]:
            matches = [e for e in pool if e["sourceRecordId"] == spec["record"] and e["field"] == "professional_context." + selector["kind"] and selector["contains"].casefold() in e["text"].casefold()]
            if not matches:
                raise ValueError("No source-bound passage for " + spec["id"])
            selected.append(min(matches, key=lambda e: (len(e["text"]), e["id"])))
        receipts = []
        for evidence in selected:
            review_id = evidence["repairProvenance"]["reviewId"]
            source = contexts[review_id]
            if source["sourceRecordId"] != evidence["sourceRecordId"]:
                raise ValueError("Source owner mismatch")
            normalized = " ".join(source["text"].split())
            for line in evidence["text"].splitlines():
                if " ".join(line.split()) not in normalized:
                    raise ValueError("Prepared evidence differs from exact source context")
            receipts.append({"reviewId": review_id, "acceptedSourceItem": source, "newSourceLedger": ledger.get(review_id), "sourceTextSha256": digest(source["text"].encode()), "sourceGeneration": "R3-new" if review_id in ledger else "R2-inherited"})
        result.append({**spec, "candidateId": candidate["id"], "candidate": candidate, "selectedEvidence": selected, "allCandidateEvidence": pool, "sourceReceipts": receipts, "workflowStatus": "prepared-source-and-projection-proof; retrieval and hosted proof pending"})
    output.mkdir(parents=True)
    artifact = {"schemaVersion": 1, "purpose": "Field-use demonstrations, not acceptance labels or a ranked relevance set", "dataReleaseId": packet["releaseId"], "corpusVersion": manifest["metadata"]["version"], "packetSha256": digest(Path(packet_path).read_bytes()), "corpusManifestSha256": digest(manifest_path.read_bytes()), "corpusSha256": manifest["sourceCorpusSha256"], "cases": result}
    (output / "source-workflow-cases.json").write_text(json.dumps(artifact, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"cases": len(result), "candidates": len(candidates), "selectedEvidence": sum(len(c["selectedEvidence"]) for c in result), "categories": sorted({k for c in result for k in c["categories"]}), "output": str(output)}


if __name__ == "__main__":
    cli = argparse.ArgumentParser()
    for name in ["manifest", "packet", "ledger", "output"]:
        cli.add_argument("--" + name, required=True)
    args = cli.parse_args()
    print(json.dumps(prepare(args.manifest, args.packet, args.ledger, args.output)))

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import contain_projection_findings as C
from prepare_sources import hash_value


class ProjectionContainment(unittest.TestCase):
    def fixture(self, root, previous_patch=False):
        source = root / "old"
        (source / "safe-r1").mkdir(parents=True)
        record = {"id": "source-one", "name": "Dr Example", "about": "Original damaged source" if previous_patch else "Patient feedback: testimonial text.", "about_alternatives": {"phin": "Patient feedback: testimonial text.", "spire": "Recorded cardiac CT practice."}}
        provenance = {"reviewId": "review-one", "sourceField": "About", "snapshotSha256": "b" * 64}
        unsafe = {"kind": "biography", "text": "Patient feedback: testimonial text.", "provenance": provenance}
        good = {"kind": "qualification", "text": "MD", "provenance": {**provenance, "reviewId": "review-safe"}}
        context = {"sourceRecordId": record["id"], "field": "professional_context", "beforeHash": hash_value(None), "value": [unsafe, good], "approved": True}
        old_patch = {"sourceRecordId": record["id"], "field": "about", "value": unsafe["text"], "approved": True, "beforeHash": hash_value(record["about"]), "provenance": provenance}
        packet = {"schemaVersion": 2, "releaseId": "test-r3", "holds": [{"sourceRecordId": "held", "reason": "Identity uncertainty"}], "suppressions": [], "patches": [context] + ([old_patch] if previous_patch else [])}
        baseline = root / "raw.json"
        baseline.write_text(json.dumps({"rows": [record]}), encoding="utf-8")
        (source / "repairs.json").write_text(json.dumps(packet), encoding="utf-8")
        (source / "safe-r1" / "repairs.json").write_text(json.dumps({**packet, "releaseId": "safe-r1", "patches": [old_patch] if previous_patch else []}), encoding="utf-8")
        (source / "review-ledger.json").write_text(json.dumps([{"reviewId": "review-one"}, {"reviewId": "review-safe"}]), encoding="utf-8")
        return baseline, source, record, good

    def prepare(self, baseline, source, out):
        with patch.object(C, "FINDINGS", [("source-one", "review-one", "patient-testimonials", r"patient feedback\s*:")]):
            return C.prepare(baseline, source, out)

    def test_source_withholding_preserves_inputs_other_context_and_holds(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            baseline, source, record, good = self.fixture(root)
            raw_before, packet_before = baseline.read_bytes(), (source / "repairs.json").read_bytes()
            out = root / "new"
            result = self.prepare(baseline, source, out)
            prepared = json.loads((out / "repairs.json").read_text())
            self.assertEqual(prepared["patches"][0]["value"], [good])
            self.assertEqual({item["field"] for item in prepared["suppressions"]}, {"about", "about_alternatives.phin"})
            self.assertEqual(prepared["holds"], json.loads(packet_before)["holds"])
            self.assertEqual(baseline.read_bytes(), raw_before)
            self.assertEqual((source / "repairs.json").read_bytes(), packet_before)
            self.assertEqual(result["omittedSourceContextItems"], 1)

    def test_rejected_old_patch_cannot_leave_original_wording_or_rollback_patch_live(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            baseline, source, record, _ = self.fixture(root, previous_patch=True)
            out = root / "new"
            result = self.prepare(baseline, source, out)
            prepared = json.loads((out / "repairs.json").read_text())
            safe = json.loads((out / "safe-r1" / "repairs.json").read_text())
            self.assertTrue(all(item["field"] != "about" for item in prepared["patches"]))
            self.assertEqual(safe["patches"], [])
            self.assertEqual(safe["suppressions"], prepared["suppressions"])
            exclusion = next(item for item in prepared["suppressions"] if item["field"] == "about")
            self.assertEqual(exclusion["beforeHash"], hash_value(record["about"]))
            self.assertEqual(result["withdrawnEarlierPatches"], [{"sourceRecordId": record["id"], "field": "about"}])

    def test_wrong_review_or_marker_fails_before_creating_new_packet(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            baseline, source, _, _ = self.fixture(root)
            packet_file = source / "repairs.json"
            packet = json.loads(packet_file.read_text())
            packet["patches"][0]["value"][0]["text"] = "A changed source no longer has the reviewed marker."
            packet_file.write_text(json.dumps(packet))
            with self.assertRaisesRegex(ValueError, "binding no longer matches"):
                self.prepare(baseline, source, root / "new")
            self.assertFalse((root / "new").exists())

    def test_existing_packet_directory_is_never_overwritten(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            baseline, source, _, _ = self.fixture(root)
            before = (source / "repairs.json").read_bytes()
            with self.assertRaisesRegex(ValueError, "immutable output"):
                self.prepare(baseline, source, source)
            self.assertEqual((source / "repairs.json").read_bytes(), before)


if __name__ == "__main__":
    unittest.main()

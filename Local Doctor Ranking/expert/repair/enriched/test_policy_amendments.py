import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from apply_policy_amendments import apply
from prepare_sources import save, digest


class PolicyAmendments(unittest.TestCase):
    def fixture(self, root):
        source = root / "source"
        (source / "safe-r1").mkdir(parents=True)
        text = "Recorded qualification\n\nFRCS 1990"
        source_hash = hashlib.sha256(text.encode()).hexdigest()
        packet = dict(holds=[{"sourceRecordId": "held-person"}], suppressions=[{"sourceRecordId": "source-one", "field": "about"}], patches=[dict(sourceRecordId="source-one", field="professional_context", value=[dict(kind="biography", text=text, provenance=dict(reviewId="review-one"))])])
        save(source / "repairs.json", packet)
        save(source / "safe-r1" / "repairs.json", {**packet, "patches": []})
        save(source / "review-ledger.json", [{"reviewId": "review-one"}])
        save(source / "suppression-ledger.json", packet["suppressions"])
        save(source / "report.json", {"contextItems": 1})
        policy = dict(schemaVersion=1, reviewId="review-one", textSha256=source_hash, spans=[dict(start=0, end=len(text), text=text, mode="source-context")])
        review = root / "review.json"
        save(review, dict(sourcePacketSha256=digest(source / "repairs.json"), decisions=[dict(sourceRecordId="source-one", reviewId="review-one", textSha256=source_hash, decision="replace-exact-segmentation-policy", replacementPolicy=policy)]))
        return source, review, packet, policy

    def test_amendment_only_changes_display_policy_and_preserves_safe_rollback(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source, review, original, policy = self.fixture(root)
            old_bytes = (source / "repairs.json").read_bytes()
            out = root / "new"
            report = apply(source, review, out)
            final = json.loads((out / "repairs.json").read_text())
            item = final["patches"][0]["value"][0]
            self.assertEqual(item.pop("segmentationPolicy"), policy)
            self.assertEqual(final, original)
            self.assertEqual((source / "repairs.json").read_bytes(), old_bytes)
            self.assertEqual((source / "safe-r1" / "repairs.json").read_bytes(), (out / "safe-r1" / "repairs.json").read_bytes())
            self.assertTrue(report["sourceClaimsUnchanged"])

    def test_wrong_review_source_hash_fails_before_output(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source, review, _, _ = self.fixture(root)
            data = json.loads(review.read_text())
            data["decisions"][0]["textSha256"] = "a" * 64
            save(review, data)
            with self.assertRaisesRegex(ValueError, "Source text does not match"):
                apply(source, review, root / "new")
            self.assertFalse((root / "new").exists())

    def test_review_cannot_rebind_a_source_to_another_record(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source, review, _, _ = self.fixture(root)
            data = json.loads(review.read_text())
            data["decisions"][0]["sourceRecordId"] = "other-person"
            save(review, data)
            with self.assertRaises(KeyError):
                apply(source, review, root / "new")
            self.assertFalse((root / "new").exists())


if __name__ == "__main__":
    unittest.main()

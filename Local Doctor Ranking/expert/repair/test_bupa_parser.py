import unittest
from bupa_parser import parse_snapshot, hash_value


def page(body, name="Dr Example Person", gmc="1234567"):
    return (f'<html><h2>{name}</h2>{body}<h4>GMC registration</h4>'
            f'<p>Reference number {gmc}</p><a href="/Consultant/view/12345/?printPage=1">Print</a></html>').encode("utf-8")


class BupaRecoveryTests(unittest.TestCase):
    def section(self, markup, label="Areas of interest"):
        parsed = parse_snapshot(page(f"<h4>{label}</h4>{markup}"))
        self.assertEqual(parsed["errors"], [])
        return parsed["sections"][label]

    def test_lowercase_letters_are_preserved_at_real_breaks(self):
        s = self.section("<p>All areas of sports and exercise medicine<br />back problems</p>")
        self.assertEqual(s["text"], "All areas of sports and exercise medicine\nback problems")
        self.assertEqual(s["legacy"]["legacyBranch"], "faulty-character-class")
        self.assertIn("All a; eas of spo; ts", s["legacy"]["clinical_interests"])
        self.assertTrue(s["checks"]["characterConservation"])

    def test_inline_markup_does_not_manufacture_word_breaks(self):
        s = self.section("<p>radio<em>therapy</em>; <a>brain</a> treatment &amp; training</p>")
        self.assertEqual(s["text"], "radiotherapy; brain treatment & training")
        self.assertTrue(s["checks"]["boundaryConservation"])

    def test_short_entries_and_negative_intro_keep_source_order(self):
        s = self.section("<p>I do not perform:<BR>CT<br/>MR<br>No</p>")
        self.assertEqual(s["text"], "I do not perform:\nCT\nMR\nNo")
        self.assertEqual(s["checks"]["outputLines"], 4)
        self.assertTrue(s["checks"]["hasShortSourceLine"])

    def test_paragraphs_list_and_postscript_remain_ordered(self):
        s = self.section("<p>Recorded interests:</p><ul><li>CT</li><li>MR</li></ul><p>Previous training only.</p>")
        self.assertEqual(s["text"], "Recorded interests:\nCT\nMR\nPrevious training only.")
        self.assertTrue(s["checks"]["boundaryConservation"])

    def test_entities_decoded_once_no_guessing_unrecognized_literals(self):
        s = self.section("<p>Queen&rsquo;s &amp; &amp;rsquo; &amp;CT;</p>")
        self.assertEqual(s["text"], "Queen’s & &rsquo; &CT;")

    def test_mojibake_is_held_without_repair_guess(self):
        text = "â€¢ Gastrointestinal radiology"
        s = self.section("<p>" + text + "</p>")
        self.assertEqual(s["text"], text)
        self.assertIn("unknown-source-encoding", s["errors"])

    def test_replacement_and_invalid_utf8_fail_closed(self):
        self.assertIn("unknown-source-encoding", self.section("<p>Replacement �</p>")["errors"])
        self.assertEqual(parse_snapshot(b"<html>\xff</html>")["errors"], ["invalid-utf8"])

    def test_section_cannot_consume_contacts_or_next_heading(self):
        s = self.section("<p>Brain treatment</p><h4>Medical secretaries</h4><p>Private details</p>")
        self.assertEqual(s["text"], "Brain treatment")
        self.assertIn("contact-content", self.section("<p>Contact test@example.invalid</p>")["errors"])

    def test_review_markup_omits_attributes_and_nonvisible_scripts(self):
        s = self.section('<p>Training <a href="mailto:test@example.invalid" data-private="secret">details</a><script>secret()</script></p>')
        self.assertNotIn('test@example', s['sourceMarkup'])
        self.assertNotIn('secret', s['sourceMarkup'])
        self.assertEqual(s['text'], 'Training details')

    def test_ambiguous_heading_and_unexpected_wrapper_are_held(self):
        parsed = parse_snapshot(page("<h4>About me</h4><p>One</p><h4>About me</h4><p>Two</p>"))
        self.assertEqual(parsed["sections"]["About me"]["errors"], ["ambiguous-section-heading"])
        self.assertEqual(self.section("<div>Unrecognized wrapper</div>")["errors"], ["unexpected-section-wrapper"])

    def test_numeric_metadata_is_separate_from_gmc(self):
        parsed = parse_snapshot(page("<h4>About me</h4><p>Background</p>"))
        self.assertEqual(parsed["providerIds"], ["12345"])
        self.assertEqual(parsed["gmcNumbers"], ["1234567"])

    def test_explicit_hcpc_and_gdc_registration_sections_preserve_typed_ids(self):
        parsed = parse_snapshot(page("<h4>Professional registration</h4><p>HCPC: PYL12345</p><h4>GDC registration</h4><p>Reference number 123456</p>"))
        self.assertEqual(parsed["typedRegistrations"]["HCPC"], ["PYL12345"])
        self.assertEqual(parsed["typedRegistrations"]["GDC"], ["123456"])

    def test_genuine_punctuation_ranges_and_case_are_unmodified(self):
        s = self.section("<p>CT; MR; No radioactive implants. Chemotherapy 1–28 days, 1–56 days.</p>")
        self.assertEqual(s["text"], "CT; MR; No radioactive implants. Chemotherapy 1–28 days, 1–56 days.")

    def test_character_and_boundary_checks_independent_of_legacy_oracle(self):
        s = self.section("<p>Fatty Liver disease<br>Liver cirrhosis and its complications<br>Liver cancers</p>", "Research interests")
        self.assertEqual(s["legacy"]["research_interests"], "Fatty Liver diseaseLiver cirrhosis and its complicationsLiver cancers")
        self.assertEqual(s["text"].splitlines(), ["Fatty Liver disease", "Liver cirrhosis and its complications", "Liver cancers"])

    def test_hash_contract_literal_unicode_sorted_keys(self):
        self.assertEqual(hash_value({"z": "’", "a": ["CT", None]}), hash_value({"a": ["CT", None], "z": "’"}))


if __name__ == "__main__":
    unittest.main()

import unittest
from stage_bupa_context import extract_context


def fixture(extra):
    binary=('<h2>Dr Example Person</h2><h3>A company or title</h3>'+extra+
        '<h4>GMC registration</h4><p>Reference number 1234567</p>'+
        '<a href="/Consultant/view/12345/?printPage=1">Print</a>').encode('utf8')
    row={'name':'Dr Example Person','gmc_number':'1234567'}
    return binary,row,row.copy()


class ContextTests(unittest.TestCase):
    def test_real_language_tooltip_wrapper_is_supported_without_attributes(self):
        r=extract_context(*fixture('<h4>(Additional) Languages spoken</h4><ul class="languagelist"><div class="tooltip" title="Private attribute"><li>Greek, Modern - Native or bilingual</li></div></ul>'))
        self.assertEqual(r['items'],[{'kind':'language','text':'Greek, Modern - Native or bilingual','sourceField':'(Additional) Languages spoken'}])
        self.assertNotIn('Private attribute',str(r))

    def test_unexpected_wrappers_are_held(self):
        r=extract_context(*fixture('<h4>Languages spoken</h4><ul><div class="unrelated"><li>Danish</li></div></ul>'))
        self.assertEqual(r['items'],[])
        self.assertEqual(r['sections'][0]['reason'],'unsupported-or-empty-list-structure')

    def test_languages_keep_comma_synonym_and_fluency_qualification(self):
        result=extract_context(*fixture('<h4>(Additional) Languages spoken</h4><ul><li>Greek, Modern\n - Native or bilingual</li><li>Urdu - Conversational</li></ul>'))
        self.assertEqual(result['items'],[{'kind':'language','text':'Greek, Modern - Native or bilingual','sourceField':'(Additional) Languages spoken'},
            {'kind':'language','text':'Urdu - Conversational','sourceField':'(Additional) Languages spoken'}])

    def test_all_offers_are_metadata_services_without_activity_inference(self):
        result=extract_context(*fixture('<h4>Offers</h4><ul><li>Face-to-face consultations</li><li>Video and telephone consultations</li><li>Home chemotherapy</li></ul>'))
        self.assertEqual(len(result['items']),3)
        self.assertTrue(all(x['kind']=='service' and x['sourceField']=='Offers' for x in result['items']))
        self.assertFalse(any(x['kind']=='profession' for x in result['items']))

    def test_identity_mismatch_never_creates_context(self):
        binary,b,f=fixture('<h4>Offers</h4><ul><li>Home chemotherapy</li></ul>');b['gmc_number']='7654321'
        result=extract_context(binary,b,f);self.assertEqual(result['items'],[]);self.assertIn('frozen-gmc-binding-failed',result['reasons'])

    def test_unknown_offer_and_non_list_markup_are_held(self):
        r=extract_context(*fixture('<h4>Offers</h4><ul><li>Unsupported offer</li></ul>'))
        self.assertEqual(r['items'],[]);self.assertIn('unexpected-offer-label',r['sections'][0]['items'][0]['reasons'])
        r=extract_context(*fixture('<h4>Offers</h4><p>Home chemotherapy</p>'))
        self.assertEqual(r['sections'][0]['reason'],'expected-immediate-ul')

    def test_duplicate_and_unsafe_language_items_are_not_exported(self):
        r=extract_context(*fixture('<h4>Languages spoken</h4><ul><li>Danish</li><li>Danish</li><li>test@example.invalid</li></ul>'))
        self.assertEqual([x['text'] for x in r['items']],['Danish'])
        self.assertNotIn('text',r['sections'][0]['items'][2])


if __name__=='__main__':unittest.main()

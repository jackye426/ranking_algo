import copy
import unittest
from bupa_parser import parse_snapshot
from stage_bupa import evaluate_row, choose_pilot, source_review_packet


def fixture():
    binary = b'<h2>Dr Example Person</h2><h4>Areas of interest</h4><p>Brain treatment<br>back problems</p><h4>GMC registration</h4><p>Reference number 1234567</p><h4>End</h4><a href="/Consultant/view/12345/?printPage=1">Print</a>'
    parsed = parse_snapshot(binary)
    legacy = parsed['sections']['Areas of interest']['legacy']
    frozen = {'name':'Dr Example Person', 'gmc_number':'1234567', 'html_snapshot':'example.html',
              'clinical_interests':legacy['clinical_interests'], 'areas_of_interest':legacy['areas_of_interest']}
    return frozen, copy.deepcopy(frozen), parsed


class StageTests(unittest.TestCase):
    def test_only_bound_professional_fields_are_proposed_without_source_mutation(self):
        f,b,p = fixture(); before=copy.deepcopy((f,b,p))
        out, patches, holds=evaluate_row(5,f,b,p,set())
        self.assertEqual(len(patches),2)
        self.assertEqual({x['field'] for x in patches},{'clinical_interests','areas_of_interest'})
        self.assertEqual(holds,[])
        self.assertEqual((f,b,p),before)
        self.assertTrue(all(x['approved'] for x in patches))
        self.assertFalse(out['review']['humanReviewed'])
        self.assertEqual(set(patches[0]['provenance']),{'sourceUrl','sourceLabel','sourceDate','observedAt','snapshotSha256','parserVersion','reviewId'})

    def test_merged_field_is_never_replaced(self):
        f,b,p=fixture();b['clinical_interests']='Independent merged provider content'
        out,patches,holds=evaluate_row(5,f,b,p,set())
        self.assertEqual([x['field'] for x in patches],['areas_of_interest'])
        self.assertIn('baseline-field-not-frozen-bupa-value',out['fields']['clinical_interests']['reasons'])
        self.assertEqual(holds,[])

    def test_changed_html_or_registration_cannot_repair_old_field(self):
        f,b,p=fixture();p['sections']['Areas of interest']['legacy']['clinical_interests']='Different source'
        out,patches,_=evaluate_row(5,f,b,p,set())
        self.assertNotIn('clinical_interests',[x['field'] for x in patches])
        f,b,p=fixture();p['gmcNumbers']=['7654321']
        out,patches,holds=evaluate_row(5,f,b,p,set())
        self.assertEqual(patches,[]);self.assertEqual(holds,[])
        self.assertIn('source-gmc-binding-failed',out['reasons'])

    def test_only_mandatory_holds_change_eligibility(self):
        f,b,p=fixture()
        for index in [6445,26882,22318]:
            out,patches,holds=evaluate_row(index,f,b,p,set())
            self.assertEqual(patches,[]);self.assertEqual(len(holds),1)
        out,patches,holds=evaluate_row(5,f,b,p,{'bupa_5'})
        self.assertTrue(out['historicalUrlConflict']);self.assertEqual(len(patches),2);self.assertEqual(holds,[])

    def test_encoding_field_hold_is_not_an_identity_hold(self):
        f,b,p=fixture();p['sections']['Areas of interest']['errors']=['unknown-source-encoding']
        out,patches,holds=evaluate_row(5,f,b,p,set())
        self.assertEqual(patches,[]);self.assertEqual(holds,[])
        self.assertFalse(out['review']['humanReviewed'])

    def test_url_absence_cannot_manufacture_provenance(self):
        f,b,p=fixture();p['providerIds']=[]
        out,patches,_=evaluate_row(5,f,b,p,set())
        self.assertEqual(patches,[])
        self.assertIn('no-typed-identity-bound-evidence-url',out['fields']['clinical_interests']['reasons'])

    def test_source_reviews_do_not_export_contact_or_personal_sections(self):
        f,b,p=fixture();p['sections']['About me']={'text':'sensitive placeholder','errors':['contact-content']}
        out,patches,_=evaluate_row(5,f,b,p,set())
        packet=source_review_packet(out,patches,p,'test')
        self.assertNotIn('About me',packet['sections'])
        self.assertFalse(packet['humanReviewed'])

    def test_pilot_is_40_risk_and_60_seeded_controls_deterministically(self):
        rows=[{} for _ in range(37195)]
        a,reasons=choose_pilot(rows,[]);b,_=choose_pilot(rows,[])
        self.assertEqual(a,b);self.assertEqual(len(a),100);self.assertEqual(len(set(a)),100)
        self.assertEqual(sum(v=='seeded-control' for v in reasons.values()),60)


if __name__=='__main__': unittest.main()

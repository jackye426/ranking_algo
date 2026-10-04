/* Prepared from actual offline search results. Recheck with npm run verify:comparison. */
(function (root) {
  'use strict';
  const data = {
  "verifiedAt": "2026-10-04T01:39:18.360Z",
  "corpusCount": 4031,
  "eligibleCount": 433,
  "scopeNote": "A prepared comparison of real search results from recorded Spire consultant profiles. First recorded hospital shown; no location filter is applied.",
  "verificationNote": "The search was checked on this date using cached records. This is not a fresh verification of each consultant’s profile or availability.",
  "contextNote": "Goals and previous care change relevance, not eligibility. Failed physiotherapy does not imply that surgery is appropriate or establish a consultant’s expertise in that history.",
  "verification": {
    "sameEligibleIds": true,
    "noProcedureRequirement": true,
    "noExclusion": true,
    "actualBm25": true,
    "actualEmbeddings": true,
    "paidApiCalls": 0
  },
  "baseline": {
    "prompt": "I have knee pain",
    "followup": null,
    "criteria": {
      "topic": "knee pain",
      "specialty": null,
      "procedures": [],
      "location": null,
      "insurance": null,
      "sortByDistance": false,
      "radiusMiles": null,
      "gender": null,
      "language": null,
      "clinicalContext": null
    },
    "total": 433,
    "results": [
      {
        "id": "supabase-c-7015944",
        "name": "Mr Christopher Thomas",
        "specialty": "Consultant Orthopaedic Surgeon (Hip and Knee)",
        "location": "Spire Cardiff Hospital",
        "reason": "Knee pain is listed in his recorded clinical interests.",
        "evidenceText": "knee pain, over 18 years, joint replacement",
        "evidenceUrl": "/sources/supabase-c-7015944",
        "profileUrl": "https://www.spirehealthcare.com/spire-cardiff-hospital/consultants/mr-christopher-thomas-c7015944/",
        "sourceField": "clinical_interests / areas_of_interest",
        "supportingEvidence": [
          {
            "text": "knee pain, over 18 years, joint replacement",
            "sourceField": "clinical_interests / areas_of_interest",
            "sourceUrl": "/sources/supabase-c-7015944"
          }
        ]
      },
      {
        "id": "supabase-c-6078138",
        "name": "Mr Joseph Windley",
        "specialty": "Consultant Orthopaedic Surgeon",
        "location": "Spire St Anthony's Hospital",
        "reason": "His recorded specialty is orthopaedic surgery. The fit for this symptom needs confirmation.",
        "evidenceText": "Consultant Orthopaedic Surgeon",
        "evidenceUrl": "https://www.spirehealthcare.com/spire-st-anthonys-hospital/consultants/mr-joseph-windley-c6078138",
        "profileUrl": "https://www.spirehealthcare.com/spire-st-anthonys-hospital/consultants/mr-joseph-windley-c6078138/",
        "sourceField": "specialty",
        "supportingEvidence": [
          {
            "text": "Consultant Orthopaedic Surgeon",
            "sourceField": "specialty",
            "sourceUrl": "https://www.spirehealthcare.com/spire-st-anthonys-hospital/consultants/mr-joseph-windley-c6078138"
          }
        ]
      },
      {
        "id": "supabase-c-3575473",
        "name": "Mr Jurgen Stamer",
        "specialty": "Consultant Orthopaedic Surgeon",
        "location": "Spire Murrayfield Hospital Wirral",
        "reason": "Knee pain is listed in his recorded clinical interests.",
        "evidenceText": "knee pain",
        "evidenceUrl": "/sources/supabase-c-3575473",
        "profileUrl": "https://www.spirehealthcare.com/spire-murrayfield-hospital-wirral/consultants/mr-jurgen-stamer-c3575473/",
        "sourceField": "clinical_interests / areas_of_interest",
        "supportingEvidence": [
          {
            "text": "knee pain",
            "sourceField": "clinical_interests / areas_of_interest",
            "sourceUrl": "/sources/supabase-c-3575473"
          }
        ]
      }
    ]
  },
  "goal": {
    "prompt": "I’m a runner with knee pain and want to get back to running",
    "followup": null,
    "criteria": {
      "topic": "knee pain",
      "specialty": null,
      "procedures": [],
      "location": null,
      "insurance": null,
      "sortByDistance": false,
      "radiusMiles": null,
      "gender": null,
      "language": null,
      "clinicalContext": "I’m a runner with knee pain and want to get back to running"
    },
    "total": 433,
    "results": [
      {
        "id": "supabase-c-4749002",
        "name": "Mr Ashutosh Acharya",
        "specialty": "Consultant Orthopaedic Surgeon",
        "location": "Spire Cheshire Hospital",
        "reason": "You want to get back to running. His record lists runner’s knee and knee pain, giving you a specific reason to explore his profile.",
        "evidenceText": "Runner's knee",
        "evidenceUrl": "/sources/supabase-c-4749002",
        "profileUrl": "https://www.spirehealthcare.com/spire-cheshire-hospital/consultants/mr-ashutosh-acharya-c4749002/",
        "sourceField": "clinical_interests / areas_of_interest",
        "supportingEvidence": [
          {
            "text": "Runner's knee",
            "sourceField": "clinical_interests / areas_of_interest",
            "sourceUrl": "/sources/supabase-c-4749002"
          },
          {
            "text": "Knee pain",
            "sourceField": "clinical_interests / areas_of_interest",
            "sourceUrl": "/sources/supabase-c-4749002"
          }
        ]
      },
      {
        "id": "supabase-c-6058091",
        "name": "Mr Moataz El-Husseiny",
        "specialty": "Consultant Orthopaedic Surgeon",
        "location": "Spire Thames Valley Hospital",
        "reason": "His record lists running injuries alongside anterior knee pain. Those interests connect with your knee concern and your goal of returning to running.",
        "evidenceText": "Running injuries",
        "evidenceUrl": "/sources/supabase-c-6058091",
        "profileUrl": "https://www.spirehealthcare.com/spire-thames-valley-hospital/consultants/mr-moataz-el-husseiny-c6058091/",
        "sourceField": "clinical_interests / areas_of_interest",
        "supportingEvidence": [
          {
            "text": "Running injuries",
            "sourceField": "clinical_interests / areas_of_interest",
            "sourceUrl": "/sources/supabase-c-6058091"
          },
          {
            "text": "Anterior knee pain",
            "sourceField": "clinical_interests / areas_of_interest",
            "sourceUrl": "/sources/supabase-c-6058091"
          }
        ]
      },
      {
        "id": "supabase-c-3351259",
        "name": "Mr Nigel Donnachie",
        "specialty": "Consultant Orthopaedic Surgeon",
        "location": "Spire Murrayfield Hospital Wirral",
        "reason": "Investigation of a painful knee relates to your knee concern. A running-specific connection would need confirming.",
        "evidenceText": "Investigation of painful knee",
        "evidenceUrl": "/sources/supabase-c-3351259",
        "profileUrl": "https://www.spirehealthcare.com/spire-murrayfield-hospital-wirral/consultants/mr-nigel-donnachie-c3351259/",
        "sourceField": "clinical_interests / areas_of_interest",
        "supportingEvidence": [
          {
            "text": "Investigation of painful knee",
            "sourceField": "clinical_interests / areas_of_interest",
            "sourceUrl": "/sources/supabase-c-3351259"
          }
        ]
      }
    ]
  },
  "history": {
    "prompt": "I’m a runner with knee pain and want to get back to running",
    "followup": "Physiotherapy hasn’t helped",
    "criteria": {
      "topic": "knee pain",
      "specialty": null,
      "procedures": [],
      "location": null,
      "insurance": null,
      "sortByDistance": false,
      "radiusMiles": null,
      "gender": null,
      "language": null,
      "clinicalContext": "I’m a runner with knee pain and want to get back to running; Physiotherapy hasn’t helped"
    },
    "total": 433,
    "results": [
      {
        "id": "supabase-c-3116968",
        "name": "Dr Mark Ridgewell",
        "specialty": "Consultant Musculo Skeletal and Sports and Exercise Medicine",
        "location": "Spire Cardiff Hospital",
        "reason": "You want to return to running. His recorded interests include running injuries and knee pain, giving you a reason to explore his sports medicine practice.",
        "evidenceText": "Running injuries",
        "evidenceUrl": "/sources/supabase-c-3116968",
        "profileUrl": "https://www.spirehealthcare.com/spire-cardiff-hospital/consultants/dr-mark-ridgewell-c3116968/",
        "sourceField": "clinical_interests / areas_of_interest",
        "supportingEvidence": [
          {
            "text": "Running injuries",
            "sourceField": "clinical_interests / areas_of_interest",
            "sourceUrl": "/sources/supabase-c-3116968"
          },
          {
            "text": "Knee pain",
            "sourceField": "clinical_interests / areas_of_interest",
            "sourceUrl": "/sources/supabase-c-3116968"
          }
        ]
      },
      {
        "id": "supabase-c-3351259",
        "name": "Mr Nigel Donnachie",
        "specialty": "Consultant Orthopaedic Surgeon",
        "location": "Spire Murrayfield Hospital Wirral",
        "reason": "Investigation of a painful knee relates to your knee concern. A running-specific connection would need confirming.",
        "evidenceText": "Investigation of painful knee",
        "evidenceUrl": "/sources/supabase-c-3351259",
        "profileUrl": "https://www.spirehealthcare.com/spire-murrayfield-hospital-wirral/consultants/mr-nigel-donnachie-c3351259/",
        "sourceField": "clinical_interests / areas_of_interest",
        "supportingEvidence": [
          {
            "text": "Investigation of painful knee",
            "sourceField": "clinical_interests / areas_of_interest",
            "sourceUrl": "/sources/supabase-c-3351259"
          }
        ]
      },
      {
        "id": "supabase-c-4749002",
        "name": "Mr Ashutosh Acharya",
        "specialty": "Consultant Orthopaedic Surgeon",
        "location": "Spire Cheshire Hospital",
        "reason": "You want to get back to running. His record lists runner’s knee and knee pain, giving you a specific reason to explore his profile.",
        "evidenceText": "Runner's knee",
        "evidenceUrl": "/sources/supabase-c-4749002",
        "profileUrl": "https://www.spirehealthcare.com/spire-cheshire-hospital/consultants/mr-ashutosh-acharya-c4749002/",
        "sourceField": "clinical_interests / areas_of_interest",
        "supportingEvidence": [
          {
            "text": "Runner's knee",
            "sourceField": "clinical_interests / areas_of_interest",
            "sourceUrl": "/sources/supabase-c-4749002"
          },
          {
            "text": "Knee pain",
            "sourceField": "clinical_interests / areas_of_interest",
            "sourceUrl": "/sources/supabase-c-4749002"
          }
        ]
      }
    ]
  }
};
  if (root) root.DocMapComparisonData = data;
  if (typeof module === 'object' && module.exports) module.exports = data;
})(typeof window === 'object' ? window : null);

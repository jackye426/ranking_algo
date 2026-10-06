'use strict';
// Evaluation clarifications made before the first retrieval score. Initial
// diagnostic findings remain unchanged in review-ledger.cjs.
module.exports = [
  {date:'2026-10-06',area:'relationship scoring',decision:'An unknown relationship with the requested fictional manufacturer must not hide real relationships with other organisations.',reason:'The original no-relationships shortcut was stricter than the actual product requirement. Score absence of an invented requested-manufacturer link, preserving other evidence for review.'},
  {date:'2026-10-06',area:'requirement labels',decision:'Dermoscopy-only panel wording requires the modality label; it must not automatically create a skin-lesion condition requirement.',reason:'Two cases explicitly named only the modality. Correcting that expectation avoids rewarding inferred clinical requirements.'},
  {date:'2026-10-06',area:'evidence-01a274d03a39ecfaa7e8',decision:'Research-funded PhD information can safely remain research/background if it does not assert current practice or an industry relationship.',reason:'The source genuinely describes a funded PhD. The critical original defect was industry-relationship classification, not the exact safe replacement label.'},
  {date:'2026-10-06',area:'evidence-0038ab12aad720a32d0c',decision:'A clinical topic list can conservatively remain professional background.',reason:'The critical distinction is that a noun list must not become an assertion of performed clinical activity.'}
];

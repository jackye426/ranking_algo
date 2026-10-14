# Bounded repair utility checks — 8 October 2026

Eight selected checks pass source ownership, exact wording, linked source URL, snapshot/review provenance, BM25 reachability and guarded qualification. The checks use the current BM25Index over all searchable R2 passages and the current matrixFor restricted to each selected source passage. They do not change ranking weights or frozen evaluation labels.

| Example | Exact phrase in this candidate's baseline passages | R2 raw BM25 passage rank | Qualified interpretation |
|---|---:|---:|---|
| Gillett — exercise guidance & prescription | 0 | 4 | Listed clinical interest; performed activity remains potential. |
| Pericleous — Fatty Liver disease | 3 | 66 | Research-interest wording; study experience remains potential. |
| Pericleous — Liver cirrhosis and its complications | 1 | 1 | Research-interest wording; study experience remains potential. |
| Pericleous — Liver cancers | 1 | 1 | Research-interest wording; study experience remains potential. |
| Pericleous — Autoimmune liver diseases of the liver | 1 | 2 | Research-interest wording; study experience remains potential. |
| Pericleous — Rare liver diseases | 1 | 1 | Research-interest wording; study experience remains potential. |
| Gillett — HCA Sports Injuries context | 0 | 123 | Listed condition/interest; performed care remains potential. |
| Bupa language context — Portuguese - Fluent | 0 | 1 | Professional background; clinical-interest/activity probes remain potential. |

The five Pericleous lines were already present elsewhere in his baseline evidence. Their restoration preserves source structure and provenance; this is **not five newly discovered research facts**, study participation, authorship or investigator responsibility. Raw passage rank is not final app ranking or a claim of comparative clinical suitability. Rank 123 is reachable in the lexical index, not a top-20 discovery success.

For all eight tested natural-language phrasings (“Find experts with interests in …”), the unchanged deterministic parser asks for clarification. These checks therefore demonstrate stored/source evidence and lexical reachability, not complete end-to-end ontology coverage. No broad usability pass is inferred.

Detailed source evidence, provenance, baseline comparisons and matrix results are retained in the private repair-specific.json. The R2 corpus is expert-corpus-v2-3506499e3898780ca0af, SHA256 122d8e40e0e2c86c6f8f531b33fc44543c7995ae6de5963904a43aa24183e866. The baseline export checksum was independently verified while streaming the selected records.

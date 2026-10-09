# Source-bound field exclusions and exact recovery

`compileFieldSafety` is a pure preparation function. It accepts parsed baseline rows, their verified file hash, a pinned prior packet, a fresh release ID and independently approved decisions. It never approves ownership, writes files or changes the original data.

Every decision names its reviewer, review ID, reason, source record and field. `beforeHash` binds the original field value. `sourceEvidence` binds the original source record, source field and snapshot hash. A packet-specific `currentBindings` entry pins the exact existing field patch and suppression hashes (`hashValue(null)` when absent).

Two actions are supported:

- **`exclude-field`** removes only a specifically approved current replacement, if present, then suppresses the source-bound field. An existing suppression is retained with its original review history. Specialty and NHS-base exclusions use the runtime's evidence-only projection; their canonical values remain unchanged.
- **`replace-field-with-reviewed-spans`** is limited to the existing ordinary text-repair fields. It verifies a complete supporting source text/hash and exact, ordered, nonoverlapping retained spans. Separate spans remain separate values. Source wording, dates and provenance are preserved; no missing wording is reconstructed. A previously suppressed field cannot be revived through this action.

Source recovery provenance uses `professional-source-field-repair-v1`, the decision's review ID and a matching source-evidence snapshot/field. Unavailable original links stay null. A reviewed source excerpt does not establish current registration or practice.

When composed with `compileContextWithholding`, pass its result as `contextPreparation` and retain the original packet as `targetPacket`. The compiler checks that the context stage made only its recorded exact item removals: field patches, suppressions, holds, source hashes and all other packet properties must remain unchanged. Both sets of approvals therefore retain their original immutable packet bindings. Adding context or changing another field in the intermediate result fails.

The final packet is verified with `applyRepairs`. Duplicate/stale decisions, wrong-person source evidence, changes to protected names/registrations/locations/profile links and fabricated or reordered excerpts fail closed. The caller must verify the actual source files and baseline bytes before invoking the pure function, and preserve the review receipts with the staged package.

Run `node --test expert/repair/enriched/field-safety.test.cjs`. Real professional source rows and decision artifacts stay in the private preparation workspace.

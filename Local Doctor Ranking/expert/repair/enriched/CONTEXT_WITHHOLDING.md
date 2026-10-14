# Source-bound context withholding

`withhold-context.cjs` prepares a new immutable repair packet from an already reviewed packet. It is a pure function: it neither writes files nor approves source ownership. It never contacts Supabase or changes the baseline.

Use it only after the source-item decisions are approved. Apply the same decision set to the enriched and safe-baseline packets. An addition absent from the safe baseline needs an explicit, packet-bound absence disposition; it is not a successful removal.

## Inputs

Before approval, `proposeContextWithholding` accepts the same pinned baseline/source/target inputs and `requests` containing `{ proposalId, sourceRecordId, sourcePacketSha256, itemSha256, reason }`. It deterministically computes current bindings and explicit absence outcomes for review. Every returned item has `approved: false`; no reviewer is fabricated. Passing those proposals directly to the compiler fails.

Review the proposed bindings for both target packets before creating the decision file. Retain the proposal packet and its checksum alongside the independent decisions.

`compileContextWithholding` accepts:

- `baselineRows` and the previously verified `baselineSha256`.
- `sourcePacket` and `targetPacket`, each `{ bytes, sha256 }`, where the digest covers the exact JSON bytes. The source packet is the version reviewed for ownership; the target is the current packet to clone.
- A fresh `releaseId` and the approved `decisions` below.
- Optional verified scope `lineage`, comprising pinned `{ bytes, sha256 }` descriptors for `report`, `history` and `priorPacket`.

Each decision records:

```js
{
  decisionId, reviewId, reviewer, reason,
  approved: true,
  action: 'withhold-context-item',
  sourceRecordId,
  sourcePacketSha256,
  itemSha256,             // releases.hashValue of the complete reviewed item
  provenanceSha256,       // releases.hashValue of its complete provenance
  kind,
  targetPacketSha256s: [enrichedPacketSha, safePacketSha],
  absentAllowedPacketSha256s: [],
  currentBindings: [
    {
      packetSha256: enrichedPacketSha,
      itemSha256: exactCurrentItemHash,
      outcome: 'remove-reviewed-item'
    }
  ]
}
```

Every target packet needs exactly one approved current binding. For an explicit absence, `itemSha256` is `null`, the outcome is `source-addition-absent-from-this-release`, and that packet's digest must also appear in `absentAllowedPacketSha256s`. An item already removed by independently reviewed scope corrections uses `already-withheld-by-reviewed-spans` and a null hash.

These are distinct outcomes. Neither absence nor earlier withholding increases the newly removed-item count.

## Lineage and safety

The compiler joins source rows and complete source-item hashes, never historical array positions. For an item changed by the earlier scope repair, it checks the packet/report/history hashes, both source reviewers, exact omitted and retained spans, original provenance, replacement wording and segmentation-policy rebind. It reconstructs the current item, then requires its hash to equal the separately approved current binding.

Duplicate decisions, duplicate context patches/items, changed wording or provenance, unapproved outcomes and ambiguous source history fail closed. Missing additions cannot mask a changed item from the same source. Removing the final context addition drops its patch only when the baseline has no populated context to restore; otherwise preparation stops.

The final cloned packet is passed through `applyRepairs`. Identity, locations, flags, mandatory holds and suppressions remain under that adapter's existing controls. The caller must first verify the baseline file's digest; the pure function receives parsed rows and does not reread or recalculate a file digest.

## Output and release gate

The result contains the cloned `packet`, explicit per-decision `outcomes`, validated cloned `rows`, a `summary`, and input/lineage hashes. Persist it only to a new staging directory after both enriched and safe-baseline preparations pass. Retain all prior packets and review receipts privately. The compiler does not admit a source, approve an identity or make a release ready for use.

Run `node --test expert/repair/enriched/withhold-context.test.cjs` for the focused safety fixtures. Real source decisions and raw professional data belong in the private preparation workspace, not in this directory or Git.

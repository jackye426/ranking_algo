# Current release inventory

Fresh byte verification: 9 October 2026. All nine observed manifest/artifact sets match their own declared hashes. Original packages and historical receipts were read in place and remain unchanged.

| Package location | Identifier | Manifest SHA-256 | Schema / projection | Rows | Holds / field exclusions | Status |
| --- | --- | --- | --- | ---: | --- | --- |
| repair-private/releases | bupa-r1-20261008 | 28028cb4bcd4147154615f3f75781624020c1528f936616c2d8a6252d600ddf4 | 1 / expert-repair-v1 | 40876 | 2 / 0 | superseded-do-not-select |
| repair-private/releases | bupa-r1-20261008-v2 | 8409d33afcb2c8cfbfd035912e9b04d40db0e8bdfef5e846923c7b964b80fe9d | 1 / expert-repair-v1 | 40876 | 3 / 0 | historical-preview-receipt-only-superseded-safety-policy |
| repair-private/releases | context-r2-20261008 | 5376dbc5d04e661b3f00e54fe744db9b42da6f79adcd12e81b92ccf48ae4ba90 | 1 / expert-repair-v1 | 40876 | 3 / 0 | withheld-retrieval-regression |
| repair-private/releases | r0-safe-20261008 | 8febfbe5e13e85efa492e4643f511bd8fc22a586bdb176350a54b64c5d9506ef | 1 / expert-repair-v1 | 40876 | 2 / 0 | superseded-do-not-select |
| repair-private/releases | r0-safe-20261008-v2 | e44e5a8460b7a206a93b81fa24d4d9c1ddd899c62f973e7273ab45c7b908aee6 | 1 / expert-repair-v1 | 40876 | 3 / 0 | historical-preview-receipt-only-superseded-safety-policy |
| final-packages-v17 | enriched-r3-20261009-v4 | 39a9af0458c3e0bf7d2807fc60f6499762c0dec25da5c1aa15e4ca6aa2223acb | 2 / expert-repair-v2 | 40876 | 67 / 2890 | staged-source-reviewed-not-product-approved |
| final-packages-v17 | safe-r1-20261009-v4 | d2bc4546e75e1354610f0f544bc5d354573892e15d8005ef51abf1fe44bc29c5 | 2 / expert-repair-v2 | 40876 | 67 / 2890 | staged-source-reviewed-not-product-approved |
| final-packages-v19 | enriched-r3-20261009-v4 | a0e9bfc4c3f678b8d0c260671d1e284a4e6b401b9a5fea2a0181b9e9931edd66 | 2 / expert-repair-v2 | 40876 | 67 / 2890 | staged-source-reviewed-not-product-approved |
| final-packages-v19 | safe-r1-20261009-v4 | 3c6ff8dc23f07bb0f5f56ed97f097e0c4695a141c7fe3c0df2364025f14a533f | 2 / expert-repair-v2 | 40876 | 67 / 2890 | staged-source-reviewed-not-product-approved |

The two v19 packages are the only current staging import bindings. Both preserve the same 40,876-row baseline (SHA-256 `69ed571e67c79d8ed1327b74e23dd999ea5b39c53bd20553f23f34afae9c3a8e`), 32 original exclusions, 67 additional holds and 2,890 field exclusions.

The v17 and v19 package identifiers repeat with different runtime/cache/manifest bytes. They are separate historical code/data tuples. Same-ID substitution fails database import; choose a unique ID for any future immutable package.

Source-packet hashes differ from packaged repair hashes because retained serialization differs. Source v16 R3 packet: `366951240932b1c16ad189cad11ef310e939f058ffd740ae5f060e3914799331`; packaged v19 repair: `2ce7d09f9dec47a5fe4989c789492a0a59d185b02c1396b559188e36de959c6f`. Source v16 safe packet: `9a572c968d122e7e5563be57b5f707e903d75d0c63a5c465860fed0c16eb73df`; packaged v19 repair: `a33b20d0499069e09e16da8f2add9179ea51e0909ef01f9afc77d9c19f2d5b18`. Preserve both.

V19 R3: 42,301 patches, 243,652 context items, corpus `expert-corpus-v3-ab2d57a74b9275e77928`, 577,834 passages, corpus bytes SHA `0b9c451d4c111d8a527799e4fd8eff8d97f92a1a6680de2f14f20beba6bd6699`. Safe v19: 24,862 patches, 207 context items, corpus `expert-corpus-v3-1d8504ad6f6a62c98c45`, 300,173 passages, corpus SHA `8a7f597dd47aa84bad89e0a6458f062a497a03942d834ad24414dcebc17e4c83`. Both have 40,221 identity groups and 18,013 held groups; indexed candidate counts are 22,208 and 22,204 respectively. Patch/context units overlap; they are not counts of new people or facts.

Approval linkage: existing `handover/DATA_INGESTION_FIXER_HANDOVER.md`, historical `PAUSED_20261009_2100.md`, and retained application `expert/repair/RELEASE-ROLLBACK.md`. Historical R1 source and preview receipts are preserved, including failed AI acceptance. They do not grant a current exact product approval. R2 remains withheld. R3 and the current safety-compatible fallback have no product approval receipt in this branch.

Private machine-readable inventory, complete artifact hashes, absolute evidence paths and binding hashes are at `.private/inventory-20261009/inventory.json`. No originals or private review records are copied into this Git branch.

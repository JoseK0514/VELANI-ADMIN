# Independent review resolution

November10,2026. Initial reviewed source f30f11c; initial verdict BLOCK/With fixes. One implementer correction pass, no second reviewer dispatch.

- R1 Important, fixed: preserve exact database timestamps in internal/source cursors; validate ISO offsets without JavaScript Date truncation. RED lost records in sub-millisecond/equal-time traversal; GREEN all rows appear exactly once. Covers internal and source pagination.
- R2 Important, fixed: catalog enrichment requires matching workplace ID, environment and incarnation. RED fresh trial/paid evidence from an old incarnation appeared current; GREEN unknown/partial.
- R3 Important, fixed: trial metric requires complete bounded current workplace/catalog ID/environment/incarnation coverage. RED missing/subset/orphan/old-incarnation rows produced a number; GREEN null/partial. Verified empty scope still yields0.
- R5 Important, fixed for the supported restore procedure: external authorization epoch/fingerprints, private begin/complete recovery, mandatory auth-root rotation, proof/session/key invalidation and re-enrollment. RED restored pre-logout/pre-recovery auth passed unchanged erasure watermark; GREEN independent fence closes it, unchanged roots fail, old factors/sessions fail and two fresh cryptographic factors produce a new valid session. Procedure must begin before every provider/logical restore; arbitrary owner-level SQL outside the runbook is not a supported restoration path. The web/maintenance journal roles cannot alter authorization state.
- R4 regraded Minor and deferred: repeated internal schema parsing and oversized modules remain maintainability debt. They do not change current behavior/authority/retention guarantees; splitting unrelated code during the correctness pass would broaden risk. This is not a claim the style check passed.

Declined-review rulings: UI stays with Claude per Jose's ownership instruction, so visual/mobile/keyboard acceptance remains open. Live Google/provider/source/cron/backup/budget/pause states stay explicit activation gates; code tests do not establish live operation. These boundaries carry the cost that neither a completed UI nor a production-ready service is claimed by this backend qualification.

See final-suite.txt, final-build.txt, dependency-audit.json and final-receipt.json for exact final checks/source. No production secrets or real customer test data were used.

# Equipment identification by source

Follow-up to M3 Wave 2's deferred "explore item cards and shop gear" note.
J is `local-run/.runtime/decompiled/service/com/d2/serv/game` in the original backup.

## Audit before implementation

- Explore is already correct: `RoleModule/OutSearchSystem.java`, `OnCustomGetBonus`
  (item branch, lines 330-355) creates the configured item and sets binding, but
  never sets an identify count or flushes properties. `ItemModule/ItemBaseSystem`,
  `OnItemCreate` sets fold count; `EquipModule/EquipSystem`, `OnEquipItemCreate`
  initializes durability; `AddPropSystem.OnEquipItemCreate` is a no-op.
  RES `Code/ClassInfo.dat` integer properties `CanIdentify`, `IdentifyPropCount`,
  and `IdentifyTimes` have default 0 (type word 1 followed by default word 0).
  Explore gear is therefore plain, count 0, no properties, and considered appraised
  by `IdentifySystem.IsEquipIdentifyed`. No new explore roll is appropriate.
- Refresh shop distributions are already implemented: `CommerceModule/RefreshShopSystem`,
  stock creation switch (lines 264-311): Item Shop has 60/40 weights for plain/one
  property and flushes the latter immediately; Mystery has 60/20/15/5 weights for
  1-4 hidden properties; Dark has 700/249/50/1 weights and remains hidden.
  `IdentifySystem.GetEquipIdentifyMaxCount` returns 4. Purchase preserves the stock
  item's properties rather than rolling again.
- Missing: `IdentifySystem.SetEquipIdentifyPropCount` (335-347) refuses configurations
  absent from the identify list. Reborn stock gave those equipment items positive
  counts anyway, making some impossible to appraise. Normalize these to the plain
  defaults on stock creation and purchase (including previously persisted offers).
- Missing: copying an appraised plain stock row could set identifyTimes to 1 despite
  count 0. Plain items must retain times 0; appraisal is true because CanIdentify is 0.
- Missing regression coverage: explore equipment defaults, both hidden shop types,
  plain stock without an artificial roll, immediate Item Shop properties, and the
  missing-list refusal. Wholesale and Mystic purchase paths do not set counts in the
  original and retain their plain grant behavior.

The implementation normalizes shop instance state in one helper and uses it both
when stocking and when transferring purchased stock. Existing shop rolls and their
probabilities remain unchanged; explore's original plain state is covered by an API test.

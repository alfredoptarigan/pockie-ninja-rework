# Original bag capacity

J is `local-run/.runtime/decompiled/service/com/d2/serv/game` in the original backup.

- `ContainerModule/PackSystem.java`: constants `MaxPackBoxNum = 4`,
  `MaxPackBoxCap = 60`, `InitActivePackBoxNum = 2`; `OnPlayerFirstLogin` activates two
  pages and `OnPlayerLoadAfter` creates each page with capacity 60. Initial capacity
  is 120 cells, maximum 240, not 150 inventory rows.
- `OnCustomPackBoxActive` activates pages sequentially. RES `Box/ActivePackCost.ini`
  charges 188 Gold for page 3 and 288 Gold for page 4.
- `ContainerModule/ContainerRule/PosContainerRule.java`, `SetPosRecordValue` and
  `CheckItemPlace`: ItemShapeType 1 occupies one cell; other shapes occupy a
  rectangle of width shape/2 and height 2. Placement requires a contiguous shape
  on one page, not just enough total free cells.
- `ContainerRule.java`, `CanAutoFlod` and `CheckItemBangdingPropEquals`: only
  matching configs and binding properties with shape 1 fold, up to ItemMaxFoldNum.
  `ItemModule/ItemBaseSystem.java` supplies item config properties; equipment outside
  the pack does not consume pack capacity.
- `RoleModule/OutSearchSystem.java`, `OnOutSearch`: checks placement of a shape-6
  item before spending the search cost (not six arbitrary free cells).

The reborn schema has neither positions/page assignments nor ActivedPackBoxNum.
The shared helper therefore uses the initial 120-cell budget and shape costs,
matching bound/unbound stacks. It cannot reproduce page fragmentation or paid
expansion without schema work outside this task's allowed files. Explore reserves
six cells. All capacity callers and overflow drops use this same budget.

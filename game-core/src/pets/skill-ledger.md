# Pet skill ledger (m6 task 5 -> task 6)

Every `ispet` row of `skill.ini` (`server/data/game/skills.json`), with its Rhino script under
`~/Privates/game-pockieninja/app/code/props/serv/game/Resource/javascript/`. Pet skills are plain
skill rows on the master (SkillSystem.RefreshPlayerSkill): `type 2` triggers fire by `quomodo`
(1 fight begin, 2 before attack, 3 before attacked, 4 damaged, 5 death, 8 after a hit (pet),
9 after being hit). The engine marks their events `isPet`.

- Task 5 ported `skill_chonggong_40001.js` (PET_ATTACK; `skill_40001.js` is a stub) and the
  regeneration aura buffs 11861-11863 in `game-core/src/battle/scripts/pet-core.ts`.
- Task 6 ports the rest: 40 Halo and 26 Help script files (40116 reuses 40010's script). New fight
  buffs use 15101-15199.
- Rows without a script do nothing in a fight; filter them from the learn pools (or port them as
  data if a tooltip shows an effect).
- Regeneration auras: `regenAuraResist` (pet-core.ts) is wired into 11811, 11812, 11813 and
  11815 (`buffs.ts`). Its 2011 OnAdd also runs in 11804 and 11808 (`ninjutsu-buffs.ts`), 11810
  (`ninjutsu-trigger-a-buffs.ts`), 11820 (`ninjutsu-trigger-b-buffs.ts`) and 11833
  (`ninjutsu-buffs.ts`); task 6 wires those when it ports 40066-40068 and 40086-40088, the
  skills that add or raise the auras.

## Halo (ispet 1)

| Id    | Quomodo | Prob. | Script                                     | Status                                          |
| ----- | ------- | ----- | ------------------------------------------ | ----------------------------------------------- |
| 40057 | 1       | 100   | `skill/skill_chongguanghuanceshi_40057.js` | task 6                                          |
| 40058 | 1       | 100   | `skill/skill_shaluguanghuan0_40058.js`     | task 6                                          |
| 40059 | 1       | 100   | `skill/skill_shaluguanghuan1_40059.js`     | task 6                                          |
| 40060 | 1       | 100   | `skill/skill_shaluguanghuan2_40060.js`     | task 6                                          |
| 40061 | 1       | 100   | -                                          | no script (data row; skip or filter from pools) |
| 40062 | 1       | 100   | `skill/skill_jingjiguanghuan0_40062.js`    | task 6                                          |
| 40063 | 1       | 100   | `skill/skill_jingjiguanghuan1_40063.js`    | task 6                                          |
| 40064 | 1       | 100   | `skill/skill_jingjiguanghuan2_40064.js`    | task 6                                          |
| 40065 | 1       | 100   | -                                          | no script (data row; skip or filter from pools) |
| 40066 | 1       | 100   | `skill/skill_zaishengguanghuan0_40066.js`  | task 6                                          |
| 40067 | 1       | 100   | `skill/skill_zaishengguanghuan1_40067.js`  | task 6                                          |
| 40068 | 1       | 100   | `skill/skill_zaishengguanghuan2_40068.js`  | task 6                                          |
| 40069 | 1       | 100   | -                                          | no script (data row; skip or filter from pools) |
| 40070 | 1       | 100   | `skill/skill_shenshengguanghuan0_40070.js` | task 6                                          |
| 40071 | 1       | 100   | `skill/skill_shenshengguanghuan1_40071.js` | task 6                                          |
| 40072 | 1       | 100   | `skill/skill_shenshengguanghuan2_40072.js` | task 6                                          |
| 40073 | 1       | 100   | -                                          | no script (data row; skip or filter from pools) |
| 40074 | 1       | 100   | `skill/skill_zhihuiguanghuan0_40074.js`    | task 6                                          |
| 40075 | 1       | 100   | `skill/skill_zhihuiguanghuan1_40075.js`    | task 6                                          |
| 40076 | 1       | 100   | `skill/skill_zhihuiguanghuan2_40076.js`    | task 6                                          |
| 40077 | 1       | 100   | -                                          | no script (data row; skip or filter from pools) |
| 40078 | 1       | 100   | `skill/skill_xuezhou_40078.js`             | task 6                                          |
| 40079 | 1       | 100   | `skill/skill_roubo_40079.js`               | task 6                                          |
| 40080 | 1       | 100   | `skill/skill_kangfen_40080.js`             | task 6                                          |
| 40082 | 1       | 100   | `skill/skill_jiancihuti_40082.js`          | task 6                                          |
| 40083 | 1       | 100   | `skill/skill_guanghezuoyong_40083.js`      | task 6                                          |
| 40084 | 1       | 100   | `skill/skill_hanlengbowen_40084.js`        | task 6                                          |
| 40086 | 1       | 100   | `skill/skill_xisheng_40086.js`             | task 6                                          |
| 40087 | 1       | 100   | `skill/skill_quxie_40087.js`               | task 6                                          |
| 40088 | 1       | 100   | `skill/skill_muoushi_40088.js`             | task 6                                          |
| 40090 | 1       | 100   | `skill/skill_longzuxuetong_40090.js`       | task 6                                          |
| 40091 | 1       | 100   | `skill/skill_bukeqinfan_40091.js`          | task 6                                          |
| 40092 | 1       | 100   | `skill/skill_shenshengyinji_40092.js`      | task 6                                          |
| 40094 | 1       | 100   | `skill/skill_shenmishu_40094.js`           | task 6                                          |
| 40095 | 1       | 100   | `skill/skill_ganzhi_40095.js`              | task 6                                          |
| 40096 | 5       | 0     | -                                          | no script (data row; skip or filter from pools) |
| 40106 | 1       | 100   | `skill/skill_kangti_40106.js`              | task 6                                          |
| 40108 | 1       | 100   | `skill/skill_qingxing_40108.js`            | task 6                                          |
| 40110 | 1       | 100   | `skill/skill_jieyin_40110.js`              | task 6                                          |
| 40113 | 1       | 100   | `skill/skill_zhufu_40113.js`               | task 6                                          |
| 40122 | 1       | 100   | `skill/skill_chonggaoguanghuan0_40122.js`  | task 6                                          |
| 40123 | 1       | 100   | `skill/skill_chonggaoguanghuan1_40123.js`  | task 6                                          |
| 40124 | 1       | 100   | `skill/skill_chonggaoguanghuan2_40124.js`  | task 6                                          |
| 40125 | 4       | 100   | `skill/skill_renzhuli_40125.js`            | task 6                                          |
| 40126 | 2       | 100   | `skill/skill_shouxuefeiteng_40126.js`      | task 6                                          |
| 40127 | 4       | 100   | `skill/skill_shouhuakuangbao_40127.js`     | task 6                                          |

## Help (ispet 2)

| Id    | Quomodo | Prob. | Script                                  | Status                                          |
| ----- | ------- | ----- | --------------------------------------- | ----------------------------------------------- |
| 40001 | 8       | 21    | `skill/skill_chonggong_40001.js`        | ported (task 5)                                 |
| 40002 | 9       | 11    | `skill/skill_chongjiaxue_40002.js`      | task 6                                          |
| 40003 | 9       | 11    | `skill/skill_chongjialan_40003.js`      | task 6                                          |
| 40004 | 1       | 21    | -                                       | no script (data row; skip or filter from pools) |
| 40005 | 1       | 21    | -                                       | no script (data row; skip or filter from pools) |
| 40006 | 3       | 10    | `skill/skill_chongdang_40006.js`        | task 6                                          |
| 40007 | 8       | 21    | `skill/skill_chongzhuoshi_40007.js`     | task 6                                          |
| 40008 | 8       | 19    | `skill/skill_chongxixue_40008.js`       | task 6                                          |
| 40009 | 8       | 21    | `skill/skill_chongdingyao_40009.js`     | task 6                                          |
| 40010 | 8       | 17    | `skill/skill_chonglianji_40010.js`      | task 6                                          |
| 40011 | 9       | 21    | -                                       | no script (data row; skip or filter from pools) |
| 40012 | 1       | 100   | `skill/skill_chonghuafen_40012.js`      | task 6                                          |
| 40013 | 8       | 16    | `skill/skill_chongchanrao_40013.js`     | task 6                                          |
| 40014 | 1       | 100   | `skill/skill_chongtaiyang_40014.js`     | task 6                                          |
| 40015 | 8       | 16    | `skill/skill_chongzhongya_40015.js`     | task 6                                          |
| 40016 | 8       | 21    | -                                       | no script (data row; skip or filter from pools) |
| 40017 | 8       | 21    | -                                       | no script (data row; skip or filter from pools) |
| 40098 | 1       | 100   | `skill/skill_jueduizhongcheng_40098.js` | task 6                                          |
| 40100 | 1       | 100   | `skill/skill_yazhi_40100.js`            | task 6                                          |
| 40104 | 1       | 100   | `skill/skill_xingyun_40104.js`          | task 6                                          |
| 40105 | 1       | 100   | `skill/skill_eyun_40105.js`             | task 6                                          |
| 40114 | 1       | 100   | `skill/skill_hanbinghuxi_40114.js`      | task 6                                          |
| 40115 | 1       | 100   | `skill/skill_fangshoufanji_40115.js`    | task 6                                          |
| 40116 | 8       | 17    | `skill/skill_chonglianji_40010.js`      | task 6                                          |
| 40121 | 3       | 17    | `skill/skill_chongtunshi_40121.js`      | task 6                                          |
| 40128 | 5       | 30    | `skill/skill_shazhishouhu_40128.js`     | task 6                                          |
| 40129 | 4       | 15    | `skill/skill_shuilongbo_40129.js`       | task 6                                          |
| 40130 | 2       | 18    | `skill/skill_suanyefushi_40130.js`      | task 6                                          |
| 40131 | 1       | 100   | `skill/skill_yuansujingtong_40131.js`   | task 6                                          |
| 40132 | 2       | 21    | `skill/skill_leiyunfengbao_40132.js`    | task 6                                          |
| 40133 | 4       | 18    | `skill/skill_huanhua_40133.js`          | task 6                                          |
| 40134 | 8       | 23    | `skill/skill_heianzhangkong_40134.js`   | task 6                                          |
| 40135 | 8       | 32    | `skill/skill_xugoupao_40135.js`         | task 6                                          |

## Pass (ispet 3)

No scripts. A slotted Pass skill adds its `skillAdd` row (pet-skills.json) to the master through
`petPassBonuses` / `petFighterInput` before `deriveStats`, like skilladd.ini rows of passives.

- 2011 rows (69): 40043-40056 and 50001-50055.
- Reborn-only book rows (29): 50056, 50058-50070, 50072-50086. 50057 and 50071 are omitted (no
  tooltip value).

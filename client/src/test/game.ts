import type { Character, CharacterStats } from '@pockie/shared'
import type { InventoryItem, Quest, QuestOffer, SceneView } from '../game/types'

export const character: Character = {
  id: 'c1',
  name: 'Ninja_01',
  gender: 0,
  nation: 0,
  clothing: 3,
  avatarId: 3,
  level: 1,
  exp: 5,
  stone: 100,
  gold: 0,
  giftCoupon: 10,
  honor: 0,
  hp: 120,
  mp: 30,
  maxHp: 160,
  maxMp: 40,
  hpPouch: 0,
  mpPouch: 0,
  pouchMax: 10000,
  sceneId: 111,
}

export const stats: CharacterStats = {
  strength: 1365,
  agility: 1365,
  stamina: 1365,
  maxHp: 160,
  maxMp: 40,
  minAttack: 8,
  maxAttack: 9,
  atkTime: 1000,
  defense: 154,
  dodge: 1,
  hit: 0,
  crit: 0,
  critAttach: 230,
  parry: 2,
  pierce: 0,
  tough: 0,
  neglectDefense: 0,
  counter: 5,
  weaponClass: 4,
}

/** Quest 90002 (equip the weapon), handed out by the Fire Village Elder. */
export const equipOffer: QuestOffer = {
  taskId: 90002,
  npcId: 'n11001',
  sceneId: 111,
  nameKey: 'lg_Task_90002',
  talkKey: null,
}

export const villageScene: SceneView = {
  sceneId: 111,
  nameKey: 'lg_Scene_BackGround_111',
  monsters: [],
  npcs: [{ id: 'n11001', nameKey: 'lg_name_n11001', x: 0, y: 0, scale: 100 }],
  exploreSpots: [],
  links: [171],
  revive: { homeExpLoss: 0, gold: 1, goldAllowed: true },
}

export const newbiePackQuest: Quest = {
  taskId: 90001,
  state: 0,
  progress: [0],
  nameKey: 'lg_Task_90001',
  descriptionKey: 'lg_TaskDes_90001',
  steps: [{ descriptionKey: 'lg_SubTaskDes_90001', target: 1 }],
}

export const potion: InventoryItem = {
  id: '00000000-0000-7000-8000-000000000001',
  itemId: 'i160006',
  count: 2,
  bound: false,
  equippedSlot: null,
  nameKey: 'lg_HP1_itemname',
}

export const fists: InventoryItem = {
  id: '00000000-0000-7000-8000-000000000002',
  itemId: 'i270100',
  count: 1,
  bound: true,
  equippedSlot: null,
  nameKey: 'lg_Equip_GlovesNewbie',
}

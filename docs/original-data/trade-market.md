# Original data: player trade and the Market

Reference for milestone 4 (Social & Competition): direct player-to-player trade and the player
Market (listings, buy orders, market warehouse). Sources:

- J = decompiled game server `local-run/.runtime/decompiled/service/com/d2/serv/game`
  (`CommerceModule/ExchangeSystem.java`, `CommerceModule/MartSystem.java`,
  `ContainerModule/ContainerSystem.java`, `CapitalModule/CapitalSystem.java`,
  `LiveModule/StateSystem.java`, `LiveModule/AsynSystem.java`, `RoleModule/LookSystem.java`,
  `MailModule/MailSystem.java`).
- P = decompiled domain ("public data") server `.../service/com/d2/serv/pubdata/Mart/MartServer.java`.
  The Market's shared state lives here; game servers talk to it with `SendToDomain` and receive
  `CommandByPlayerName` callbacks.
- RES = `app/code/props/serv/game/Resource/` (`Box/BoxConfig.ini`, `item/item.ini`, `role/Look.ini`).
- C = client scripts `local-run/.runtime/swf/LittleNinjasClient/scripts/` (`GameUI/AsUILogic/UI_Exchange/`,
  `GameUI/AsUILogic/Mart/`, `GameUI/listcell/Mart*.as`, `SceneUI/UI_BottomMenu.as`).
- DT = `apache/source/binary/datatable` (`martsellshow.s34727.tab`, `martcollectshow.s34710.tab`,
  `martcollect.s34710.tab`).
- DB = `backupdb/*.sql` (table shapes only).

English text comes from `tools/i18n/en.json` (key prefix `lg_`). Currency ids: 0 = Stone,
2 = Gold, 3 = Gift Coupon (`CapitalSystem.GetCapitalPropIndex` 164-178).

## Overview

| Feature                                   | Server                              | State                               | Shipped in 2011?                                      |
| ----------------------------------------- | ----------------------------------- | ----------------------------------- | ----------------------------------------------------- |
| Direct trade (`ExchangeBox` window)       | `ExchangeSystem` (J), custom 70-75  | per player box + view 10/11         | **No.** Code present, module never registered (below) |
| Market listings ("Buy List" / "Sell")     | `MartSystem` (J) + `MartServer` (P) | domain field `mart`                 | Yes                                                   |
| Buy orders ("Sell List" / "Buy", Collect) | same, custom 420-427                | domain field `smart`                | Yes                                                   |
| Market warehouse + wallet                 | same, custom 256, 425-428           | domain field `depot`, `MartInfoRec` | Yes                                                   |
| Gold-for-Stone order book                 | none                                | -                                   | **Does not exist** (see note)                         |

Notes:

1. **Direct trade was switched off.** `CommerceModule/Main.java` registers `NpcShopSystem`,
   `RefreshShopSystem`, `MartSystem`, `VirtualShopSystem` and `MysticShopSystem`, but not
   `ExchangeSystem` (checked in both `app/code/lib/service.jar` and `app-tmp/code/lib/service.jar`).
   Its `ThreadInitialize` never runs, so customs 70-75 have no handler. The client agrees: the
   player menu defines `Menu_Player_Exchange = 5` "Trade" (`C/Common/PlayerMenuManager.as:27,52,61`)
   but no menu ever pushes it (chat, whisper, mail, home, match lists only push LookInfo,
   AddFriend, AddEnemy, Team, SendMail). Even with the module registered, items could not enter
   the trade box: `ContainerSystem.OnTestAdd/OnTestRemove` (694-848, 850+) have no `case 10/11`
   and return 0, and `IExchangeSystem` declares no methods, so `ExchangeSystem.OnTestAdd` is
   unreachable. The only working player-to-player channel in the shipped game was the Market.
   Player mail is text-only (`MailSystem` customs 137-147 have no item or money handling).
2. **"Stock" is not a currency exchange.** The `smart` field and `Stock*` handlers implement item
   **buy orders** (client name "Collect"): a buyer escrows Stone and/or Gold for up to 30 units of
   one item and sellers fill it. There is no Gold-for-Stone order book anywhere. Gold and Stone
   meet only indirectly, because a listing may carry both a Stone and a Gold price.
3. The live DB dumps (2011-12-21 … 2012-02-08) show the `mart` table holding only a handful of
   rows: the Market was barely used on that server.

## Part 1: Direct trade (`ExchangeSystem`, dormant)

Documented as the original design reference. Line numbers are `ExchangeSystem.java`.

### Data

| Item           | Value                                                                                                       |
| -------------- | ----------------------------------------------------------------------------------------------------------- |
| Box            | `ExchangeBox` per player, created on login (68-75); `BoxConfig.ini` 194-198: `BoxType=2`, 10 × 3 = 30 slots |
| Views          | 10 = own box, 11 = partner's box (each player sees the other's box live)                                    |
| Box properties | `PlayerID`, `PlayerName`, `IsLock`, `IsOK`, `ExchangeCapital0` (Stone), `ExchangeCapital2` (Gold)           |
| Player state   | `State` 5 = trading (`StateSystem`); 0 idle, 1 fighting, 2 dead, 4 auto-battle                              |
| Stats          | record `ExchgStat` (type, day, count) and property `ExchgTime` (last trade day)                             |

### Flow

| Step       | Custom (client → server)                                         | Server rule                                                                                                                                                                                                                                                                                                                                                        |
| ---------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1 Request  | 74 `EXCHANGE_REQUEST` `[targetName]`                             | requester level ≥ 20 (`FeedBack_Common_082`), state 0, not in the Las Noches auto challenge (`SingleGate_240`); target online (`_026`), level ≥ 20 (`_083`), neither in a team (`_080`, `_078`), target state 0 (`_027`), target not in Las Noches (`SingleGate_241`). Sends server custom 7 `[requesterName]` to the target and `_089` to the requester (190-241) |
| 2 Prompt   | client                                                           | target sees `Common_ExchangeRequest` OK/Cancel (`C/UI_Exchange/ExchangeView.as:53-73`); no timeout                                                                                                                                                                                                                                                                 |
| 3 Answer   | 75 `EXCHANGE_ANSWER` `[requesterName, permit]`                   | requester must exist, not be in a team, state 0 (else `_025`); answerer not in Las Noches. `permit == 2` declines (`_024` to requester). **Any other value accepts.** Binds both boxes, adds views 10/11, sets both states to 5, `_084` to both (243-297)                                                                                                          |
| 4 Offer    | container move (custom 63) / 73 `EXCHANGE_MONEY` `[type, value]` | money type 0 or 2; value is clamped to the balance (164-188). Items would be checked by `OnTestAdd` (587-614): source must be a bag view 25-28 or 10, box not locked/OK, `ItemBindingStatus != 1` (`_041`), not `CLASS_TASKITEM` (`_042`)                                                                                                                          |
| 5 Lock     | 71 `EXCHANGE_LOCK`                                               | ignored once self is OK. If the partner is OK and self is locked: clears partner OK and unlocks self. Else toggles own lock; messages `_085` / `_087` (119-150)                                                                                                                                                                                                    |
| 6 Confirm  | 70 `EXCHANGE_OK`                                                 | both must be locked; first OK sets `IsOK=1` and tells the partner `_086`; the second OK runs `ExchangeComplete` (87-117)                                                                                                                                                                                                                                           |
| 7 Complete | -                                                                | see below (299-529); `_088` "Trade successful!" to both                                                                                                                                                                                                                                                                                                            |
| Cancel     | 72 `EXCHANGE_CANCLE`                                             | `_039` to self, `_040` to partner, `ExchangeFail` (152-162)                                                                                                                                                                                                                                                                                                        |
| Logout     | callback `OnOffLine`                                             | `_038` to partner, `ExchangeFail` (77-85)                                                                                                                                                                                                                                                                                                                          |

`ExchangeComplete` order: check each side can pay its offered Stone/Gold (`_028`-`_031`), check
each side can receive the other's money without passing the cap (`_032`-`_035`), bag space for
each side (`CheckPackPlaceItems`, `_036`/`_037`); any failure calls `ExchangeFail`. Then move
items (`AutoPlacePackItems`), move money (capital reason 6), reset both boxes, remove views, set
both states to 0, write logs and stats. `ExchangeFail` (531-568) returns each box's items to its
owner's bag and resets everything.

### Limits and rules

| Rule                  | Original                                                                                                                                                                                                                                                         |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Level                 | both ≥ 20                                                                                                                                                                                                                                                        |
| Distance / scene      | **none**: the target is looked up by name server-wide (`GetPlayer`); `_026` reads "not in this area"                                                                                                                                                             |
| Team                  | neither may be in a team at request time; only the requester is rechecked at answer time                                                                                                                                                                         |
| Busy                  | state must be 0 (not fighting, dead, auto-battling or already trading); state 5 blocks fights (`StateSystem.CanChangeState` 44-77, `FightSystem.CanFight` 138-146) and scene changes (`SceneSystem` 283)                                                         |
| Item slots            | 30 per side (box and client grid `ImageGridList(30, …)`, `UI_Exchange.as:226`)                                                                                                                                                                                   |
| Currency              | Stone and Gold on the server; the client only has a Stone field (8 digits, `UI_Exchange.as:153-156, 476-486`)                                                                                                                                                    |
| Max currency          | receiver may not pass 100,000,000 (`CapitalSystem.CanIncCapital` 43-66)                                                                                                                                                                                          |
| Items                 | not bound (status 1), not quest items. **`CanTrade` is not checked** (unlike the Market)                                                                                                                                                                         |
| Equipped items        | cannot be offered (source must be a bag view)                                                                                                                                                                                                                    |
| Enhanced / identified | allowed; the item object moves as is                                                                                                                                                                                                                             |
| Fee / tax             | none. Stone received goes through the anti-addiction income multiplier (reason 6 is not exempt, `CapitalSystem` 92-94: 1.0, 0.5 after 3 h, 0 after 6 h for unverified minors, `AdultSystem` 464-485, 495-496), so the receiver can get less than the sender paid |
| Logs                  | `SavePlayerLog(103, partnerName, …, "In items: cfg,uid,count;…; Out Items: …; Inc money: 0\|n,2\|n; Dec money: …")` for both (447-450); capital logs reason 6                                                                                                    |
| Stats                 | `ExchgStat` row type 3 = all trades; type 0 = items both ways without money, 2 = items one way without money, 1 = money plus items both ways; other mixes are not counted (467-528). A `vars` list is built but never sent (leftover)                            |

### Client window (`UI_Exchange.as`)

Two panels (self, partner) with name, portrait (`LittleUserFace_<sex>_<cloth>_Role`), a 30-slot
grid, a Stone field (`Common_ExchangeStone` placeholder) and a status label (`Common_ExchangeWait`,
`Common_ExchangeLocked`, `Common_ExchangeSure`). Buttons Lock/Unlock, OK, Cancel; no close button.
OK is enabled only when both sides are locked. Bound items show greyed while dragged
(`onViewInHand` 296-322). Tooltips `Tip_ExchangeLock`, `Tip_ExchangeUnLock`, `Tip_ExchangeOK_UnLock`.
The window opens when both views arrive (`ExchangeView.as:38-46`) and closes when one is removed.

## Part 2: Market (`MartSystem` + `MartServer`)

### Access

| Rule          | Value                                                                                                                                                                                            |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Entry         | HUD bottom menu button `Mart` (`UI_BottomMenu.as:85, 169-192`), no NPC                                                                                                                           |
| Level         | client opens the window at **25** (`GameDefine.UseMart_LevelLimit`, `Mart_Sysinfo_019`); server only checks **5** when listing (`MartSystem.LevelLimit` 1519, 160-165)                           |
| Opening hours | every handler refuses between **06:00 and 09:00** server time with `Mart_CantOpenTime` (`CanUseMart` 1450-1457); no client check                                                                 |
| Busy lock     | each request takes the player's async lock (`AsynSystem.BeginWait`), released by the domain reply or after **30 s** (`AsynSystem` 38-50); while waiting the player cannot fight (`CanFight` 139) |
| Badge         | the button flashes while the warehouse has rows or the wallet holds money (`UI_BottomMenu.as:304-341`)                                                                                           |

### Listing eligibility (`OnTestAdd` 121-143, `CanSale` 270-288, `OnCustomMartSale` 145-268)

| Check           | Rule                                                                                                                                                           |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CanTrade`      | bit 2 (players) set: values 2 or 3 (`ItemBaseSystem.CanExchange` 135-141), and not an expired time-limited item                                                |
| Binding         | `ItemBindingStatus == 0`                                                                                                                                       |
| Market category | item has `MartType` in `item.ini` (otherwise silently ignored)                                                                                                 |
| Equipment       | must be identified with **2-4 properties** (blue or better); 0 or 1 property is refused                                                                        |
| Quest items     | not refused (10 `TaskItem`s have `CanTrade=2` and a `MartType`)                                                                                                |
| Equipped / bag  | **not checked on the server**: the client sends an object id; only `Exists(item)` is tested. The client lists bag items only (`MarcketMySellShowPage` 116-152) |
| Quantity        | 1 … stack size; a partial stack gets a fresh uid (cloned and destroyed)                                                                                        |

Eligible items: 5,590 of 7,369 have both `MartType` and `CanTrade` 2/3 (mostly 3,840 outfits,
812 pets, 356 equipment, 181 magic items, 93 food, 84+18 debris, 66 jewels, 42 skill books).

### Listing (custom 250 `[itemObject, count, priceStone, priceGold, hours]`)

| Field        | Rule                                                                                                                                                                                                            |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prices       | per unit. At least one of Stone/Gold > 0; each ≤ **1,000,000** (`Mart_Sysinfo_013`). The client sends -1 for "not offered"                                                                                      |
| Duration     | client choices **8, 12, 24 h** (`UI_MartSellSet.as:103`); server only requires `hours > 0` (no maximum)                                                                                                         |
| Fee          | **`floor((12.5 + 0.25 × level) × hours)` Stone**, paid up front, not refunded (`GetCharge` 1502-1507; reason 31). Level 25: 150/225/450; level 50: 200/300/600; level 90: 280/420/840                           |
| Max listings | **5** rows in the player's `SaleItemRec` (includes expired rows not yet moved to the warehouse; `Mart_Sysinfo_018`)                                                                                             |
| Messages     | `Mart_Sysinfo_011` (fee too high), `_012` fee paid, `_006` listed                                                                                                                                               |
| Effect       | the item is destroyed (or its stack reduced) in the bag **before** the domain stores it; equipment and pets are serialised (`PackItem`) into `PropRec`, every other item is kept only as `config + uid + count` |
| Category key | `MartType`, plus `_<quality>` for equipment: quality = property count - 1 → 1 blue (2 props), 2 orange (3), 3 gold (4) (`GetDomainRec` 1459-1469, `GetEquipQuality` 774-783)                                    |
| Logs         | `SaveItemLog(100, "sale item")`, `SavePlayerLog(100, uid, cfg, name, …, "amount, capital0, capital1, time")`                                                                                                    |

### Browse (custom 251 `[type, pos?, level?, quality?]` → server custom 70)

- The client builds the category path from `DT/martsellshow` (532 rows): top type 0 Weapon, 2 Armor,
  5 Outfit, 3 Gem, 4 Pet, 1 Item (`Mart_Arms`, `Mart_Armor`, `Mart_Coat`, `Mart_Gem`,
  `Mart_Material`, `Mart_Props`), then position (Weapon1/2/4 = the three class weapons; Hat, Cloth,
  Shoe, Glove, Belt, Ring, `TipEquipBaseType3`), level band (1-10 … 81-90) and quality
  (Blue/Orange/Gold); the quality index is sent +1 for weapons and armor. Outfits: sex × slot ×
  White/Blue/Orange. Gems, pets and items have their own sub-types.
- The server joins the ints with `_` into the record name and returns up to **200 rows**:
  seller, config, uid, count, Stone price, Gold price, end time (`OnCustomMartShow` 290-340).
- **Search** is client-side only: substring of the localised name inside the fetched category
  (`MarcketBuyShowPage.as:323-366`). **No sort.** Paging 8 rows.
- Expired rows met while browsing are removed (lazy expiry, see below).
- Equipment/pet tooltips: custom 255 `[uid, type]` → server custom 72 with the serialised item.

### Buy (custom 252 `[uid, currency 0=Stone 1=Gold, count, …categoryPath]`)

1. Game: currency 0/1, warehouse has < **15** rows (`Mart_Sysinfo_040`), take async lock, send to
   domain (`OnCustomMartBuy` 429-464).
2. Domain `OnMartCheckBuy` (P 396-495): listing exists (`Mart_Sysinfo_017`), not expired
   (`_005`, row removed), `count ≤ remaining` (`_010`), chosen price > 0. Replies with
   `unitPrice × count`.
3. Game `OnCommandCheckBuyBak` (583-616): not your own listing (`Mart_Sysinfo_016`, by name), can
   pay (`_004`), warehouse < 15; **charges the buyer** (reason 27).
4. Domain `OnMartBuy` (P 497-640) re-validates; decrements or removes the listing; the seller's
   wallet gets **`max(1, floor(total × 0.9))`** (10% tax, float math); the item goes to the
   **buyer's market warehouse** (`DepositItems`, source 0); the seller gets mail `MarkerMail_0005`
   and, if online, a record update (`OnCommandSellOut` 618-646, `Mart_Sysinfo_008` when sold out).
   Logs: buyer 101, seller 111, tax 3.

Partial purchases of a stack are allowed. The client confirms with `Common_MartBuyPK` and checks
the balance first (`UI_MartBuySet.as:167-214`).

### Expiry, cancel and returns

| Action                       | Custom / path                                                                         | Effect                                                                                                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Expiry                       | lazy: any browse of that category (P `OnMartRemove` 371-394)                          | listing row removed, seller mailed `MarkerMail_0006`; the seller's `SaleItemRec` row stays until moved. Nothing happens if nobody browses that category |
| Take down ("Claim" button)   | 254 `MART_RECYCLE [uid, config]` (466-486, P 642-668)                                 | listing removed, own row marked `endTime = -1` ("Stale")                                                                                                |
| Move to warehouse ("Stored") | 426 `MART_DEPOT_SALE [uid, config]` (967-994, P 670-706)                              | listing and own row removed, item deposited to own warehouse (source 1). **Not restricted to expired rows**                                             |
| Claim item                   | 425 `MART_DEPOT_GET [serial]` (1034-1059, P 1241-1282, `OnCommandGetCheck` 1208-1285) | bag check (`Mart_Sysinfo_023`); equipment/pets are unpacked with their uid; other items are **recreated from config** in stacks                         |
| Claim money                  | 256 `MART_GAIN` (564-581, P 759-818, `OnCommandGain` 699-756)                         | moves the whole wallet (Stone and Gold) to the character, reason 33 (no anti-addiction cut); refused if it would pass the cap (`_021`/`_022`)           |

The "warehouse" (`MartDepotRec`, client tab 5) holds up to **15** rows (checked before every
operation that adds one; the domain record allows 50). Row: serial, source (0 bought, 1 own
listing returned, 2 buy order partial, 3 buy order complete, 4 failed sale into an order;
`Common_MarcketDepotFrom0-5`), config, count, identify property list. The "wallet"
(`MartCapital0` Stone, `MartCapital1` Gold) is shown in the same tab.

Expired listings are **not** mailed back. Mail only notifies (system hint mail type 10, tab
`Common_MailMartMailTab`, `MailSystem.OnDomainMessage` 644-668). Mail keys used: `MarkerMail_0005`
sold, `_0006` listing expired, `_0008` buy order complete, `_0009` buy order expired, `_0010`
sale into order failed. `_0001`-`_0004` and `_0007` are unused.

### Buy orders ("Collect", customs 420-427)

| Step                | Path                                                                                                                                                                                                                                                      | Rule                                                                                                                                                                                                                                                                                                                                               |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create              | 420 `MART_STOCK [config, count, priceStone, priceGold, hours]` (785-833) → P `OnCheckNewStock` 1421-1442 → `OnCommandStockBack` 1317-1404 → P `OnStockNew` 963-1058                                                                                       | item has `StockType` (client list `DT/martcollect`: 434 items, outfits, gems, pets, bags, food, VIP items, scrolls); count 1-30 (1 for equipment, outfits, pets); prices ≤ 1,000,000, one > 0; max **8** open orders (domain allows 20 indexes); fee as for listings (reason 88); **escrow `price × count` in every offered currency** (reason 89) |
| Browse              | 421 `MART_QUERY_STOCK [path…]` → server custom 73 (835-886)                                                                                                                                                                                               | category tree `DT/martcollectshow` (227 rows): Outfit, Gem, Pet, Item; up to 200 rows: buyer, index, config, filled, max, Stone, Gold, end time                                                                                                                                                                                                    |
| Fill (sell into it) | item dragged into `MartBox` (view 19, 1 slot, `BoxConfig.ini` 242-246) then 422 `MART_STOCK_SALE [buyer, index, count, currency 0/2, …path]` (888-965) → P `OnStockCheck` 1089-1196 → `OnCommandStockDestroyItem` 1406-1448 → P `OnStockSaleOK` 1543-1719 | not your own order; not equipment; whole stack in the box must equal `count`; count ≤ remaining (`_034`); escrow covers it. The item is **destroyed first**; seller's wallet gets `max(1, floor(price × count × 0.9))`; escrow and filled count update; when full the order leaves the list and the buyer is mailed `_0008`                        |
| Cancel              | 424 `MART_STOCK_OFF [index, config]` (1061-1093, P 1198-1239)                                                                                                                                                                                             | listing removed, order marked `endTime = -1`                                                                                                                                                                                                                                                                                                       |
| Collect             | 427 `MART_DEPOT_STOCK [index, config]` (996-1032, P `OnMartStockDepot` 708-757)                                                                                                                                                                           | bought units to the warehouse (source 2, or 3 when complete), remaining escrow to the wallet. Client offers it only for complete or timed-out orders; **the server allows it any time and does not remove the public order row**                                                                                                                   |

### Advertise in chat

`Show` buttons on own listings and orders send customs 282/286 (`LookSystem` 242-299); cost
**2 Gold** (`RES/role/Look.ini [Show] Capital=2,2`); only your own listing (uid must be in your
`SaleItemRec`). The domain keeps the last 100 shown items (`ShowItemRec`, P 915-957).

## Part 3: Atomicity in the original, bugs and exploits

### How the Market avoids duplication

- One domain process owns the shared records, so domain handlers are serialised. Every money or
  item hand-off uses the player's async lock plus a **serial** stored on both sides:
  - Wallet claim: the domain moves the balance into "pending" columns and issues
    `"<seq>_<stone>_<gold>"` (`GetGainSerial` P 1760-1783); the game credits once and stores the
    serial in `MartGainSeri`; the domain clears pending on the follow-up message (P 820-840) or,
    after a crash, on the next login (P 231-248).
  - Warehouse claim: serial `"<time>_<seq>"` (`GetDepotSerial` P 1734-1758); the game stores the last
    claimed serial in `MartGetSeri` and refuses a repeat; the domain deletes rows it sees confirmed.
- Listed items leave the bag before the domain stores them; bought items arrive in the warehouse,
  not the bag, so the bag never has to be checked across servers.

### Bugs and exploits (direct trade, dormant)

| #   | Issue                                                                                                                                                                                                                                                                            |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | **Bait and switch:** `OnCustomExchangeMoney` (164-188) ignores `IsLock`/`IsOK` and does not reset the partner's OK. A player can lower the offered Stone after both locked and the partner confirmed; `ExchangeComplete` reads the new value. The client only disables the field |
| T2  | No pending request is stored. Custom 75 accepts any online player name, so a crafted client can force a trade window open with anyone idle and not in a team                                                                                                                     |
| T3  | `permit` other than 2 (e.g. 0) counts as accept                                                                                                                                                                                                                                  |
| T4  | The answerer's state and team are not rechecked; accepting a stale request while already trading rebinds views 10/11 and leaves the third player's window pointing at the wrong box                                                                                              |
| T5  | `CanTrade` is never checked, so NPC-only items (`CanTrade=1`) would be tradable                                                                                                                                                                                                  |
| T6  | Received Stone is reduced by the anti-addiction multiplier while the sender pays in full (money destroyed)                                                                                                                                                                       |
| T7  | Negative money amounts are harmless (`CanDecCapital`/`CanIncCapital` return 0 for values ≤ 0), but nothing rejects them                                                                                                                                                          |

### Bugs and exploits (Market)

| #   | Issue                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | **Buyer pays, gets nothing.** The buyer is charged in step 3 and `OnMartBuy` re-validates afterwards. If another buyer, the seller's "move to warehouse" or expiry wins the race, every failure branch only writes log 109; **no refund** (P 510-573)                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| M2  | **Seller loses the item.** The item is destroyed before the domain stores the listing; if `AddRecordRows` fails (seller's domain `SaleRec` is capped at 10 rows, category at 9,999) nothing is returned. `OnMartSale` also silently deletes an older row with the same uid (P 347-350)                                                                                                                                                                                                                                                                                                                                                                                                                        |
| M3  | **Buy-order seller loses the item.** `OnCommandStockDestroyItem` destroys the item, then `OnStockSaleOK` re-validates; only the "not enough remaining" branch returns it (`StockSaleFail`, source 4). If the order was cancelled, completed or collected meanwhile, or escrow ran short, the item is gone                                                                                                                                                                                                                                                                                                                                                                                                     |
| M4  | **Buy-order escrow and fee lost.** `OnCommandStockBack` charges fee and escrow before `OnStockNew`, whose failure branches only log 109                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| M5  | **Money/item duplication via stale buy orders (from code reading, not reproduced).** `OnMartStockDepot` deletes the buyer's order row but not the public category row, and fills never check `endTime`. Flow: buyer collects an expired (or, with a crafted client, active) order E while nobody has browsed its category, so the public row survives; buyer opens a new order, which reuses the lowest free index; a partner fills the stale public row; the domain finds the new order by index, pays the seller 90% from the already refunded escrow and **overwrites the new order's escrow and filled count with the stale values** (P 1644-1657). The buyer then collects the inflated escrow and items |
| M6  | Duration has no server maximum; `hours × 3600` can overflow `int` (needs ~596,524 h; the fee makes it impractical)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| M7  | Non-equipment items are recreated from config on delivery: instance state is lost (time-limited items get a fresh timer, outfit recast stats are dropped, binding falls back to the item default)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| M8  | Listing takes an object id and does not check the item is in the seller's bag (equipped items or, if ids leak, other players' objects)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| M9  | Tax uses float (`value * 0.9f`): rounding errors above ~16.7 million per sale                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| M10 | Some error paths never release the async lock (`OnCommandGain` 716-721 serial mismatch, `OnCommandGetCheck` 1224-1226 `maxNum <= 0`), blocking fights and Market use for 30 s                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| M11 | Records are keyed by **character name** (`<name>SaleRec`, `MartInfoRec`, mail recipient); a rename would orphan listings, orders, wallet and warehouse                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| M12 | A wallet over the cap can never be claimed (all-or-nothing `CanIncCapital` check)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| M13 | Lazy expiry: listings of categories nobody browses never expire publicly and their seller is never mailed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| M14 | Dead code: `OnCommandRecycle` (648-697, command 155) and `OnCheckRecycle` (P 1320-1380, domain 30), `OnCommandStockOff` (1125-1160, domain 31), `OnStockOff` helper, `OnCommandSale` (413-427); client customs 253 and 423 are defined but never sent                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

## Part 4: Data files and config values

| Source                                     | Content                                                                                           | Imported?                     |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------- | ----------------------------- |
| `item.ini` `CanTrade`                      | 0 none, 1 NPC only, 2 players only, 3 both (`C/Common/Define/GameDefine.as:200-206`)              | yes (`items.json`)            |
| `item.ini` `MartType`                      | listing category path, 5,750 items, 361 distinct values (e.g. `0_0_7` weapon/class 1/level 71-80) | yes (`items.json`), unused    |
| `item.ini` `StockType`                     | buy-order category path, 5,027 items, 227 distinct values                                         | yes (`items.json`), unused    |
| `item.ini` `BindingType`, `ItemMaxFoldNum` | binding and stack size                                                                            | yes                           |
| `DT/martsellshow.s34727.tab`               | listing category tree: `ID, StepName1-4, StepDes2-4`, 532 rows                                    | no → `market-categories.json` |
| `DT/martcollectshow.s34710.tab`            | buy-order category tree, 227 rows                                                                 | no → same file                |
| `DT/martcollect.s34710.tab`                | buy-order item picker: `ID, IDType, StepName1-4, StepDes2-4, OkIndex`, 434 items                  | no → same file                |
| `BoxConfig.ini`                            | `ExchangeBox` 10 × 3, `MartBox` 1 × 1                                                             | no (constants)                |
| `role/Look.ini`                            | `[Show] Capital=2,2` (chat advert costs 2 Gold)                                                   | no (constant)                 |
| DB `mart` table                            | `FIELD_NAME` (`mart`, `smart`, `depot`) + `FIELD_DATA` blob                                       | n/a                           |

Hard-coded values:

| Value                                                                    | Where                                              |
| ------------------------------------------------------------------------ | -------------------------------------------------- |
| Trade level 20 (both)                                                    | `ExchangeSystem` 192, 214                          |
| Trade slots 30                                                           | `BoxConfig.ini`, `UI_Exchange.as:226`              |
| Market level 25 (client), 5 (server listing)                             | `GameDefine.as:36`, `MartSystem` 1519              |
| Closed 06:00-09:00                                                       | `MartSystem.CanUseMart` 1450-1457                  |
| Max price 1,000,000 per unit                                             | `MartSystem` 173, 803, 1337                        |
| Durations 8 / 12 / 24 h                                                  | `UI_MartSellSet.as:103`, `UI_MartCollectSet`       |
| Fee `(12.5 + 0.25 × level) × hours` Stone (10,000 if level or hours ≤ 0) | `MartSystem.GetCharge` 1502-1507                   |
| Tax 10% (seller gets `max(1, floor(0.9 × total))`)                       | P 593-598, 1669-1672                               |
| Max listings 5                                                           | `MartSystem` 166                                   |
| Max buy orders 8 (domain 20)                                             | `MartSystem` 810, 1346; P 1431                     |
| Buy order count 1-30                                                     | `MartSystem` 797, 1329                             |
| Warehouse 15 rows (domain 50)                                            | `MartSystem` 449, 603, 946, 976, 1005; P 409, 1453 |
| Browse page 200 rows (client 8 per page)                                 | `MartSystem` 335, 881                              |
| Currency cap 100,000,000                                                 | `CapitalSystem` 55-63                              |
| Async lock timeout 30 s                                                  | `AsynSystem` 44                                    |
| Chat advert 2 Gold, last 100 kept                                        | `Look.ini`, P 925-929                              |

Capital reasons: 6 trade, 27 Market purchase, 31 listing fee, 33 wallet claim, 88 buy-order fee,
89 buy-order escrow, 91 escrow refund (dead path), 35 chat advert. Player log types: 100 listed,
101 bought, 102 recycled (dead), 103 trade, 105 order created, 106 sold into order, 107 order
refund (dead), 109 Market failure, 110 warehouse claim, 111 sold; domain logs 2 wallet in/out,
3 tax.

## Part 5: Client windows

| Tab (`UI_Marcket.as:56-60`)           | Page                                                 | Content and actions                                                                                                                                                                                           |
| ------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0 "Buy List" `Common_MartTabBuy`      | `MarcketBuyShowPage`, `MartBuyListCell`              | type toggles + Pos/Level/Quality combos, name search box, 8-row pages; columns name (quality colour), level, count, Stone, Gold ("--" if none), time left, Buy                                                |
| (dialog) buy                          | `UI_MartBuySet`                                      | Stone/Gold radio (disabled when no price), quantity 1…count, total and balance, confirm                                                                                                                       |
| 1 "Sell List" `Common_MartTabCollect` | `MarcketCollectShowPage`, `MartCollectListCell`      | open buy orders: name, level, filled/max, Stone, Gold, time left, Sell                                                                                                                                        |
| (dialog) sell into order              | `UI_MartCollectAcceptSet`                            | one-slot `MartBox`, currency radio, shows proceeds after 10% tax (`Common_MartCotActAsk`)                                                                                                                     |
| 2 "Status" `Common_MartTabSelling`    | `MarcketSellingShowPage`, `MartSellingListCell`      | own listings (`SaleItemRec`): take down (254), move to warehouse when expired (426), Show (282)                                                                                                               |
| 3 "Sell" `Common_MartTabSell`         | `MarcketMySellShowPage`                              | sellable bag items (unbound, `CanTrade` 2/3, equipment with ≥ 2 properties) → `UI_MartSellSet`: Stone/Gold checkboxes and prices (≤ 1,000,000), quantity, 8/12/24 h, fee preview, rules text `Common_SellDes` |
| 4 "Buy" `Common_MartTabMyCollect`     | `MarcketMyCollectShowPage`, `MartCollectingListCell` | own orders (`StockItemRec`), escrow totals, New order (`UI_MartCollectSet`: item picker tree, count, prices, duration, fee), cancel (424), collect (427), Show (286)                                          |
| 5 Warehouse                           | `MarketDepotPage`, `MarcketDepotListCell`            | rows with source label and claim button (425); wallet Stone/Gold with one claim button (256)                                                                                                                  |

Time left is shown as `HH:MM` from the server end time; at 0 the row shows `Common_OutTime` and
actions are disabled. There is no time-of-day check on the client.

Copy notes for our English pass (the source strings are reused for other meanings):
`FeedBack_Common_026` really means "player not online", `_089` means "Trade request sent to {0},
please wait", `Mart_Sysinfo_040` ("Got …") is shown when the warehouse is full,
`Mart_Sysinfo_005` when a listing has expired, `MarkerMail_0005` `{@1}` is the buyer,
`Common_Down` "Claim" is the take-down button and `Common_InDepot` "Stored" the move-to-warehouse
button, `Common_MarcketDepotFrom1` "Sale failed" is a returned listing.

## Part 6: Dependencies

| Dependency      | Original                                                                                                        | Port impact                                                           |
| --------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Mail            | text-only system mail type 10 for sold / expired / order complete / order expired / failed sale; no attachments | needs M4 mail (system messages); items and money never travel by mail |
| Friends         | none: trade and Market never check friendship                                                                   | none                                                                  |
| Team            | trade refused while either side is in a team                                                                    | party system (M4) must expose "in team"                               |
| Identify system | equipment needs 2-4 properties; quality bucket from the count                                                   | `inventory_items.props` / `identifyCount` (done in M3)                |
| Chat            | Show buttons post a paid item link                                                                              | optional                                                              |
| Anti-addiction  | trade Stone income multiplier                                                                                   | not ported (we have no adult system)                                  |

## Recommended scope for M4

Port 1:1:

- Market listings: eligibility (`CanTrade & 2`, unbound, in bag and not equipped, `MartType` set,
  equipment 2-4 properties), per-unit Stone and/or Gold price ≤ 1,000,000, durations 8/12/24 h,
  fee `floor((12.5 + 0.25 × level) × hours)` Stone, 5 listings, partial purchases, no self-buy,
  10% tax with a minimum payout of 1, category tree from `martsellshow` (import
  `market-categories.json`), 8-row pages, name filter.
- Market warehouse (15 rows) and wallet with explicit claim, so the bag never blocks a sale.

Simplify:

- One Postgres transaction per action instead of the game/domain round trips; drop serials,
  validation strings and the 30 s async lock.
- Keep the listed `inventory_items` row (move it to a `market` location or a listing table that
  references it) so instance state (enhance, props, binding, durability) survives; never recreate
  from config (fixes M7).
- Expiry by query (`expires_at > now()`) plus a periodic sweep that returns items to the warehouse
  and sends the mail, instead of lazy expiry on browse (fixes M13).
- Server-side sort (price, time left) and name search are cheap additions; ask first (Q11).
- Defer buy orders ("Collect") unless the product owner wants them (Q6); if ported, delete the
  public row with the order and check `expires_at` on fill (fixes M5).
- Direct trade: the original never shipped it (Q1). If we add it, use the design above with the
  fixes below.

Security notes:

- Lock rows in a fixed order (both characters by id, then the listing) with `SELECT … FOR UPDATE`,
  as `shop/routes.ts` already does with `lockCharacter`; check balances, bag space and listing
  state inside the same transaction; charge only when the purchase commits (fixes M1-M4).
- Use conditional updates such as `count = count - n WHERE count >= n AND expires_at > now()`;
  never trust client prices, totals or object ids; validate every id belongs to the caller
  (fixes M8).
- Integer math for tax (`floor(total * 9 / 10)`), `bigint` currencies and the original
  100,000,000 cap per currency (fixes M9).
- Key everything by character id, not name (M11).
- Trade, if built: store pending requests server-side with a short TTL; any change to either offer
  (items or money) clears both locks and confirmations; confirm against an offer version so a
  stale confirm fails; check `CanTrade & 2`, unbound, not equipped, not quest items; recheck
  state, team and level at accept and complete (fixes T1-T5).
- Rate-limit listing, buying and trade requests; write an audit table for every trade, listing,
  purchase, claim and tax (the original logs 100-111 show the fields worth keeping).

### Open questions for the product owner

1. Direct trade was disabled in the shipped game (module unregistered, menu entry hidden). Do we
   add it in M4 (with the fixes), or keep the Market as the only player-to-player channel?
2. If trade is added: Stone only (as the original window) or also Gold? Same-scene only, or
   any online player by name as the dormant code did?
3. Gold on the Market: allow Gold prices (players then trade the premium currency for items, an
   indirect Gold/Stone rate) or Stone only?
4. Market level: 25 (client) or 5 (server)? Recommendation: 25.
5. Keep the daily 06:00-09:00 closure? Recommendation: drop it (it was a maintenance window).
6. Include buy orders ("Collect", 8 orders, 30 units, escrow) in M4 or defer?
7. Keep the warehouse + wallet claim step, or deliver straight to the bag (falling back to the
   warehouse when full)? Recommendation: keep it, it removes bag-space races.
8. Expiry and sale notifications: system mail (needs M4 mail first) or in-game notices only?
9. Keep the fee formula, the 8/12/24 h choices, 5 listings, 15 warehouse rows and the 10% tax
   as they are?
10. Equipment needs 2-4 identified properties to be listed (grey and single-property gear cannot
    be sold). Keep?
11. Add server-side search by name and sort by price/time (not in the original)?
12. Quest items with `CanTrade=2` (10 items) are listable in the original. Keep or block?
13. Paid "Show in chat" advert (2 Gold): port with chat links or skip?

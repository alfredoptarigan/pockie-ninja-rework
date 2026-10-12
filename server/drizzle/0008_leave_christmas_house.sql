-- The Christmas House scenes (2104, 2204, 2304, 2404, 2504) are closed (CLOSED_SCENES in
-- @pockie/shared): they have no exits, so ninjas who travelled there are sent home to their
-- village (nation 0 Fire 111, 1 Water 121, 2 Earth 151, 3 Wind 141, 4 Lightning 131).
UPDATE "characters"
SET "scene_id" = CASE "nation"
  WHEN 0 THEN 111
  WHEN 1 THEN 121
  WHEN 2 THEN 151
  WHEN 3 THEN 141
  ELSE 131
END
WHERE "scene_id" IN (2104, 2204, 2304, 2404, 2504);

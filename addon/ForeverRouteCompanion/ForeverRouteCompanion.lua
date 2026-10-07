local addonName, WFRP = ...
WFRP = type(WFRP) == "table" and WFRP or {}
_G.WFRP = WFRP

local SCHEMA_VERSION = 2
local ADDON_PREFIX = "WFRP1"
local MAX_RUNS = 50

local function now() return time and time() or 0 end
local function normalize(value) return string.lower(tostring(value or "")):gsub("[%p%s]+", " "):gsub("^%s+", ""):gsub("%s+$", "") end

local function encode(value)
  value = tostring(value or "")
  return (value:gsub("([^%w%-_%.~])", function(character)
    if character == " " then return "+" end
    return string.format("%%%02X", string.byte(character))
  end))
end

local function decode(value)
  value = tostring(value or ""):gsub("+", " ")
  return (value:gsub("%%(%x%x)", function(hex) return string.char(tonumber(hex, 16)) end))
end

local function split(value, separator)
  local result = {}
  separator = separator or ","
  for entry in string.gmatch(value or "", "([^" .. separator .. "]+)") do table.insert(result, entry) end
  return result
end

local function isArray(value)
  if type(value) ~= "table" then return false end
  local maximum, count = 0, 0
  for key in pairs(value) do
    if type(key) ~= "number" or key < 1 or key % 1 ~= 0 then return false end
    maximum, count = math.max(maximum, key), count + 1
  end
  return maximum == count
end

local function jsonEscape(value)
  return tostring(value or ""):gsub("\\", "\\\\"):gsub('"', '\\"'):gsub("\n", "\\n"):gsub("\r", "\\r"):gsub("\t", "\\t")
end

local function json(value, seen)
  local kind = type(value)
  if kind == "nil" then return "null" end
  if kind == "boolean" then return value and "true" or "false" end
  if kind == "number" then return value == value and tostring(value) or "0" end
  if kind == "string" then return '"' .. jsonEscape(value) .. '"' end
  if kind ~= "table" then return '"' .. jsonEscape(tostring(value)) .. '"' end
  seen = seen or {}
  if seen[value] then return "null" end
  seen[value] = true
  local output = {}
  if isArray(value) then
    for index = 1, #value do table.insert(output, json(value[index], seen)) end
    seen[value] = nil
    return "[" .. table.concat(output, ",") .. "]"
  end
  for key, entry in pairs(value) do table.insert(output, json(tostring(key)) .. ":" .. json(entry, seen)) end
  table.sort(output)
  seen[value] = nil
  return "{" .. table.concat(output, ",") .. "}"
end

local function itemIDFromLink(link) return link and tonumber(string.match(link, "item:(%d+)")) or nil end

local function addUnique(list, value)
  if value == nil or value == "" then return end
  for _, current in ipairs(list or {}) do if tostring(current) == tostring(value) then return end end
  table.insert(list, value)
end

local function initializeDB()
  ForeverRouteCompanionDB = ForeverRouteCompanionDB or {}
  local db = ForeverRouteCompanionDB
  db.version = SCHEMA_VERSION
  db.flightPaths = db.flightPaths or {}
  db.plan = db.plan or {}
  db.runs = db.runs or {}
  db.characters = db.characters or {}
  db.peers = db.peers or {}
  db.settings = db.settings or { autoRecord = true, showMinimap = true, compactHud = true }
  return db
end

local function activeQuestIDs()
  local result = {}
  local count = C_QuestLog and C_QuestLog.GetNumQuestLogEntries and C_QuestLog.GetNumQuestLogEntries() or GetNumQuestLogEntries()
  for index = 1, count do
    local questID
    if C_QuestLog and C_QuestLog.GetInfo then
      local info = C_QuestLog.GetInfo(index)
      questID = info and not info.isHeader and info.questID or nil
    else
      local _, _, _, isHeader, _, _, _, id = GetQuestLogTitle(index)
      if not isHeader then questID = id end
    end
    if questID then table.insert(result, questID) end
  end
  table.sort(result)
  return result
end

local function completedQuestIDs()
  local result = {}
  for questID in pairs(WFRP_DUNGEON_QUEST_IDS or {}) do
    local complete = C_QuestLog and C_QuestLog.IsQuestFlaggedCompleted and C_QuestLog.IsQuestFlaggedCompleted(questID)
    if complete == nil and IsQuestFlaggedCompleted then complete = IsQuestFlaggedCompleted(questID) end
    if complete then table.insert(result, questID) end
  end
  table.sort(result)
  return result
end

local SLOT_NAMES = { [1]="Head", [2]="Neck", [3]="Shoulder", [5]="Chest", [6]="Waist", [7]="Legs", [8]="Feet", [9]="Wrist", [10]="Hands", [11]="Finger", [12]="Finger 2", [13]="Trinket", [14]="Trinket 2", [15]="Back", [16]="Main Hand", [17]="Off Hand", [18]="Ranged", [19]="Tabard" }

local function equippedItems()
  local result = {}
  for slot, label in pairs(SLOT_NAMES) do
    local link = GetInventoryItemLink and GetInventoryItemLink("player", slot)
    local itemID = GetInventoryItemID and GetInventoryItemID("player", slot) or itemIDFromLink(link)
    if itemID then
      local name, _, quality, itemLevel = GetItemInfo(itemID)
      table.insert(result, { slot = label, itemId = itemID, name = name or ("Item " .. itemID), quality = quality, itemLevel = itemLevel })
    end
  end
  table.sort(result, function(a, b) return a.slot < b.slot end)
  return result
end

local function professions()
  local result = {}
  if GetProfessions and GetProfessionInfo then
    local values = { GetProfessions() }
    for _, index in ipairs(values) do
      if index then
        local name, _, skill, maximum = GetProfessionInfo(index)
        if name then table.insert(result, { name = name, skill = skill or 0, maximum = maximum or 0 }) end
      end
    end
  elseif GetNumSkillLines and GetSkillLineInfo then
    for index = 1, GetNumSkillLines() do
      local name, isHeader, _, skill, _, _, maximum = GetSkillLineInfo(index)
      if name and not isHeader and maximum and maximum > 0 then table.insert(result, { name = name, skill = skill or 0, maximum = maximum }) end
    end
  end
  return result
end

local function talentSummary()
  local result, bestName, bestPoints = {}, "", -1
  if not GetNumTalentTabs or not GetTalentTabInfo then return result, bestName end
  for index = 1, GetNumTalentTabs() do
    local name, _, points = GetTalentTabInfo(index)
    if name then
      table.insert(result, { name = name, points = points or 0 })
      if (points or 0) > bestPoints then bestName, bestPoints = name, points or 0 end
    end
  end
  return result, bestName
end

local function freeBagSlots()
  local free = 0
  for bag = 0, 4 do
    if C_Container and C_Container.GetContainerNumFreeSlots then
      local slots = C_Container.GetContainerNumFreeSlots(bag)
      free = free + (slots or 0)
    elseif GetContainerNumFreeSlots then
      local slots = GetContainerNumFreeSlots(bag)
      free = free + (slots or 0)
    end
  end
  return free
end

local function durabilityPercent()
  local lowest = 100
  for slot = 1, 18 do
    local current, maximum
    if GetInventoryItemDurability then current, maximum = GetInventoryItemDurability(slot) end
    if current and maximum and maximum > 0 then lowest = math.min(lowest, current / maximum * 100) end
  end
  return math.floor(lowest + .5)
end

local function playerPosition()
  if not C_Map or not C_Map.GetBestMapForUnit or not C_Map.GetPlayerMapPosition then return nil end
  local mapID = C_Map.GetBestMapForUnit("player")
  if not mapID then return nil end
  local point = C_Map.GetPlayerMapPosition(mapID, "player")
  if not point then return { mapId = mapID } end
  return { mapId = mapID, x = point.x, y = point.y }
end

local function groupSnapshot()
  local result = {}
  local count = GetNumGroupMembers and GetNumGroupMembers() or 0
  local inRaid = IsInRaid and IsInRaid()
  local rosterCount = inRaid and count or math.max(0, count - 1)
  for index = 1, rosterCount do
    local unit = inRaid and ("raid" .. index) or ("party" .. index)
    if UnitExists(unit) then
      local name, realm = UnitName(unit)
      local _, class = UnitClass(unit)
      table.insert(result, { name = name or "Unknown", realm = realm or "", class = class or "", level = UnitLevel(unit) or 0, online = UnitIsConnected(unit) ~= false, leader = UnitIsGroupLeader and UnitIsGroupLeader(unit) or false })
    end
  end
  local playerName, playerRealm = UnitName("player")
  local _, playerClass = UnitClass("player")
  table.insert(result, 1, { name = playerName or "Unknown", realm = playerRealm or "", class = playerClass or "", level = UnitLevel("player") or 0, online = true, leader = UnitIsGroupLeader and UnitIsGroupLeader("player") or count == 0 })
  return result
end

local function questReadiness(dungeonID)
  local active, complete, missing, locked = {}, {}, {}, {}
  local activeSet = {}; for _, id in ipairs(activeQuestIDs()) do activeSet[id] = true end
  local completeSet = {}; for _, id in ipairs(completedQuestIDs()) do completeSet[id] = true end
  local faction = string.lower(UnitFactionGroup("player") or "")
  local level = UnitLevel("player") or 1
  for _, id in ipairs((WFRP_DUNGEON_QUESTS or {})[dungeonID] or {}) do
    local quest = (WFRP_QUESTS or {})[id] or {}
    local questFaction = string.lower(quest.faction or "both")
    local availableToFaction = questFaction == "both" or questFaction == faction
    if availableToFaction then
      if activeSet[id] then table.insert(active, id)
      elseif completeSet[id] then table.insert(complete, id)
      elseif tonumber(quest.level or 0) > level then table.insert(locked, id)
      else table.insert(missing, id) end
    end
  end
  return { active = active, complete = complete, missing = missing, locked = locked }
end

local function resolveDungeon(instanceName)
  local normalized = normalize(instanceName)
  if normalized == "" then return nil end
  for name, id in pairs(WFRP_DUNGEONS_BY_NAME or {}) do if normalize(name) == normalized then return id end end
  for name, id in pairs(WFRP_DUNGEONS_BY_NAME or {}) do local candidate = normalize(name); if string.find(normalized, candidate, 1, true) or string.find(candidate, normalized, 1, true) then return id end end
  return nil
end

local function characterSnapshot()
  local name, realm = UnitName("player"), GetRealmName()
  local faction = UnitFactionGroup("player")
  local _, class = UnitClass("player")
  local talents, spec = talentSummary()
  local cooldownStart, cooldownDuration = 0, 0
  if GetItemCooldown then cooldownStart, cooldownDuration = GetItemCooldown(6948) end
  local _, instanceType = IsInInstance()
  return {
    name = name or "Unknown", realm = realm or "", level = UnitLevel("player") or 1,
    xp = UnitXP("player") or 0, xpMax = UnitXPMax("player") or 0, restedXp = GetXPExhaustion and (GetXPExhaustion() or 0) or 0,
    faction = faction or "", class = class or "", spec = spec or "", talents = talents,
    gear = equippedItems(), professions = professions(), bindLocation = GetBindLocation and GetBindLocation() or "",
    flightPaths = initializeDB().flightPaths, money = GetMoney and GetMoney() or 0, freeBagSlots = freeBagSlots(), durability = durabilityPercent(),
    hearthReadyAt = cooldownStart > 0 and (cooldownStart + cooldownDuration) or 0,
    zone = GetRealZoneText and GetRealZoneText() or GetZoneText and GetZoneText() or "", subzone = GetSubZoneText and GetSubZoneText() or "",
    position = playerPosition(), inInstance = instanceType == "party" or instanceType == "raid", capturedAt = now(),
  }
end

local function saveCharacterSnapshot()
  local db, snapshot = initializeDB(), characterSnapshot()
  db.characters[(snapshot.name or "Unknown") .. "-" .. (snapshot.realm or "")] = snapshot
  db.lastCharacter = snapshot
  return snapshot
end

WFRP.session = WFRP.session or { lastLevel = 0, lastXp = 0, lastXpMax = 0 }

local function xpDelta()
  local level, xp, maximum = UnitLevel("player") or 1, UnitXP("player") or 0, UnitXPMax("player") or 0
  local previousLevel, previousXp, previousMax = WFRP.session.lastLevel, WFRP.session.lastXp, WFRP.session.lastXpMax
  WFRP.session.lastLevel, WFRP.session.lastXp, WFRP.session.lastXpMax = level, xp, maximum
  if previousLevel == 0 then return 0 end
  if level == previousLevel then return math.max(0, xp - previousXp) end
  if level > previousLevel then return math.max(0, previousMax - previousXp) + xp end
  return 0
end

local function trimRuns()
  local runs = initializeDB().runs
  while #runs > MAX_RUNS do table.remove(runs, 1) end
end

local function currentRun() return initializeDB().currentRun end

local function startRun(dungeonID, instanceName, manual)
  local db = initializeDB()
  if db.currentRun then return db.currentRun end
  local character = characterSnapshot()
  db.currentRun = {
    id = tostring(now()) .. "-" .. tostring(math.random(1000, 9999)), dungeonId = dungeonID or "unknown", dungeonName = (WFRP_DUNGEONS or {})[dungeonID] or instanceName or "Unknown dungeon",
    startedAt = now(), startLevel = character.level, startXp = character.xp, startXpMax = character.xpMax,
    totalXp = 0, combatXp = 0, questXp = 0, deaths = 0, bosses = {}, loot = {}, quests = {}, manual = manual == true,
    group = groupSnapshot(), restedStart = character.restedXp,
  }
  WFRP.session.lastLevel, WFRP.session.lastXp, WFRP.session.lastXpMax = character.level, character.xp, character.xpMax
  if WFRP.RefreshUI then WFRP.RefreshUI() end
  print("|cffffc44dWFRP:|r Recording " .. db.currentRun.dungeonName .. ".")
  return db.currentRun
end

local function stopRun(reason)
  local db, run = initializeDB(), currentRun()
  if not run then return nil end
  run.totalXp = run.totalXp + xpDelta()
  local character = characterSnapshot()
  run.endedAt = now(); run.duration = math.max(0, run.endedAt - run.startedAt)
  run.endLevel, run.endXp, run.endXpMax = character.level, character.xp, character.xpMax
  run.unclassifiedXp = math.max(0, run.totalXp - run.combatXp - run.questXp)
  run.restedEnd = character.restedXp; run.reason = reason or "manual"
  table.insert(db.runs, run); db.currentRun = nil; trimRuns(); saveCharacterSnapshot()
  if WFRP.RefreshUI then WFRP.RefreshUI() end
  print(string.format("|cffffc44dWFRP:|r Saved %s · %d XP · %s.", run.dungeonName, run.totalXp, SecondsToTime and SecondsToTime(run.duration) or (run.duration .. "s")))
  return run
end

local function updateRunXp()
  local delta = xpDelta()
  local run = currentRun()
  if run and delta > 0 then run.totalXp = run.totalXp + delta end
  if WFRP.RefreshUI then WFRP.RefreshUI() end
end

local function recordCombatXp(message)
  local run = currentRun(); if not run then return end
  local cleaned = tostring(message or ""):gsub(",", "")
  local amount = tonumber(cleaned:match("(%d+)%s+[Ee]xperience")) or tonumber(cleaned:match("(%d+)%s+[Xx][Pp]"))
  if amount then run.combatXp = run.combatXp + amount end
end

local function recordQuest(questID, xpReward)
  local run = currentRun(); if not run then return end
  addUnique(run.quests, questID); run.questXp = run.questXp + math.max(0, tonumber(xpReward) or 0)
end

local function recordLoot(message)
  local run = currentRun(); if not run then return end
  local link = tostring(message or ""):match("(|c%x+|Hitem:.-|h.-|h|r)") or tostring(message or ""):match("(|Hitem:.-|h.-|h)")
  local itemID = itemIDFromLink(link); if itemID then addUnique(run.loot, itemID) end
end

local function recordBoss(name)
  local run = currentRun(); if not run or not name then return end
  for _, boss in ipairs((WFRP_DUNGEON_BOSSES or {})[run.dungeonId] or {}) do if normalize(boss) == normalize(name) then addUnique(run.bosses, boss); return end end
end

local function updateInstance()
  local db = initializeDB()
  local name, instanceType = GetInstanceInfo()
  local inInstance = instanceType == "party"
  local dungeonID = inInstance and resolveDungeon(name) or nil
  if inInstance and dungeonID and db.settings.autoRecord and not db.currentRun then startRun(dungeonID, name, false) end
  if (not inInstance or not dungeonID) and db.currentRun and not db.currentRun.manual and now() - db.currentRun.startedAt > 30 then stopRun("left-instance") end
  if WFRP.RefreshUI then WFRP.RefreshUI() end
end

local function nextDungeon()
  local route = split(initializeDB().plan.route or "")
  return route[1], route[1] and ((WFRP_DUNGEONS or {})[route[1]] or route[1]) or nil
end

local function telemetryPayload()
  local db, character = initializeDB(), saveCharacterSnapshot()
  local recentRuns = {}
  for index = math.max(1, #db.runs - 24), #db.runs do if db.runs[index] then table.insert(recentRuns, db.runs[index]) end end
  local nextID = nextDungeon()
  return {
    schema = SCHEMA_VERSION, addonVersion = (GetAddOnMetadata and GetAddOnMetadata(addonName, "Version")) or (C_AddOns and C_AddOns.GetAddOnMetadata and C_AddOns.GetAddOnMetadata(addonName, "Version")) or "1.0.0", dataVersion = WFRP_DATA_VERSION or WFRP_DATA_FETCHED_AT,
    exportedAt = now(), character = character, quests = { active = activeQuestIDs(), complete = completedQuestIDs() }, runs = recentRuns,
    currentRun = db.currentRun, group = groupSnapshot(), peers = db.peers, plan = db.plan, readiness = nextID and questReadiness(nextID) or nil,
  }
end

local dialog
local function showText(title, value, editable, onAccept)
  if not dialog then
    dialog = CreateFrame("Frame", "ForeverRouteCompanionDialog", UIParent, BackdropTemplateMixin and "BackdropTemplate" or nil)
    dialog:SetSize(700, 300); dialog:SetPoint("CENTER"); dialog:SetFrameStrata("DIALOG"); dialog:SetClampedToScreen(true); dialog:EnableMouse(true)
    if dialog.SetBackdrop then dialog:SetBackdrop({ bgFile="Interface/Buttons/WHITE8X8", edgeFile="Interface/Tooltips/UI-Tooltip-Border", tile=false, edgeSize=14, insets={left=3,right=3,top=3,bottom=3} }); dialog:SetBackdropColor(.025,.035,.055,.99); dialog:SetBackdropBorderColor(.62,.46,.16,1) end
    dialog.title = dialog:CreateFontString(nil, "OVERLAY", "GameFontNormalLarge"); dialog.title:SetPoint("TOPLEFT", 18, -16)
    local close = CreateFrame("Button", nil, dialog, "UIPanelCloseButton"); close:SetPoint("TOPRIGHT", -4, -4)
    local scroll = CreateFrame("ScrollFrame", nil, dialog, "UIPanelScrollFrameTemplate"); scroll:SetPoint("TOPLEFT", 18, -48); scroll:SetPoint("BOTTOMRIGHT", -36, 54)
    dialog.edit = CreateFrame("EditBox", nil, scroll); dialog.edit:SetMultiLine(true); dialog.edit:SetAutoFocus(false); dialog.edit:SetFontObject(ChatFontNormal); dialog.edit:SetWidth(630); dialog.edit:SetScript("OnEscapePressed", function(self) self:ClearFocus(); dialog:Hide() end); scroll:SetScrollChild(dialog.edit)
    dialog.accept = CreateFrame("Button", nil, dialog, "UIPanelButtonTemplate"); dialog.accept:SetSize(120, 26); dialog.accept:SetPoint("BOTTOMRIGHT", -18, 16); dialog.accept:SetText("Import")
  end
  dialog.title:SetText(title); dialog.edit:SetText(value or ""); dialog.edit:SetFocus(); dialog.edit:HighlightText(); dialog.accept:SetShown(editable == true)
  dialog.accept:SetScript("OnClick", function() if onAccept then onAccept(dialog.edit:GetText()) end; dialog:Hide() end); dialog:Show()
end

local function importPlan(value)
  if string.sub(value or "", 1, 7) ~= "WFRP1P|" then print("|cffffc44dWFRP:|r Expected a WFRP1 planner string."); return false end
  local plan = {}
  for _, segment in ipairs(split(string.sub(value, 8), "|")) do local key, field = string.match(segment, "^([^=]+)=(.*)$"); if key then plan[key] = decode(field) end end
  initializeDB().plan = plan
  local route = split(plan.route or "")
  local nextName = route[1] and ((WFRP_DUNGEONS or {})[route[1]] or route[1]) or "none"
  print("|cffffc44dWFRP:|r Imported " .. #route .. " stops. Next: " .. nextName .. ".")
  if WFRP.RefreshUI then WFRP.RefreshUI() end
  return true
end

local function exportTelemetry() showText("Copy this into Forever Route Planner", "WFRP2C|payload=" .. encode(json(telemetryPayload())), false) end

local function sendPartyState()
  if not IsInGroup or not IsInGroup() or not C_ChatInfo or not C_ChatInfo.SendAddonMessage then return end
  local db, character = initializeDB(), characterSnapshot()
  local nextID = nextDungeon()
  local readiness = nextID and questReadiness(nextID) or { active = {}, missing = {} }
  local wishlistCount = #split(db.plan.wishlist or "")
  local message = table.concat({ "STATE", encode(character.name), encode(character.class), character.level, encode(nextID or ""), #readiness.active, #readiness.missing, db.currentRun and encode(db.currentRun.dungeonId) or "", wishlistCount }, "|")
  local instanceGroup = LE_PARTY_CATEGORY_INSTANCE and IsInGroup(LE_PARTY_CATEGORY_INSTANCE)
  C_ChatInfo.SendAddonMessage(ADDON_PREFIX, message, instanceGroup and "INSTANCE_CHAT" or "PARTY")
end

WFRP.GetDB = initializeDB
WFRP.GetCharacter = characterSnapshot
WFRP.GetQuestReadiness = questReadiness
WFRP.GetNextDungeon = nextDungeon
WFRP.GetTelemetry = telemetryPayload
WFRP.Export = exportTelemetry
WFRP.ImportPlan = importPlan
WFRP.StartRun = function(dungeonID) local id = dungeonID; if not id or id == "" then id = nextDungeon() end; return startRun(id, nil, true) end
WFRP.StopRun = stopRun
WFRP.SendPartyState = sendPartyState
WFRP.ShowImport = function() showText("Paste a planner route", "WFRP1P|", true, importPlan) end

SLASH_FOREVERROUTECOMPANION1 = "/wfrp"
SlashCmdList.FOREVERROUTECOMPANION = function(message)
  local command, rest = string.match(message or "", "^(%S*)%s*(.-)$"); command = string.lower(command or "")
  if command == "export" then exportTelemetry()
  elseif command == "import" then if rest == "" then WFRP.ShowImport() else importPlan(rest) end
  elseif command == "next" then local _, name = nextDungeon(); print("|cffffc44dWFRP:|r Next: " .. (name or "No route imported") .. ".")
  elseif command == "start" then WFRP.StartRun(rest)
  elseif command == "stop" then stopRun("manual")
  elseif command == "share" then sendPartyState()
  elseif command == "reset" and rest == "runs" then initializeDB().runs = {}; print("|cffffc44dWFRP:|r Run history cleared."); if WFRP.RefreshUI then WFRP.RefreshUI() end
  else if WFRP.ToggleUI then WFRP.ToggleUI() else print("|cffffc44dWFRP:|r /wfrp export · import · next · start · stop · share") end end
end

local events = CreateFrame("Frame")
for _, event in ipairs({ "PLAYER_LOGIN", "PLAYER_LOGOUT", "PLAYER_ENTERING_WORLD", "ZONE_CHANGED_NEW_AREA", "PLAYER_XP_UPDATE", "PLAYER_LEVEL_UP", "QUEST_TURNED_IN", "CHAT_MSG_COMBAT_XP_GAIN", "CHAT_MSG_LOOT", "PLAYER_DEAD", "COMBAT_LOG_EVENT_UNFILTERED", "INSTANCE_ENCOUNTER_ENGAGE_UNIT", "TAXIMAP_OPENED", "GROUP_ROSTER_UPDATE", "CHAT_MSG_ADDON" }) do events:RegisterEvent(event) end
events:SetScript("OnEvent", function(_, event, ...)
  local db = initializeDB()
  if event == "PLAYER_LOGIN" then
    math.randomseed(now()); saveCharacterSnapshot(); WFRP.session.lastLevel, WFRP.session.lastXp, WFRP.session.lastXpMax = UnitLevel("player") or 1, UnitXP("player") or 0, UnitXPMax("player") or 0
    if C_ChatInfo and C_ChatInfo.RegisterAddonMessagePrefix then C_ChatInfo.RegisterAddonMessagePrefix(ADDON_PREFIX) end
    C_Timer.After(1, function() updateInstance(); sendPartyState(); if WFRP.RefreshUI then WFRP.RefreshUI() end end)
  elseif event == "PLAYER_LOGOUT" then saveCharacterSnapshot()
  elseif event == "PLAYER_ENTERING_WORLD" or event == "ZONE_CHANGED_NEW_AREA" then C_Timer.After(.5, updateInstance)
  elseif event == "PLAYER_XP_UPDATE" or event == "PLAYER_LEVEL_UP" then updateRunXp()
  elseif event == "QUEST_TURNED_IN" then local questID, xpReward = ...; recordQuest(questID, xpReward); C_Timer.After(.1, updateRunXp)
  elseif event == "CHAT_MSG_COMBAT_XP_GAIN" then recordCombatXp(...)
  elseif event == "CHAT_MSG_LOOT" then recordLoot(...)
  elseif event == "PLAYER_DEAD" then if db.currentRun then db.currentRun.deaths = db.currentRun.deaths + 1 end
  elseif event == "INSTANCE_ENCOUNTER_ENGAGE_UNIT" then for index = 1, 5 do if UnitExists("boss" .. index) then recordBoss(UnitName("boss" .. index)) end end
  elseif event == "COMBAT_LOG_EVENT_UNFILTERED" then local _, subevent, _, _, _, _, _, _, destName = CombatLogGetCurrentEventInfo(); if subevent == "UNIT_DIED" then recordBoss(destName) end
  elseif event == "TAXIMAP_OPENED" then
    local known = {}; for _, name in ipairs(db.flightPaths) do known[name] = true end
    for index = 1, NumTaxiNodes() do if TaxiNodeGetType(index) ~= "NONE" then local name = TaxiNodeName(index); if name and not known[name] then known[name] = true; table.insert(db.flightPaths, name) end end end
    table.sort(db.flightPaths)
  elseif event == "GROUP_ROSTER_UPDATE" then sendPartyState(); if WFRP.RefreshUI then WFRP.RefreshUI() end
  elseif event == "CHAT_MSG_ADDON" then
    local prefix, message, _, sender = ...
    if prefix == ADDON_PREFIX and sender and not string.find(sender, UnitName("player") or "", 1, true) then
      local fields = split(message, "|")
      if fields[1] == "STATE" then db.peers[sender] = { name = decode(fields[2]), class = decode(fields[3]), level = tonumber(fields[4]) or 0, nextDungeon = decode(fields[5]), activeQuests = tonumber(fields[6]) or 0, missingQuests = tonumber(fields[7]) or 0, currentDungeon = decode(fields[8]), wishlistCount = tonumber(fields[9]) or 0, seenAt = now() }; if WFRP.RefreshUI then WFRP.RefreshUI() end end
    end
  end
end)

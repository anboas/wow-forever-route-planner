local addonName = ...
ForeverRouteCompanionDB = ForeverRouteCompanionDB or { flightPaths = {}, plan = {} }

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

local function join(values, separator)
  return table.concat(values, separator or ",")
end

local function split(value, separator)
  local result = {}
  separator = separator or ","
  for entry in string.gmatch(value or "", "([^" .. separator .. "]+)") do table.insert(result, entry) end
  return result
end

local function itemIDFromLink(link)
  return link and tonumber(string.match(link, "item:(%d+)")) or nil
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
    if questID then table.insert(result, tostring(questID)) end
  end
  return result
end

local function completedQuestIDs()
  local result = {}
  for questID in pairs(WFRP_DUNGEON_QUEST_IDS or {}) do
    local complete = C_QuestLog and C_QuestLog.IsQuestFlaggedCompleted and C_QuestLog.IsQuestFlaggedCompleted(questID)
    if complete == nil and IsQuestFlaggedCompleted then complete = IsQuestFlaggedCompleted(questID) end
    if complete then table.insert(result, tostring(questID)) end
  end
  table.sort(result, function(a, b) return tonumber(a) < tonumber(b) end)
  return result
end

local SLOT_NAMES = { [1]="Head", [2]="Neck", [3]="Shoulder", [5]="Chest", [6]="Waist", [7]="Legs", [8]="Feet", [9]="Wrist", [10]="Hands", [11]="Finger", [12]="Finger2", [13]="Trinket", [14]="Trinket2", [15]="Back", [16]="Main Hand", [17]="Off Hand", [18]="Ranged", [19]="Tabard" }

local function equippedItems()
  local result = {}
  for slot, label in pairs(SLOT_NAMES) do
    local itemID = GetInventoryItemID and GetInventoryItemID("player", slot) or itemIDFromLink(GetInventoryItemLink("player", slot))
    if itemID then table.insert(result, label .. ":" .. itemID) end
  end
  table.sort(result)
  return result
end

local function professions()
  local result = {}
  if GetProfessions and GetProfessionInfo then
    local values = { GetProfessions() }
    for _, index in ipairs(values) do
      if index then
        local name, _, skill, maximum = GetProfessionInfo(index)
        if name then table.insert(result, encode(name) .. ":" .. (skill or 0) .. ":" .. (maximum or 0)) end
      end
    end
  elseif GetNumSkillLines and GetSkillLineInfo then
    for index = 1, GetNumSkillLines() do
      local name, isHeader, _, skill, _, _, maximum = GetSkillLineInfo(index)
      if name and not isHeader and maximum and maximum > 0 then table.insert(result, encode(name) .. ":" .. (skill or 0) .. ":" .. maximum) end
    end
  end
  return result
end

local dialog
local function showText(title, value)
  if not dialog then
    dialog = CreateFrame("Frame", "ForeverRouteCompanionDialog", UIParent, BackdropTemplateMixin and "BackdropTemplate" or nil)
    dialog:SetSize(640, 250)
    dialog:SetPoint("CENTER")
    dialog:SetFrameStrata("DIALOG")
    if dialog.SetBackdrop then dialog:SetBackdrop({ bgFile="Interface/Tooltips/UI-Tooltip-Background", edgeFile="Interface/Tooltips/UI-Tooltip-Border", tile=true, tileSize=16, edgeSize=16, insets={left=4,right=4,top=4,bottom=4} }) end
    if dialog.SetBackdropColor then dialog:SetBackdropColor(0.03, 0.05, 0.08, 0.98) end
    dialog.title = dialog:CreateFontString(nil, "OVERLAY", "GameFontNormalLarge")
    dialog.title:SetPoint("TOPLEFT", 18, -16)
    local close = CreateFrame("Button", nil, dialog, "UIPanelCloseButton")
    close:SetPoint("TOPRIGHT", -4, -4)
    local scroll = CreateFrame("ScrollFrame", nil, dialog, "UIPanelScrollFrameTemplate")
    scroll:SetPoint("TOPLEFT", 18, -48)
    scroll:SetPoint("BOTTOMRIGHT", -36, 18)
    dialog.edit = CreateFrame("EditBox", nil, scroll)
    dialog.edit:SetMultiLine(true)
    dialog.edit:SetAutoFocus(false)
    dialog.edit:SetFontObject(ChatFontNormal)
    dialog.edit:SetWidth(570)
    dialog.edit:SetScript("OnEscapePressed", function(self) self:ClearFocus(); dialog:Hide() end)
    scroll:SetScrollChild(dialog.edit)
  end
  dialog.title:SetText(title)
  dialog.edit:SetText(value)
  dialog.edit:HighlightText()
  dialog.edit:SetFocus()
  dialog:Show()
end

local function characterExport()
  local name, realm = UnitName("player"), GetRealmName()
  local faction = UnitFactionGroup("player")
  local _, class = UnitClass("player")
  local fields = {
    "name=" .. encode(name), "realm=" .. encode(realm), "level=" .. UnitLevel("player"),
    "xp=" .. UnitXP("player"), "xpmax=" .. UnitXPMax("player"), "faction=" .. encode(faction), "class=" .. encode(class),
    "active=" .. join(activeQuestIDs()), "complete=" .. join(completedQuestIDs()), "gear=" .. join(equippedItems()),
    "bind=" .. encode(GetBindLocation and GetBindLocation() or ""), "flights=" .. encode(join(ForeverRouteCompanionDB.flightPaths or {})),
    "professions=" .. join(professions()),
  }
  return "WFRP1C|" .. join(fields, "|")
end

local function importPlan(value)
  if string.sub(value or "", 1, 7) ~= "WFRP1P|" then print("|cffffc44dWFRP:|r Expected a WFRP1 planner string."); return end
  local plan = {}
  for _, segment in ipairs(split(string.sub(value, 8), "|")) do
    local key, field = string.match(segment, "^([^=]+)=(.*)$")
    if key then plan[key] = decode(field) end
  end
  ForeverRouteCompanionDB.plan = plan
  local route = split(plan.route or "")
  local nextName = route[1] and (WFRP_DUNGEONS[route[1]] or route[1]) or "none"
  print("|cffffc44dWFRP:|r Imported " .. #route .. " stops. Next: " .. nextName .. ".")
end

local function showNext()
  local route = split(ForeverRouteCompanionDB.plan and ForeverRouteCompanionDB.plan.route or "")
  if not route[1] then print("|cffffc44dWFRP:|r No planner route imported."); return end
  print("|cffffc44dWFRP:|r Next: " .. (WFRP_DUNGEONS[route[1]] or route[1]) .. " · " .. #route .. " planned stops.")
end

SLASH_FOREVERROUTECOMPANION1 = "/wfrp"
SlashCmdList.FOREVERROUTECOMPANION = function(message)
  local command, rest = string.match(message or "", "^(%S*)%s*(.-)$")
  command = string.lower(command or "")
  if command == "export" then showText("Copy this into Forever Route Planner", characterExport())
  elseif command == "import" then importPlan(rest)
  elseif command == "next" then showNext()
  else print("|cffffc44dWFRP:|r /wfrp export · /wfrp import <planner string> · /wfrp next") end
end

local events = CreateFrame("Frame")
events:RegisterEvent("PLAYER_LOGIN")
events:RegisterEvent("TAXIMAP_OPENED")
events:SetScript("OnEvent", function(_, event)
  ForeverRouteCompanionDB = ForeverRouteCompanionDB or { flightPaths = {}, plan = {} }
  ForeverRouteCompanionDB.flightPaths = ForeverRouteCompanionDB.flightPaths or {}
  if event == "PLAYER_LOGIN" then return end
  local known = {}
  for _, name in ipairs(ForeverRouteCompanionDB.flightPaths) do known[name] = true end
  for index = 1, NumTaxiNodes() do
    if TaxiNodeGetType(index) ~= "NONE" then
      local name = TaxiNodeName(index)
      if name and not known[name] then known[name] = true; table.insert(ForeverRouteCompanionDB.flightPaths, name) end
    end
  end
  table.sort(ForeverRouteCompanionDB.flightPaths)
end)

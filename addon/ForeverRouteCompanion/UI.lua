local _, WFRP = ...
WFRP = type(WFRP) == "table" and WFRP or _G.WFRP
if not WFRP then return end

local COLORS = {
  canvas = { .018, .026, .04, .98 }, surface = { .035, .05, .075, 1 }, elevated = { .052, .072, .105, 1 },
  line = { .14, .18, .25, 1 }, gold = { .96, .69, .20, 1 }, blue = { .22, .58, .96, 1 },
  green = { .24, .78, .46, 1 }, red = { .95, .31, .31, 1 }, text = { .9, .93, .98, 1 }, muted = { .5, .57, .68, 1 },
}

local function backdrop(frame, color, border)
  if not frame.SetBackdrop then return end
  frame:SetBackdrop({ bgFile = "Interface/Buttons/WHITE8X8", edgeFile = "Interface/Buttons/WHITE8X8", tile = false, edgeSize = 1, insets = { left = 1, right = 1, top = 1, bottom = 1 } })
  frame:SetBackdropColor(unpack(color or COLORS.surface))
  frame:SetBackdropBorderColor(unpack(border or COLORS.line))
end

local function setColor(font, color) font:SetTextColor(unpack(color or COLORS.text)) end
local function formatNumber(value) return BreakUpLargeNumbers and BreakUpLargeNumbers(math.floor(tonumber(value) or 0)) or tostring(math.floor(tonumber(value) or 0)) end
local function duration(seconds)
  seconds = math.max(0, tonumber(seconds) or 0)
  if seconds >= 3600 then return string.format("%dh %02dm", math.floor(seconds / 3600), math.floor(seconds % 3600 / 60)) end
  return string.format("%dm %02ds", math.floor(seconds / 60), seconds % 60)
end

local function listCount(value)
  local count = 0
  for _ in string.gmatch(value or "", "([^,]+)") do count = count + 1 end
  return count
end

local frame = CreateFrame("Frame", "ForeverRouteCompanionFrame", UIParent, BackdropTemplateMixin and "BackdropTemplate" or nil)
frame:SetSize(760, 520)
frame:SetPoint("CENTER")
frame:SetFrameStrata("DIALOG")
frame:SetClampedToScreen(true)
frame:EnableMouse(true)
frame:SetMovable(true)
frame:RegisterForDrag("LeftButton")
frame:SetScript("OnDragStart", frame.StartMoving)
frame:SetScript("OnDragStop", frame.StopMovingOrSizing)
backdrop(frame, COLORS.canvas, { .36, .28, .12, 1 })
frame:Hide()
table.insert(UISpecialFrames, frame:GetName())

local topLine = frame:CreateTexture(nil, "ARTWORK")
topLine:SetColorTexture(unpack(COLORS.gold))
topLine:SetPoint("TOPLEFT", 1, -1)
topLine:SetPoint("TOPRIGHT", -1, -1)
topLine:SetHeight(2)

local mark = frame:CreateFontString(nil, "OVERLAY", "GameFontNormalHuge")
mark:SetPoint("TOPLEFT", 18, -14)
mark:SetText("F")
setColor(mark, COLORS.gold)

local title = frame:CreateFontString(nil, "OVERLAY", "GameFontNormalLarge")
title:SetPoint("TOPLEFT", 47, -13)
title:SetText("FOREVER INTELLIGENCE")
setColor(title, COLORS.text)

local subtitle = frame:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
subtitle:SetPoint("TOPLEFT", title, "BOTTOMLEFT", 0, -2)
subtitle:SetText("Character · leveling · gear · group telemetry")
setColor(subtitle, COLORS.muted)

local status = frame:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
status:SetPoint("TOPRIGHT", -48, -20)
status:SetText("LOCAL ONLY")
setColor(status, COLORS.green)

local close = CreateFrame("Button", nil, frame, "UIPanelCloseButton")
close:SetPoint("TOPRIGHT", -5, -6)

local sidebar = CreateFrame("Frame", nil, frame, BackdropTemplateMixin and "BackdropTemplate" or nil)
sidebar:SetPoint("TOPLEFT", 12, -57)
sidebar:SetPoint("BOTTOMLEFT", 12, 12)
sidebar:SetWidth(116)
backdrop(sidebar, { .025, .036, .055, 1 }, COLORS.line)

local content = CreateFrame("Frame", nil, frame)
content:SetPoint("TOPLEFT", sidebar, "TOPRIGHT", 12, 0)
content:SetPoint("BOTTOMRIGHT", -12, 12)

local activeTab = "now"
local tabButtons = {}
local dynamic = {}

local function track(region) table.insert(dynamic, region); return region end
local function clearDynamic()
  for _, region in ipairs(dynamic) do region:Hide(); if region.SetParent and region:GetObjectType() ~= "FontString" and region:GetObjectType() ~= "Texture" then region:SetParent(nil) end end
  dynamic = {}
end

local function font(parent, text, template, x, y, width, color, justify)
  local value = track(parent:CreateFontString(nil, "OVERLAY", template or "GameFontHighlight"))
  value:SetPoint("TOPLEFT", x, y)
  if width then value:SetWidth(width); value:SetWordWrap(true) end
  value:SetJustifyH(justify or "LEFT")
  value:SetText(text or "")
  setColor(value, color)
  return value
end

local function panel(parent, x, y, width, height, color)
  local value = track(CreateFrame("Frame", nil, parent, BackdropTemplateMixin and "BackdropTemplate" or nil))
  value:SetPoint("TOPLEFT", x, y); value:SetSize(width, height); backdrop(value, color or COLORS.surface, COLORS.line)
  return value
end

local function button(parent, text, x, y, width, onClick, active)
  local value = track(CreateFrame("Button", nil, parent, BackdropTemplateMixin and "BackdropTemplate" or nil))
  value:SetPoint("TOPLEFT", x, y); value:SetSize(width, 30); backdrop(value, active and { .16, .12, .04, 1 } or COLORS.elevated, active and COLORS.gold or COLORS.line)
  value.label = value:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall"); value.label:SetPoint("CENTER"); value.label:SetText(text); setColor(value.label, active and COLORS.gold or COLORS.text)
  value:SetScript("OnEnter", function(self) if self.SetBackdropBorderColor then self:SetBackdropBorderColor(unpack(COLORS.gold)) end end)
  value:SetScript("OnLeave", function(self) if self.SetBackdropBorderColor then self:SetBackdropBorderColor(unpack(active and COLORS.gold or COLORS.line)) end end)
  value:SetScript("OnClick", onClick)
  return value
end

local function metric(parent, label, value, detail, x, y, width, accent)
  local card = panel(parent, x, y, width, 66, COLORS.surface)
  local stripe = track(card:CreateTexture(nil, "ARTWORK")); stripe:SetColorTexture(unpack(accent or COLORS.blue)); stripe:SetPoint("TOPLEFT", 0, 0); stripe:SetPoint("BOTTOMLEFT", 0, 0); stripe:SetWidth(3)
  font(card, string.upper(label), "GameFontNormalSmall", 12, -9, width - 20, COLORS.muted)
  font(card, tostring(value), "GameFontNormalLarge", 12, -25, width - 20, COLORS.text)
  if detail then font(card, detail, "GameFontHighlightSmall", 12, -47, width - 20, COLORS.muted) end
  return card
end

local function sectionTitle(text, detail)
  font(content, text, "GameFontNormalLarge", 0, -1, 590, COLORS.text)
  if detail then font(content, detail, "GameFontHighlightSmall", 0, -25, 590, COLORS.muted) end
end

local function renderNow()
  local db, character = WFRP.GetDB(), WFRP.GetCharacter()
  local nextID, nextName = WFRP.GetNextDungeon()
  local readiness = nextID and WFRP.GetQuestReadiness(nextID) or { active = {}, complete = {}, missing = {} }
  local run = db.currentRun
  sectionTitle("Command center", run and ("Recording " .. run.dungeonName) or "Your next decision, live character state, and route readiness.")
  local width = 145
  metric(content, "Level", character.level, formatNumber(character.xp) .. " / " .. formatNumber(character.xpMax) .. " XP", 0, -52, width, COLORS.gold)
  metric(content, "Rested", formatNumber(character.restedXp), character.restedXp > 0 and "bonus XP available" or "not rested", 153, -52, width, COLORS.blue)
  metric(content, "Bags", character.freeBagSlots, "free slots", 306, -52, width, character.freeBagSlots < 6 and COLORS.red or COLORS.green)
  metric(content, "Durability", character.durability .. "%", character.zone, 459, -52, width, character.durability < 30 and COLORS.red or COLORS.green)

  local route = panel(content, 0, -128, 604, 112, COLORS.surface)
  font(route, "NEXT RUN", "GameFontNormalSmall", 14, -11, 90, COLORS.gold)
  font(route, nextName or "No route imported", "GameFontNormalLarge", 14, -29, 360, COLORS.text)
  local readinessText = nextID and string.format("%d active · %d complete · %d missing", #readiness.active, #readiness.complete, #readiness.missing) or "Export a route from the website, then import it here."
  font(route, readinessText, "GameFontHighlightSmall", 14, -54, 380, #readiness.missing > 0 and COLORS.red or COLORS.green)
  font(route, character.bindLocation ~= "" and ("Hearth: " .. character.bindLocation) or "Hearth location unknown", "GameFontHighlightSmall", 14, -75, 360, COLORS.muted)
  button(route, "Import route", 430, -14, 156, WFRP.ShowImport)
  button(route, "Share with party", 430, -53, 156, WFRP.SendPartyState)

  if run then
    local elapsed = math.max(0, time() - run.startedAt)
    metric(content, "Run time", duration(elapsed), run.dungeonName, 0, -250, 145, COLORS.red)
    metric(content, "Total XP", formatNumber(run.totalXp), formatNumber(run.combatXp) .. " combat", 153, -250, 145, COLORS.gold)
    metric(content, "Bosses", #run.bosses, #run.loot .. " loot records", 306, -250, 145, COLORS.blue)
    metric(content, "Deaths", run.deaths, #run.quests .. " quests", 459, -250, 145, run.deaths > 0 and COLORS.red or COLORS.green)
    button(content, "Stop & save run", 0, -326, 188, function() WFRP.StopRun("manual") end, true)
    button(content, "Export telemetry", 198, -326, 188, WFRP.Export)
  else
    local intelligence = panel(content, 0, -250, 604, 122, COLORS.surface)
    font(intelligence, "RUN INTELLIGENCE", "GameFontNormalSmall", 14, -11, 180, COLORS.gold)
    font(intelligence, "Automatic recording is armed", "GameFontNormalLarge", 14, -31, 360, COLORS.text)
    font(intelligence, "Entering a known Forever dungeon starts a run. XP, bosses, loot, quests, group, deaths, time, and rested state are captured locally.", "GameFontHighlightSmall", 14, -56, 410, COLORS.muted)
    button(intelligence, "Start next run", 430, -18, 156, function() WFRP.StartRun(nextID) end, true)
    button(intelligence, "Export snapshot", 430, -57, 156, WFRP.Export)
  end

  if nextID and #readiness.missing > 0 then
    font(content, "MISSING DUNGEON QUESTS", "GameFontNormalSmall", 0, -388, 300, COLORS.red)
    local names = {}
    for index = 1, math.min(5, #readiness.missing) do
      local quest = (WFRP_QUESTS or {})[readiness.missing[index]]
      table.insert(names, quest and (quest.name .. (quest.giver ~= "" and (" · " .. quest.giver .. ", " .. quest.zone) or "")) or ("Quest " .. readiness.missing[index]))
    end
    font(content, table.concat(names, "\n"), "GameFontHighlightSmall", 0, -407, 598, COLORS.muted)
  end
end

local function renderCharacter()
  local character = WFRP.GetCharacter()
  sectionTitle(character.name .. " · " .. character.realm, character.class .. " · " .. character.spec .. " · " .. character.zone)
  metric(content, "Level", character.level, formatNumber(character.xp) .. " XP", 0, -52, 145, COLORS.gold)
  metric(content, "Rested", formatNumber(character.restedXp), "available", 153, -52, 145, COLORS.blue)
  metric(content, "Money", GetCoinTextureString and GetCoinTextureString(character.money) or formatNumber(character.money), nil, 306, -52, 145, COLORS.gold)
  metric(content, "Durability", character.durability .. "%", character.freeBagSlots .. " free bags", 459, -52, 145, character.durability < 30 and COLORS.red or COLORS.green)
  font(content, "EQUIPPED GEAR", "GameFontNormalSmall", 0, -136, 200, COLORS.gold)
  local gear = character.gear or {}
  for index = 1, math.min(14, #gear) do
    local item = gear[index]
    local column = (index - 1) % 2
    local row = math.floor((index - 1) / 2)
    local card = panel(content, column * 306, -158 - row * 38, 298, 32, COLORS.surface)
    font(card, item.slot, "GameFontNormalSmall", 9, -7, 82, COLORS.muted)
    font(card, item.name, "GameFontHighlightSmall", 88, -7, 200, item.quality and item.quality >= 3 and COLORS.blue or COLORS.text)
  end
  if #gear == 0 then font(content, "No equipped item data is cached yet. Open your character panel or export again.", "GameFontHighlightSmall", 0, -162, 590, COLORS.muted) end
  local professions = {}; for _, entry in ipairs(character.professions or {}) do table.insert(professions, string.format("%s %d/%d", entry.name, entry.skill, entry.maximum)) end
  font(content, "PROFESSIONS", "GameFontNormalSmall", 0, -446, 120, COLORS.gold)
  font(content, #professions > 0 and table.concat(professions, " · ") or "No profession data", "GameFontHighlightSmall", 110, -446, 480, COLORS.muted)
end

local function renderRuns()
  local db = WFRP.GetDB()
  sectionTitle("Run history", #db.runs .. " locally recorded dungeon runs. Newest first.")
  local totalXp, totalSeconds, totalDeaths = 0, 0, 0
  for _, run in ipairs(db.runs) do totalXp = totalXp + (run.totalXp or 0); totalSeconds = totalSeconds + (run.duration or 0); totalDeaths = totalDeaths + (run.deaths or 0) end
  metric(content, "Runs", #db.runs, "stored locally", 0, -52, 145, COLORS.blue)
  metric(content, "Total XP", formatNumber(totalXp), totalSeconds > 0 and (formatNumber(totalXp / totalSeconds * 3600) .. " XP/hour") or "no sample", 153, -52, 145, COLORS.gold)
  metric(content, "Time", duration(totalSeconds), "inside dungeons", 306, -52, 145, COLORS.green)
  metric(content, "Deaths", totalDeaths, "across all runs", 459, -52, 145, totalDeaths > 0 and COLORS.red or COLORS.green)
  font(content, "RECENT RUNS", "GameFontNormalSmall", 0, -136, 180, COLORS.gold)
  for visible = 1, math.min(8, #db.runs) do
    local run = db.runs[#db.runs - visible + 1]
    local row = panel(content, 0, -157 - (visible - 1) * 38, 604, 32, COLORS.surface)
    font(row, run.dungeonName or run.dungeonId, "GameFontHighlight", 9, -7, 220, COLORS.text)
    font(row, duration(run.duration), "GameFontHighlightSmall", 232, -8, 76, COLORS.muted)
    font(row, formatNumber(run.totalXp) .. " XP", "GameFontHighlightSmall", 310, -8, 92, COLORS.gold)
    font(row, #run.bosses .. " bosses", "GameFontHighlightSmall", 406, -8, 80, COLORS.blue)
    font(row, run.deaths .. " deaths", "GameFontHighlightSmall", 492, -8, 100, run.deaths > 0 and COLORS.red or COLORS.green)
  end
  if #db.runs == 0 then font(content, "No runs yet. Enter a known dungeon or press Start next run from Now.", "GameFontHighlightSmall", 0, -164, 590, COLORS.muted) end
  button(content, "Export all telemetry", 0, -472, 188, WFRP.Export, true)
end

local function renderGroup()
  local db = WFRP.GetDB()
  local telemetry = WFRP.GetTelemetry()
  sectionTitle("Party intelligence", "Lightweight addon-to-addon readiness for the people you always run with.")
  button(content, "Refresh party state", 416, -4, 188, WFRP.SendPartyState, true)
  font(content, "CURRENT PARTY", "GameFontNormalSmall", 0, -56, 160, COLORS.gold)
  local rowIndex = 0
  for _, member in ipairs(telemetry.group or {}) do
    rowIndex = rowIndex + 1
    local row = panel(content, 0, -77 - (rowIndex - 1) * 40, 604, 34, COLORS.surface)
    font(row, member.name, "GameFontHighlight", 10, -8, 180, COLORS.text)
    font(row, member.class .. " · " .. member.level, "GameFontHighlightSmall", 192, -9, 160, COLORS.muted)
    font(row, member.leader and "LEADER" or (member.online and "ONLINE" or "OFFLINE"), "GameFontNormalSmall", 480, -9, 110, member.online and COLORS.green or COLORS.red, "RIGHT")
  end
  local peerStart = -94 - math.max(1, rowIndex) * 40
  font(content, "WFRP PEERS", "GameFontNormalSmall", 0, peerStart, 160, COLORS.gold)
  local peerIndex = 0
  for sender, peer in pairs(db.peers or {}) do
    if time() - (peer.seenAt or 0) < 900 then
      peerIndex = peerIndex + 1
      local row = panel(content, 0, peerStart - 21 - (peerIndex - 1) * 42, 604, 36, COLORS.surface)
      font(row, peer.name ~= "" and peer.name or sender, "GameFontHighlight", 10, -8, 160, COLORS.text)
      font(row, peer.class .. " · " .. peer.level, "GameFontHighlightSmall", 174, -9, 110, COLORS.muted)
      local nextName = (WFRP_DUNGEONS or {})[peer.nextDungeon] or peer.nextDungeon or "No route"
      font(row, nextName, "GameFontHighlightSmall", 286, -9, 170, COLORS.blue)
      font(row, peer.missingQuests .. " missing · " .. (peer.wishlistCount or 0) .. " wish", "GameFontHighlightSmall", 442, -9, 147, peer.missingQuests > 0 and COLORS.red or COLORS.green, "RIGHT")
    end
  end
  if peerIndex == 0 then font(content, "No recent addon peers. Group members running WFRP appear here after Refresh party state.", "GameFontHighlightSmall", 0, peerStart - 24, 590, COLORS.muted) end
end

local function renderSync()
  local db = WFRP.GetDB()
  sectionTitle("Website exchange", "Versioned local telemetry. Nothing is uploaded automatically.")
  local card = panel(content, 0, -52, 604, 132, COLORS.surface)
  font(card, "WFRP 1.0 INTELLIGENCE SUITE", "GameFontNormalSmall", 14, -12, 300, COLORS.gold)
  font(card, "Export character + run telemetry", "GameFontNormalLarge", 14, -34, 380, COLORS.text)
  font(card, "Copy one WFRP2 string into the website to update your character, gear, route readiness, party snapshot, and run dashboard.", "GameFontHighlightSmall", 14, -60, 380, COLORS.muted)
  button(card, "Export telemetry", 414, -20, 172, WFRP.Export, true)
  button(card, "Import web route", 414, -59, 172, WFRP.ShowImport)
  font(content, "DATASET", "GameFontNormalSmall", 0, -202, 90, COLORS.gold)
  font(content, tostring(WFRP_DATA_VERSION or WFRP_DATA_FETCHED_AT or "unknown"), "GameFontHighlightSmall", 92, -202, 500, COLORS.muted)
  font(content, "LOCAL STORAGE", "GameFontNormalSmall", 0, -238, 110, COLORS.gold)
  font(content, #db.runs .. " runs · " .. #db.flightPaths .. " flight paths · " .. listCount(db.plan.route or "") .. " route stops", "GameFontHighlightSmall", 116, -238, 470, COLORS.muted)
  font(content, "COMMANDS", "GameFontNormalSmall", 0, -286, 110, COLORS.gold)
  font(content, "/wfrp · /wfrp export · /wfrp import · /wfrp next · /wfrp start · /wfrp stop · /wfrp share", "GameFontHighlightSmall", 0, -307, 590, COLORS.text)
  font(content, "PRIVACY", "GameFontNormalSmall", 0, -352, 110, COLORS.green)
  font(content, "Character and run data stays in SavedVariables until you explicitly export it. Party state uses the in-game addon channel only.", "GameFontHighlightSmall", 0, -373, 590, COLORS.muted)
end

local renderers = { now = renderNow, character = renderCharacter, runs = renderRuns, group = renderGroup, sync = renderSync }

local function render()
  if not frame:IsShown() then return end
  clearDynamic()
  for id, tab in pairs(tabButtons) do
    local selected = id == activeTab
    backdrop(tab, selected and { .16, .12, .04, 1 } or { .025, .036, .055, 1 }, selected and COLORS.gold or COLORS.line)
    setColor(tab.label, selected and COLORS.gold or COLORS.muted)
  end
  (renderers[activeTab] or renderNow)()
end

local tabs = { { "now", "NOW", "◆" }, { "character", "CHARACTER", "♟" }, { "runs", "RUNS", "▥" }, { "group", "GROUP", "♣" }, { "sync", "SYNC", "↕" } }
for index, entry in ipairs(tabs) do
  local id, label, icon = unpack(entry)
  local tab = CreateFrame("Button", nil, sidebar, BackdropTemplateMixin and "BackdropTemplate" or nil)
  tab:SetPoint("TOPLEFT", 8, -8 - (index - 1) * 50); tab:SetSize(100, 42); backdrop(tab, COLORS.surface, COLORS.line)
  tab.icon = tab:CreateFontString(nil, "OVERLAY", "GameFontNormal"); tab.icon:SetPoint("LEFT", 10, 0); tab.icon:SetText(icon); setColor(tab.icon, COLORS.gold)
  tab.label = tab:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall"); tab.label:SetPoint("LEFT", 30, 0); tab.label:SetText(label); setColor(tab.label, COLORS.muted)
  tab:SetScript("OnClick", function() activeTab = id; render() end)
  tabButtons[id] = tab
end

local version = sidebar:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
version:SetPoint("BOTTOM", 0, 14); version:SetText("v1.0 · local"); setColor(version, COLORS.muted)

local hud = CreateFrame("Button", "ForeverRouteCompanionHUD", UIParent, BackdropTemplateMixin and "BackdropTemplate" or nil)
hud:SetSize(344, 58); hud:SetPoint("TOPRIGHT", -34, -220); hud:SetClampedToScreen(true); hud:SetMovable(true); hud:RegisterForDrag("LeftButton"); hud:SetScript("OnDragStart", hud.StartMoving); hud:SetScript("OnDragStop", hud.StopMovingOrSizing); backdrop(hud, COLORS.canvas, { .31, .25, .12, 1 })
hud.accent = hud:CreateTexture(nil, "ARTWORK"); hud.accent:SetColorTexture(unpack(COLORS.gold)); hud.accent:SetPoint("TOPLEFT", 0, 0); hud.accent:SetPoint("BOTTOMLEFT", 0, 0); hud.accent:SetWidth(3)
hud.title = hud:CreateFontString(nil, "OVERLAY", "GameFontNormal"); hud.title:SetPoint("TOPLEFT", 13, -10); setColor(hud.title, COLORS.text)
hud.detail = hud:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall"); hud.detail:SetPoint("TOPLEFT", 13, -32); setColor(hud.detail, COLORS.muted)
hud.badge = hud:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall"); hud.badge:SetPoint("RIGHT", -12, 0); setColor(hud.badge, COLORS.gold)
hud:SetScript("OnClick", function() frame:Show(); activeTab = "now"; render() end)

local minimap = CreateFrame("Button", "ForeverRouteCompanionMinimapButton", Minimap, BackdropTemplateMixin and "BackdropTemplate" or nil)
minimap:SetSize(30, 30); minimap:SetPoint("TOPLEFT", Minimap, "TOPLEFT", -3, 4); minimap:SetFrameStrata("MEDIUM"); backdrop(minimap, COLORS.canvas, COLORS.gold)
minimap.text = minimap:CreateFontString(nil, "OVERLAY", "GameFontNormalLarge"); minimap.text:SetPoint("CENTER"); minimap.text:SetText("F"); setColor(minimap.text, COLORS.gold)
minimap:SetScript("OnClick", function() if frame:IsShown() then frame:Hide() else frame:Show(); render() end end)
minimap:SetScript("OnEnter", function(self) GameTooltip:SetOwner(self, "ANCHOR_LEFT"); GameTooltip:SetText("Forever Intelligence"); GameTooltip:AddLine("Route, runs, gear, and party telemetry", .7, .75, .85); GameTooltip:Show() end)
minimap:SetScript("OnLeave", GameTooltip_Hide)

local function refreshHud()
  local db = WFRP.GetDB()
  local nextID, nextName = WFRP.GetNextDungeon()
  local run = db.currentRun
  if not run and not nextID then hud:Hide(); return end
  hud:Show()
  if run then
    hud.title:SetText("Recording · " .. run.dungeonName)
    hud.detail:SetText(duration(time() - run.startedAt) .. " · " .. formatNumber(run.totalXp) .. " XP · " .. #run.bosses .. " bosses")
    hud.badge:SetText("LIVE")
    setColor(hud.badge, COLORS.red)
  else
    local readiness = WFRP.GetQuestReadiness(nextID)
    hud.title:SetText("Next · " .. nextName)
    hud.detail:SetText(#readiness.active .. " active quests · " .. #readiness.missing .. " missing")
    hud.badge:SetText(#readiness.missing == 0 and "READY" or "PREP")
    setColor(hud.badge, #readiness.missing == 0 and COLORS.green or COLORS.gold)
  end
end

WFRP.RefreshUI = function() refreshHud(); render() end
WFRP.ToggleUI = function() if frame:IsShown() then frame:Hide() else frame:Show(); render() end end

frame:SetScript("OnShow", render)
local elapsed = 0
frame:SetScript("OnUpdate", function(_, delta) elapsed = elapsed + delta; if elapsed >= 1 then elapsed = 0; if frame:IsShown() or WFRP.GetDB().currentRun then WFRP.RefreshUI() end end end)

local login = CreateFrame("Frame")
login:RegisterEvent("PLAYER_LOGIN")
login:SetScript("OnEvent", function()
  local db = WFRP.GetDB()
  minimap:SetShown(db.settings.showMinimap ~= false)
  hud:SetShown(db.settings.compactHud ~= false)
  C_Timer.After(1.2, WFRP.RefreshUI)
end)

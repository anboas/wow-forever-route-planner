export const XP_TO_NEXT = Object.freeze({
  1: 400, 2: 900, 3: 1400, 4: 2100, 5: 2800, 6: 3600, 7: 4500, 8: 5400, 9: 6500,
  10: 7600, 11: 8700, 12: 9800, 13: 11000, 14: 12300, 15: 13600, 16: 15000,
  17: 16400, 18: 17800, 19: 19300, 20: 20800, 21: 22400, 22: 24000, 23: 25500,
  24: 27200, 25: 28900, 26: 30500, 27: 32200, 28: 33900, 29: 36300, 30: 38800,
  31: 41600, 32: 44600, 33: 48000, 34: 51400, 35: 55000, 36: 58700, 37: 62400,
  38: 66200, 39: 70200, 40: 74300, 41: 78500, 42: 82800, 43: 87100, 44: 91600,
  45: 96300, 46: 101000, 47: 105800, 48: 110700, 49: 115700, 50: 120900,
  51: 126100, 52: 131500, 53: 137000, 54: 142500, 55: 148200, 56: 154000,
  57: 159900, 58: 165800, 59: 172000,
});

export function clampCharacter(level, xp) {
  const safeLevel = Math.max(1, Math.min(60, Number(level) || 1));
  const cap = XP_TO_NEXT[safeLevel] ?? 0;
  return { level: safeLevel, xp: Math.max(0, Math.min(cap ? cap - 1 : 0, Number(xp) || 0)) };
}

export function addExperience(character, amount) {
  let { level, xp } = clampCharacter(character.level, character.xp);
  let remaining = Math.max(0, Number(amount) || 0);
  while (level < 60 && remaining > 0) {
    const needed = XP_TO_NEXT[level] - xp;
    if (remaining < needed) {
      xp += remaining;
      remaining = 0;
    } else {
      remaining -= needed;
      level += 1;
      xp = 0;
    }
  }
  return { level, xp, overflow: remaining };
}

export function progressPercent(character) {
  const cap = XP_TO_NEXT[character.level];
  return cap ? Math.min(100, (character.xp / cap) * 100) : 100;
}

export function formatCharacter(character) {
  const cap = XP_TO_NEXT[character.level];
  if (!cap) return "Level 60";
  return `Level ${character.level} · ${Math.round(progressPercent(character))}%`;
}

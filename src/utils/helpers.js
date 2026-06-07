const { EmbedBuilder } = require('discord.js');
const { User, Guild }  = require('../database/models');

// ─── Colores ──────────────────────────────────────────────────────────────────
const COLORS = {
  main:    0x5865F2,
  success: 0x57F287,
  error:   0xED4245,
  warn:    0xFEE75C,
  gold:    0xF5C842,
  purple:  0x9B59B6,
  night:   0x2B2D31,
};

// ─── Embeds rápidos ───────────────────────────────────────────────────────────
function successEmbed(desc) {
  return new EmbedBuilder().setColor(COLORS.success).setDescription(`✅ ${desc}`);
}
function errorEmbed(desc) {
  return new EmbedBuilder().setColor(COLORS.error).setDescription(`❌ ${desc}`);
}
function infoEmbed(desc, title = null) {
  const e = new EmbedBuilder().setColor(COLORS.main).setDescription(desc);
  if (title) e.setTitle(title);
  return e;
}

// ─── XP / Niveles ─────────────────────────────────────────────────────────────
function xpForLevel(level) {
  return Math.floor(5 * level ** 2 + 50 * level + 100);
}

// ─── Usuario DB (upsert) ──────────────────────────────────────────────────────
async function getUser(userId, guildId) {
  return User.findOneAndUpdate(
    { userId, guildId },
    { $setOnInsert: { userId, guildId } },
    { upsert: true, new: true }
  );
}

// ─── Guild DB (upsert) ────────────────────────────────────────────────────────
async function getGuild(guildId) {
  return Guild.findOneAndUpdate(
    { guildId },
    { $setOnInsert: { guildId } },
    { upsert: true, new: true }
  );
}

// ─── Cooldown helper ──────────────────────────────────────────────────────────
function msToTime(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0)  return `${h}h ${m % 60}m`;
  if (m > 0)  return `${m}m ${s % 60}s`;
  return `${s}s`;
}

// ─── Formatear número ─────────────────────────────────────────────────────────
function fmt(n) {
  return (n || 0).toLocaleString('es-ES');
}

// ─── Barra de progreso ────────────────────────────────────────────────────────
function progressBar(current, max, length = 15) {
  const fill = Math.round((current / max) * length);
  return '█'.repeat(Math.max(0, fill)) + '░'.repeat(Math.max(0, length - fill));
}

// ─── Comprobar premium ────────────────────────────────────────────────────────
// Busca premium en CUALQUIER entrada del usuario (cualquier guildId)
// Así funciona aunque el premium se diera en otro servidor
async function isPremiumUser(userId, guildId) {
  // Buscar en el servidor actual
  const u = await User.findOne({ userId, guildId });
  if (u?.premium && u.premiumExpires > new Date()) return true;

  // Buscar en cualquier otro servidor (por si el premium es global)
  const anyU = await User.findOne({ userId, premium: true });
  if (anyU?.premiumExpires > new Date()) return true;

  // Compatibilidad: campo isPremium (versiones antiguas del bot)
  const legacy = await User.findOne({ userId, isPremium: true });
  if (legacy) return true;

  return false;
}

async function isPremiumGuild(guildId) {
  const g = await Guild.findOne({ guildId });
  return !!(g?.premium && g.premiumExpires > new Date());
}

async function hasPremium(userId, guildId) {
  try {
    const [userPrem, guildPrem] = await Promise.all([
      isPremiumUser(userId, guildId),
      isPremiumGuild(guildId),
    ]);
    return userPrem || guildPrem;
  } catch {
    return false;
  }
}

module.exports = {
  COLORS, successEmbed, errorEmbed, infoEmbed,
  xpForLevel, getUser, getGuild, msToTime, fmt,
  progressBar, isPremiumUser, isPremiumGuild, hasPremium,
};

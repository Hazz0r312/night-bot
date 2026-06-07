const mongoose = require('mongoose');
const { Schema } = mongoose;

// ─── Usuario ──────────────────────────────────────────────────────────────────
const UserSchema = new Schema({
  userId:  { type: String, required: true },
  guildId: { type: String, required: true },
  // Economía
  coins:     { type: Number, default: 0 },
  bank:      { type: Number, default: 0 },
  lastDaily: { type: Date,   default: null },
  lastWork:  { type: Date,   default: null },
  lastRob:   { type: Date,   default: null },
  lastCrime: { type: Date,   default: null },
  inventory: { type: [{ item: String, amount: Number }], default: [] },
  // Niveles
  xp:    { type: Number, default: 0 },
  level: { type: Number, default: 0 },
  // Premium usuario
  premium:        { type: Boolean, default: false },
  premiumExpires: { type: Date,    default: null },
  premiumOrderId: { type: String,  default: null },
  // Misc
  bio:       { type: String, default: '' },
  marriage:  { type: String, default: null },
  rep:       { type: Number, default: 0 },
  lastRep:   { type: Date,   default: null },
}, { timestamps: true });
UserSchema.index({ userId: 1, guildId: 1 }, { unique: true });

// ─── Servidor ─────────────────────────────────────────────────────────────────
const GuildSchema = new Schema({
  guildId: { type: String, required: true, unique: true },
  // Premium
  premium:        { type: Boolean, default: false },
  premiumExpires: { type: Date,    default: null },
  premiumOrderId: { type: String,  default: null },
  // Moderación
  modLogChannel: { type: String, default: null },
  muteRoleId:    { type: String, default: null },
  bannedWords:   { type: [String], default: [] },
  antiSpam:      { type: Boolean, default: false },
  antiLinks:     { type: Boolean, default: false },
  antiInvites:   { type: Boolean, default: false },
  // Bienvenida
  welcomeEnabled:  { type: Boolean, default: false },
  welcomeChannel:  { type: String, default: null },
  welcomeMessage:  { type: String, default: '¡Bienvenido/a {user} a **{server}**! 🎉 Eres el miembro #**{count}**.' },
  leaveEnabled:    { type: Boolean, default: false },
  leaveChannel:    { type: String, default: null },
  leaveMessage:    { type: String, default: '**{username}** ha abandonado el servidor. Somos **{count}** miembros.' },
  autoRoleId:      { type: String, default: null },
  // Niveles
  levelsEnabled:  { type: Boolean, default: true },
  levelChannel:   { type: String, default: null },
  levelMessage:   { type: String, default: '🎉 ¡Felicidades {user}! Has subido al nivel **{level}**!' },
  levelRoles:     [{ level: Number, roleId: String }],
  // Economía
  currencyName:  { type: String, default: 'coins' },
  currencyEmoji: { type: String, default: '🪙' },
  // Tickets
  ticketCategory:   { type: String, default: null },
  ticketLogChannel: { type: String, default: null },
  ticketSupportRoles: { type: [String], default: [] },
  ticketMessage:    { type: String, default: '¡Hola {user}! El equipo te atenderá en breve.\n**Tema:** {topic}' },
  // IA
  aiEnabled:   { type: Boolean, default: false },
  aiChannel:   { type: String, default: null },
  aiPersonality: { type: String, default: 'Eres Night, un bot de Discord amigable y útil.' },
  // Prefix
  prefix: { type: String, default: 'n!' },
}, { timestamps: true });

// ─── Ticket ───────────────────────────────────────────────────────────────────
const TicketSchema = new Schema({
  guildId:   { type: String, required: true },
  userId:    { type: String, required: true },
  channelId: { type: String, required: true, unique: true },
  ticketNum: { type: Number, required: true },
  topic:     { type: String, default: 'Sin tema' },
  status:    { type: String, enum: ['open','closed'], default: 'open' },
  claimedBy: { type: String, default: null },
}, { timestamps: true });

// ─── Warn ─────────────────────────────────────────────────────────────────────
const WarnSchema = new Schema({
  guildId:   { type: String, required: true },
  userId:    { type: String, required: true },
  moderator: { type: String, required: true },
  reason:    { type: String, default: 'Sin razón' },
  active:    { type: Boolean, default: true },
}, { timestamps: true });

// ─── Orden Premium ────────────────────────────────────────────────────────────
const PremiumOrderSchema = new Schema({
  orderId:   { type: String, required: true, unique: true },
  discordId: { type: String, required: true },
  guildId:   { type: String, default: null },
  type:      { type: String, enum: ['user','server'], default: 'user' },
  amount:    { type: Number, default: 1.00 },
  status:    { type: String, enum: ['pending','completed','cancelled'], default: 'pending' },
}, { timestamps: true });

// ─── Tienda del servidor ──────────────────────────────────────────────────────
const ShopItemSchema = new Schema({
  guildId:     { type: String, required: true },
  name:        { type: String, required: true },
  description: { type: String, default: '' },
  price:       { type: Number, required: true },
  roleId:      { type: String, default: null },
  emoji:       { type: String, default: '🎁' },
  stock:       { type: Number, default: -1 }, // -1 = ilimitado
}, { timestamps: true });

module.exports = {
  User:         mongoose.model('User', UserSchema),
  Guild:        mongoose.model('Guild', GuildSchema),
  Ticket:       mongoose.model('Ticket', TicketSchema),
  Warn:         mongoose.model('Warn', WarnSchema),
  PremiumOrder: mongoose.model('PremiumOrder', PremiumOrderSchema),
  ShopItem:     mongoose.model('ShopItem', ShopItemSchema),
};

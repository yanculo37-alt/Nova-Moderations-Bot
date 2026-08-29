const embeds = require('../embeds');
const { v2 } = require('../utils/v2');
const GuildSettings = require('../models/GuildSettings');
const RealmAPI = require('./RealmAPI');
const { formatWatchlistBody } = require('./playerlist');

const timers = new Map();

function clearTimer(guildId) {
  const t = timers.get(guildId);
  if (t) clearInterval(t);
  timers.delete(guildId);
}

async function buildBody(code) {
  const realmApi = new RealmAPI();

  const realm = await realmApi.getRealmInfo(code);
  if (!realm || realm.status) return { error: `Realm \`${code}\` could not be read (code \`${realm?.status ?? '?'}\`).` };

  const active = await realmApi.getActivePlayers(realm.id).catch(() => null);
  if (!active || active.status) return { error: `Realm \`${code}\` could not be read (code \`${active?.status ?? '?'}\`).` };

  const xuids = (active.players ?? []).map((p) => p.uuid).filter(Boolean);
  if (!xuids.length) return { realm, body: formatWatchlistBody([]) };

  const users = await realmApi.getXboxUserBulk(xuids).catch(() => null);
  if (!Array.isArray(users)) return { realm, body: formatWatchlistBody(xuids.map((x) => ({ xuid: x }))) };

  return { realm, body: formatWatchlistBody(users) };
}

async function tick(client, guildId) {
  let settings;
  try {
    settings = await GuildSettings.findOne({ guildId }).lean();
  } catch {
    return;
  }

  const wl = settings?.realm?.watchlist;
  const code = settings?.realm?.code;
  if (!wl?.enabled || !wl.channelId || !code) return clearTimer(guildId);

  const channel = await client.channels.fetch(wl.channelId).catch(() => null);
  if (!channel || typeof channel.send !== 'function') return;

  let result;
  try {
    result = await buildBody(code);
  } catch (err) {
    console.warn(`[REALM WATCHLIST] ${guildId} lookup failed:`, err?.message || err);
    return;
  }

  const card = result.error
    ? embeds.error('Realm unavailable', result.error)
    : embeds.info(`${result.realm.name || 'Realm'} playerlist`, result.body);

  await channel.send(v2([card])).catch((err) => {
    console.warn(`[REALM WATCHLIST] ${guildId} send failed:`, err?.message || err);
    return null;
  });
}

async function schedule(client, guildId) {
  clearTimer(guildId);

  let settings;
  try {
    settings = await GuildSettings.findOne({ guildId }).lean();
  } catch {
    return;
  }

  const wl = settings?.realm?.watchlist;
  if (!wl?.enabled || !wl.channelId || !settings?.realm?.code) return;

  const minutes = Math.min(15, Math.max(1, Number(wl.delay) || 5));
  const timer = setInterval(() => {
    tick(client, guildId).catch((err) => console.warn('[REALM WATCHLIST] tick error:', err?.message || err));
  }, minutes * 60_000);
  if (typeof timer.unref === 'function') timer.unref();
  timers.set(guildId, timer);

  tick(client, guildId).catch(() => null);
}

async function startAll(client) {
  let list = [];
  try {
    list = await GuildSettings.find({ 'realm.watchlist.enabled': true }).lean();
  } catch (err) {
    console.warn('[REALM WATCHLIST] could not load settings:', err?.message || err);
    return;
  }
  for (const s of list) await schedule(client, s.guildId);
  if (list.length) console.log(`[REALM WATCHLIST] started for ${list.length} guild(s).`);
}

module.exports = { schedule, startAll, stop: clearTimer, tick, buildBody };

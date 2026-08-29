const mongoose = require('mongoose');
const config = require('../configs/config.json');
let GuildSettings; try { GuildSettings = require('../models/GuildSettings'); } catch {}

const cache = new Map();
const TTL = 60_000;

function ticketDefaults() {
  return {
    categoryId: '',
    supportRoleId: '',
    supportRoles: [],
    transcriptChannelId: '',
    categories: JSON.parse(JSON.stringify(config.defaults.ticketCategories)),
    panel: {
      title: '🎫 Support Tickets',
      description:
        'Need help? Open a ticket below and our staff team will respond as soon as possible.\n\n' +
        'Please pick the category that best fits your issue.',
      color: '#5865F2',
      placeholder: 'Select a category to open a ticket…',
    },
    welcome: {
      title: '🎫 Ticket — {category}',
      message:
        'Hello {user}, thanks for reaching out!\nA staff member will be with you shortly.\n' +
        'Use the buttons below to manage this ticket.',
      color: '#5865F2',
    },
    buttons: {
      claim:      { label: 'Claim',      emoji: '🙋' },
      close:      { label: 'Close',      emoji: '🔒' },
      transcript: { label: 'Transcript', emoji: '📄' },
    },
    autoClose: { enabled: false, inactivityHours: 48 },
    permissions: { userCanClose: true, requireReasonOnClose: false },
  };
}

function applicationDefaults() {
  return {
    panelChannelId: '',
    logChannelId: '',
    panel: {
      title: '',
      description: 'Pick an application type below. The bot will DM you the questions — answer them one at a time. You have 10 minutes per answer.',
      color: '#5865F2',
      placeholder: 'Select an application type…',
    },
    types: [
      {
        value: 'staff',
        label: 'Staff Application',
        emoji: '🛡️',
        description: 'Apply to join the staff team.',
        questions: [
          'What is your name and age?',
          'What timezone are you in and how many hours/day can you be active?',
          'Why do you want to become staff?',
          'Do you have any previous moderation experience?',
        ],
        acceptMessage: '🎉 Your **{type}** application has been **accepted**! Welcome aboard.',
        declineMessage: 'Unfortunately, your **{type}** application was **declined**.',
      },
    ],
  };
}

function defaults() {
  return {
    prefix: config.prefix,
    staffRoles: [],
    modRoles: [],
    autoRole: { enabled: false, roleId: '' },
    logChannels: { moderation: '', messages: '', tickets: '', joinLeave: '' },
    statusChannels: { memberCount: '', botStatus: '' },
    commandChannels: [],
    suggestions: { enabled: true, channelId: '' },
    welcome: { enabled: true, channelId: '', message: config.defaults.welcomeMessage },
    goodbye: { enabled: true, channelId: '', message: config.defaults.goodbyeMessage },
    tickets: ticketDefaults(),
    applications: applicationDefaults(),
    automod: {
      ...config.defaults.automod,

      discordAutomod: { enabled: true, ruleId: '' },
    },
    leveling: { ...config.defaults.leveling },
    setupCompletedAt: null,
  };
}

function deepMerge(a, b) {
  if (Array.isArray(b)) return b.slice();
  if (b && typeof b === 'object') {
    const out = { ...(a && typeof a === 'object' ? a : {}) };
    for (const k of Object.keys(b)) out[k] = deepMerge(out[k], b[k]);
    return out;
  }
  return b === undefined ? a : b;
}

async function get(guildId) {
  if (!guildId) return defaults();
  const hit = cache.get(guildId);
  if (hit && Date.now() - hit.at < TTL) return hit.value;

  let doc = null;
  if (GuildSettings && mongoose.connection.readyState === 1) {
    try { doc = await GuildSettings.findOne({ guildId }).lean().maxTimeMS(1500); } catch {}
  }
  const merged = deepMerge(defaults(), doc || {});

  if (!Array.isArray(merged.tickets.categories) || merged.tickets.categories.length === 0) {
    merged.tickets.categories = JSON.parse(JSON.stringify(config.defaults.ticketCategories));
  }
  cache.set(guildId, { value: merged, at: Date.now() });
  return merged;
}

function peek(guildId) {
  if (!guildId) return defaults();
  return cache.get(guildId)?.value || defaults();
}

async function set(guildId, patch) {
  if (!guildId) throw new Error('guildId required');
  cache.delete(guildId);
  if (!GuildSettings || mongoose.connection.readyState !== 1) {
    const cur = (await get(guildId)) || defaults();
    const next = deepMerge(cur, patch);
    cache.set(guildId, { value: next, at: Date.now() });
    return next;
  }

  const flat = {};
  function walk(obj, prefix = '') {
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      const key = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === 'object' && !Array.isArray(v)) walk(v, key);
      else flat[key] = v;
    }
  }
  walk(patch);
  const doc = await GuildSettings.findOneAndUpdate(
    { guildId },
    { $set: { guildId, ...flat } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();
  const merged = deepMerge(defaults(), doc);
  if (!Array.isArray(merged.tickets.categories) || merged.tickets.categories.length === 0) {
    merged.tickets.categories = JSON.parse(JSON.stringify(config.defaults.ticketCategories));
  }
  cache.set(guildId, { value: merged, at: Date.now() });
  return merged;
}

async function reset(guildId) {
  cache.delete(guildId);
  if (GuildSettings && mongoose.connection.readyState === 1) {
    await GuildSettings.deleteOne({ guildId }).catch(() => null);
  }
}

function invalidate(guildId) { cache.delete(guildId); }

function isPersistent() {
  return Boolean(GuildSettings) && mongoose.connection.readyState === 1;
}

const NOT_PERSISTED_NOTE =
  '\n\n-# ⚠️ The database is offline, so this is stored in memory only and will be lost when the bot restarts.';

module.exports = {
  get, peek, set, reset, invalidate, defaults,
  ticketDefaults, applicationDefaults, isPersistent, NOT_PERSISTED_NOTE,
};

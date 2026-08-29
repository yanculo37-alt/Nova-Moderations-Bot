const {
  PermissionsBitField,
  AutoModerationRuleTriggerType,
  AutoModerationRuleEventType,
  AutoModerationActionType,
} = require('discord.js');
const settings = require('./settings');
const { variantsFor } = require('./wordVariants');

const RULE_NAME = 'Nova Automod — Blacklist';

const MAX_KEYWORDS = 1000;
const MAX_KEYWORD_LEN = 60;

function isEnabled(s) {
  const d = s?.automod?.discordAutomod;

  return d?.enabled !== false;
}

function buildKeywords(list) {
  const words = (list || []).map(w => String(w || '').trim().toLowerCase()).filter(Boolean);
  if (!words.length) return [];

  const perWord = Math.max(4, Math.min(40, Math.floor(MAX_KEYWORDS / Math.max(words.length, 1)) - 1));

  const out = [];
  const seen = new Set();
  const push = (w) => {
    if (!w || w.length + 2 > MAX_KEYWORD_LEN) return;

    const kw = `*${w}*`;
    if (seen.has(kw)) return;
    seen.add(kw);
    out.push(kw);
  };

  for (const word of words) {
    if (out.length >= MAX_KEYWORDS) break;
    for (const variant of variantsFor(word, perWord)) {
      push(variant);
      if (out.length >= MAX_KEYWORDS) break;
    }
  }
  return out.slice(0, MAX_KEYWORDS);
}

function canManage(guild) {
  const me = guild?.members?.me;
  return Boolean(me?.permissions?.has(PermissionsBitField.Flags.ManageGuild));
}

async function findRule(guild, ruleId) {
  try {
    if (ruleId) {
      const byId = await guild.autoModerationRules.fetch(ruleId).catch(() => null);
      if (byId) return byId;
    }
    const all = await guild.autoModerationRules.fetch().catch(() => null);
    if (!all) return null;
    return all.find(r => r.name === RULE_NAME) || null;
  } catch { return null; }
}

function actionsFor(s) {
  const actions = [{
    type: AutoModerationActionType.BlockMessage,
    metadata: { customMessage: 'That word is blacklisted in this server.' },
  }];
  const alertChannelId = s?.logChannels?.moderation;
  if (alertChannelId) {
    actions.push({
      type: AutoModerationActionType.SendAlertMessage,
      metadata: { channel: alertChannelId },
    });
  }
  return actions;
}

async function sync(guild, opts = {}) {
  if (!guild) return { ok: false, reason: 'No guild.' };
  if (!canManage(guild)) return { ok: false, reason: 'I need the **Manage Server** permission to manage Discord AutoMod.' };

  const s = opts.settings || await settings.get(guild.id);
  const enabled = opts.enabled !== undefined ? opts.enabled : isEnabled(s);
  const words = opts.blacklist || s?.automod?.blacklist || [];
  const keywords = buildKeywords(words);
  const ruleId = s?.automod?.discordAutomod?.ruleId || '';
  const existing = await findRule(guild, ruleId);

  try {

    if (enabled && keywords.length === 0) {
      if (existing) {
        await existing.delete('Nova Automod: blacklist is empty');
        await settings.set(guild.id, { automod: { discordAutomod: { enabled: true, ruleId: '' } } });
      }
      return { ok: true, action: 'removed', count: 0 };
    }

    if (!enabled) {
      if (existing) await existing.edit({ enabled: false, reason: 'Nova Automod disabled via /automod toggle' });
      return { ok: true, action: 'disabled', count: keywords.length };
    }

    if (existing) {
      await existing.edit({
        enabled: true,
        name: RULE_NAME,
        eventType: AutoModerationRuleEventType.MessageSend,
        triggerMetadata: { keywordFilter: keywords },
        actions: actionsFor(s),
        exemptRoles: Array.isArray(s?.automod?.exemptRoleIds) ? s.automod.exemptRoleIds : [],
        reason: 'Nova Automod: syncing blacklist to Discord AutoMod',
      });
      if (existing.id !== ruleId) {
        await settings.set(guild.id, { automod: { discordAutomod: { enabled: true, ruleId: existing.id } } });
      }
      return { ok: true, action: 'updated', count: keywords.length, ruleId: existing.id };
    }

    const created = await guild.autoModerationRules.create({
      name: RULE_NAME,
      creatorId: guild.client.user.id,
      enabled: true,
      eventType: AutoModerationRuleEventType.MessageSend,
      triggerType: AutoModerationRuleTriggerType.Keyword,
      triggerMetadata: { keywordFilter: keywords },
      actions: actionsFor(s),
      exemptRoles: Array.isArray(s?.automod?.exemptRoleIds) ? s.automod.exemptRoleIds : [],
      reason: 'Nova Automod: enabling Discord AutoMod for blacklisted words',
    });
    await settings.set(guild.id, { automod: { discordAutomod: { enabled: true, ruleId: created.id } } });
    return { ok: true, action: 'created', count: keywords.length, ruleId: created.id };
  } catch (e) {
    return { ok: false, reason: e?.message || String(e) };
  }
}

async function setEnabled(guild, enabled) {
  const s = await settings.set(guild.id, { automod: { discordAutomod: { enabled: Boolean(enabled) } } });
  return sync(guild, { settings: s, enabled: Boolean(enabled) });
}

async function syncAll(client) {
  const results = [];
  for (const guild of client.guilds.cache.values()) {
    const r = await sync(guild).catch(e => ({ ok: false, reason: e.message }));
    results.push({ guildId: guild.id, ...r });
  }
  return results;
}

module.exports = { sync, setEnabled, syncAll, isEnabled, buildKeywords, RULE_NAME };

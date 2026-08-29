const appSystem = require('../systems/applicationSystem');
const settings = require('../utils/settings');
const cooldown = require('../utils/cooldown');
const { runAutomod } = require('../moderation/automod');
const { v2, Card, container } = require('../utils/v2');
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const path = require('path');
const fs = require('fs');

const BANNER_PATH = path.join(__dirname, '..', 'assets', 'nova-banner.png');
const HAS_BANNER = fs.existsSync(BANNER_PATH);

async function sendMentionCard(message, client, prefix) {
  if (!HAS_BANNER) return null;

  const embed = new EmbedBuilder()
    .setColor(0x4B4BFF)
    .setImage('attachment://nova-banner.png');

  const files = [new AttachmentBuilder(BANNER_PATH, { name: 'nova-banner.png' })];

  return message.reply({ embeds: [embed], files, allowedMentions: { repliedUser: false } }).catch(() => null);
}

let Level; try { Level = require('../models/Level'); } catch {}

let config = { prefix: '!' };
try { config = require('../configs/config.json'); } catch {}

const DEFAULT_PREFIX = config.prefix || '!';

const xpCooldown = new Map();

function xpNeededFor(level) {
  return 5 * (level * level) + 50 * level + 100;
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function resolveLevelUpChannel(message, lvlCfg) {
  const id = lvlCfg?.channelId;
  if (id) {
    const ch = message.guild.channels.cache.get(id)
      || await message.guild.channels.fetch(id).catch(() => null);
    if (ch && ch.isTextBased && ch.isTextBased()) return ch;
  }
  return message.channel;
}

async function handleLeveling(message) {
  if (!Level) return;
  if (!message.guild || message.author.bot) return;
  if (!message.content || message.content.length < 2) return;

  let s;
  try { s = await settings.get(message.guild.id); } catch { return; }
  const lvl = (s && s.leveling) || {};
  if (lvl.enabled === false) return;

  const ignoredChannels = Array.isArray(lvl.ignoredChannels) ? lvl.ignoredChannels : [];
  if (ignoredChannels.includes(message.channel.id)) return;
  const ignoredRoles = Array.isArray(lvl.ignoredRoles) ? lvl.ignoredRoles : [];
  if (message.member && ignoredRoles.some(r => message.member.roles.cache.has(r))) return;

  const cdMs = Number.isFinite(lvl.cooldownMs) ? lvl.cooldownMs : 60_000;
  const key = `${message.guild.id}:${message.author.id}`;
  const now = Date.now();
  const last = xpCooldown.get(key) || 0;
  if (now - last < cdMs) return;
  xpCooldown.set(key, now);

  let gain;
  if (Number.isFinite(lvl.minXp) || Number.isFinite(lvl.maxXp)) {
    const minXp = Number.isFinite(lvl.minXp) ? lvl.minXp : 15;
    const maxXp = Number.isFinite(lvl.maxXp) ? lvl.maxXp : 25;
    gain = randInt(Math.min(minXp, maxXp), Math.max(minXp, maxXp));
  } else {
    const per = Number.isFinite(lvl.xpPerMessage) ? lvl.xpPerMessage : 15;
    gain = per;
  }

  let doc = await Level.findOne({ guildId: message.guild.id, userId: message.author.id });
  if (!doc) doc = new Level({ guildId: message.guild.id, userId: message.author.id, xp: 0, level: 0 });

  doc.xp = (doc.xp || 0) + gain;

  let leveledUp = false;
  while (doc.xp >= xpNeededFor(doc.level)) {
    doc.xp -= xpNeededFor(doc.level);
    doc.level += 1;
    leveledUp = true;
  }

  try { await doc.save(); } catch (err) { console.error('[leveling save]', err); return; }

  if (leveledUp) {
    try {
      const ch = await resolveLevelUpChannel(message, lvl);

      const embed = new Card()
        .setColor(0x57F287)
        .setDescription(`<@${message.author.id}> reached level **${doc.level}**! 🎉`);

      await ch.send(v2([embed], { allowedMentions: { users: [message.author.id] } }));
    } catch (err) {
      console.error('[leveling announce]', err);
    }
  }
}

async function resolvePrefix(guildId) {
  if (!guildId) return DEFAULT_PREFIX;
  try {
    const s = await settings.get(guildId);
    const p = (s && s.prefix) ? String(s.prefix) : DEFAULT_PREFIX;
    return p || DEFAULT_PREFIX;
  } catch {
    return DEFAULT_PREFIX;
  }
}

module.exports = {
  name: 'messageCreate',
  async execute(message, client) {
    try {
      if (message.partial) {
        try { await message.fetch(); } catch { return; }
      }
      if (message.author?.bot) return;

      if (message.guild) {
        try {
          const s = await settings.get(message.guild.id);
          const handled = await runAutomod(message, client, s);
          if (handled) return;
        } catch (err) {
          console.error('[automod-dispatch]', err);
        }

        try {
          await handleLeveling(message);
        } catch (err) {
          console.error('[leveling]', err);
        }
      }

      if (!message.guild) {
        if (await appSystem.routeDMMessage(message, 'events/messageCreate.js')) return;
        return;
      }

      const prefix = await resolvePrefix(message.guild.id);
      const content = message.content || '';

      if (new RegExp(`^<@!?${client.user.id}>$`).test(content.trim())) {
        return sendMentionCard(message, client, prefix);
      }

      if (!client?.prefixCommands || client.prefixCommands.size === 0) return;

      const mentionRe = new RegExp(`^<@!?${client.user.id}>\\s+`);
      let used = null;
      if (content.startsWith(prefix)) {
        used = prefix;
      } else if (mentionRe.test(content)) {
        used = content.match(mentionRe)[0];
      } else {
        return;
      }

      const withoutPrefix = content.slice(used.length).trim();
      if (!withoutPrefix) return;

      const args = withoutPrefix.split(/\s+/);
      const rawName = args.shift().toLowerCase();

      const name = client.prefixCommands.has(rawName)
        ? rawName
        : (client.aliases?.get(rawName) || null);
      if (!name) return;

      const command = client.prefixCommands.get(name);
      if (!command || typeof command.run !== 'function') return;

      if (client.cooldowns) {
        const remaining = cooldown(client, command, message.author.id);
        if (remaining > 0) {
          return message
            .reply(v2(
              [container({ color: 0xFEE75C, children: [`⏱️ Slow down — try again in **${remaining}s**.`] })],
              { allowedMentions: { repliedUser: false } },
            ))
            .catch(() => null);
        }
      }

      try {
        await command.run({ message, args, client, prefix: used });
      } catch (err) {
        console.error(`[PREFIX ${name}]`, err);
        await message
          .reply(v2(
            [container({ color: 0xED4245, children: ['❌ Something went wrong running that command.'] })],
            { allowedMentions: { repliedUser: false } },
          ))
          .catch(() => null);
      }
    } catch (err) {
      console.error('[messageCreate]', err);
    }
  },
};

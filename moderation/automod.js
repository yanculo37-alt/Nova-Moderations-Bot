const { PermissionsBitField, ChannelType } = require('discord.js');
const embeds = require('../embeds');
const { logTo } = require('../utils/logger');
const { v2, Card } = require('../utils/v2');
const words = require('../utils/wordVariants');

const INVITE_RE = /(discord\.gg\/|discord(?:app)?\.com\/invite\/)[a-z0-9-]+/i;
const LINK_RE   = /https?:\/\/[^\s]+/i;

const normalize = words.normalize;

function containsBlacklist(content, list) {
  return words.findMatch(content, list || []) || undefined;
}
function isLinkWhitelisted(content, list) {
  return (list || []).some(d => d && content.toLowerCase().includes(d));
}

function ensureMaps(client) {
  if (!client.spamMap)      client.spamMap     = new Map();
  if (!client.spamMsgMap)   client.spamMsgMap  = new Map();
  if (!client.warnRepeats)  client.warnRepeats = new Map();
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function guildIconURL(guild) {
  try { return guild?.iconURL?.({ size: 256, extension: 'png' }) || null; } catch { return null; }
}

function findAnnounceChannel(guild) {

  const me = guild.members.me;
  const canSend = (ch) =>
    ch && ch.type === ChannelType.GuildText &&
    ch.permissionsFor(me)?.has(PermissionsBitField.Flags.SendMessages) &&
    ch.permissionsFor(me)?.has(PermissionsBitField.Flags.ViewChannel);

  if (canSend(guild.systemChannel)) return guild.systemChannel;
  const named = guild.channels.cache.find(
    c => c.type === ChannelType.GuildText && /^general$/i.test(c.name) && canSend(c)
  );
  if (named) return named;
  return guild.channels.cache.find(c => canSend(c)) || null;
}

async function applyPunishment(message, reason, client, A, extraDeleteIds = []) {

  try { await message.delete().catch(() => null); } catch {}

  for (const ref of extraDeleteIds) {
    try {
      const ch = ref.channelId === message.channel.id
        ? message.channel
        : await message.guild.channels.fetch(ref.channelId).catch(() => null);
      if (ch && ch.messages) {
        await ch.messages.delete(ref.id).catch(() => null);
      }
    } catch {}
  }

  const key = `${message.guild.id}:${message.author.id}`;
  const count = (client.warnRepeats.get(key) || 0) + 1;
  client.warnRepeats.set(key, count);
  setTimeout(() => client.warnRepeats.delete(key), 10 * 60 * 1000);

  const icon = guildIconURL(message.guild);
  const isTimeout = count >= 3;

  try {
    const dm = new Card()
      .setColor(isTimeout ? 0xED4245 : 0xFEE75C)
      .setTitle(isTimeout ? 'Automod Timeout' : 'Automod Warning')
      .setDescription(
        isTimeout
          ? `You have been **timed out** in **${message.guild.name}**.\n` +
            `**Reason:** ${reason}\n` +
            `**Offense #:** ${count} (3rd strike)`
          : `Your message in **${message.guild.name}** was removed.\n` +
            `**Reason:** ${reason}\n` +
            `**Notice:** This is your **${ordinal(count)} warning**. ` +
            `${count === 1 ? 'Two more warnings' : 'One more warning'} will result in a timeout.`
      )
      .setFooter({ text: message.guild.name, iconURL: icon || undefined })
      .setTimestamp();
    if (icon) dm.setThumbnail(icon);
    await message.author.send(v2([dm])).catch(() => null);
  } catch {}

  if (isTimeout) {
    const me = message.guild.members.me;
    if (me?.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
      await message.member?.timeout(A.timeoutMs || 5 * 60 * 1000, `Automod: ${reason}`).catch(() => null);
    }
  }

  await logTo(message.client, message.guild.id, 'moderation',
    embeds.mod('Automod Action',
      `**User:** ${message.author} (\`${message.author.id}\`)\n` +
      `**Reason:** ${reason}\n` +
      `**Channel:** ${message.channel}\n` +
      `**Offense #:** ${count}\n` +
      `**Action:** ${isTimeout ? 'Timeout' : 'Warning'}`));
}

function memberIsTargeted(member, A) {
  if (!Array.isArray(A.targetRoleIds) || A.targetRoleIds.length === 0) return true;
  if (!member?.roles?.cache) return false;
  return A.targetRoleIds.some(rid => member.roles.cache.has(rid));
}

async function runAutomod(message, client, settingsDoc) {
  try {
    if (!message.guild || message.author.bot) return false;
    if (message.member?.permissions.has(PermissionsBitField.Flags.ManageMessages)) return false;

    const A = settingsDoc?.automod;
    if (!A) return false;
    if (!memberIsTargeted(message.member, A)) return false;

    ensureMaps(client);
    const c = message.content || '';

    if (A.antiSlur) {
      const hit = containsBlacklist(c, A.blacklist || []);
      if (hit) { await applyPunishment(message, `using a blacklisted word (\`${hit}\`)`, client, A); return true; }
    }
    if (A.antiInvite && INVITE_RE.test(c)) {
      await applyPunishment(message, 'posting Discord invite links', client, A); return true;
    }
    if (A.antiLink && LINK_RE.test(c) && !isLinkWhitelisted(c, A.linkWhitelist || [])) {
      await applyPunishment(message, 'posting unauthorized links', client, A); return true;
    }
    if (A.antiEveryone && /@everyone/.test(c)) {
      try { await message.delete().catch(() => null); } catch {}
      return true;
    }
    if (A.antiHere && /@here/.test(c)) {
      try { await message.delete().catch(() => null); } catch {}
      return true;
    }
    if (A.antiMassMention && (message.mentions.users.size + message.mentions.roles.size) >= (A.mentionThreshold || 5)) {
      await applyPunishment(message, 'mass mentioning users', client, A); return true;
    }
    if (A.antiCaps && c.length >= (A.capsMinLength || 10)) {
      const letters = c.replace(/[^a-zA-Z]/g, '');
      if (letters.length >= (A.capsMinLength || 10)) {
        const upper = letters.replace(/[^A-Z]/g, '').length;
        if ((upper / letters.length) * 100 >= (A.capsThreshold || 70)) {
          await applyPunishment(message, 'using excessive caps', client, A); return true;
        }
      }
    }
    if (A.antiEmojiSpam) {
      const emojis = (c.match(/<a?:\w+:\d+>/g) || []).length +
                     (c.match(/\p{Extended_Pictographic}/gu) || []).length;
      if (emojis >= (A.emojiThreshold || 8)) {
        await applyPunishment(message, 'spamming emojis', client, A); return true;
      }
    }
    if (A.antiSpam) {
      const threshold = A.spamThreshold || 5;
      const windowMs  = A.spamWindowMs || 5000;
      const key = `${message.guild.id}:${message.author.id}`;
      const now = Date.now();

      const times = (client.spamMap.get(key) || []).filter(t => now - t < windowMs);
      times.push(now);
      client.spamMap.set(key, times);

      const refs = (client.spamMsgMap.get(key) || []).filter(r => now - r.at < windowMs);
      refs.push({ id: message.id, channelId: message.channel.id, at: now });
      client.spamMsgMap.set(key, refs);

      if (times.length >= threshold) {
        client.spamMap.set(key, []);
        const toDelete = refs.filter(r => r.id !== message.id);
        client.spamMsgMap.set(key, []);
        await applyPunishment(message, `spamming messages (${times.length} in ${Math.round(windowMs/1000)}s)`, client, A, toDelete);
        return true;
      }
    }
    return false;
  } catch (err) {
    console.error('[automod]', err);
    return false;
  }
}

module.exports = { runAutomod };

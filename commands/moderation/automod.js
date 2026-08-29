const {
  SlashCommandBuilder,
  PermissionsBitField,
  } = require('discord.js');
const settings = require('../../utils/settings');
const discordAutomod = require('../../utils/discordAutomod');
const { v2, Card } = require('../../utils/v2');

let embeds = null;
try { embeds = require('../../embeds'); } catch {}

function ok(title, desc) {
  if (embeds?.success) return embeds.success(title, desc);
  return new Card().setColor(0x57F287).setTitle(title).setDescription(desc || null);
}
function err(title, desc) {
  if (embeds?.error) return embeds.error(title, desc);
  return new Card().setColor(0xED4245).setTitle(title).setDescription(desc || null);
}
function info(title, desc) {
  if (embeds?.info) return embeds.info(title, desc);
  return new Card().setColor(0x5865F2).setTitle(title).setDescription(desc || null);
}

async function syncNative(guild) {
  if (!guild) return '';
  const r = await discordAutomod.sync(guild).catch(e => ({ ok: false, reason: e.message }));
  if (r.ok) {
    if (r.action === 'disabled') return '\n-# Discord AutoMod is currently **off** for this server (`/automod toggle`).';
    if (r.action === 'removed')  return '\n-# Discord AutoMod rule removed (no words left to block).';
    return `\n-# ✅ Synced to **Discord AutoMod** (${r.count} keyword${r.count === 1 ? '' : 's'} blocked server-wide).`;
  }
  return `\n-# ⚠️ Could not update Discord AutoMod: ${r.reason}`;
}

async function doAdd(guildId, word) {
  const s = await settings.get(guildId);
  const list = Array.isArray(s.automod.blacklist) ? s.automod.blacklist.slice() : [];
  const w = String(word).trim().toLowerCase();
  if (!w) return { ok: false, msg: 'Word cannot be empty.' };
  if (list.map(x => x.toLowerCase()).includes(w)) return { ok: false, msg: `\`${w}\` is already on the blacklist.` };
  list.push(w);
  await settings.set(guildId, { automod: { blacklist: list, antiSlur: true } });
  return { ok: true, msg: `Added \`${w}\` to the automod blacklist. (${list.length} total)`, sync: true };
}

async function doRemove(guildId, word) {
  const s = await settings.get(guildId);
  const list = Array.isArray(s.automod.blacklist) ? s.automod.blacklist.slice() : [];
  const w = String(word).trim().toLowerCase();
  const idx = list.findIndex(x => x.toLowerCase() === w);
  if (idx === -1) return { ok: false, msg: `\`${w}\` is not on the blacklist.` };
  list.splice(idx, 1);
  await settings.set(guildId, { automod: { blacklist: list } });
  return { ok: true, msg: `Removed \`${w}\` from the blacklist. (${list.length} total)`, sync: true };
}

async function doList(guildId) {
  const s = await settings.get(guildId);
  const list = Array.isArray(s.automod.blacklist) ? s.automod.blacklist : [];
  const roles = Array.isArray(s.automod.targetRoleIds) ? s.automod.targetRoleIds : [];
  const wordsText = list.length
    ? list.map(w => `\`${w}\``).join(', ')
    : '*No words configured.*';
  const rolesText = roles.length
    ? roles.map(r => `<@&${r}>`).join(', ')
    : '*All members (no target role filter).*';
  const nativeOn = discordAutomod.isEnabled(s);
  return info('Automod Configuration',
    `**Discord AutoMod:** ${nativeOn ? '🟢 Enabled' : '🔴 Disabled'}\n\n` +
    `**Blacklisted words (${list.length}):**\n${wordsText}\n\n` +
    `**Target roles:**\n${rolesText}\n\n` +
    `**Spam threshold:** ${s.automod.spamThreshold || 5} msgs / ${(s.automod.spamWindowMs || 5000)/1000}s\n` +
    `**Timeout duration:** ${Math.round((s.automod.timeoutMs || 300000)/1000)}s`);
}

async function doSetRole(guildId, roleId, removeMode) {
  const s = await settings.get(guildId);
  const cur = Array.isArray(s.automod.targetRoleIds) ? s.automod.targetRoleIds.slice() : [];
  const has = cur.includes(roleId);
  let next;
  let action;
  if (removeMode) {
    if (!has) return { ok: false, msg: `<@&${roleId}> is not a target role.` };
    next = cur.filter(r => r !== roleId);
    action = `Removed <@&${roleId}> from automod target roles.`;
  } else {
    if (has) {
      next = cur.filter(r => r !== roleId);
      action = `Removed <@&${roleId}> from automod target roles.`;
    } else {
      next = [...cur, roleId];
      action = `Added <@&${roleId}> as an automod target role.`;
    }
  }
  await settings.set(guildId, { automod: { targetRoleIds: next } });
  const note = next.length === 0
    ? '\n*No target roles set — automod now applies to **everyone**.*'
    : `\n*Automod now only targets members with: ${next.map(r => `<@&${r}>`).join(', ')}*`;
  return { ok: true, msg: action + note };
}

async function doToggle(guild, enabled) {
  const r = await discordAutomod.setEnabled(guild, enabled);
  if (!r.ok) return { ok: false, msg: `Could not ${enabled ? 'enable' : 'disable'} Discord AutoMod: ${r.reason}` };
  return {
    ok: true,
    msg: enabled
      ? `**Discord AutoMod is now ON.**\nThe blacklist is enforced natively by Discord — blacklisted messages are blocked before they are ever posted.` +
        (r.count ? `\n\n${r.count} keyword${r.count === 1 ? '' : 's'} are active in the rule.` : '\n\n*No blacklisted words yet — add some with `/automod add`.*')
      : `**Discord AutoMod is now OFF.**\nThe native rule has been disabled; the bot falls back to deleting flagged messages itself.`,
  };
}

module.exports = {
  name: 'automod',
  description: 'Manage the automod blacklist and target roles.',
  category: 'moderation',
  data: new SlashCommandBuilder()
    .setName('automod')
    .setDescription('Manage the automod blacklist and target roles.')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
    .addSubcommand(sc => sc
      .setName('add')
      .setDescription('Add a word to the automod blacklist.')
      .addStringOption(o => o.setName('word').setDescription('Word/phrase to blacklist').setRequired(true)))
    .addSubcommand(sc => sc
      .setName('remove')
      .setDescription('Remove a word from the automod blacklist.')
      .addStringOption(o => o.setName('word').setDescription('Word/phrase to remove').setRequired(true)))
    .addSubcommand(sc => sc
      .setName('list')
      .setDescription('List all automod settings (words, roles, thresholds).'))
    .addSubcommand(sc => sc
      .setName('toggle')
      .setDescription('Turn Discord\'s native AutoMod on or off for the blacklist.')
      .addBooleanOption(o => o
        .setName('toggle')
        .setDescription('true = enable Discord AutoMod (default), false = disable it')))
    .addSubcommand(sc => sc
      .setName('setrole')
      .setDescription('Toggle a role as an automod target (only these roles get moderated).')
      .addRoleOption(o => o.setName('role').setDescription('Role to target').setRequired(true))
      .addBooleanOption(o => o.setName('remove').setDescription('Remove this role instead of toggle/add'))),

  async execute({ interaction }) {
    if (!interaction.guild)
      return interaction.reply(v2([err('Guild only')], { ephemeral: true }));
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild))
      return interaction.reply(v2([err('Missing Permission', 'You need **Manage Server**.')], { ephemeral: true }));

    const sub = interaction.options.getSubcommand();
    await interaction.deferReply({ ephemeral: true });

    try {
      if (sub === 'add') {
        const r = await doAdd(interaction.guild.id, interaction.options.getString('word', true));
        if (r.sync) r.msg += await syncNative(interaction.guild);
        return interaction.editReply(v2([r.ok ? ok('Blacklist updated', r.msg) : err('Failed', r.msg)]));
      }
      if (sub === 'remove') {
        const r = await doRemove(interaction.guild.id, interaction.options.getString('word', true));
        if (r.sync) r.msg += await syncNative(interaction.guild);
        return interaction.editReply(v2([r.ok ? ok('Blacklist updated', r.msg) : err('Failed', r.msg)]));
      }
      if (sub === 'toggle') {

        const enabled = interaction.options.getBoolean('toggle') ?? true;
        const r = await doToggle(interaction.guild, enabled);
        return interaction.editReply(v2([r.ok ? ok(enabled ? 'Discord AutoMod enabled' : 'Discord AutoMod disabled', r.msg) : err('Failed', r.msg)]));
      }
      if (sub === 'list') {
        return interaction.editReply(v2([await doList(interaction.guild.id)]));
      }
      if (sub === 'setrole') {
        const role = interaction.options.getRole('role', true);
        const remove = interaction.options.getBoolean('remove') || false;
        const r = await doSetRole(interaction.guild.id, role.id, remove);
        return interaction.editReply(v2([r.ok ? ok('Target roles updated', r.msg) : err('Failed', r.msg)]));
      }
    } catch (e) {
      console.error('[/automod]', e);
      return interaction.editReply(v2([err('Error', String(e.message || e))]));
    }
  },

  async run({ message, args }) {
    if (!message.guild) return;
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageGuild))
      return message.reply(v2([err('Missing Permission', 'You need **Manage Server**.')]));

    const sub = (args[0] || '').toLowerCase();
    try {
      if (sub === 'add') {
        const word = args.slice(1).join(' ');
        if (!word) return message.reply(v2([err('Usage', '`!automod add <word>`')]));
        const r = await doAdd(message.guild.id, word);
        if (r.sync) r.msg += await syncNative(message.guild);
        return message.reply(v2([r.ok ? ok('Blacklist updated', r.msg) : err('Failed', r.msg)]));
      }
      if (sub === 'remove' || sub === 'rm' || sub === 'del') {
        const word = args.slice(1).join(' ');
        if (!word) return message.reply(v2([err('Usage', '`!automod remove <word>`')]));
        const r = await doRemove(message.guild.id, word);
        if (r.sync) r.msg += await syncNative(message.guild);
        return message.reply(v2([r.ok ? ok('Blacklist updated', r.msg) : err('Failed', r.msg)]));
      }
      if (sub === 'list' || sub === 'ls' || !sub) {
        return message.reply(v2([await doList(message.guild.id)]));
      }
      if (sub === 'toggle') {
        const raw = (args[1] || '').toLowerCase();
        const enabled = /^(false|off|no|disable|0)$/.test(raw) ? false : true;
        const r = await doToggle(message.guild, enabled);
        return message.reply(v2([r.ok ? ok(enabled ? 'Discord AutoMod enabled' : 'Discord AutoMod disabled', r.msg) : err('Failed', r.msg)]));
      }
      if (sub === 'setrole') {
        const role = message.mentions.roles?.first()
          || message.guild.roles.cache.get(args[1]);
        if (!role) return message.reply(v2([err('Usage', '`!automod setrole @role [remove]`')]));
        const remove = /^(remove|rm|off|delete)$/i.test(args[2] || '');
        const r = await doSetRole(message.guild.id, role.id, remove);
        return message.reply(v2([r.ok ? ok('Target roles updated', r.msg) : err('Failed', r.msg)]));
      }
      return message.reply(v2([err('Usage', '`!automod add|remove|list|toggle <true|false>|setrole ...`')]));
    } catch (e) {
      console.error('[!automod]', e);
      return message.reply(v2([err('Error', String(e.message || e))]));
    }
  },
};

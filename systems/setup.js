const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, RoleSelectMenuBuilder, StringSelectMenuBuilder,
  ChannelType, PermissionsBitField, MessageFlags,
} = require('discord.js');
const settings = require('../utils/settings');
const config = require('../configs/config.json');
const embeds = require('../embeds');
const { fail, ok, statusReply } = require('../utils/reply');
const { v2, Card } = require('../utils/v2');
const { stripEphemeral, withEphemeral, reportError } = require('../utils/errors');

const NS = 'setup';
const id = (...parts) => [NS, ...parts].join(':');
const P = PermissionsBitField.Flags;

function isAdmin(member) {
  if (!member) return false;
  if (config.owners?.includes(member.id)) return true;
  return member.permissions?.has(P.Administrator)
      || member.permissions?.has(P.ManageGuild);
}

async function buildMainEmbed(guild) {
  const s = await settings.get(guild.id);
  const yn = (v) => v ? '✅' : '⚠️';
  const ch = (i) => i ? `<#${i}>` : '*not set*';
  const rl = (i) => i ? `<@&${i}>` : '*not set*';

  return new Card()
    .setColor(config.branding.color)
    .setTitle('⚙️ Server Setup')
    .setDescription(
      `Configure **${guild.name}** without ever touching \`config.json\`.\n` +
      `Pick a category below, or run **Auto Setup** to create everything in one click.`
    )
    .addFields(
      { name: '📜 Logs', value:
        `${yn(s.logChannels.moderation)} Moderation: ${ch(s.logChannels.moderation)}\n` +
        `${yn(s.logChannels.messages)} Messages: ${ch(s.logChannels.messages)}\n` +
        `${yn(s.logChannels.tickets)} Tickets: ${ch(s.logChannels.tickets)}\n` +
        `${yn(s.logChannels.joinLeave)} Join/Leave: ${ch(s.logChannels.joinLeave)}`, inline: true },
      { name: '👥 Roles', value:
        `Staff: ${s.staffRoles.length ? s.staffRoles.map(r => `<@&${r}>`).join(' ') : '*none*'}\n` +
        `Mod: ${s.modRoles.length ? s.modRoles.map(r => `<@&${r}>`).join(' ') : '*none*'}\n` +
        `Auto-role: ${s.autoRole.enabled ? rl(s.autoRole.roleId) : '*off*'}`, inline: true },
      { name: '👋 Welcome / Goodbye', value:
        `Welcome: ${s.welcome.enabled ? ch(s.welcome.channelId) : '*off*'}\n` +
        `Goodbye: ${s.goodbye.enabled ? ch(s.goodbye.channelId) : '*off*'}\n` +
        `Suggestions: ${s.suggestions.enabled ? ch(s.suggestions.channelId) : '*off*'}`, inline: false },
      { name: '🎫 Tickets', value:
        `Category: ${s.tickets.categoryId ? `<#${s.tickets.categoryId}>` : '*not set*'}\n` +
        `Support role: ${rl(s.tickets.supportRoleId)}\n` +
        `Transcripts: ${ch(s.tickets.transcriptChannelId)}`, inline: true },
      { name: '🛡️ Automod', value:
        `Slurs ${yn(s.automod.antiSlur)} • Spam ${yn(s.automod.antiSpam)} • Invites ${yn(s.automod.antiInvite)}\n` +
        `Caps ${yn(s.automod.antiCaps)} • Mentions ${yn(s.automod.antiMassMention)} • Links ${yn(s.automod.antiLink)}`, inline: true },
      { name: '⚡ Bot', value: `Prefix: \`${s.prefix || config.prefix}\`\nCmd channels: ${s.commandChannels.length ? s.commandChannels.map(c => `<#${c}>`).join(' ') : '*all*'}`, inline: false },
    )
    .setFooter({ text: s.setupCompletedAt ? `Last saved ${new Date(s.setupCompletedAt).toUTCString()}` : 'Not yet completed' });
}

function mainComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(id('autopanel')).setLabel('Auto Setup').setEmoji('✨').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(id('page', 'logs')).setLabel('Logs').setEmoji('📜').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(id('page', 'roles')).setLabel('Roles').setEmoji('👥').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(id('page', 'channels')).setLabel('Channels').setEmoji('📢').setStyle(ButtonStyle.Primary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(id('page', 'automod')).setLabel('Automod').setEmoji('🛡️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(id('page', 'bot')).setLabel('Bot').setEmoji('⚡').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(id('refresh')).setLabel('Refresh').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(id('reset')).setLabel('Reset All').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
    ),
  ];
}

async function openMainPanel(target) {
  const guild = target.guild;
  const member = target.member;
  if (!isAdmin(member)) return fail(target, 'Insufficient Permissions', 'You need **Administrator** or **Manage Server** to use setup.');

  const embed = await buildMainEmbed(guild);
  const components = mainComponents();
  const payload = v2([embed, ...components], { ephemeral: true });

  if (target.isRepliable) {
    if (target.deferred || target.replied) return target.editReply(payload).catch(() => null);
    return target.reply(payload).catch(() => null);
  }

  return target.reply({ ...payload, flags: stripEphemeral(payload.flags) })
    .catch((e) => console.error('[setup] panel send failed:', e?.code ?? '', e?.message ?? e));
}

function autoPanelEmbed(guild) {
  return new Card()
    .setColor(config.branding.color)
    .setTitle('✨ Auto Setup')
    .setDescription(
      `Choose what to do for **${guild.name}**:\n\n` +
      `• **Full Setup** — creates roles, the private **LOGS** category and every community category/channel.\n` +
      `• **Only Logs** — creates just the private **LOGS** category + all log channels.\n` +
      `• **Delete All Channels** — ⚠️ removes **every** channel and category in this server (irreversible).\n` +
      `• **Delete EVERYTHING** — 💥 nukes **every channel AND every role** the bot can touch (irreversible).`
    );
}
function autoPanelComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(id('auto', 'full')).setLabel('Full Setup').setEmoji('✨').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(id('auto', 'logs')).setLabel('Only Logs').setEmoji('📜').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(id('auto', 'wipe')).setLabel('Delete All Channels').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(id('auto', 'nuke')).setLabel('Delete EVERYTHING').setEmoji('💥').setStyle(ButtonStyle.Danger),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(id('back')).setLabel('Back').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
    ),
  ];
}
async function openAutoPanel(target) {
  if (!isAdmin(target.member)) return fail(target, 'Insufficient Permissions', 'Setup is admin-only.');
  const payload = v2([autoPanelEmbed(target.guild), ...autoPanelComponents()], { ephemeral: true });
  if (target.isRepliable) {
    if (target.deferred || target.replied) return target.editReply(payload).catch(() => null);
    return target.reply(payload).catch(() => null);
  }

  return target.reply({ ...payload, flags: stripEphemeral(payload.flags) })
    .catch((e) => console.error('[setup] panel send failed:', e?.code ?? '', e?.message ?? e));
}

function pageEmbed(title, desc) {
  return new Card().setColor(config.branding.color).setTitle(`⚙️ ${title}`).setDescription(desc);
}
const backRow = () => new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId(id('back')).setLabel('Back').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
);

async function showPage(interaction, page) {
  const builders = {
    logs: pageLogs, roles: pageRoles, channels: pageChannels,
    tickets: pageTickets, automod: pageAutomod, bot: pageBot,
  };
  const fn = builders[page];
  if (!fn) return fail(interaction, 'Unknown page', page);
  const { embed, components } = await fn(interaction.guild);
  return interaction.update(v2([embed, ...components, backRow()])).catch(() => null);
}

async function pageLogs() {
  const embed = pageEmbed('Log Channels',
    'Select the channel for each log type. Pick the same channel to disable a log via **Reset All**.');
  const mk = (key, placeholder) => new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder().setCustomId(id('set', `logChannels.${key}`))
      .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      .setPlaceholder(placeholder).setMinValues(0).setMaxValues(1),
  );
  return { embed, components: [
    mk('moderation', '🛡️  Moderation log channel'),
    mk('messages',   '✏️  Message log channel'),
    mk('tickets',    '🎫  Ticket log channel'),
    mk('joinLeave',  '👋  Join / Leave log channel'),
  ]};
}

async function pageRoles() {
  const embed = pageEmbed('Roles & Permissions',
    'Choose which roles count as **Staff** (full mod commands), **Mod** (basic mod commands), and the optional **Auto-Role** for new members.');
  return { embed, components: [
    new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder().setCustomId(id('setroles', 'staffRoles'))
        .setPlaceholder('👑  Staff roles').setMinValues(0).setMaxValues(10)),
    new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder().setCustomId(id('setroles', 'modRoles'))
        .setPlaceholder('🛡️  Moderator roles').setMinValues(0).setMaxValues(10)),
    new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder().setCustomId(id('autorole'))
        .setPlaceholder('🤖  Auto-role for new members (pick none to disable)').setMinValues(0).setMaxValues(1)),
  ]};
}

async function pageChannels() {
  const embed = pageEmbed('Channels',
    'Configure welcome, goodbye, suggestion, and command-restricted channels.');
  const ch = (key, placeholder) => new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder().setCustomId(id('set', key))
      .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      .setPlaceholder(placeholder).setMinValues(0).setMaxValues(1));
  return { embed, components: [
    ch('welcome.channelId',     '👋  Welcome channel'),
    ch('goodbye.channelId',     '😢  Goodbye channel'),
    ch('suggestions.channelId', '💡  Suggestions channel'),
    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder().setCustomId(id('cmdchannels'))
        .setChannelTypes(ChannelType.GuildText)
        .setPlaceholder('🔒  Restrict commands to channels (none = all)').setMinValues(0).setMaxValues(10)),
  ]};
}

async function pageTickets() {
  const embed = pageEmbed('Tickets',
    'Configure the tickets category, support role, and transcript channel.');
  return { embed, components: [
    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder().setCustomId(id('set', 'tickets.categoryId'))
        .setChannelTypes(ChannelType.GuildCategory)
        .setPlaceholder('📂  Ticket category').setMinValues(0).setMaxValues(1)),
    new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder().setCustomId(id('ticketrole'))
        .setPlaceholder('🛟  Support role').setMinValues(0).setMaxValues(1)),
    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder().setCustomId(id('set', 'tickets.transcriptChannelId'))
        .setChannelTypes(ChannelType.GuildText)
        .setPlaceholder('📄  Transcript channel').setMinValues(0).setMaxValues(1)),
  ]};
}

async function pageAutomod(guild) {
  const s = await settings.get(guild.id);
  const embed = pageEmbed('Automod',
    'Toggle individual filters. Currently **on** filters appear with ✅, off with ⚠️.');
  const opt = (label, key) => ({
    label: `${s.automod[key] ? '✅' : '⚠️'}  ${label}`,
    value: key,
    description: s.automod[key] ? 'Click to DISABLE' : 'Click to ENABLE',
  });
  return { embed, components: [
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId(id('automod', 'toggle'))
        .setPlaceholder('Pick a filter to toggle…')
        .addOptions(
          opt('Anti-slur',         'antiSlur'),
          opt('Anti-spam',         'antiSpam'),
          opt('Anti-invite',       'antiInvite'),
          opt('Anti-link',         'antiLink'),
          opt('Anti-mass-mention', 'antiMassMention'),
          opt('Block @everyone',   'antiEveryone'),
          opt('Block @here',       'antiHere'),
          opt('Anti-caps',         'antiCaps'),
          opt('Anti-emoji-spam',   'antiEmojiSpam'),
          opt('Warn on flag',      'warnOnFlag'),
          opt('Timeout on repeat', 'timeoutOnRepeat'),
        )),
  ]};
}

async function pageBot(guild) {
  const s = await settings.get(guild.id);
  const embed = pageEmbed('Bot Settings',
    `Current prefix: \`${s.prefix || config.prefix}\`\n` +
    `Leveling: ${s.leveling.enabled ? '✅ enabled' : '⚠️ disabled'}\n\n` +
    'Use the buttons below to change.');
  return { embed, components: [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(id('prefix')).setLabel('Change Prefix').setEmoji('⚡').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(id('toggle', 'leveling.enabled')).setLabel(s.leveling.enabled ? 'Disable Leveling' : 'Enable Leveling').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(id('toggle', 'welcome.enabled')).setLabel(s.welcome.enabled ? 'Disable Welcome' : 'Enable Welcome').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(id('toggle', 'goodbye.enabled')).setLabel(s.goodbye.enabled ? 'Disable Goodbye' : 'Enable Goodbye').setStyle(ButtonStyle.Secondary),
    ),
  ]};
}

const CAT = {
  logs:     '━━━『 👮 𝐋𝐎𝐆𝐒 』━━━',
  welcome:  '━━━『 🌌 𝐖𝐄𝐋𝐂𝐎𝐌𝐄 』━━━',
  info:     '━━━『 📌 𝐈𝐍𝐅𝐎 』━━━',
  chat:     '━━━『 💬 𝐂𝐇𝐀𝐓 』━━━',
  voice:    '━━━『 🗣️ 𝐕𝐎𝐈𝐂𝐄 𝐂𝐇𝐀𝐓𝐒 』━━━',
  support:  '━━━『 🎫 𝐒𝐔𝐏𝐏𝐎𝐑𝐓 』━━━',
  partners: '━━━『 🤝 𝐏𝐀𝐑𝐓𝐍𝐄𝐑𝐒 』━━━',
  tickets:  '━━━『 🎟️ 𝐓𝐈𝐂𝐊𝐄𝐓𝐒 』━━━',
};

function findCategory(guild, name) {
  return guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === name);
}
function findChannel(guild, name, type) {
  return guild.channels.cache.find(c => c.type === type && c.name === name);
}

async function ensureRole(guild, name, color, created, opts = {}) {
  const existing = guild.roles.cache.find(r => r.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    if (opts.permissions || typeof opts.hoist === 'boolean' || typeof opts.mentionable === 'boolean') {
      await existing.edit({
        ...(opts.permissions ? { permissions: opts.permissions } : {}),
        ...(typeof opts.hoist === 'boolean' ? { hoist: opts.hoist } : {}),
        ...(typeof opts.mentionable === 'boolean' ? { mentionable: opts.mentionable } : {}),
      }, 'Nova auto-setup sync').catch(() => null);
    }
    return existing;
  }
  const r = await guild.roles.create({
    name,
    color,
    hoist: opts.hoist ?? false,
    mentionable: opts.mentionable ?? false,
    permissions: opts.permissions ?? [],
    reason: 'Nova auto-setup',
  }).catch((e) => { console.error('[SETUP] role create failed:', name, e?.message); return null; });
  if (r) created.push(`Role <@&${r.id}>`);
  return r;
}

async function ensureCategory(guild, name, overwrites, created, position) {
  let cat = findCategory(guild, name);
  if (!cat) {
    cat = await guild.channels.create({
      name, type: ChannelType.GuildCategory,
      permissionOverwrites: overwrites, position,
      reason: 'Nova auto-setup',
    }).catch((e) => { console.error('[SETUP] category create failed:', name, e?.message); return null; });
    if (cat) created.push(`Category **${cat.name}**`);
  } else if (overwrites) {
    await cat.permissionOverwrites.set(overwrites, 'Nova auto-setup sync').catch(() => null);
  }
  return cat;
}

async function ensureChannel(guild, { name, type = ChannelType.GuildText, parent, overwrites, userLimit, topic }, created) {
  const existing = findChannel(guild, name, type);
  if (existing) {
    if (parent && existing.parentId !== parent.id) {
      await existing.setParent(parent.id, { lockPermissions: false }).catch(() => null);
    }
    if (overwrites && existing.permissionOverwrites?.set) {
      await existing.permissionOverwrites.set(overwrites, 'Nova auto-setup sync').catch(() => null);
    }
    if (userLimit && type === ChannelType.GuildVoice && existing.userLimit !== userLimit) {
      await existing.setUserLimit(userLimit, 'Nova auto-setup sync').catch(() => null);
    }
    if (topic && type === ChannelType.GuildText && existing.topic !== topic) {
      await existing.setTopic(topic, 'Nova auto-setup sync').catch(() => null);
    }
    return existing;
  }
  const opts = {
    name, type,
    parent: parent?.id || null,
    permissionOverwrites: overwrites,
    reason: 'Nova auto-setup',
  };
  if (userLimit && type === ChannelType.GuildVoice) opts.userLimit = userLimit;
  if (topic && type === ChannelType.GuildText) opts.topic = topic;
  const c = await guild.channels.create(opts).catch((e) => { console.error('[SETUP] channel create failed:', name, e?.message); return null; });
  if (c) created.push(type === ChannelType.GuildVoice ? `Voice <#${c.id}>` : `Channel <#${c.id}>`);
  return c;
}

async function buildLogs(guild, staffBucket, me, created) {
  const privateOverwrites = [
    { id: guild.roles.everyone.id, deny:  [P.ViewChannel] },
    ...staffBucket.map(r => ({ id: r.id, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.AttachFiles, P.EmbedLinks] })),
    { id: me.id, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.AttachFiles, P.EmbedLinks, P.ManageMessages] },
  ];

  const logsCat = await ensureCategory(guild, CAT.logs, privateOverwrites, created, 0);

  const mk = (name) => ensureChannel(guild, {
    name, type: ChannelType.GuildText, parent: logsCat,
    overwrites: privateOverwrites,
  }, created);

  const modLog       = await mk('👮・mod-logs');
  const msgLog       = await mk('✏️・message-logs');
  const ticketLog    = await mk('🎫・ticket-logs');
  const joinLeaveLog = await mk('👋・join-leave-logs');
  const transcripts  = await mk('📄・ticket-transcripts');
  const serverLog    = await mk('🛠️・server-logs');
  const voiceLog     = await mk('🎙️・voice-logs');

  return { logsCat, modLog, msgLog, ticketLog, joinLeaveLog, transcripts, serverLog, voiceLog };
}

async function ensureBaseRoles(guild, created) {
  const PERMS = {
    owner: [P.Administrator],
    admin: [P.Administrator],
    headMod: [
      P.ManageGuild, P.ManageChannels, P.ManageRoles, P.ManageMessages,
      P.KickMembers, P.BanMembers, P.ModerateMembers, P.MentionEveryone,
      P.ViewAuditLog, P.ManageNicknames, P.MuteMembers, P.DeafenMembers, P.MoveMembers,
    ],
    mod: [
      P.ManageMessages, P.KickMembers, P.ModerateMembers,
      P.ViewAuditLog, P.ManageNicknames, P.MuteMembers, P.MoveMembers,
    ],
    helper: [P.ManageMessages, P.ModerateMembers, P.MuteMembers],
    staff:  [P.ManageMessages, P.ModerateMembers],
    support:[P.ManageMessages],
    bots:   [P.ManageMessages, P.EmbedLinks, P.AttachFiles, P.UseExternalEmojis, P.AddReactions],
    member: [
      P.ViewChannel, P.SendMessages, P.ReadMessageHistory,
      P.EmbedLinks, P.AttachFiles, P.AddReactions, P.UseExternalEmojis,
      P.Connect, P.Speak, P.Stream, P.UseVAD,
    ],
    muted: [],
  };

  const owner   = await ensureRole(guild, '👑｜OWNER',     '#FF2D55', created, { hoist: true, mentionable: true, permissions: PERMS.owner });
  const coOwner = await ensureRole(guild, '💎｜CO-OWNER',  '#AF52DE', created, { hoist: true, mentionable: true, permissions: PERMS.owner });
  const admin   = await ensureRole(guild, '🛡️｜ADMIN',    '#FF3B30', created, { hoist: true, mentionable: true, permissions: PERMS.admin });
  const headMod = await ensureRole(guild, '⚔️｜HEAD MOD', '#FF9500', created, { hoist: true, mentionable: true, permissions: PERMS.headMod });
  const mod     = await ensureRole(guild, '🔨｜MODERATOR','#5865F2', created, { hoist: true, mentionable: true, permissions: PERMS.mod });
  const helper  = await ensureRole(guild, '🤝｜HELPER',    '#5AC8FA', created, { hoist: true, mentionable: true, permissions: PERMS.helper });
  const staff   = await ensureRole(guild, '🧰｜STAFF',     '#34C759', created, { hoist: true, mentionable: true, permissions: PERMS.staff });
  const support = await ensureRole(guild, '🎫｜SUPPORT',   '#FEE75C', created, { hoist: true, mentionable: true, permissions: PERMS.support });
  const bots    = await ensureRole(guild, '🤖｜BOTS',      '#99AAB5', created, { hoist: true, mentionable: false, permissions: PERMS.bots });
  const member  = await ensureRole(guild, '👤｜MEMBER',    '#B9BBBE', created, { hoist: false, mentionable: false, permissions: PERMS.member });
  const muted   = await ensureRole(guild, '🔇｜MUTED',     '#4F545C', created, { hoist: false, mentionable: false, permissions: PERMS.muted });

  try {
    const me = guild.members.me;
    const top = me?.roles?.highest?.position ?? 1;
    const order = [owner, coOwner, admin, headMod, mod, helper, staff, support, bots, member, muted].filter(Boolean);
    const positions = order.map((r, i) => ({ role: r.id, position: Math.max(1, top - 1 - i) }));
    await guild.roles.setPositions(positions).catch(() => null);
  } catch {  }

  const staffBucket = [owner, coOwner, admin, headMod, mod, helper, staff].filter(Boolean);
  const modBucket   = [headMod, mod, helper].filter(Boolean);

  return { owner, coOwner, admin, headMod, mod, helper, staff, support, bots, member, muted, staffBucket, modBucket };
}

async function runAutoSetup(interaction, mode = 'full') {
  await interaction.deferUpdate().catch(() => null);
  const guild = interaction.guild;
  const me = guild.members.me;
  if (!me?.permissions.has(P.ManageChannels) || !me?.permissions.has(P.ManageRoles)) {
    return statusReply(interaction, embeds.error('Auto Setup Failed',
      'I need **Manage Channels** and **Manage Roles** permissions.'), { ephemeral: true });
  }

  const created = [];
  const roles = await ensureBaseRoles(guild, created);
  const { mod, staff, support, member, muted, staffBucket, modBucket } = roles;

  const logs = await buildLogs(guild, staffBucket, me, created);

  if (muted) {
    for (const ch of guild.channels.cache.values()) {
      await ch.permissionOverwrites?.edit?.(muted.id, {
        SendMessages: false,
        SendMessagesInThreads: false,
        AddReactions: false,
        Speak: false,
        Stream: false,
      }, { reason: 'Nova auto-setup: muted role' }).catch(() => null);
    }
  }

  const basePatch = {
    staffRoles: staffBucket.map(r => r.id),
    modRoles:   modBucket.map(r => r.id),
    logChannels: {
      moderation: logs.modLog?.id || '',
      messages:   logs.msgLog?.id || '',
      tickets:    logs.ticketLog?.id || '',
      joinLeave:  logs.joinLeaveLog?.id || '',
    },
    setupCompletedAt: new Date(),
  };

  if (mode === 'logs') {
    await settings.set(guild.id, basePatch);
    const summary = embeds.success('Logs Setup Complete',
      `Created **${created.length}** items.\n\n` +
      (created.slice(0, 25).join('\n') || '*Nothing new — already set up.*'));
    await interaction.followUp(v2([summary], { ephemeral: true })).catch(() => null);
    const refreshed = await buildMainEmbed(guild);
    return interaction.editReply(v2([refreshed, ...mainComponents()])).catch(() => null);
  }

  const publicReadOnly = [
    { id: guild.roles.everyone.id, deny: [P.SendMessages, P.CreatePublicThreads, P.CreatePrivateThreads], allow: [P.ViewChannel, P.ReadMessageHistory] },
    ...staffBucket.map(r => ({ id: r.id, allow: [P.SendMessages, P.ManageMessages] })),
    ...(muted ? [{ id: muted.id, deny: [P.SendMessages, P.AddReactions, P.CreatePublicThreads, P.CreatePrivateThreads] }] : []),
    { id: me.id, allow: [P.ViewChannel, P.SendMessages, P.EmbedLinks, P.AttachFiles, P.ManageMessages] },
  ];

  const welcomeCat = await ensureCategory(guild, CAT.welcome, publicReadOnly, created);
  const welcomeCh  = await ensureChannel(guild, { name: '👋・welcome', parent: welcomeCat, overwrites: publicReadOnly }, created);
  const goodbyeCh  = await ensureChannel(guild, { name: '💔・goodbye', parent: welcomeCat, overwrites: publicReadOnly }, created);

  const infoCat = await ensureCategory(guild, CAT.info, publicReadOnly, created);
  const rulesCh         = await ensureChannel(guild, { name: '📜・rules',         parent: infoCat, overwrites: publicReadOnly }, created);
  const announcementsCh = await ensureChannel(guild, { name: '📢・announcements', parent: infoCat, overwrites: publicReadOnly }, created);
  const giveawaysCh     = await ensureChannel(guild, { name: '🎁・giveaways',     parent: infoCat, overwrites: publicReadOnly }, created);
  const realmInfoCh     = await ensureChannel(guild, { name: '🌍・realm-info',    parent: infoCat, overwrites: publicReadOnly }, created);

  const publicTalk = [
    { id: guild.roles.everyone.id, allow: [P.ViewChannel, P.ReadMessageHistory, P.SendMessages, P.Connect, P.Speak, P.UseVAD, P.Stream, P.AddReactions, P.EmbedLinks, P.AttachFiles, P.UseExternalEmojis] },
    ...(muted ? [{ id: muted.id, deny: [P.SendMessages, P.AddReactions, P.Speak, P.Stream, P.CreatePublicThreads, P.CreatePrivateThreads] }] : []),
    { id: me.id, allow: [P.ViewChannel, P.SendMessages, P.EmbedLinks, P.AttachFiles, P.ManageMessages, P.Connect, P.Speak, P.MoveMembers] },
  ];

  const chatCat = await ensureCategory(guild, CAT.chat, publicTalk, created);
  await ensureChannel(guild, { name: '💬・general',     parent: chatCat, overwrites: publicTalk }, created);
  await ensureChannel(guild, { name: '📸・media',       parent: chatCat, overwrites: publicTalk }, created);
  await ensureChannel(guild, { name: '🌌・skygen-chat', parent: chatCat, overwrites: publicTalk }, created);

  const voiceCat = await ensureCategory(guild, CAT.voice, publicTalk, created);
  await ensureChannel(guild, { name: '🎧・General VC', type: ChannelType.GuildVoice, parent: voiceCat, overwrites: publicTalk }, created);
  await ensureChannel(guild, { name: '🎮・Gaming VC',  type: ChannelType.GuildVoice, parent: voiceCat, overwrites: publicTalk }, created);
  await ensureChannel(guild, {
    name: '📝・Support VC', type: ChannelType.GuildVoice, parent: voiceCat,
    userLimit: 2, overwrites: publicTalk,
  }, created);
  const staffVcOverwrites = [
    { id: guild.roles.everyone.id, deny: [P.ViewChannel, P.Connect] },
    ...staffBucket.map(r => ({ id: r.id, allow: [P.ViewChannel, P.Connect, P.Speak] })),
    { id: me.id, allow: [P.ViewChannel, P.Connect, P.Speak] },
  ];
  await ensureChannel(guild, {
    name: '👮・Staff VC', type: ChannelType.GuildVoice, parent: voiceCat,
    overwrites: staffVcOverwrites,
  }, created);

  const supportCat = await ensureCategory(guild, CAT.support, publicReadOnly, created);
  const createTicketCh = await ensureChannel(guild, { name: '🎫・create-ticket', parent: supportCat, overwrites: publicReadOnly }, created);

  const partnersCat = await ensureCategory(guild, CAT.partners, publicReadOnly, created);
  await ensureChannel(guild, { name: '📣・our-ad',   parent: partnersCat, overwrites: publicReadOnly }, created);
  await ensureChannel(guild, { name: '📣・partners', parent: partnersCat, overwrites: publicTalk }, created);

  const ticketsOverwrites = [
    { id: guild.roles.everyone.id, deny: [P.ViewChannel] },
    ...(support ? [{ id: support.id, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.AttachFiles, P.EmbedLinks, P.ManageMessages] }] : []),
    ...staffBucket.map(r => ({ id: r.id, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.AttachFiles, P.EmbedLinks, P.ManageMessages] })),
    { id: me.id, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.AttachFiles, P.EmbedLinks, P.ManageChannels, P.ManageMessages] },
  ];
  const ticketsCat = await ensureCategory(guild, CAT.tickets, ticketsOverwrites, created);

  const patch = {
    ...basePatch,
    autoRole: { enabled: !!member, roleId: member?.id || '' },
    welcome: { enabled: true, channelId: welcomeCh?.id || '', message: config.defaults.welcomeMessage },
    goodbye: { enabled: true, channelId: goodbyeCh?.id || '', message: config.defaults.goodbyeMessage },
    suggestions: { enabled: false, channelId: '' },
    tickets: {
      categoryId: ticketsCat?.id || '',
      supportRoleId: support?.id || '',
      transcriptChannelId: logs.transcripts?.id || '',
      panelChannelId: createTicketCh?.id || '',
    },
  };
  await settings.set(guild.id, patch);

  const summary = embeds.success('Auto Setup Complete',
    `Created **${created.length}** items and saved settings.\n\n` +
    (created.length ? created.slice(0, 25).join('\n') + (created.length > 25 ? `\n…and ${created.length - 25} more` : '') : '*Nothing new — your server already had everything.*'));
  await interaction.followUp(v2([summary], { ephemeral: true })).catch(() => null);
  const refreshed = await buildMainEmbed(guild);
  return interaction.editReply(v2([refreshed, ...mainComponents()])).catch(() => null);
}

async function runWipeChannels(interaction) {
  await interaction.deferUpdate().catch(() => null);
  const guild = interaction.guild;
  const me = guild.members.me;
  if (!me?.permissions.has(P.ManageChannels)) {
    return statusReply(interaction, embeds.error('Wipe Failed', 'I need **Manage Channels** permission.'), { ephemeral: true });
  }
  let deleted = 0, failed = 0;
  const channels = [...guild.channels.cache.values()]

    .sort((a, b) => (a.type === ChannelType.GuildCategory ? 1 : 0) - (b.type === ChannelType.GuildCategory ? 1 : 0));
  for (const c of channels) {
    if (c.id === interaction.channelId) { failed++; continue; }
    try { await c.delete('Nova auto-setup wipe'); deleted++; }
    catch { failed++; }
  }
  await interaction.followUp(v2([embeds.success('Channels Wiped', `Deleted **${deleted}** channels${failed ? ` (couldn't delete ${failed})` : ''}.\n\nTip: run **Auto Setup → Full Setup** to recreate everything.`)], { ephemeral: true })).catch(() => null);
}

async function runWipeEverything(interaction) {
  await interaction.deferUpdate().catch(() => null);
  const guild = interaction.guild;
  const me = guild.members.me;
  if (!me?.permissions.has(P.ManageChannels) || !me?.permissions.has(P.ManageRoles)) {
    return statusReply(interaction, embeds.error('Nuke Failed',
      'I need **Manage Channels** and **Manage Roles** permissions.'), { ephemeral: true });
  }

  let chDeleted = 0, chFailed = 0;
  const channels = [...guild.channels.cache.values()]
    .sort((a, b) => (a.type === ChannelType.GuildCategory ? 1 : 0) - (b.type === ChannelType.GuildCategory ? 1 : 0));
  for (const c of channels) {
    try { await c.delete('Nova nuke: delete everything'); chDeleted++; }
    catch { chFailed++; }
  }

  const myTop = me.roles.highest?.position ?? 0;
  let rDeleted = 0, rFailed = 0;
  const roles = [...guild.roles.cache.values()]
    .filter(r => r.id !== guild.roles.everyone.id && !r.managed && r.position < myTop)
    .sort((a, b) => b.position - a.position);
  for (const r of roles) {
    try { await r.delete('Nova nuke: delete everything'); rDeleted++; }
    catch { rFailed++; }
  }

  try { await settings.reset(guild.id); } catch {  }

  const summary = embeds.success('Server Nuked',
    `Deleted **${chDeleted}** channels${chFailed ? ` (${chFailed} failed)` : ''} and ` +
    `**${rDeleted}** roles${rFailed ? ` (${rFailed} failed)` : ''}.\n\n` +
    `Settings cleared. Re-run **/setup → Auto Setup → Full Setup** in any new channel to rebuild the server.`);
  await interaction.user.send(v2([summary])).catch(() => null);
  await interaction.followUp(v2([summary], { ephemeral: true })).catch(() => null);
}

function setNested(obj, path, value) {
  const parts = path.split('.');
  const last = parts.pop();
  let cur = obj;
  for (const p of parts) cur = (cur[p] = cur[p] || {});
  cur[last] = value;
}

async function handleInteraction(interaction) {
  if (!interaction.customId?.startsWith(`${NS}:`)) return false;
  if (!isAdmin(interaction.member)) {
    await fail(interaction, 'Insufficient Permissions', 'Setup is admin-only.');
    return true;
  }
  const [, action, arg] = interaction.customId.split(':');

  try {
    if (action === 'autopanel') {
      await interaction.update(v2([autoPanelEmbed(interaction.guild), ...autoPanelComponents()])).catch(() => null);
      return true;
    }
    if (action === 'auto') {
      if (arg === 'full' || !arg) { await runAutoSetup(interaction, 'full'); return true; }
      if (arg === 'logs')         { await runAutoSetup(interaction, 'logs'); return true; }
      if (arg === 'wipe')         { await runWipeChannels(interaction);      return true; }
      if (arg === 'nuke')         { await runWipeEverything(interaction);    return true; }
    }
    if (action === 'refresh' || action === 'back') {
      const embed = await buildMainEmbed(interaction.guild);
      await interaction.update(v2([embed, ...mainComponents()])).catch(() => null);
      return true;
    }
    if (action === 'reset') {
      await settings.reset(interaction.guild.id);
      const embed = await buildMainEmbed(interaction.guild);
      await interaction.update(v2([embed, ...mainComponents()])).catch(() => null);
      await interaction.followUp(v2([embeds.success('Reset', 'All saved settings cleared.')], { ephemeral: true })).catch(() => null);
      return true;
    }
    if (action === 'page') { await showPage(interaction, arg); return true; }

    if (action === 'set') {
      const value = interaction.values[0] || '';
      const patch = {};
      setNested(patch, arg, value);

      if (value && (arg === 'welcome.channelId' || arg === 'goodbye.channelId')) {
        const key = arg.split('.')[0];
        const s = await settings.get(interaction.guild.id);
        patch[key].enabled = true;
        if (!s[key].message || !s[key].message.trim()) {
          patch[key].message = config.defaults[`${key}Message`];
        }
      }

      await settings.set(interaction.guild.id, patch);
      await interaction.deferUpdate().catch(() => null);
      await interaction.followUp(v2([embeds.success('Saved', `Set \`${arg}\` → ${value ? `<#${value}>` : '*cleared*'}`)], { ephemeral: true })).catch(() => null);
      return true;
    }
    if (action === 'setroles') {
      const patch = {}; patch[arg] = interaction.values;
      await settings.set(interaction.guild.id, patch);
      await interaction.deferUpdate().catch(() => null);
      await interaction.followUp(v2([embeds.success('Saved', `${arg} → ${interaction.values.length} role(s)`)], { ephemeral: true })).catch(() => null);
      return true;
    }
    if (action === 'autorole') {
      const v = interaction.values[0];
      await settings.set(interaction.guild.id, { autoRole: { enabled: !!v, roleId: v || '' } });
      await interaction.deferUpdate().catch(() => null);
      await interaction.followUp(v2([embeds.success('Saved', v ? `Auto-role → <@&${v}>` : 'Auto-role disabled')], { ephemeral: true })).catch(() => null);
      return true;
    }
    if (action === 'ticketrole') {
      const v = interaction.values[0] || '';
      await settings.set(interaction.guild.id, { tickets: { supportRoleId: v } });
      await interaction.deferUpdate().catch(() => null);
      await interaction.followUp(v2([embeds.success('Saved', v ? `Support role → <@&${v}>` : 'Support role cleared')], { ephemeral: true })).catch(() => null);
      return true;
    }
    if (action === 'cmdchannels') {
      await settings.set(interaction.guild.id, { commandChannels: interaction.values });
      await interaction.deferUpdate().catch(() => null);
      await interaction.followUp(v2([embeds.success('Saved', `Command channels → ${interaction.values.length || 'all'}`)], { ephemeral: true })).catch(() => null);
      return true;
    }
    if (action === 'automod' && arg === 'toggle') {
      const key = interaction.values[0];
      const s = await settings.get(interaction.guild.id);
      const newVal = !s.automod[key];
      await settings.set(interaction.guild.id, { automod: { [key]: newVal } });

      if (key === 'antiEveryone' || key === 'antiHere') {
        try {
          const s2 = await settings.get(interaction.guild.id);
          const shouldDeny = !!(s2.automod.antiEveryone || s2.automod.antiHere);
          const everyoneRole = interaction.guild.roles.everyone;
          const perms = new PermissionsBitField(everyoneRole.permissions.bitfield);
          const hasIt = perms.has(P.MentionEveryone);
          if (shouldDeny && hasIt) {
            perms.remove(P.MentionEveryone);
            await everyoneRole.setPermissions(perms.bitfield,
              'Nova automod: block @everyone/@here mentions').catch(() => null);
          } else if (!shouldDeny && !hasIt) {
            perms.add(P.MentionEveryone);
            await everyoneRole.setPermissions(perms.bitfield,
              'Nova automod: restore @everyone/@here mentions').catch(() => null);
          }
        } catch (e) { console.error('[SETUP] mention-everyone perm toggle failed:', e?.message); }
      }

      await showPage(interaction, 'automod');
      return true;
    }
    if (action === 'toggle') {
      const s = await settings.get(interaction.guild.id);
      const parts = arg.split('.');
      let cur = s; for (const p of parts) cur = cur?.[p];
      const patch = {}; setNested(patch, arg, !cur);
      await settings.set(interaction.guild.id, patch);
      const embed = await buildMainEmbed(interaction.guild);
      await interaction.update(v2([embed, ...mainComponents()])).catch(() => null);
      return true;
    }
    if (action === 'prefix') {
      await interaction.reply(v2([embeds.info('Change Prefix',
          'Run `!setup prefix <new-prefix>` (max 5 chars) to change it.\nExample: `!setup prefix ?`')], { ephemeral: true })).catch(() => null);
      return true;
    }
  } catch (err) {
    console.error('[SETUP] interaction error:', err);
    await fail(interaction, 'Setup error', err.message?.slice(0, 1500) || 'Unknown error');
    return true;
  }
  return false;
}

module.exports = { openMainPanel, openAutoPanel, handleInteraction, isAdmin, runAutoSetup, runWipeChannels };
const {
  ChannelType, PermissionsBitField,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, AttachmentBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const embeds = require('../embeds');
const settings = require('../utils/settings');
const config = require('../configs/config.json');
const { logTo } = require('../utils/logger');
const { v2, Card } = require('../utils/v2');
let Ticket; try { Ticket = require('../models/Ticket'); } catch {}

function fmt(str, vars) {
  return String(str || '').replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : `{${k}}`));
}

function makeEmbed(title, description, color) {
  const e = new Card()
    .setColor(color || config.branding.color)
    .setFooter({ text: config.branding.footer, iconURL: config.branding.iconURL })
    .setTimestamp();
  if (title) e.setTitle(title);
  if (description) e.setDescription(description);
  return e;
}

function panelEmbed(s, guild) {
  const cats = (s.tickets.categories || []).map(c => `${c.emoji || '🎫'} **${c.label}**`).join('\n');
  const desc = `${s.tickets.panel.description}\n\n**Categories:**\n${cats}`;
  const e = makeEmbed(s.tickets.panel.title, desc, s.tickets.panel.color);

  if (guild) {
    const icon = guild.iconURL?.({ size: 256, extension: 'png' });
    if (icon) e.setThumbnail(icon);
  }
  return e;
}

function panelComponents(s) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId('ticket-open')
    .setPlaceholder(s.tickets.panel.placeholder || 'Select a category…')
    .addOptions((s.tickets.categories || []).slice(0, 25).map(c => ({
      label: String(c.label).slice(0, 100),
      value: String(c.value).slice(0, 100),
      emoji: c.emoji || undefined,
      description: c.description ? String(c.description).slice(0, 100) : undefined,
    })));
  return [new ActionRowBuilder().addComponents(menu)];
}

function keepContainers(msg) {
  return (msg?.components || [])
    .filter((c) => c.type === 17)
    .map((c) => Card.fromContainer(c.toJSON()));
}

function ticketControls(s, { claimedBy } = {}) {
  const b = s.tickets.buttons || {};
  const mk = (id, def, style, disabled) => {
    const cfg = b[def] || {};
    const btn = new ButtonBuilder().setCustomId(id).setStyle(style)
      .setLabel(String(cfg.label || def).slice(0, 80))
      .setDisabled(!!disabled);
    if (cfg.emoji) try { btn.setEmoji(cfg.emoji); } catch {}
    return btn;
  };

  const claimBtn = new ButtonBuilder()
    .setCustomId(claimedBy ? 'ticket-unclaim' : 'ticket-claim')
    .setStyle(claimedBy ? ButtonStyle.Secondary : ButtonStyle.Primary)
    .setLabel(String(claimedBy ? (b.unclaim?.label || 'Unclaim') : (b.claim?.label || 'Claim')).slice(0, 80))
    .setDisabled(false);
  const emoji = claimedBy ? (b.unclaim?.emoji || b.claim?.emoji) : b.claim?.emoji;
  if (emoji) try { claimBtn.setEmoji(emoji); } catch {}
  return [new ActionRowBuilder().addComponents(
    claimBtn,
    mk('ticket-close',      'close',      ButtonStyle.Danger),
    mk('ticket-transcript', 'transcript', ButtonStyle.Secondary),
  )];
}

async function sendPanel(channel) {
  const s = await settings.get(channel.guild.id);
  return channel.send(v2([panelEmbed(s, channel.guild), ...panelComponents(s)]));
}

function supportRoleIds(s) {
  const arr = Array.isArray(s.tickets.supportRoles) ? s.tickets.supportRoles.slice() : [];
  if (s.tickets.supportRoleId && !arr.includes(s.tickets.supportRoleId)) arr.push(s.tickets.supportRoleId);
  return arr.filter(Boolean);
}

function isStaff(member, s) {
  if (!member) return false;
  if (member.permissions?.has?.(PermissionsBitField.Flags.ManageGuild)) return true;
  const roles = supportRoleIds(s);
  if (!roles.length) return false;
  return roles.some(r => member.roles?.cache?.has?.(r));
}

function ticketOwnerId(channel) {

  const m = /Ticket\s*•\s*(\d+)/.exec(channel?.topic || '');
  return m ? m[1] : null;
}

async function openTicket(interaction, category) {
  const guild = interaction.guild;
  const s = await settings.get(guild.id);

  const existing = guild.channels.cache.find(c =>
    c.name === `ticket-${interaction.user.username.toLowerCase()}` && c.type === ChannelType.GuildText);
  if (existing) {
    return interaction.reply(v2([embeds.error('Ticket Exists', `You already have an open ticket: ${existing}`)], { ephemeral: true })).catch(() => null);
  }

  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
    { id: interaction.user.id,     allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.AttachFiles] },
    { id: guild.members.me.id,     allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageChannels, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.AttachFiles] },
  ];
  for (const rid of supportRoleIds(s)) {
    overwrites.push({ id: rid, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.AttachFiles, PermissionsBitField.Flags.ManageMessages] });
  }

  const channel = await guild.channels.create({
    name: `ticket-${interaction.user.username}`.toLowerCase().slice(0, 90),
    type: ChannelType.GuildText,
    parent: s.tickets.categoryId || null,
    permissionOverwrites: overwrites,
    topic: `Ticket • ${interaction.user.id} • ${category}`,
  });

  const vars = {
    user: `${interaction.user}`,
    username: interaction.user.username,
    category,
    server: guild.name,
  };
  const w = s.tickets.welcome || {};
  const intro = makeEmbed(fmt(w.title, vars), fmt(w.message, vars), w.color);
  const gIcon = guild.iconURL?.({ size: 256, extension: 'png' });
  if (gIcon) intro.setThumbnail(gIcon);

  const supportPing = supportRoleIds(s).map(r => `<@&${r}>`).join(' ');
  const msg = await channel.send(v2([intro, `${interaction.user} ${supportPing}`.trim(), ...ticketControls(s)]));
  await msg.pin().catch(() => null);

  if (Ticket) await Ticket.create({ guildId: guild.id, channelId: channel.id, userId: interaction.user.id, category }).catch(() => null);
  await logTo(interaction.client, guild.id, 'tickets', embeds.info('Ticket Opened', `**User:** ${interaction.user}\n**Category:** ${category}\n**Channel:** ${channel}`));
  await interaction.reply(v2([embeds.success('Ticket Created', `${channel}`)], { ephemeral: true })).catch(() => null);
}

async function generateTranscript(channel) {
  try {
    const dht = require('discord-html-transcripts');
    return await dht.createTranscript(channel, {
      limit: -1, returnType: 'attachment', filename: `transcript-${channel.name}.html`,
      poweredBy: false, saveImages: true,
    });
  } catch {
    const msgs = await channel.messages.fetch({ limit: 100 });
    const txt = msgs.reverse().map(m => `[${m.createdAt.toISOString()}] ${m.author.tag}: ${m.content}`).join('\n');
    return new AttachmentBuilder(Buffer.from(txt, 'utf8'), { name: `transcript-${channel.name}.txt` });
  }
}

async function closeTicket(channel, closer, client, reason) {
  const s = await settings.get(channel.guild.id);
  const reasonText = (reason && String(reason).trim()) || 'No reason provided';
  const transcript = await generateTranscript(channel);
  const log = embeds.info('Ticket Closed', `**Channel:** \`${channel.name}\`\n**Closed by:** ${closer}\n**Reason:** ${reasonText}`);
  await logTo(client, channel.guild.id, 'tickets', log);
  if (s.tickets.transcriptChannelId) {
    const tCh = await client.channels.fetch(s.tickets.transcriptChannelId).catch(() => null);
    if (tCh) await tCh.send(v2([log], { files: [transcript] })).catch(() => null);
  }

  try {
    const ownerId = ticketOwnerId(channel);
    if (ownerId) {
      const owner = await client.users.fetch(ownerId).catch(() => null);
      if (owner) {
        const guild = channel.guild;
        const closerTag = closer?.tag || closer?.username || `<@${closer?.id || 'unknown'}>`;
        const dm = new Card()
          .setColor(config.branding.color)
          .setTitle('Your ticket has been closed')
          .setDescription(
            `Your ticket \`${channel.name}\` in **${guild.name}** has been closed.`
          )
          .addFields(
            { name: 'Closed by', value: `${closerTag} (<@${closer?.id || ''}>)`, inline: false },
            { name: 'Reason',    value: reasonText.slice(0, 1024),                inline: false },
          )
          .setFooter({ text: config.branding.footer, iconURL: config.branding.iconURL })
          .setTimestamp();
        const gIcon = guild.iconURL?.({ size: 256, extension: 'png' });
        if (gIcon) dm.setThumbnail(gIcon);
        await owner.send(v2([dm], { files: [transcript] })).catch(() => null);
      }
    }
  } catch {}

  if (Ticket) await Ticket.updateOne({ channelId: channel.id }, { closed: true, closedAt: new Date(), closeReason: reasonText, closedBy: closer?.id || null }).catch(() => null);
  await channel.send(v2([embeds.warn('Closing Ticket', `Reason: ${reasonText}\nThis channel will be deleted in 5 seconds…`)])).catch(() => null);
  setTimeout(() => channel.delete().catch(() => null), 5000);
}

async function runAutoCloseSweep(client) {
  for (const [, guild] of client.guilds.cache) {
    let s; try { s = await settings.get(guild.id); } catch { continue; }
    if (!s.tickets.autoClose?.enabled) continue;
    const hours = Number(s.tickets.autoClose.inactivityHours) || 48;
    const cutoff = Date.now() - hours * 3600_000;
    for (const [, ch] of guild.channels.cache) {
      if (ch.type !== ChannelType.GuildText) continue;
      if (!ch.name?.startsWith('ticket-')) continue;
      try {
        const last = await ch.messages.fetch({ limit: 1 });
        const lastMsg = last.first();
        const ts = lastMsg ? lastMsg.createdTimestamp : ch.createdTimestamp;
        if (ts < cutoff) {
          await ch.send(v2([embeds.warn('Auto-Close', `No activity for ${hours}h. Closing ticket.`)])).catch(() => null);
          await closeTicket(ch, client.user, client, `Auto-closed after ${hours}h of inactivity`);
        }
      } catch {}
    }
  }
}

function topicClaimedBy(channel) {
  const m = /Claimed by: (\d+)/.exec(channel?.topic || '');
  return m ? m[1] : null;
}

async function handleOpenSelect(interaction) {
  if (!interaction.isStringSelectMenu() || interaction.customId !== 'ticket-open') return false;
  const category = interaction.values?.[0];
  if (!category) return true;
  await openTicket(interaction, category);
  return true;
}

async function handleClaim(interaction) {
  if (!interaction.isButton() || interaction.customId !== 'ticket-claim') return false;
  const ch = interaction.channel;
  if (!ch?.name?.startsWith('ticket-')) {
    await interaction.reply(v2([embeds.error('Not a ticket channel.')], { ephemeral: true })).catch(() => null);
    return true;
  }
  const s = await settings.get(interaction.guild.id);

  if (!isStaff(interaction.member, s)) {
    await interaction.reply(v2([embeds.error('Not Allowed', 'Only staff members can claim tickets.')], { ephemeral: true })).catch(() => null);
    return true;
  }

  const ownerId = ticketOwnerId(ch);
  if (ownerId && ownerId === interaction.user.id) {
    await interaction.reply(v2([embeds.error('Not Allowed', 'You cannot claim your own ticket.')], { ephemeral: true })).catch(() => null);
    return true;
  }

  try { await ch.fetch(true); } catch {}

  const already = topicClaimedBy(ch);
  if (already && already !== interaction.user.id) {
    await interaction.reply(v2([embeds.warn('Already Claimed', `This ticket is already claimed by <@${already}>.`)], { ephemeral: true })).catch(() => null);
    return true;
  }

  const baseTopic = String(ch.topic || '').replace(/\s*•\s*Claimed by:\s*\d+/g, '');
  const newTopic = `${baseTopic} • Claimed by: ${interaction.user.id}`.slice(0, 1024);
  await ch.setTopic(newTopic).catch(() => null);
  if (Ticket) await Ticket.updateOne({ channelId: ch.id }, { claimedBy: interaction.user.id }).catch(() => null);

  try {
    await interaction.update(v2([...keepContainers(interaction.message), ...ticketControls(s, { claimedBy: interaction.user.id })]));
  } catch {
    try {
      await interaction.message.edit(v2([...keepContainers(interaction.message), ...ticketControls(s, { claimedBy: interaction.user.id })]));
    } catch {}
  }
  await ch.send(v2([embeds.info('Ticket Claimed', `${interaction.user} has claimed this ticket.`)])).catch(() => null);
  return true;
}

async function handleUnclaim(interaction) {
  if (!interaction.isButton() || interaction.customId !== 'ticket-unclaim') return false;
  const ch = interaction.channel;
  if (!ch?.name?.startsWith('ticket-')) {
    await interaction.reply(v2([embeds.error('Not a ticket channel.')], { ephemeral: true })).catch(() => null);
    return true;
  }
  const s = await settings.get(interaction.guild.id);
  try { await ch.fetch(true); } catch {}
  const claimer = topicClaimedBy(ch);
  if (!claimer) {
    await interaction.reply(v2([embeds.warn('Not Claimed', 'This ticket is not currently claimed.')], { ephemeral: true })).catch(() => null);
    return true;
  }
  if (claimer !== interaction.user.id) {
    await interaction.reply(v2([embeds.error('Not Allowed', `Only <@${claimer}> can unclaim this ticket.`)], { ephemeral: true })).catch(() => null);
    return true;
  }

  const newTopic = String(ch.topic || '').replace(/\s*•\s*Claimed by:\s*\d+/g, '').slice(0, 1024);
  await ch.setTopic(newTopic).catch(() => null);
  if (Ticket) await Ticket.updateOne({ channelId: ch.id }, { claimedBy: null }).catch(() => null);

  try {
    await interaction.update(v2([...keepContainers(interaction.message), ...ticketControls(s)]));
  } catch {
    try {
      await interaction.message.edit(v2([...keepContainers(interaction.message), ...ticketControls(s)]));
    } catch {}
  }
  await ch.send(v2([embeds.info('Ticket Unclaimed', `${interaction.user} has unclaimed this ticket.`)])).catch(() => null);
  return true;
}

async function handleClose(interaction) {
  if (!interaction.isButton() || interaction.customId !== 'ticket-close') return false;
  const ch = interaction.channel;
  if (!ch?.name?.startsWith('ticket-')) {
    await interaction.reply(v2([embeds.error('Not a ticket channel.')], { ephemeral: true })).catch(() => null);
    return true;
  }

  const modal = new ModalBuilder()
    .setCustomId('ticket-close-modal')
    .setTitle('Close Ticket');
  const input = new TextInputBuilder()
    .setCustomId('reason')
    .setLabel('Reason for closing')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(1000)
    .setPlaceholder('Optional — will be shown to the ticket owner');
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  await interaction.showModal(modal).catch(() => null);
  return true;
}

async function handleCloseModal(interaction) {
  if (!interaction.isModalSubmit?.() || interaction.customId !== 'ticket-close-modal') return false;
  const ch = interaction.channel;
  if (!ch?.name?.startsWith('ticket-')) {
    await interaction.reply(v2([embeds.error('Not a ticket channel.')], { ephemeral: true })).catch(() => null);
    return true;
  }
  const reason = (interaction.fields.getTextInputValue('reason') || '').trim() || 'No reason provided';
  await interaction.reply(v2([embeds.info('Closing…', `Generating transcript and closing this ticket.\n**Reason:** ${reason}`)], { ephemeral: true })).catch(() => null);
  await closeTicket(ch, interaction.user, interaction.client, reason);
  return true;
}

async function handleTranscript(interaction) {
  if (!interaction.isButton() || interaction.customId !== 'ticket-transcript') return false;
  const ch = interaction.channel;
  if (!ch?.name?.startsWith('ticket-')) {
    await interaction.reply(v2([embeds.error('Not a ticket channel.')], { ephemeral: true })).catch(() => null);
    return true;
  }
  await interaction.deferReply({ ephemeral: true }).catch(() => null);
  const t = await generateTranscript(ch);
  await interaction.editReply(v2([embeds.info('Transcript Generated')], { files: [t] })).catch(() => null);
  return true;
}

async function handleInteraction(interaction) {
  if (interaction.isStringSelectMenu?.() && interaction.customId === 'ticket-open') return handleOpenSelect(interaction);
  if (interaction.isModalSubmit?.() && interaction.customId === 'ticket-close-modal') return handleCloseModal(interaction);
  if (interaction.isButton?.()) {
    if (interaction.customId === 'ticket-claim')      return handleClaim(interaction);
    if (interaction.customId === 'ticket-unclaim')    return handleUnclaim(interaction);
    if (interaction.customId === 'ticket-close')      return handleClose(interaction);
    if (interaction.customId === 'ticket-transcript') return handleTranscript(interaction);
  }
  return false;
}

module.exports = {
  sendPanel, panelEmbed, panelComponents, ticketControls,
  openTicket, closeTicket, generateTranscript, runAutoCloseSweep,
  supportRoleIds, isStaff, ticketOwnerId, makeEmbed, fmt,
  handleInteraction, handleOpenSelect, handleClaim, handleUnclaim, handleClose, handleCloseModal, handleTranscript,
  topicClaimedBy,
};

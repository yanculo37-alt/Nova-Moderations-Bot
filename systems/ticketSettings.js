const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, RoleSelectMenuBuilder, StringSelectMenuBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  ChannelType, PermissionsBitField, MessageFlags,
} = require('discord.js');
const settings = require('../utils/settings');
const config = require('../configs/config.json');
const embeds = require('../embeds');
const tickets = require('../tickets/ticketSystem');
const { v2, Card } = require('../utils/v2');
const { withEphemeral, stripEphemeral, reportError } = require('../utils/errors');

const NS = 'tset';
const id = (...parts) => [NS, ...parts].join(':');

function isTicketAdmin(member) {
  if (!member) return false;
  if (config.owners?.includes(member.id)) return true;
  return member.permissions?.has(PermissionsBitField.Flags.Administrator)
      || member.permissions?.has(PermissionsBitField.Flags.ManageGuild);
}

async function ephemeral(target, payload) {
  const log = (e) => console.error('[ticketSettings]', e?.code ?? '', e?.message ?? e);
  const data = { ...payload, flags: withEphemeral(payload.flags) };
  if (target.deferred && !target.replied) {
    return target.editReply({ ...payload, flags: stripEphemeral(payload.flags) }).catch(log);
  }
  if (target.replied) return target.followUp(data).catch(log);
  if (typeof target.reply === 'function') return target.reply(data).catch(log);
  return null;
}

function mainEmbed(s) {
  const t = s.tickets;
  const cats = (t.categories || []).map(c => `${c.emoji || '🎫'} ${c.label}`).join(', ') || '—';
  const sup = (tickets.supportRoleIds(s) || []).map(r => `<@&${r}>`).join(' ') || '—';
  const e = new Card()
    .setColor(t.panel?.color || config.branding.color)
    .setTitle('🎫 Ticket Settings')
    .setDescription('Manage every part of the ticket system from this panel. Changes save automatically.')
    .addFields(
      { name: 'Categories', value: cats, inline: false },
      { name: 'Support Roles', value: sup, inline: true },
      { name: 'Parent Category', value: t.categoryId ? `<#${t.categoryId}>` : '—', inline: true },
      { name: 'Transcript Channel', value: t.transcriptChannelId ? `<#${t.transcriptChannelId}>` : '—', inline: true },
      { name: 'Panel Color', value: t.panel?.color || '—', inline: true },
      { name: 'Auto-Close', value: t.autoClose?.enabled ? `After ${t.autoClose.inactivityHours}h` : 'Disabled', inline: true },
      { name: 'User can close', value: t.permissions?.userCanClose ? '✅' : '❌', inline: true },
    )
    .setFooter({ text: config.branding.footer, iconURL: config.branding.iconURL });
  return e;
}

function mainComponents() {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(id('panel')).setLabel('Panel Embed').setEmoji('🖼️').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(id('welcome')).setLabel('Welcome Msg').setEmoji('👋').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(id('buttons')).setLabel('Buttons').setEmoji('🔘').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(id('cats')).setLabel('Categories').setEmoji('📂').setStyle(ButtonStyle.Primary),
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(id('roles')).setLabel('Support Roles').setEmoji('🛡️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(id('parent')).setLabel('Parent Category').setEmoji('📁').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(id('transcript')).setLabel('Transcripts').setEmoji('📄').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(id('autoclose')).setLabel('Auto-Close').setEmoji('⏱️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(id('perms')).setLabel('Permissions').setEmoji('🔐').setStyle(ButtonStyle.Secondary),
  );
  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(id('preview')).setLabel('Preview Panel').setEmoji('👁️').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(id('send')).setLabel('Send Panel Here').setEmoji('📨').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(id('reset')).setLabel('Reset Defaults').setEmoji('♻️').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(id('close')).setLabel('Close').setEmoji('✖️').setStyle(ButtonStyle.Secondary),
  );
  return [row1, row2, row3];
}

async function openMainPanel(target) {
  const log = (e) => console.error('[ticketSettings.openMainPanel]', e?.code ?? '', e?.message ?? e);
  let s;
  try {
    s = await settings.get(target.guild.id);
  } catch (err) {
    if (typeof target.isRepliable === 'function') {
      return reportError(target, err, { action: 'loading ticket settings' });
    }
    throw err;
  }

  const payload = v2([mainEmbed(s), ...mainComponents()]);

  if (target.isButton?.() || target.isAnySelectMenu?.() || target.isModalSubmit?.()) {
    if (target.deferred && !target.replied) {
      return target.editReply({ ...payload, flags: stripEphemeral(payload.flags) }).catch(log);
    }
    if (target.replied) return target.followUp({ ...payload, flags: withEphemeral(payload.flags) }).catch(log);
    return target.update({ ...payload }).catch((e) => {
      log(e);
      return target.reply({ ...payload, flags: withEphemeral(payload.flags) }).catch(log);
    });
  }

  if (typeof target.isRepliable === 'function') {
    if (target.deferred && !target.replied) {
      return target.editReply({ ...payload, flags: stripEphemeral(payload.flags) }).catch(log);
    }
    return target.reply({ ...payload, flags: withEphemeral(payload.flags) }).catch(log);
  }

  return target.reply({ ...payload, flags: stripEphemeral(payload.flags) }).catch(log);
}

function modal(customId, title, fields) {
  const m = new ModalBuilder().setCustomId(customId).setTitle(title.slice(0, 45));
  for (const f of fields) {
    const t = new TextInputBuilder()
      .setCustomId(f.id).setLabel(f.label.slice(0, 45))
      .setStyle(f.style || TextInputStyle.Short)
      .setRequired(!!f.required);
    if (f.value !== undefined && f.value !== null) t.setValue(String(f.value).slice(0, f.max || 1000));
    if (f.placeholder) t.setPlaceholder(f.placeholder.slice(0, 100));
    if (f.max) t.setMaxLength(f.max);
    m.addComponents(new ActionRowBuilder().addComponents(t));
  }
  return m;
}

async function showPanelModal(interaction, s) {
  const p = s.tickets.panel;
  return interaction.showModal(modal(id('panel-save'), 'Edit Panel Embed', [
    { id: 'title', label: 'Title (optional)', value: p.title, max: 200, required: false },
    { id: 'description', label: 'Description', value: p.description, style: TextInputStyle.Paragraph, max: 2000, required: true },
    { id: 'color', label: 'Color (hex e.g. #5865F2)', value: p.color, max: 9 },
    { id: 'placeholder', label: 'Dropdown placeholder', value: p.placeholder, max: 100 },
  ]));
}

async function showWelcomeModal(interaction, s) {
  const w = s.tickets.welcome;
  return interaction.showModal(modal(id('welcome-save'), 'Edit Ticket Welcome', [
    { id: 'title', label: 'Title (vars: {category} {user})', value: w.title, max: 200, required: true },
    { id: 'message', label: 'Message ({user} {category} {server})', value: w.message, style: TextInputStyle.Paragraph, max: 2000, required: true },
    { id: 'color', label: 'Color (hex)', value: w.color, max: 9 },
  ]));
}

async function showButtonsModal(interaction, s) {
  const b = s.tickets.buttons;
  return interaction.showModal(modal(id('buttons-save'), 'Edit Ticket Buttons', [
    { id: 'claim', label: 'Claim — label | emoji', value: `${b.claim.label} | ${b.claim.emoji}`, max: 80 },
    { id: 'close', label: 'Close — label | emoji', value: `${b.close.label} | ${b.close.emoji}`, max: 80 },
    { id: 'transcript', label: 'Transcript — label | emoji', value: `${b.transcript.label} | ${b.transcript.emoji}`, max: 80 },
  ]));
}

async function showAutoCloseModal(interaction, s) {
  const a = s.tickets.autoClose;
  return interaction.showModal(modal(id('autoclose-save'), 'Auto-Close Settings', [
    { id: 'enabled', label: 'Enabled? (yes/no)', value: a.enabled ? 'yes' : 'no', max: 5 },
    { id: 'hours', label: 'Inactivity hours', value: String(a.inactivityHours), max: 4 },
  ]));
}

async function showPermsView(interaction, s) {
  const p = s.tickets.permissions;
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(id('perms-toggle', 'userCanClose')).setStyle(p.userCanClose ? ButtonStyle.Success : ButtonStyle.Secondary).setLabel(`User can close: ${p.userCanClose ? 'ON' : 'OFF'}`),
    new ButtonBuilder().setCustomId(id('perms-toggle', 'requireReasonOnClose')).setStyle(p.requireReasonOnClose ? ButtonStyle.Success : ButtonStyle.Secondary).setLabel(`Require reason: ${p.requireReasonOnClose ? 'ON' : 'OFF'}`),
    new ButtonBuilder().setCustomId(id('back')).setStyle(ButtonStyle.Secondary).setLabel('← Back'),
  );
  return interaction.update(v2([new Card().setColor(config.branding.color).setTitle('🔐 Ticket Permissions')
      .setDescription('Toggle ticket permission flags.'), row])).catch(() => null);
}

function catsEmbed(s) {
  const list = (s.tickets.categories || []).map((c, i) =>
    `**${i + 1}.** ${c.emoji || '🎫'} **${c.label}** \`${c.value}\`${c.description ? ` — ${c.description}` : ''}`
  ).join('\n') || '*No categories yet.*';
  return new Card().setColor(config.branding.color).setTitle('📂 Ticket Categories')
    .setDescription(list + '\n\nUse the buttons to add, edit, or remove categories.');
}

function catsComponents(s) {
  const select = new StringSelectMenuBuilder()
    .setCustomId(id('cats-pick'))
    .setPlaceholder('Select a category to edit/remove…')
    .addOptions(((s.tickets.categories || []).slice(0, 25)).map((c, i) => ({
      label: `${i + 1}. ${c.label}`.slice(0, 100),
      value: String(c.value),
      emoji: c.emoji || undefined,
      description: (c.description || `value: ${c.value}`).slice(0, 100),
    })));
  const rows = [];
  if ((s.tickets.categories || []).length) rows.push(new ActionRowBuilder().addComponents(select));
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(id('cats-add')).setLabel('Add Category').setEmoji('➕').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(id('back')).setLabel('← Back').setStyle(ButtonStyle.Secondary),
  ));
  return rows;
}

async function showCatsView(interaction, s) {
  return interaction.update(v2([catsEmbed(s), ...catsComponents(s)])).catch(() => null);
}

async function showCatModal(interaction, existing) {
  const e = existing || { label: '', value: '', emoji: '🎫', description: '' };
  return interaction.showModal(modal(id('cat-save', existing ? existing.value : '__new__'), existing ? `Edit ${existing.label}` : 'Add Category', [
    { id: 'label', label: 'Label (shown in dropdown)', value: e.label, max: 80, required: true },
    { id: 'value', label: 'Value (unique id, no spaces)', value: e.value, max: 60, required: true, placeholder: 'general' },
    { id: 'emoji', label: 'Emoji', value: e.emoji, max: 10 },
    { id: 'description', label: 'Description (optional)', value: e.description, max: 100 },
  ]));
}

async function handleInteraction(interaction) {
  const cid = interaction.customId || '';
  if (!cid.startsWith(NS + ':')) return false;
  if (!isTicketAdmin(interaction.member)) {
    await interaction.reply(v2([embeds.error('Insufficient Permissions', 'You need Manage Server to edit ticket settings.')], { ephemeral: true })).catch(() => null);
    return true;
  }
  const parts = cid.split(':');
  const action = parts[1];
  const arg = parts[2];
  const s = await settings.get(interaction.guild.id);

  try {

    if (interaction.isButton()) {
      switch (action) {
        case 'panel':     return void await showPanelModal(interaction, s);
        case 'welcome':   return void await showWelcomeModal(interaction, s);
        case 'buttons':   return void await showButtonsModal(interaction, s);
        case 'autoclose': return void await showAutoCloseModal(interaction, s);
        case 'perms':     return void await showPermsView(interaction, s);
        case 'cats':      return void await showCatsView(interaction, s);
        case 'cats-add':  return void await showCatModal(interaction, null);
        case 'back':      return void await openMainPanel(interaction);
        case 'preview': {
          return void await interaction.reply(v2([tickets.panelEmbed(s, interaction.guild), ...tickets.panelComponents(s)], { ephemeral: true })).catch(() => null);
        }
        case 'send': {
          await tickets.sendPanel(interaction.channel);
          return void await interaction.reply(v2([embeds.success('Panel Sent', `Sent in ${interaction.channel}.`)], { ephemeral: true })).catch(() => null);
        }
        case 'reset': {
          const def = settings.ticketDefaults();
          await settings.set(interaction.guild.id, { tickets: def });
          return void await openMainPanel(interaction);
        }
        case 'close': {
          return void await interaction.update(v2([embeds.success('Closed', 'Settings panel closed.')])).catch(() => null);
        }
        case 'roles':
          return void await interaction.update(v2([new Card().setColor(config.branding.color).setTitle('🛡️ Support Roles').setDescription('Pick the roles that can view & manage tickets.'), new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId(id('roles-pick')).setMinValues(0).setMaxValues(10).setPlaceholder('Choose support roles')), new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(id('back')).setLabel('← Back').setStyle(ButtonStyle.Secondary))])).catch(() => null);
        case 'parent':
          return void await interaction.update(v2([new Card().setColor(config.branding.color).setTitle('📁 Parent Category').setDescription('Where new ticket channels are created.'), new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId(id('parent-pick')).addChannelTypes(ChannelType.GuildCategory).setPlaceholder('Choose category')), new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(id('back')).setLabel('← Back').setStyle(ButtonStyle.Secondary))])).catch(() => null);
        case 'transcript':
          return void await interaction.update(v2([new Card().setColor(config.branding.color).setTitle('📄 Transcript Channel').setDescription('Where ticket transcripts are posted on close.'), new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId(id('transcript-pick')).addChannelTypes(ChannelType.GuildText).setPlaceholder('Choose channel')), new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(id('back')).setLabel('← Back').setStyle(ButtonStyle.Secondary))])).catch(() => null);
        case 'perms-toggle': {
          const next = { ...s.tickets.permissions, [arg]: !s.tickets.permissions[arg] };
          await settings.set(interaction.guild.id, { tickets: { permissions: next } });
          const ns = await settings.get(interaction.guild.id);
          return void await showPermsView(interaction, ns);
        }
        case 'cat-edit':   return void await showCatModal(interaction, (s.tickets.categories || []).find(c => c.value === arg));
        case 'cat-remove': {
          const next = (s.tickets.categories || []).filter(c => c.value !== arg);
          if (next.length === 0) {
            return void await interaction.reply(v2([embeds.error('Cannot remove', 'You need at least one category.')], { ephemeral: true })).catch(() => null);
          }
          await settings.set(interaction.guild.id, { tickets: { categories: next } });
          const ns = await settings.get(interaction.guild.id);
          return void await showCatsView(interaction, ns);
        }
      }
    }

    if (interaction.isAnySelectMenu()) {
      if (action === 'roles-pick') {
        await settings.set(interaction.guild.id, { tickets: { supportRoles: interaction.values, supportRoleId: interaction.values[0] || '' } });
        return void await openMainPanel(interaction);
      }
      if (action === 'parent-pick') {
        await settings.set(interaction.guild.id, { tickets: { categoryId: interaction.values[0] || '' } });
        return void await openMainPanel(interaction);
      }
      if (action === 'transcript-pick') {
        await settings.set(interaction.guild.id, { tickets: { transcriptChannelId: interaction.values[0] || '' } });
        return void await openMainPanel(interaction);
      }
      if (action === 'cats-pick') {
        const value = interaction.values[0];
        const cat = (s.tickets.categories || []).find(c => c.value === value);
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(id('cat-edit', value)).setLabel('Edit').setEmoji('✏️').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(id('cat-remove', value)).setLabel('Remove').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId(id('cats')).setLabel('← Categories').setStyle(ButtonStyle.Secondary),
        );
        return void await interaction.update(v2([new Card().setColor(config.branding.color).setTitle(`${cat.emoji || '🎫'} ${cat.label}`)
            .setDescription(`Value: \`${cat.value}\`\nDescription: ${cat.description || '—'}`), row])).catch(() => null);
      }
    }

    if (interaction.isModalSubmit()) {
      const get = (k) => interaction.fields.getTextInputValue(k);
      if (action === 'panel-save') {
        await settings.set(interaction.guild.id, { tickets: { panel: {
          title: get('title'), description: get('description'),
          color: get('color') || s.tickets.panel.color,
          placeholder: get('placeholder') || s.tickets.panel.placeholder,
        } } });
        return void await openMainPanel(interaction);
      }
      if (action === 'welcome-save') {
        await settings.set(interaction.guild.id, { tickets: { welcome: {
          title: get('title'), message: get('message'),
          color: get('color') || s.tickets.welcome.color,
        } } });
        return void await openMainPanel(interaction);
      }
      if (action === 'buttons-save') {
        const parse = (v) => {
          const [label, emoji] = String(v).split('|').map(x => x.trim());
          return { label: label || 'Button', emoji: emoji || '' };
        };
        await settings.set(interaction.guild.id, { tickets: { buttons: {
          claim: parse(get('claim')),
          close: parse(get('close')),
          transcript: parse(get('transcript')),
        } } });
        return void await openMainPanel(interaction);
      }
      if (action === 'autoclose-save') {
        const enabled = /^(y|yes|true|on|1)$/i.test(get('enabled').trim());
        const hours = Math.max(1, Math.min(720, parseInt(get('hours'), 10) || 48));
        await settings.set(interaction.guild.id, { tickets: { autoClose: { enabled, inactivityHours: hours } } });
        return void await openMainPanel(interaction);
      }
      if (action === 'cat-save') {
        const newCat = {
          label: get('label').trim(),
          value: get('value').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-').slice(0, 60),
          emoji: (get('emoji') || '🎫').trim(),
          description: (get('description') || '').trim(),
        };
        if (!newCat.label || !newCat.value) {
          return void await interaction.reply(v2([embeds.error('Invalid', 'Label and value are required.')], { ephemeral: true })).catch(() => null);
        }
        const list = Array.isArray(s.tickets.categories) ? s.tickets.categories.slice() : [];
        if (arg === '__new__') {
          if (list.some(c => c.value === newCat.value)) {
            return void await interaction.reply(v2([embeds.error('Duplicate', `A category with value \`${newCat.value}\` already exists.`)], { ephemeral: true })).catch(() => null);
          }
          if (list.length >= 25) {
            return void await interaction.reply(v2([embeds.error('Limit', 'Discord allows max 25 dropdown options.')], { ephemeral: true })).catch(() => null);
          }
          list.push(newCat);
        } else {
          const idx = list.findIndex(c => c.value === arg);
          if (idx === -1) list.push(newCat);
          else list[idx] = newCat;
        }
        await settings.set(interaction.guild.id, { tickets: { categories: list } });
        const ns = await settings.get(interaction.guild.id);
        await interaction.reply(v2([embeds.success('Category Saved')], { ephemeral: true })).catch(() => null);

        await interaction.followUp(v2([catsEmbed(ns), ...catsComponents(ns)], { ephemeral: true })).catch(() => null);
        return true;
      }
    }
  } catch (err) {
    console.error('[TICKET-SETTINGS]', err);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction.reply(v2([embeds.error('Error', err.message?.slice(0, 1500) || 'Unknown error')], { ephemeral: true })).catch(() => null);
    }
  }
  return true;
}

module.exports = { openMainPanel, handleInteraction, isTicketAdmin };

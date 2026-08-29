const {
  SlashCommandBuilder,
  PermissionsBitField,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const ms = require('ms');
const embeds = require('../../embeds');
const { v2 } = require('../../utils/v2');

const giveaways = new Map();

module.exports = {
  name: 'giveaway',
  aliases: ['gstart'],
  description: 'Start a giveaway: !giveaway <duration> <prize>',
  category: 'fun',
  data: new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Start a giveaway.')
    .addStringOption(o => o.setName('duration').setDescription('e.g. 1h, 30m').setRequired(true))
    .addStringOption(o => o.setName('prize').setDescription('Prize').setRequired(true))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild),

  async run({ message, args }) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
      return message.reply(v2([embeds.error('Insufficient Permissions', 'You need **Manage Server**.')]));
    }
    const dur = ms(args[0]);
    const prize = args.slice(1).join(' ');
    if (!dur || !prize) {
      return message.reply(v2([embeds.error('Usage', '`!giveaway <duration> <prize>`')]));
    }
    await runGiveaway(message.channel, dur, prize, message.author);
    message.delete().catch(() => null);
  },

  async execute({ interaction }) {
    const dur = ms(interaction.options.getString('duration'));
    const prize = interaction.options.getString('prize');
    if (!dur || !prize) {
      return interaction.reply(v2([embeds.error('Bad Input', 'Invalid duration or prize.')], { ephemeral: true }));
    }
    await runGiveaway(interaction.channel, dur, prize, interaction.user);
    interaction.reply(v2([embeds.success('Panel Sent', `Giveaway for **${prize}** started.`)], { ephemeral: true }));
  },

  async handleInteraction(interaction) {
    if (!interaction.isButton?.()) return false;
    const id = interaction.customId || '';
    if (!id.startsWith('gw:')) return false;

    const [, action, messageId] = id.split(':');
    const g = giveaways.get(messageId);

    if (action === 'join') {
      try {
        await interaction.deferReply({ ephemeral: true });
      } catch (e) {
        console.error('[giveaway] defer failed:', e);
        return true;
      }
      if (!g || g.ended) {
        await interaction.editReply(v2([embeds.warn('Giveaway Ended', 'This giveaway has already ended.')]));
        return true;
      }
      const uid = interaction.user.id;
      if (g.entrants.has(uid)) {
        g.entrants.delete(uid);
        await interaction.editReply(v2([embeds.info('Left Giveaway', `You left the giveaway for **${g.prize}**.`)]));
      } else {
        g.entrants.add(uid);
        await interaction.editReply(v2([embeds.success(
            'Joined Giveaway',
            `You joined the giveaway for **${g.prize}**!\nClick the button again to leave.`
          )]));
      }
      updateEntrantCount(interaction.client, g, messageId).catch(() => null);
      return true;
    }

    if (action === 'list') {
      try {
        await interaction.deferReply({ ephemeral: true });
      } catch (e) {
        console.error('[giveaway] defer failed:', e);
        return true;
      }
      if (!g) {
        await interaction.editReply(v2([embeds.warn('No Data', 'No data for this giveaway.')]));
        return true;
      }
      if (!g.entrants.size) {
        await interaction.editReply(v2([embeds.info('Entrants', 'No entrants yet.')]));
        return true;
      }
      const mentions = [...g.entrants].map(id => `<@${id}>`);
      const chunks = [];
      let buf = '';
      for (const m of mentions) {
        if ((buf + (buf ? ', ' : '') + m).length > 1800) {
          chunks.push(buf);
          buf = m;
        } else {
          buf = buf ? `${buf}, ${m}` : m;
        }
      }
      if (buf) chunks.push(buf);

      const title = `Entrants — ${g.prize}`;
      const footer = `${g.entrants.size} entrant${g.entrants.size === 1 ? '' : 's'}`;
      await interaction.editReply(v2([embeds.info(title, chunks[0]).setFooter({ text: footer })]));
      for (let i = 1; i < chunks.length; i++) {
        await interaction.followUp(v2([embeds.info(`${title} (cont.)`, chunks[i])], { ephemeral: true })).catch(() => null);
      }
      return true;
    }

    return false;
  },
};

function buildEmbed(prize, host, endsAt, entrantCount) {
  const hostMention = typeof host === 'string' ? host : `<@${host.id ?? host}>`;
  return embeds.info(
    `🎉 Giveaway: ${prize}`,
    `**Prize:** ${prize}\n` +
    `Click **Join Giveaway** below to enter!\n` +
    `**Ends:** <t:${Math.floor(endsAt / 1000)}:R>\n` +
    `**Hosted by:** ${hostMention}\n` +
    `**Entrants:** ${entrantCount}`
  ).setTimestamp(endsAt);
}

function buildRow(messageId, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`gw:join:${messageId}`)
      .setLabel(disabled ? 'Giveaway Ended' : 'Join Giveaway')
      .setEmoji('🎉')
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`gw:list:${messageId}`)
      .setLabel('View Entrants')
      .setStyle(ButtonStyle.Secondary)
  );
}

async function updateEntrantCount(client, g, messageId) {
  const channel = await client.channels.fetch(g.channelId).catch(() => null);
  if (!channel) return;
  const msg = await channel.messages.fetch(messageId).catch(() => null);
  if (!msg) return;
  const host = await client.users.fetch(g.hostId).catch(() => null);
  await msg.edit(v2([buildEmbed(g.prize, host ?? `<@${g.hostId}>`, g.endsAt, g.entrants.size), buildRow(messageId, g.ended)])).catch(() => null);
}

async function runGiveaway(channel, dur, prize, host) {
  const endsAt = Date.now() + dur;

  const msg = await channel.send(v2([buildEmbed(prize, host, endsAt, 0)]));

  const g = {
    prize,
    hostId: host.id,
    channelId: channel.id,
    endsAt,
    entrants: new Set(),
    ended: false,
    timer: null,
  };
  giveaways.set(msg.id, g);

  await msg.edit(v2([buildEmbed(prize, host, endsAt, 0), buildRow(msg.id, false)]));

  g.timer = setTimeout(async () => {
    g.ended = true;
    const entrants = [...g.entrants];

    await msg.edit(v2([buildEmbed(prize, host, endsAt, entrants.length), buildRow(msg.id, true)])).catch(() => null);

    if (!entrants.length) {
      channel.send(v2([embeds.warn('Giveaway Ended', `No valid entries for **${prize}**.`)])).catch(() => null);
      return;
    }

    const winnerId = entrants[Math.floor(Math.random() * entrants.length)];
    channel.send(v2([embeds.success(
        '🎉 Giveaway Ended',
        `**Prize:** ${prize}\n**Winner:** <@${winnerId}>\n**Hosted by:** ${host}`
      ), `Congrats <@${winnerId}>! You won **${prize}**!`])).catch(() => null);
  }, dur);
}

const { SlashCommandBuilder } = require('discord.js');
const embeds = require('../../embeds');
const settings = require('../../utils/settings');
const { fail, ok } = require('../../utils/reply');
const { v2 } = require('../../utils/v2');
const { PermissionsBitField } = require('discord.js');
const { UserError, assertBotPerms } = require('../../utils/errors');

async function send(client, guildId, text, authorTag) {
  const trimmed = String(text || '').trim();
  if (!trimmed) throw new UserError('Empty Suggestion', 'Your suggestion can\'t be blank.');
  if (trimmed.length > 1800) {
    throw new UserError('Suggestion Too Long', `Keep it under 1800 characters — yours was ${trimmed.length}.`);
  }

  const s = await settings.get(guildId);

  if (!s?.suggestions?.enabled) {
    throw new UserError('Suggestions Disabled', 'Suggestions are turned off in this server. An admin can enable them with `/setup open` → **Channels**.');
  }
  if (!s.suggestions.channelId) {
    throw new UserError('No Suggestion Channel', 'No suggestion channel has been set. An admin needs to pick one with `/setup open` → **Channels**.');
  }

  const ch = await client.channels.fetch(s.suggestions.channelId).catch(() => null);
  if (!ch) {
    throw new UserError(
      'Suggestion Channel Missing',
      `The configured suggestion channel (<#${s.suggestions.channelId}>) no longer exists or I can't see it. An admin should re-select it in \`/setup\`.`,
    );
  }
  if (!ch.isTextBased?.()) {
    throw new UserError('Wrong Channel Type', 'The configured suggestion channel isn\'t a text channel. An admin should re-select it in `/setup`.');
  }

  assertBotPerms(
    ch,
    [
      PermissionsBitField.Flags.ViewChannel,
      PermissionsBitField.Flags.SendMessages,
      PermissionsBitField.Flags.AddReactions,
      PermissionsBitField.Flags.ReadMessageHistory,
    ],
    `posting suggestions in ${ch}`,
  );

  const m = await ch.send(v2([embeds.info('New Suggestion', trimmed).setFooter({ text: `By ${authorTag}` })]));

  const reacted = await m.react('👍').then(() => m.react('👎')).then(() => true).catch(() => false);

  return { ok: true, channel: ch, partial: !reacted };
}

module.exports = {
  name: 'suggest',
  description: 'Submit a suggestion.',
  category: 'fun',
  data: new SlashCommandBuilder().setName('suggest').setDescription('Submit a suggestion.')
    .addStringOption(o => o.setName('idea').setDescription('Your suggestion').setRequired(true)),
  async run({ message, args, client }) {
    const text = args.join(' ');
    if (!text) return fail(message, 'Usage', '`!suggest <idea>`');
    const r = await send(client, message.guild.id, text, message.author.tag);
    return ok(message, 'Submitted!',
      `Thanks for your suggestion — it was posted in ${r.channel}.` +
      (r.partial ? '\n\n-# I couldn\'t add the vote reactions (missing **Add Reactions** there).' : ''));
  },
  async execute({ interaction, client }) {
    if (!interaction.inGuild()) {
      return fail(interaction, 'Server Only', 'Suggestions can only be submitted inside a server.');
    }
    const text = interaction.options.getString('idea');
    const r = await send(client, interaction.guild.id, text, interaction.user.tag);
    return ok(interaction, 'Submitted!',
      `Thanks for your suggestion — it was posted in ${r.channel}.` +
      (r.partial ? '\n\n-# I couldn\'t add the vote reactions (missing **Add Reactions** there).' : ''),
      { ephemeral: true });
  },
};

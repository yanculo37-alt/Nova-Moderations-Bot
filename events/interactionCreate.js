const { MessageFlags, PermissionsBitField } = require('discord.js');
const { v2, container } = require('../utils/v2');
const { reportError, safeRespond, describeError } = require('../utils/errors');

let setupSystem = null;
try { setupSystem = require('../systems/setup'); } catch (e) {
  console.error('[interactionCreate] failed to load setup system:', e);
}

let appSystem = null;
try { appSystem = require('../systems/applicationSystem'); } catch {}

let tickets = null;
try { tickets = require('../tickets/ticketSystem'); } catch {}

let ticketSettings = null;
try { ticketSettings = require('../systems/ticketSettings'); } catch {}

let reactionRole = null;
try { reactionRole = require('../commands/fun/reactionrole'); } catch (e) {
  console.error('[interactionCreate] failed to load reactionrole:', e);
}

let giveaway = null;
try { giveaway = require('../commands/fun/giveaway'); } catch (e) {
  console.error('[interactionCreate] failed to load giveaway:', e);
}

async function tryRoute(router, interaction, name) {
  if (!router || typeof router.handleInteraction !== 'function') return false;
  try {
    return (await router.handleInteraction(interaction)) === true;
  } catch (err) {

    await reportError(interaction, err, { action: `handling that ${name} action` });
    return true;
  }
}

function requiredPermsFor(cmd) {
  const data = cmd?.data;
  if (!data) return null;

  let raw =
    data.default_member_permissions ??
    (typeof data.toJSON === 'function' ? data.toJSON().default_member_permissions : null);
  if (raw === null || raw === undefined) return null;
  try {
    return BigInt(raw);
  } catch {
    return null;
  }
}

function formatMissingPerms(bits) {
  try {
    const names = new PermissionsBitField(bits).toArray();
    if (!names.length) return 'the required permissions';
    return names
      .map(n => n.replace(/([a-z])([A-Z])/g, '$1 $2'))
      .map(n => `\`${n}\``)
      .join(', ');
  } catch {
    return 'the required permissions';
  }
}

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    try {

      if (!interaction.isChatInputCommand?.() && !interaction.isAutocomplete?.()) {
        if (await tryRoute(setupSystem, interaction, 'setup')) return;
        if (await tryRoute(ticketSettings, interaction, 'ticket settings')) return;
        if (await tryRoute(tickets, interaction, 'ticket')) return;
        if (await tryRoute(appSystem, interaction, 'application')) return;
        if (await tryRoute(reactionRole, interaction, 'reaction role')) return;
        if (await tryRoute(giveaway, interaction, 'giveaway')) return;

        // Route button interactions back to the slash command module that owns them.
        if (interaction.isButton?.()) {
          const cmdName = interaction.customId?.split('-')[0];
          const cmd = cmdName ? client.commands?.get(cmdName) : null;
          if (cmd?.handleInteraction) {
            try {
              return await cmd.handleInteraction(interaction);
            } catch (err) {
              await reportError(interaction, err, { action: `handling that ${cmdName} button` });
              return;
            }
          }
        }
      }

      if (interaction.isChatInputCommand?.()) {
        const cmd = client.commands?.get(interaction.commandName);
        if (!cmd) return;

        const required = requiredPermsFor(cmd);
        if (required && required !== 0n) {

          if (!interaction.inGuild() || !interaction.guild) {
            return interaction.reply(
              v2([container({ color: 0xED4245, children: ['❌ This command can only be used inside a server.'] })], { ephemeral: true }),
            ).catch(() => null);
          }

          const perms = interaction.memberPermissions;
          const hasPerm =
            perms?.has(PermissionsBitField.Flags.Administrator) ||
            perms?.has(required, true);

          if (!hasPerm) {
            const missing = perms
              ? new PermissionsBitField(required).missing(perms)
              : new PermissionsBitField(required).toArray();
            console.warn(
              `[SLASH ${interaction.commandName}] permission denied for ${interaction.user.tag} (${interaction.user.id}) in guild ${interaction.guild.id}. Missing: ${missing.join(', ')}`
            );
            return interaction.reply(
              v2([container({
                color: 0xED4245,
                children: [`❌ You don't have permission to use \`/${interaction.commandName}\`. Missing: ${formatMissingPerms(required)}.`],
              })], { ephemeral: true }),
            ).catch(() => null);
          }
        }

        const watchdog = setTimeout(() => {
          if (!interaction.replied && !interaction.deferred) {
            interaction
              .deferReply({ flags: MessageFlags.Ephemeral })
              .catch(() => null);
          }
        }, 2200);

        try {
          await cmd.execute({ interaction, client });
        } catch (err) {
          await reportError(interaction, err, {
            action: `running \`/${interaction.commandName}\``,
          });
        } finally {
          clearTimeout(watchdog);

          if (!interaction.replied && !interaction.deferred) {
            await safeRespond(
              interaction,
              v2([container({
                color: 0xFEE75C,
                children: [
                  '### ⚠️ No Response Produced',
                  `\`/${interaction.commandName}\` finished without sending anything back. ` +
                  'This usually means a required setting is missing — try `/setup view`.',
                ],
              })], { ephemeral: true }),
            );
          }
        }
        return;
      }

      if (interaction.isAutocomplete?.()) {
        const cmd = client.commands?.get(interaction.commandName);
        if (cmd?.autocomplete) {
          try { await cmd.autocomplete(interaction, client); }
          catch (err) {
            const { title } = describeError(err, { action: 'building suggestions' });
            console.error(`[AUTOCOMPLETE ${interaction.commandName}] ${title}`, err);
            await interaction.respond([]).catch(() => null);
          }
        }
      }
    } catch (err) {

      await reportError(interaction, err, { action: 'processing that interaction' });
    }
  },
};

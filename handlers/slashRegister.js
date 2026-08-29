const { REST, Routes } = require('discord.js');

module.exports = async function registerSlash(client) {
  const TOKEN = process.env.TOKEN;
  const CLIENT_ID = process.env.CLIENT_ID;
  const GUILD_ID  = process.env.GUILD_ID;

  if (!TOKEN || !CLIENT_ID) {
    console.warn('[SLASH] TOKEN or CLIENT_ID missing — skipping slash registration.');
    return;
  }

  const body = client.commands.filter(c => c.data).map(c => c.data.toJSON());
  if (!body.length) {
    console.warn('[SLASH] No slash commands found to register.');
    return;
  }

  console.log(`[SLASH] Preparing ${body.length} command(s):`);
  body.forEach(c => console.log(`[SLASH]   • /${c.name}`));

  const rest = new REST({ version: '10' }).setToken(TOKEN);
  const inviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&permissions=8&scope=bot%20applications.commands`;

  const tryGuild = async () => {
    const data = await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body },
    );
    console.log(`[SLASH] ✅ Registered ${data.length} GUILD commands in ${GUILD_ID} (instant).`);
    return data;
  };
  const tryGlobal = async () => {
    const data = await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      { body },
    );
    console.log(`[SLASH] ✅ Registered ${data.length} GLOBAL commands (may take up to 1h to appear).`);
    return data;
  };

  const explainMissingAccess = () => {
    console.error('[SLASH] ❌ Discord returned 50001 Missing Access.');
    console.error('[SLASH]    This almost always means the bot was invited WITHOUT');
    console.error('[SLASH]    the "applications.commands" scope, OR GUILD_ID is wrong.');
    console.error('[SLASH]    Re-invite the bot with this URL, then restart:');
    console.error(`[SLASH]    ${inviteUrl}`);
  };

  try {
    if (GUILD_ID) {
      try {
        await tryGuild();
      } catch (e) {
        if (e?.code === 50001) {
          explainMissingAccess();
          console.warn('[SLASH] Falling back to GLOBAL registration so commands aren\'t lost…');
          try { await tryGlobal(); }
          catch (e2) { console.error('[SLASH] Global fallback also failed:', e2?.message || e2); }
        } else {
          throw e;
        }
      }
    } else {
      await tryGlobal();
    }
  } catch (e) {
    if (e?.code === 50001) explainMissingAccess();
    else console.error('[SLASH] ❌ Registration failed:', e?.message || e);
  }
};

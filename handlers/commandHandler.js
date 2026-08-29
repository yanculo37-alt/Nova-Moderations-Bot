const fs = require('node:fs');
const path = require('node:path');

module.exports = async function loadCommands(client) {
  const root = path.join(__dirname, '..', 'commands');
  if (!fs.existsSync(root)) {
    console.warn('[CMD] No /commands directory found.');
    return;
  }

  const categories = fs.readdirSync(root).filter(f =>
    fs.statSync(path.join(root, f)).isDirectory()
  );

  const stats = { prefix: 0, slash: 0, dual: 0, failed: 0, byCategory: {} };
  const failures = [];
  const slashNames = new Set();
  const prefixNames = new Set();

  for (const category of categories) {
    const dir = path.join(root, category);
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.js'));
    stats.byCategory[category] = { prefix: 0, slash: 0 };

    for (const file of files) {
      const full = path.join(dir, file);
      let command;
      try {
        delete require.cache[require.resolve(full)];
        command = require(full);
      } catch (err) {
        stats.failed++;
        failures.push(`${category}/${file}: ${err.message}`);
        continue;
      }

      if (!command || typeof command !== 'object') {
        stats.failed++;
        failures.push(`${category}/${file}: empty export`);
        continue;
      }
      if (!command.name) {
        stats.failed++;
        failures.push(`${category}/${file}: missing .name`);
        continue;
      }
      command.category ||= category;

      const hasPrefix = typeof command.run === 'function';
      const hasSlash  = !!command.data && typeof command.execute === 'function';

      if (!hasPrefix && !hasSlash) {
        stats.failed++;
        failures.push(`${category}/${file}: no run() or execute()`);
        continue;
      }

      if (hasPrefix) {
        if (prefixNames.has(command.name)) {
          failures.push(`${category}/${file}: duplicate prefix name "${command.name}"`);
          stats.failed++;
          continue;
        }
        prefixNames.add(command.name);
        client.prefixCommands.set(command.name, command);
        (command.aliases || []).forEach(a => {
          if (!client.aliases.has(a)) client.aliases.set(a, command.name);
        });
        stats.prefix++;
        stats.byCategory[category].prefix++;
      }

      if (hasSlash) {
        const slashName = command.data.name;
        if (slashNames.has(slashName)) {
          failures.push(`${category}/${file}: duplicate slash name "${slashName}"`);
          stats.failed++;
          continue;
        }
        slashNames.add(slashName);
        client.commands.set(slashName, command);
        stats.slash++;
        stats.byCategory[category].slash++;
      }

      if (hasPrefix && hasSlash) stats.dual++;
    }
  }

  console.log('[CMD] ────────── Command Loader ──────────');
  for (const [cat, s] of Object.entries(stats.byCategory)) {
    console.log(`[CMD]   ${cat.padEnd(12)} prefix:${String(s.prefix).padStart(2)}  slash:${String(s.slash).padStart(2)}`);
  }
  console.log(`[CMD] ✅ Loaded ${stats.prefix} prefix, ${stats.slash} slash (${stats.dual} dual).`);
  if (stats.failed) {
    console.warn(`[CMD] ⚠️  ${stats.failed} failure(s):`);
    failures.forEach(f => console.warn(`[CMD]    - ${f}`));
  }
  console.log('[CMD] ────────────────────────────────────');
};

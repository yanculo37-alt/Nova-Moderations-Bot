module.exports = function cooldown(client, command, userId) {
  if (!command.cooldown) return 0;
  const key = `${command.name}:${userId}`;
  const now = Date.now();
  const expires = client.cooldowns.get(key) || 0;
  if (now < expires) return Math.ceil((expires - now) / 1000);
  client.cooldowns.set(key, now + command.cooldown * 1000);
  setTimeout(() => client.cooldowns.delete(key), command.cooldown * 1000);
  return 0;
};

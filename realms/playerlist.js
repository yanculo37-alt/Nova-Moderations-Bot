const DEVICE_INFO = {
  win32: { name: 'Windows PC', icon: '💻 |' },
  uwp: { name: 'Windows PC', icon: '💻 |' },
  onecore: { name: 'Windows PC', icon: '💻 |' },
  android: { name: 'Android', icon: '📱 |' },
  ios: { name: 'iOS', icon: '🍎 |' },
  iphone: { name: 'iOS', icon: '🍎 |' },
  ipad: { name: 'iOS', icon: '🍎 |' },
  xboxone: { name: 'Xbox One', icon: '🎮 |' },
  scarlett: { name: 'Xbox Series X|S', icon: '🎮 |' },
  playstation: { name: 'PlayStation', icon: '🎮 |' },
  ps4: { name: 'PlayStation', icon: '🎮 |' },
  ps5: { name: 'PlayStation', icon: '🎮 |' },
  nintendo: { name: 'Nintendo Switch', icon: '🎮 |' },
  switch: { name: 'Nintendo Switch', icon: '🎮 |' },
};

const DEVICE_BY_TITLE = {
  '1739947436': { name: 'Android', icon: '📱 |' },
  '1810924247': { name: 'iOS', icon: '🍎 |' },
  '896928775': { name: 'Windows PC', icon: '💻 |' },
  '1828326430': { name: 'Xbox One', icon: '🎮 |' },
  '1692084847': { name: 'Xbox Series X|S', icon: '🎮 |' },
  '2044456598': { name: 'Nintendo Switch', icon: '🎮 |' },
  '1001782317': { name: 'PlayStation', icon: '🎮 |' },
  '1008647042': { name: 'PlayStation', icon: '🎮 |' },
};

function deviceOf(person) {
  const details = Array.isArray(person?.presenceDetails) ? person.presenceDetails : [];
  if (!details.length) return { name: 'Unknown', icon: '👤 |' };

  const mc = details.find((d) => d && (
    DEVICE_BY_TITLE[String(d.TitleId ?? d.titleId ?? '')] ||
    /minecraft/i.test(String(d.PresenceText ?? d.presenceText ?? ''))
  ));
  const pick = mc || details.find((d) => d?.IsPrimary ?? d?.isPrimary) || details[0];
  if (!pick) return { name: 'Unknown', icon: '👤 |' };

  const rawDevice = String(pick.Device ?? pick.device ?? '');
  const normalized = rawDevice.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (normalized && DEVICE_INFO[normalized]) return DEVICE_INFO[normalized];

  const title = String(pick.TitleId ?? pick.titleId ?? '');
  if (DEVICE_BY_TITLE[title]) return DEVICE_BY_TITLE[title];

  if (rawDevice) return { name: rawDevice, icon: '🎮 |' };
  return { name: 'Unknown', icon: '👤 |' };
}

function getRoleDetails(player, ownerUUID) {
  if (player?.uuid === ownerUUID) return { name: 'Owner', icon: '👑 |' };
  switch (player?.permission) {
    case 'OPERATOR': return { name: 'Operator', icon: '👑 |' };
    case 'VISITOR': return { name: 'Visitor', icon: '👁 |' };
    case 'MEMBER':
    default: return { name: 'Member', icon: '⭐️ |' };
  }
}

function formatWatchlistBody(users = []) {
  const blocks = users.map((u) => {
    const device = deviceOf(u);
    return `\`${u.gamertag || 'Unknown'}\` \`${u.xuid || 'Unknown'}\`\n${device.icon} ${device.name}`;
  });

  const header = blocks.length ? `${blocks.join('\n\n')}\n\n` : 'Nobody is playing on this realm right now.\n\n';
  return `${header}Online: \`${users.length}\``.slice(0, 3900);
}

module.exports = { DEVICE_INFO, DEVICE_BY_TITLE, deviceOf, getRoleDetails, formatWatchlistBody };

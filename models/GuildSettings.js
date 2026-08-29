const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  guildId: { type: String, unique: true, index: true },

  prefix: { type: String, default: null },

  staffRoles: { type: [String], default: [] },
  modRoles:   { type: [String], default: [] },
  autoRole:   { enabled: { type: Boolean, default: false }, roleId: { type: String, default: '' } },

  logChannels: {
    moderation: { type: String, default: '' },
    messages:   { type: String, default: '' },
    tickets:    { type: String, default: '' },
    joinLeave:  { type: String, default: '' },
  },
  statusChannels: {
    memberCount: { type: String, default: '' },
    botStatus:   { type: String, default: '' },
  },
  commandChannels: { type: [String], default: [] },
  suggestions: { enabled: { type: Boolean, default: true }, channelId: { type: String, default: '' } },

  welcome: {
    enabled:   { type: Boolean, default: true },
    channelId: { type: String,  default: '' },
    message:   { type: String,  default: '' },
  },
  goodbye: {
    enabled:   { type: Boolean, default: true },
    channelId: { type: String,  default: '' },
    message:   { type: String,  default: '' },
  },

  tickets: { type: mongoose.Schema.Types.Mixed, default: {} },

  applications: { type: mongoose.Schema.Types.Mixed, default: {} },

  automod: { type: mongoose.Schema.Types.Mixed, default: {} },

  leveling: { type: mongoose.Schema.Types.Mixed, default: {} },

  realm: {
    code: { type: String, default: '' },

    watchlist: {
      enabled:   { type: Boolean, default: false },
      channelId: { type: String,  default: '' },
      delay:     { type: Number,  default: 5 },
      messageId: { type: String,  default: '' },
    },
  },

  setupCompletedAt: { type: Date, default: null },
}, { timestamps: true, minimize: false });

module.exports = mongoose.models.GuildSettings || mongoose.model('GuildSettings', schema);

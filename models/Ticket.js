const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  guildId: String,
  channelId: { type: String, index: true },
  userId:    { type: String, index: true },
  category:  String,
  claimedBy: String,
  closed:    { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  closedAt:  Date,
});
module.exports = mongoose.models.Ticket || mongoose.model('Ticket', schema);

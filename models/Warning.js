const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  guildId: { type: String, index: true },
  userId:  { type: String, index: true },
  modId:   String,
  reason:  String,
  createdAt: { type: Date, default: Date.now },
});
module.exports = mongoose.models.Warning || mongoose.model('Warning', schema);

const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  guildId:   { type: String, index: true },
  userId:    { type: String, index: true },
  typeValue: { type: String },
  typeLabel: { type: String },
  questions: { type: [String], default: [] },
  answers:   { type: [String], default: [] },
  status:    { type: String, enum: ['pending', 'accepted', 'declined', 'cancelled'], default: 'pending' },
  decidedBy: { type: String, default: '' },
  reason:    { type: String, default: '' },
  logChannelId: { type: String, default: '' },
  logMessageId: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.models.Application || mongoose.model('Application', schema);

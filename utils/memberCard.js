const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const { AttachmentBuilder } = require('discord.js');
const path = require('path');

try {
  GlobalFonts.registerFromPath(path.join(__dirname, '..', 'assets', 'Inter-Regular.ttf'), 'Inter');
  GlobalFonts.registerFromPath(path.join(__dirname, '..', 'assets', 'Inter-Bold.ttf'), 'InterBold');
  GlobalFonts.registerFromPath(path.join(__dirname, '..', 'assets', 'Inter-Italic.ttf'), 'InterItalic');
} catch (e) {  }

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

async function buildMemberCard({ type, username, guildName, avatarURL }) {
  const W = 900;
  const H = 500;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  const isWelcome = type === 'welcome';
  const accent = isWelcome ? '#5cd66b' : '#ff6b6b';
  const accent2 = isWelcome ? '#7be388' : '#ff9aa0';
  const pill = isWelcome ? 'Welcome aboard!' : 'Sad to see you go!';
  const title = isWelcome ? `Welcome ${username}` : `Goodbye ${username}`;

  ctx.clearRect(0, 0, W, H);

  const cardX = 90, cardY = 60, cardW = 720, cardH = 380, radius = 28;

  ctx.fillStyle = accent;
  roundRect(ctx, cardX - 40, cardY - 30, 220, 180, radius);
  ctx.fill();

  ctx.fillStyle = accent2;
  roundRect(ctx, cardX + cardW - 180, cardY + cardH - 150, 240, 200, radius);
  ctx.fill();

  ctx.fillStyle = '#1f2024';
  roundRect(ctx, cardX, cardY, cardW, cardH, radius);
  ctx.fill();

  ctx.font = '20px InterBold';
  const pillW = ctx.measureText(pill).width + 40;
  const pillH = 38;
  const pillX = cardX + (cardW - pillW) / 2;
  const pillY = cardY + 22;
  ctx.fillStyle = '#2c2d33';
  roundRect(ctx, pillX, pillY, pillW, pillH, pillH / 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(pill, pillX + pillW / 2, pillY + pillH / 2 + 1);

  const avSize = 130;
  const avX = cardX + cardW / 2 - avSize / 2;
  const avY = pillY + pillH + 18;
  try {
    const img = await loadImage(avatarURL);
    ctx.save();
    ctx.beginPath();
    ctx.arc(avX + avSize / 2, avY + avSize / 2, avSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(img, avX, avY, avSize, avSize);
    ctx.restore();

    ctx.beginPath();
    ctx.arc(avX + avSize / 2, avY + avSize / 2, avSize / 2 + 3, 0, Math.PI * 2);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 4;
    ctx.stroke();
  } catch (_) {
    ctx.fillStyle = '#444';
    ctx.beginPath();
    ctx.arc(avX + avSize / 2, avY + avSize / 2, avSize / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = '#ffffff';
  ctx.font = '38px InterBold';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(title, cardX + cardW / 2, avY + avSize + 24);

  ctx.fillStyle = '#bdbdc4';
  ctx.font = '22px InterItalic';
  ctx.fillText(isWelcome ? 'to' : 'from', cardX + cardW / 2, avY + avSize + 78);

  ctx.fillStyle = '#ffffff';
  ctx.font = '30px InterBold';
  ctx.fillText(guildName, cardX + cardW / 2, avY + avSize + 110);

  const buffer = await canvas.encode('png');
  return new AttachmentBuilder(buffer, { name: `${type}-card.png` });
}

module.exports = { buildMemberCard };

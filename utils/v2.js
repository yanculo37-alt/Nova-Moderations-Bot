const {
  MessageFlags,
  TextDisplayBuilder,
  ContainerBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  SectionBuilder,
  ThumbnailBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  FileBuilder,
  ActionRowBuilder,
} = require('discord.js');

const text = (content) => new TextDisplayBuilder().setContent(String(content ?? '\u200b'));

const separator = (small = false, divider = true) =>
  new SeparatorBuilder()
    .setDivider(divider)
    .setSpacing(small ? SeparatorSpacingSize.Small : SeparatorSpacingSize.Large);

const sectionWithThumb = (lines, url, description) => {
  const s = new SectionBuilder();
  for (const l of [].concat(lines).filter(Boolean)) s.addTextDisplayComponents(text(l));
  const t = new ThumbnailBuilder().setURL(url);
  if (description) t.setDescription(String(description).slice(0, 256));
  return s.setThumbnailAccessory(t);
};

const sectionWithButton = (lines, button) => {
  const s = new SectionBuilder();
  for (const l of [].concat(lines).filter(Boolean)) s.addTextDisplayComponents(text(l));
  return s.setButtonAccessory(button);
};

const file = (name, spoiler = false) =>
  new FileBuilder().setURL(`attachment://${name}`).setSpoiler(spoiler);

const image = (url, description) => {
  const item = new MediaGalleryItemBuilder().setURL(url);
  if (description) item.setDescription(String(description).slice(0, 256));
  return new MediaGalleryBuilder().addItems(item);
};

const resolveColor = (color) => {
  if (color == null) return null;
  if (typeof color === 'number') return color;
  if (Array.isArray(color) && color.length === 3) return (color[0] << 16) + (color[1] << 8) + color[2];
  const str = String(color).trim().replace(/^#/, '');
  const n = parseInt(str, 16);
  return Number.isNaN(n) ? null : n;
};

const container = ({ color, children = [], spoiler = false } = {}) => {
  const c = new ContainerBuilder();
  const accent = resolveColor(color);
  if (accent != null) c.setAccentColor(accent);
  if (spoiler) c.setSpoiler(true);
  for (const child of [].concat(children).filter(Boolean)) {
    if (typeof child === 'string') c.addTextDisplayComponents(text(child));
    else if (child instanceof SectionBuilder) c.addSectionComponents(child);
    else if (child instanceof SeparatorBuilder) c.addSeparatorComponents(child);
    else if (child instanceof MediaGalleryBuilder) c.addMediaGalleryComponents(child);
    else if (child instanceof FileBuilder) c.addFileComponents(child);
    else if (child instanceof ActionRowBuilder) c.addActionRowComponents(child);
    else if (child instanceof TextDisplayBuilder) c.addTextDisplayComponents(child);
    else if (child && typeof child.toContainer === 'function') c.addTextDisplayComponents(text('\u200b'));
  }
  return c;
};

class Card {
  constructor(data = {}) {
    this.data = { fields: [], extra: [], ...data };
  }
  setColor(c) { this.data.color = c ?? undefined; return this; }
  setAccentColor(c) { return this.setColor(c); }
  setTitle(t) { this.data.title = t ?? undefined; return this; }
  setDescription(d) { this.data.description = d ?? undefined; return this; }
  setAuthor(a) { this.data.author = a ?? undefined; return this; }
  setFooter(f) { this.data.footer = f?.text ?? f ?? undefined; return this; }
  setTimestamp(at) { this.data.timestamp = at ? new Date(at).getTime() : Date.now(); return this; }
  setThumbnail(url) { this.data.thumbnail = url ?? undefined; return this; }
  setImage(url) { this.data.image = url ?? undefined; return this; }
  setSpoiler(v = true) { this.data.spoiler = v; return this; }
  addFields(...fields) { this.data.fields.push(...fields.flat().filter(Boolean)); return this; }
  setFields(...fields) { this.data.fields = fields.flat().filter(Boolean); return this; }

  addComponents(...c) { this.data.extra.push(...c.flat().filter(Boolean)); return this; }

  toContainer() {
    const d = this.data;
    const head = [];
    if (d.author?.name) head.push(`-# ${d.author.name}`);
    if (d.title) head.push(`## ${d.title}`);
    if (d.description) head.push(String(d.description));

    const children = [];
    if (d.thumbnail && head.length) children.push(sectionWithThumb(head, d.thumbnail));
    else children.push(...head);

    if (d.fields.length) {
      children.push(separator(true));
      children.push(d.fields.map((f) => `**${f.name}**\n${f.value ?? ''}`).join('\n\n'));
    }
    if (d.extra.length) children.push(...d.extra);
    if (d.image) children.push(image(d.image));
    if (d.footer || d.timestamp) {
      children.push(separator(true));
      const stamp = d.timestamp ? `<t:${Math.floor(d.timestamp / 1000)}:R>` : '';
      children.push(`-# ${[d.footer, stamp].filter(Boolean).join(' • ')}`);
    }
    return container({ color: d.color, children, spoiler: d.spoiler });
  }

  static fromContainer(raw) {
    return new ContainerBuilder(raw?.toJSON ? raw.toJSON() : raw);
  }
}

const v2 = (components = [], opts = {}) => {
  const { ephemeral = false, flags: extraFlags, ...rest } = opts || {};
  const list = [].concat(components).filter(Boolean).map((c) => (typeof c === 'string' ? text(c) : (c instanceof Card ? c.toContainer() : c)));

  let flags = MessageFlags.IsComponentsV2;
  if (ephemeral) flags |= MessageFlags.Ephemeral;
  if (extraFlags) flags |= extraFlags;

  return { components: list, flags, ...rest };
};

module.exports = {
  v2,
  Card,
  text,
  container,
  separator,
  section: sectionWithThumb,
  sectionWithThumb,
  sectionWithButton,
  image,
  file,
  resolveColor,
};

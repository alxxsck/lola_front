import slackShortcodes from 'emojibase-data/en/shortcodes/iamcal.json';

const shortcodePattern = /:([a-zA-Z0-9_+-]+):/g;
const emojiPresentationPattern = /\p{Emoji_Presentation}/u;

function hexcodeToUnicode(hexcode: string): string {
  const unicode = String.fromCodePoint(
    ...hexcode.split('-').map((part) => Number.parseInt(part, 16)),
  );
  return unicode.includes('\uFE0F') || emojiPresentationPattern.test(unicode)
    ? unicode
    : `${unicode}\uFE0F`;
}

const unicodeByShortcode = new Map<string, string>();

for (const [hexcode, value] of Object.entries(slackShortcodes)) {
  const unicode = hexcodeToUnicode(hexcode);
  const aliases = Array.isArray(value) ? value : [value];
  for (const alias of aliases) unicodeByShortcode.set(alias, unicode);
}

/**
 * Converts the Slack/IamCal shortcode vocabulary used by chat transports to
 * native Unicode while preserving unknown or project-specific shortcodes.
 */
export function formatEmojiShortcodes(text: string): string {
  if (!text.includes(':')) return text;
  return text
    .replace(shortcodePattern, (token, shortcode: string) => {
      return unicodeByShortcode.get(shortcode) ?? token;
    })
    .replace(/\uFE0F([\u{1F3FB}-\u{1F3FF}])/gu, '$1');
}

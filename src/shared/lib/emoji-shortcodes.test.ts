import { describe, expect, it } from 'vitest';
import { formatEmojiShortcodes } from './emoji-shortcodes';

describe('formatEmojiShortcodes', () => {
  it('combines a Slack emoji with its adjacent skin-tone modifier', () => {
    expect(formatEmojiShortcodes(':+1::skin-tone-3:')).toBe('👍🏼');
    expect(formatEmojiShortcodes(':wave::skin-tone-6:')).toBe('👋🏿');
  });

  it('formats known aliases inside ordinary multiline chat text', () => {
    expect(formatEmojiShortcodes('Спасибо :heart:\nПолучилось :tada:')).toBe(
      'Спасибо ❤️\nПолучилось 🎉',
    );
  });

  it('preserves native Unicode and unknown project-specific shortcodes', () => {
    expect(formatEmojiShortcodes('🔥 :project_status_ok:')).toBe('🔥 :project_status_ok:');
  });
});

# 08 — Реализовать общий full-tab presentation shell

**What to build:** Кнопка `На весь экран / Свернуть` и основной Support route должны использовать один полноэкранный shell без видимого или прокручиваемого CMS background.

**Blocked by:** 05 — Перевести Users chat на Conversation Surface; 06 — Перевести Support chat на Conversation Surface.

**Status:** complete

- [x] Full-tab shell совпадает с viewport вкладки без margin, outer radius, backdrop или horizontal overflow.
- [x] Mode switch не сбрасывает selection, draft, translation mode, inspector tab, message anchor или pending attachment.
- [x] Windowed/full-tab transition анимирует transform/opacity и уважает reduced motion.
- [x] Background становится inert и не scrollится; один reference-counted owner управляет nested overlays.
- [x] Focus сохраняется при toggle и возвращается launcher после закрытия.
- [x] Geometry, scroll, keyboard, safe-area и mobile keyboard assertions проходят в browser tests.

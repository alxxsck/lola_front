# 12 — Завершить tablet/mobile route stack

**What to build:** На узких экранах Support становится последовательным рабочим процессом `Inbox → Conversation → Inspector`, а не сжатыми desktop-панелями.

**Blocked by:** 08 — Реализовать общий full-tab presentation shell; 09 — Объединить Cases и Conversations в одном inbox.

**Status:** ready-for-agent

- [ ] Tablet показывает inbox + Conversation, а inspector открывает доступный drawer.
- [ ] Mobile показывает одну поверхность и использует canonical route/back navigation.
- [ ] Back сохраняет inbox scroll, filters, selection, message anchor и draft.
- [ ] Экранная клавиатура и safe areas не перекрывают composer или последнее сообщение.
- [ ] Focus возвращается из drawer и не теряется при смене route surface.
- [ ] Visual/keyboard проверки проходят на 1024×768, 768×1024, 390×844 и 320×568.

# Canonical identity policy в CMS

Редактор находится только в workspace **Настройки → Интеграции**. Формы Event Definition не
содержат provider-полей и не публикуют integration policy.

## Доступ и rollout

- просмотр требует `project.integrations.read`;
- preview и publish требуют `project.integrations.manage`;
- модуль можно скрыть через `VITE_CANONICAL_IDENTITY_POLICY_ENABLED=false`;
- backend остаётся authority: при выключенном canonical worker новая ревизия отображается как
  `PENDING_WORKER_CUTOVER`, при включённом — как `ACTIVE`.

## Подготовка маршрутов

В черновике каждого inbound route задаётся необязательный `canonicalKeyExtractor`:

- `sourcePath` содержит от 1 до 8 безопасных сегментов пути в нормализованном provider payload;
- `normalization`: `NONE`, `TRIM`, `LOWERCASE` или `TRIM_LOWERCASE`;
- ключ должен быть стабильным бизнес-ID, например `transaction_id`;
- временные окна, similarity и другие эвристики не поддерживаются.

Пустой extractor сохраняет обычный режим `SINGLE_SOURCE`. В canonical editor показываются только
активные опубликованные inbound routes, закреплённые за текущей ревизией выбранного Event.

## Preview и публикация

1. Выбрать Event Definition.
2. Выбрать минимум два маршрута разных providers.
3. Задать логическое имя ключа и выполнить backend preview.
4. Проверить точные route revisions, source paths и normalization.
5. Опубликовать неизменённый preview.

Publish передаёт `expectedVersion` из preview и стабильный `Idempotency-Key`. Повтор с тем же телом
возвращает исходный результат; изменённая команда с тем же ключом отклоняется. Конфликт OCC требует
обновить данные и повторить preview.

Одинаковый canonical key и одинаковый Lola payload дают одно принятое событие. Одинаковый ключ с
другим payload считается конфликтом и не объединяется автоматически.

## Безопасность UI

CMS не показывает raw provider payload, фактическое значение canonical key, его hash, credentials
или внутреннюю ошибку backend. После смены Project/события поздние ответы игнорируются. Текущая
immutable policy revision и её участники доступны в read-only режиме.

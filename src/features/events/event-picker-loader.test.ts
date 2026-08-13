import { describe, expect, it } from 'vitest';
import { createLocalEventPickerLoader } from './event-picker-loader';

describe('createLocalEventPickerLoader', () => {
  it('matches name, code and description with one case-insensitive query', async () => {
    const load = createLocalEventPickerLoader(() => [
      {
        value: 'payment.completed',
        name: 'Оплата завершена',
        code: 'payment.completed',
        description: 'Заказ успешно оплачен',
      },
      {
        value: 'session.started',
        name: 'Начало сессии',
        code: 'session.started',
        description: 'Пользователь открыл приложение',
      },
    ]);

    const page = await load({ query: 'УСПЕШНО', limit: 25 });

    expect(page.items.map((item) => item.value)).toEqual(['payment.completed']);
  });
});

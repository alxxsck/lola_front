export function russianCount(
  count: number,
  forms: readonly [one: string, few: string, many: string],
): string {
  const absolute = Math.abs(count) % 100
  const lastDigit = absolute % 10
  const form =
    absolute > 10 && absolute < 20
      ? forms[2]
      : lastDigit === 1
        ? forms[0]
        : lastDigit >= 2 && lastDigit <= 4
          ? forms[1]
          : forms[2]
  return `${count} ${form}`
}

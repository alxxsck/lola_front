export type DecimalString = string;

interface DecimalParts {
  integer: string;
  fraction: string;
}

export interface FormatDecimalMoneyOptions {
  locale?: string;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
  lessThan?: DecimalString | null;
}

const DECIMAL_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;

export function parseDecimalString(value: unknown): DecimalString | undefined {
  return typeof value === "string" &&
    value.length <= 64 &&
    DECIMAL_PATTERN.test(value)
    ? value
    : undefined;
}

export function compareDecimalStrings(
  left: DecimalString,
  right: DecimalString,
): -1 | 0 | 1 {
  const leftParts = parts(left);
  const rightParts = parts(right);
  const scale = Math.max(leftParts.fraction.length, rightParts.fraction.length);
  const leftValue = coefficient(leftParts, scale);
  const rightValue = coefficient(rightParts, scale);
  return leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
}

export function addDecimalStrings(
  values: readonly DecimalString[],
): DecimalString {
  const parsed = values.map(parts);
  const scale = Math.max(0, ...parsed.map((value) => value.fraction.length));
  const total = parsed.reduce(
    (sum, value) => sum + coefficient(value, scale),
    0n,
  );
  return fromCoefficient(total, scale);
}

export function decimalRatio(
  value: DecimalString,
  total: DecimalString,
): number {
  if (compareDecimalStrings(total, "0") === 0) return 0;
  const numeratorParts = parts(value);
  const denominatorParts = parts(total);
  const scale = Math.max(
    numeratorParts.fraction.length,
    denominatorParts.fraction.length,
  );
  const numerator = coefficient(numeratorParts, scale);
  const denominator = coefficient(denominatorParts, scale);
  const ratioScale = 1_000_000_000n;
  const scaled = (numerator * ratioScale) / denominator;
  const bounded = scaled > ratioScale ? ratioScale : scaled;
  return Number(bounded) / 1_000_000_000;
}

export function formatDecimalMoney(
  value: DecimalString,
  currency: string,
  options: FormatDecimalMoneyOptions = {},
): string {
  const normalizedCurrency = /^[a-z]{3}$/i.test(currency)
    ? currency.toUpperCase()
    : "USD";
  const locale = options.locale ?? "ru-RU";
  const minimumFractionDigits = options.minimumFractionDigits ?? 2;
  const maximumFractionDigits = Math.max(
    minimumFractionDigits,
    options.maximumFractionDigits ?? 2,
  );
  const lessThan =
    options.lessThan === undefined ? "0.01" : options.lessThan;
  if (
    lessThan &&
    compareDecimalStrings(value, "0") > 0 &&
    compareDecimalStrings(value, lessThan) < 0
  ) {
    return `< ${formatExactMoney(
      lessThan,
      normalizedCurrency,
      locale,
      minimumFractionDigits,
      maximumFractionDigits,
    )}`;
  }
  return formatExactMoney(
    value,
    normalizedCurrency,
    locale,
    minimumFractionDigits,
    maximumFractionDigits,
  );
}

function parts(value: DecimalString): DecimalParts {
  const [integer = "0", fraction = ""] = value.split(".");
  return { integer, fraction };
}

function coefficient(value: DecimalParts, scale: number): bigint {
  return BigInt(
    `${value.integer}${value.fraction.padEnd(scale, "0")}`.replace(
      /^0+(?=\d)/,
      "",
    ),
  );
}

function fromCoefficient(value: bigint, scale: number): DecimalString {
  if (scale === 0) return value.toString();
  const padded = value.toString().padStart(scale + 1, "0");
  const integer = padded.slice(0, -scale);
  const fraction = padded.slice(-scale).replace(/0+$/, "");
  return fraction ? `${integer}.${fraction}` : integer;
}

function formatExactMoney(
  value: DecimalString,
  currency: string,
  locale: string,
  minimumFractionDigits: number,
  maximumFractionDigits: number,
): string {
  const rounded = round(value, maximumFractionDigits);
  const roundedParts = parts(rounded);
  let fraction = roundedParts.fraction;
  while (fraction.length > minimumFractionDigits && fraction.endsWith("0")) {
    fraction = fraction.slice(0, -1);
  }
  fraction = fraction.padEnd(minimumFractionDigits, "0");
  const formatter = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: fraction.length,
    maximumFractionDigits: fraction.length,
  });
  return formatter
    .formatToParts(BigInt(roundedParts.integer))
    .map((part) => (part.type === "fraction" ? fraction : part.value))
    .join("");
}

function round(value: DecimalString, maximumFractionDigits: number): DecimalString {
  const valueParts = parts(value);
  if (valueParts.fraction.length <= maximumFractionDigits) return value;
  const kept = valueParts.fraction.slice(0, maximumFractionDigits);
  const discarded = valueParts.fraction[maximumFractionDigits] ?? "0";
  let rounded = BigInt(`${valueParts.integer}${kept}` || "0");
  if (discarded >= "5") rounded += 1n;
  return fromCoefficient(rounded, maximumFractionDigits);
}

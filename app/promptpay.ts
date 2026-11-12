function field(id: string, value: string) {
  return `${id}${String(value.length).padStart(2, "0")}${value}`;
}

function crc16(value: string) {
  let crc = 0xffff;
  for (let index = 0; index < value.length; index += 1) {
    crc ^= value.charCodeAt(index) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export function normalizePromptPayId(value: string) {
  return value.replace(/\D/g, "");
}

export function isValidPromptPayId(value: string) {
  const normalized = normalizePromptPayId(value);
  return normalized.length === 10 || normalized.length === 13;
}

export function maskPromptPayId(value: string) {
  const normalized = normalizePromptPayId(value);
  if (normalized.length === 10) return `${normalized.slice(0, 3)}-xxx-${normalized.slice(-4)}`;
  if (normalized.length === 13) return `x-xxxx-xxxxx-${normalized.slice(-3)}`;
  return "";
}

export function buildPromptPayPayload(promptPayId: string, amountSatang: number) {
  const normalized = normalizePromptPayId(promptPayId);
  if (!isValidPromptPayId(normalized)) return "";
  if (!Number.isInteger(amountSatang) || amountSatang <= 0) return "";

  const proxy = normalized.length === 10
    ? field("01", `0066${normalized.slice(1)}`)
    : field("02", normalized);
  const merchantAccount = field("00", "A000000677010111") + proxy;
  const amount = (amountSatang / 100).toFixed(2);
  const payloadWithoutCrc = [
    field("00", "01"),
    field("01", "12"),
    field("29", merchantAccount),
    field("53", "764"),
    field("54", amount),
    field("58", "TH"),
    "6304",
  ].join("");
  return `${payloadWithoutCrc}${crc16(payloadWithoutCrc)}`;
}

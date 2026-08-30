import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

function secret(): string {
  return process.env.VERIFICATION_CODE_SECRET ?? process.env.JWT_SECRET ?? 'LOCAL_DEV_VERIFICATION_SECRET';
}

export function generateVerificationCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

export function hashVerificationCode(code: string): string {
  return createHmac('sha256', secret()).update(code).digest('hex');
}

export function verifyCodeHash(code: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashVerificationCode(code), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

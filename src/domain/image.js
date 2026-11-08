import { randomUUID } from 'node:crypto';
import { ValidationError } from './errors.js';

export const MAX_IMAGE_BYTES = 450 * 1024;
const DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/;
const SIGNATURES = {
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) => b.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])),
  'image/webp': (b) => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP',
};

/** Valida um data URL (JPEG, PNG ou WebP até 450 KB) conferindo o tipo declarado e os bytes reais do arquivo. */
export function parseImage(input) {
  const invalid = new ValidationError('Imagem inválida. Use JPG, PNG ou WebP de até 450 KB.', { data: 'Imagem inválida.' });
  const match = DATA_URL.exec(String(input?.data ?? ''));
  if (!match) throw invalid;
  const data = Buffer.from(match[2], 'base64');
  if (!data.length || data.length > MAX_IMAGE_BYTES || !SIGNATURES[match[1]](data)) throw invalid;
  return { id: randomUUID(), mime: match[1], data, createdAt: new Date().toISOString() };
}

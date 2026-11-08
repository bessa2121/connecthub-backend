import { createHash } from 'node:crypto';
import { NotFoundError, ValidationError } from '../domain/errors.js';
import { parseImage } from '../domain/image.js';
import { imageIdOf } from '../domain/shared.js';

export function createImageUseCases({ images }) {
  return {
    async upload(userId, body) {
      const image = parseImage(body);
      await images.add({ ...image, ownerId: userId });
      return { id: image.id, url: `/api/images/${image.id}` };
    },
    async get(id) {
      const image = imageIdOf(`/api/images/${id}`) && (await images.find(id.toLowerCase()));
      if (!image) throw new NotFoundError('Imagem não encontrada.');
      // O id é único por upload (conteúdo imutável), então o ETag pode ser derivado dele.
      return { mime: image.mime, data: image.data, etag: `"${createHash('sha1').update(image.id).digest('base64url').slice(0, 20)}"` };
    },
  };
}

/** Regras compartilhadas por perfil e projetos: só usar imagens enviadas pelo próprio usuário e limpar as substituídas. */
export function createImageGuard({ images }) {
  return {
    async check(ref, userId, current, field) {
      if (!ref || ref === current) return;
      const meta = await images.meta(imageIdOf(ref));
      if (!meta || meta.ownerId !== userId) throw new ValidationError('Verifique os campos.', { [field]: 'Imagem não encontrada. Envie novamente.' });
    },
    async discard(previous, next) {
      const id = previous && previous !== next ? imageIdOf(previous) : null;
      if (id) await images.remove(id);
    },
  };
}

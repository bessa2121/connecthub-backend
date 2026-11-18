import { ConflictError, ValidationError } from './errors.js';
import { clean } from './shared.js';

// Ciclo de vida de uma solicitação/autorização de cadastro.
export const STATUS = Object.freeze({ PENDING: 'PENDING', APPROVED: 'APPROVED', REJECTED: 'REJECTED', USED: 'USED', REVOKED: 'REVOKED' });
export const STATUSES = Object.values(STATUS);

// O código institucional só IDENTIFICA a escola; não é senha nem token.
export const INSTITUTIONS = Object.freeze({ '012': 'ETEC Professor Camargo Aranha' });

export const ROLES = Object.freeze({ STUDENT: 'STUDENT', ADMIN: 'ADMIN' });
export const USER_STATUS = Object.freeze({ ACTIVE: 'ACTIVE', SUSPENDED: 'SUSPENDED' });

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const normalizeEmail = (value) => clean(value).toLowerCase();
export const isEmail = (email) => email.length <= 120 && EMAIL.test(email);
export const isUuid = (value) => UUID.test(String(value ?? ''));

const TRANSITIONS = {
  approve: { from: STATUS.PENDING, to: STATUS.APPROVED },
  reject: { from: STATUS.PENDING, to: STATUS.REJECTED },
  revoke: { from: STATUS.APPROVED, to: STATUS.REVOKED },
  use: { from: STATUS.APPROVED, to: STATUS.USED },
};

/** Devolve o novo status ou lança 409 se a operação não é válida a partir do status atual. */
export function transition(current, action) {
  const rule = TRANSITIONS[action];
  if (!rule || rule.from !== current) throw new ConflictError(`Operação não permitida para uma solicitação com status ${current}.`);
  return rule.to;
}

/** Lê só os campos permitidos: qualquer "status" enviado pelo cliente é ignorado. */
export function parseAccessRequest(input) {
  const data = {
    name: clean(input.name).replace(/\s+/g, ' '),
    email: normalizeEmail(input.email),
    institution: clean(input.institution),
  };
  const confirmation = normalizeEmail(input.emailConfirm);
  const errors = {};
  if (data.name.length < 2 || data.name.length > 80) errors.name = 'Informe seu nome completo (2 a 80 caracteres).';
  if (!isEmail(data.email)) errors.email = 'E-mail inválido.';
  else if (confirmation !== data.email) errors.emailConfirm = 'Os e-mails não coincidem.';
  if (!Object.hasOwn(INSTITUTIONS, data.institution)) errors.institution = 'Selecione a instituição.';
  if (Object.keys(errors).length) throw new ValidationError('Verifique os campos.', errors);
  return data;
}

export class AppError extends Error {
  constructor(message, status = 500, details) { super(message); this.status = status; this.details = details; }
}
export class ValidationError extends AppError { constructor(m, d) { super(m, 400, d); } }
export class UnauthorizedError extends AppError { constructor(m = 'Faça login para continuar.') { super(m, 401); } }
export class ForbiddenError extends AppError { constructor(m = 'Você não tem permissão para isso.') { super(m, 403); } }
export class NotFoundError extends AppError { constructor(m = 'Não encontrado.') { super(m, 404); } }
export class ConflictError extends AppError { constructor(m) { super(m, 409); } }

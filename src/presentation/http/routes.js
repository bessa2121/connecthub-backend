import { Router, reply, binary } from './router.js';

const IMAGE_BODY_LIMIT = 700 * 1024; // data URL base64 de uma imagem de até 450 KB

export function buildRoutes({ auth, registration, admin, projects, community, images, ping }) {
  const r = new Router();
  r.add('GET', '/', () => ({ service: 'connecthub-api', version: '1.1.0', docs: 'docs/openapi.yaml' }));
  r.add('GET', '/api/health', async () => { await ping(); return { status: 'ok' }; });
  r.add('GET', '/api/meta', () => community.meta());

  const send = async (promise) => { const out = await promise; return reply(out.status, out.body); };
  r.add('POST', '/api/access-requests', ({ body }) => send(registration.requestAccess(body)));
  r.add('POST', '/api/auth/register', ({ body }) => send(registration.register(body)));
  r.add('POST', '/api/auth/verify-email', ({ body }) => registration.verifyEmail(body));
  r.add('POST', '/api/auth/resend-verification', ({ body }) => send(registration.resendVerification(body)));
  r.add('POST', '/api/auth/login', ({ body }) => auth.login(body));
  r.add('GET', '/api/auth/me', ({ user }) => auth.me(user.id), { auth: true });

  // Administração: o servidor exige perfil ADMIN (401 sem login, 403 para alunos).
  const a = { admin: true };
  r.add('GET', '/api/admin/summary', () => admin.summary(), a);
  r.add('GET', '/api/admin/access-requests', ({ query }) => admin.listRequests(query), a);
  r.add('GET', '/api/admin/access-requests/:id', ({ params }) => admin.getRequest(params.id), a);
  r.add('PATCH', '/api/admin/access-requests/:id/approve', ({ params, user }) => admin.approve(user.id, params.id), a);
  r.add('PATCH', '/api/admin/access-requests/:id/reject', ({ params, user }) => admin.reject(user.id, params.id), a);
  r.add('GET', '/api/admin/authorizations', ({ query }) => admin.listAuthorizations(query), a);
  r.add('PATCH', '/api/admin/authorizations/:id/revoke', ({ params, user }) => admin.revoke(user.id, params.id), a);
  r.add('GET', '/api/admin/users', ({ query }) => admin.listUsers(query), a);
  r.add('PATCH', '/api/admin/users/:id/suspend', ({ params, user }) => admin.suspendUser(user.id, params.id), a);
  r.add('PATCH', '/api/admin/users/:id/reactivate', ({ params, user }) => admin.reactivateUser(user.id, params.id), a);

  r.add('GET', '/api/projects', ({ query, user }) => projects.list(query, user?.id));
  r.add('POST', '/api/projects', async ({ body, user }) => reply(201, await projects.create(user.id, body)), { auth: true });
  r.add('GET', '/api/projects/:slug', ({ params, user }) => projects.get(params.slug, user?.id));
  r.add('PUT', '/api/projects/:slug', ({ params, body, user }) => projects.update(user.id, params.slug, body), { auth: true });
  r.add('DELETE', '/api/projects/:slug', async ({ params, user }) => { await projects.remove(user.id, params.slug); return reply(204); }, { auth: true });
  r.add('DELETE', '/api/projects/:slug/authors/me', async ({ params, user }) => { await projects.leave(user.id, params.slug); return reply(204); }, { auth: true });
  r.add('POST', '/api/projects/:slug/like', ({ params, user }) => projects.toggleLike(user.id, params.slug), { auth: true });

  r.add('GET', '/api/members', ({ query }) => community.list(query));
  r.add('GET', '/api/members/:slug', ({ params }) => community.get(params.slug));
  r.add('PUT', '/api/profile', ({ body, user }) => community.updateProfile(user.id, body), { auth: true });

  r.add('POST', '/api/images', async ({ body, user }) => reply(201, await images.upload(user.id, body)), { auth: true, bodyLimit: IMAGE_BODY_LIMIT });
  r.add('GET', '/api/images/:id', async ({ params }) => binary(await images.get(params.id)));
  return r;
}

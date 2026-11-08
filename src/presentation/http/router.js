export class Router {
  routes = [];
  /** options: auth (exige login) e bodyLimit (bytes aceitos no corpo; padrão 100 KB). */
  add(method, path, handler, { auth = false, bodyLimit } = {}) {
    const keys = [];
    const re = new RegExp(`^${path.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; })}/?$`);
    this.routes.push({ method, re, keys, handler, auth, bodyLimit });
    return this;
  }
  match(method, pathname) {
    for (const route of this.routes) {
      if (route.method !== method) continue;
      const m = route.re.exec(pathname);
      if (m) return { route, params: Object.fromEntries(route.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) };
    }
    return null;
  }
}
export const reply = (status, body) => ({ __reply: true, status, body });
export const binary = ({ mime, data, etag }) => ({ __binary: true, mime, data, etag });

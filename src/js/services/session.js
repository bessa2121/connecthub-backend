import { api, tokenStore } from './api.js';

const listeners = new Set();
export const session = {
  user: null,
  subscribe: (fn) => listeners.add(fn),
  emit: () => listeners.forEach((fn) => fn(session.user)),
  async restore() {
    if (tokenStore.get()) { try { session.user = await api.me(); } catch { tokenStore.clear(); } }
    session.emit();
  },
  start({ token, user }) { tokenStore.set(token); session.user = user; session.emit(); },
  setUser(user) { session.user = user; session.emit(); },
  end() { tokenStore.clear(); session.user = null; session.emit(); },
};

const KEY_PREFIX = 'readrot-key-';

export const KeyManager = {
  save(provider, key, persist = false) {
    const store = persist ? localStorage : sessionStorage;
    store.setItem(`${KEY_PREFIX}${provider}`, key);
    if (!persist) {
      localStorage.removeItem(`${KEY_PREFIX}${provider}`);
    }
  },

  get(provider) {
    return sessionStorage.getItem(`${KEY_PREFIX}${provider}`)
      || localStorage.getItem(`${KEY_PREFIX}${provider}`);
  },

  remove(provider) {
    sessionStorage.removeItem(`${KEY_PREFIX}${provider}`);
    localStorage.removeItem(`${KEY_PREFIX}${provider}`);
  },

  hasKey(provider) {
    return !!this.get(provider);
  },
};

export function removeAllKeys() {
  KeyManager.remove('gemini');
  KeyManager.remove('openai');
  KeyManager.remove('openrouter');
}

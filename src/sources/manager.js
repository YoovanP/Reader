import { SOURCE_PROVIDERS } from './providers.js';

export class SourceManager {
  static get Providers() {
    return SOURCE_PROVIDERS;
  }

  static getSearchUrl(providerId, query) {
    const provider = SOURCE_PROVIDERS.find(p => p.id === providerId);
    if (!provider) return null;
    
    // Check for direct redirect if the query is an identifier
    const id = this.detectIdentifier(query);
    if (id && provider.directUrl) {
      return provider.directUrl.replace('{id}', id);
    }

    return provider.url.replace('{query}', encodeURIComponent(query));
  }

  /**
   * Detects if a query is a specific identifier like ISBN, MD5, or Gutenberg ID.
   */
  static detectIdentifier(query) {
    const q = query.trim();
    
    // MD5 (32 hex characters)
    if (/^[a-fA-F0-9]{32}$/.test(q)) {
      return q.toLowerCase();
    }

    // ISBN-13 (13 digits, sometimes with hyphens)
    const isbn13 = q.replace(/-/g, '');
    if (/^\d{13}$/.test(isbn13)) {
      return isbn13;
    }

    // ISBN-10 (10 digits or 9 digits + X)
    if (/^\d{9}[\dXx]$/.test(q.replace(/-/g, ''))) {
      return q.replace(/-/g, '');
    }

    // Gutenberg ID (just numbers, but we only treat it as ID if it's small/simple)
    if (/^\d{1,6}$/.test(q)) {
      return q;
    }

    return null;
  }

  /**
   * Attempts to fetch a file from a direct URL.
   * This handles CORS by providing a warning if it fails.
   */
  static async fetchFromUrl(url) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      return await response.arrayBuffer();
    } catch (error) {
      console.error('Fetch from URL failed:', error);
      throw new Error('Could not fetch file directly. This is likely due to CORS restrictions on the source site.');
    }
  }
}

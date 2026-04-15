/**
 * Search provider configuration for ReadRot
 */
export const SOURCE_PROVIDERS = [
  {
    id: "gutenberg",
    name: "Project Gutenberg",
    url: "https://www.gutenberg.org/ebooks/search/?query={query}",
    categories: ["Public Domain", "Books", "Classics"],
    description: "Free public-domain ebooks.",
    color: "#6ec8c8",
    directUrl: "https://www.gutenberg.org/ebooks/{id}"
  },
  {
    id: "standard-ebooks",
    name: "Standard Ebooks",
    url: "https://standardebooks.org/ebooks?query={query}",
    categories: ["Public Domain", "Books", "EPUB"],
    description: "Carefully proofread public-domain ebook editions.",
    color: "#6ea7c8"
  },
  {
    id: "open-library",
    name: "Open Library",
    url: "https://openlibrary.org/search?q={query}",
    categories: ["Books", "Borrowing", "Catalog"],
    description: "Search and borrow books through Internet Archive partners.",
    color: "#8dc86e"
  },
  {
    id: "internet-archive",
    name: "Internet Archive",
    url: "https://archive.org/search?query={query}%20mediatype%3Atexts",
    categories: ["Books", "Texts", "Archive"],
    description: "Digitized texts and public collections.",
    color: "#a2a2a2"
  },
  {
    id: "unglueit",
    name: "Unglue.it",
    url: "https://unglue.it/search/?q={query}",
    categories: ["Open Access"],
    description: "Crowdfunded open access books.",
    color: "#c89b6e"
  },
  {
    id: "doab",
    name: "DOAB",
    url: "https://directory.doabooks.org/search?query={query}",
    categories: ["Open Access", "Academic", "Books"],
    description: "Directory of Open Access Books.",
    color: "#c89b6e"
  },
  {
    id: "librivox",
    name: "LibriVox",
    url: "https://librivox.org/search?title={query}",
    categories: ["Audiobooks", "Public Domain"],
    description: "Public-domain audiobooks read by volunteers.",
    color: "#9e80c8"
  },
  {
    id: "wikisource",
    name: "Wikisource",
    url: "https://en.wikisource.org/w/index.php?search={query}",
    categories: ["Public Domain", "Texts"],
    description: "Free-source historical texts and literature.",
    color: "#c8b26e"
  }
];

/**
 * Search provider configuration for ReadRot
 */
export const SOURCE_PROVIDERS = [
  {
    id: "annas-archive-gl",
    name: "Anna's Archive (.gl)",
    url: "https://annas-archive.gl/search?q={query}",
    categories: ["Books", "Comics", "Mirror"],
    description: "Greenland mirror for Anna's Archive.",
    color: "#6e8dc8",
    directUrl: "https://annas-archive.gl/md5/{id}"
  },
  {
    id: "annas-archive-pk",
    name: "Anna's Archive (.pk)",
    url: "https://annas-archive.pk/search?q={query}",
    categories: ["Books", "Comics", "Mirror"],
    description: "Pakistan mirror for Anna's Archive.",
    color: "#6e8dc8",
    directUrl: "https://annas-archive.pk/md5/{id}"
  },
  {
    id: "annas-archive-gd",
    name: "Anna's Archive (.gd)",
    url: "https://annas-archive.gd/search?q={query}",
    categories: ["Books", "Comics", "Mirror"],
    description: "Grenada mirror for Anna's Archive.",
    color: "#6e8dc8",
    directUrl: "https://annas-archive.gd/md5/{id}"
  },
  {
    id: "z-lib-gd",
    name: "Z-Library (.gd)",
    url: "https://z-lib.gd/s/{query}",
    categories: ["Books", "Comics"],
    description: "Z-Library Grenada mirror.",
    color: "#c86e6e"
  },
  {
    id: "z-library-sk",
    name: "Z-Library (.sk)",
    url: "https://z-library.sk/s/{query}",
    categories: ["Books", "Comics"],
    description: "Z-Library Slovakia mirror.",
    color: "#c86e6e"
  },
  {
    id: "1lib-sk",
    name: "1Lib (.sk)",
    url: "https://1lib.sk/s/{query}",
    categories: ["Books", "Comics"],
    description: "Z-Library/1Lib mirror.",
    color: "#c86e6e"
  },
  {
    id: "z-lib-fm",
    name: "Z-Library (.fm)",
    url: "https://z-lib.fm/s/{query}",
    categories: ["Books", "Comics"],
    description: "Z-Library FM mirror.",
    color: "#c86e6e"
  },
  {
    id: "articles-sk",
    name: "Z-Lib Articles (.sk)",
    url: "https://articles.sk/s/{query}",
    categories: ["Articles"],
    description: "Z-Library articles mirror.",
    color: "#c86e6e"
  },
  {
    id: "liber3",
    name: "Liber3 (IPFS)",
    url: "https://liber3.eth.limo/#/search?q={query}",
    categories: ["Books", "Decentralized", "IPFS"],
    description: "ENS/IPFS decentralized book search engine.",
    color: "#6e8dc8"
  },
  {
    id: "libgen",
    name: "Library Genesis",
    url: "https://libgen.is/search.php?req={query}",
    categories: ["Books", "Comics", "Manga", "Tools"],
    description: "Scientific papers, novels, and comics.",
    color: "#6ec86e",
    directUrl: "https://libgen.is/book/index.php?md5={id}"
  },
  {
    id: "mobilism",
    name: "Mobilism",
    url: "https://forum.mobilism.org/search.php?keywords={query}",
    categories: ["Books", "Audiobooks", "Magazines", "Newspapers", "Comics"],
    description: "Community forum for mobile content and books.",
    color: "#c8a96e"
  },
  {
    id: "myanonamouse",
    name: "MyAnonaMouse",
    url: "https://www.myanonamouse.net/tor/browse.php?searchText={query}",
    categories: ["Books", "Audiobooks", "Comics", "Sheet Music"],
    description: "Private tracker (Requires Invite).",
    color: "#a96ec8"
  },
  {
    id: "gutenberg",
    name: "Project Gutenberg",
    url: "https://www.gutenberg.org/ebooks/search/?query={query}",
    categories: ["Public Domain", "Historical", "Nonfiction"],
    description: "Free public domain ebooks.",
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
    id: "novel-fire",
    name: "NovelFire",
    url: "https://novelfire.net/search/{query}",
    categories: ["Online Reading", "Novels"],
    description: "Web novel reading platform.",
    color: "#e05c4b"
  },
  {
    id: "wuxia-click",
    name: "WuxiaClick",
    url: "https://wuxiaclick.com/search?keyword={query}",
    categories: ["Online Reading", "Wuxia"],
    description: "Wuxia and Xianxia novels.",
    color: "#f5f0e8"
  }
];

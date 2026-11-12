import Parser from 'rss-parser';

const parser = new Parser({
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'application/rss+xml, application/xml, text/xml, */*'
  },
  timeout: 10000
});

// Curated specialty feeds that can supplement search
export const CURATED_FEEDS = [
  { id: 'techcrunch', name: 'TechCrunch', category: 'Technology', url: 'https://techcrunch.com/feed/' },
  { id: 'arstechnica', name: 'Ars Technica', category: 'Technology', url: 'https://feeds.arstechnica.com/arstechnica/index' },
  { id: 'theverge', name: 'The Verge', category: 'Technology', url: 'https://www.theverge.com/rss/index.xml' },
  { id: 'bbc', name: 'BBC World News', category: 'World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
  { id: 'npr', name: 'NPR News', category: 'General', url: 'https://feeds.npr.org/1001/rss.xml' },
  { id: 'hackernews', name: 'Hacker News', category: 'Technology', url: 'https://news.ycombinator.com/rss' }
];

/**
 * Clean HTML strings into clean text
 */
function cleanText(text = '') {
  return text
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract publisher and clean title from Google News RSS formatted titles
 */
function parseTitleAndPublisher(rawTitle = '') {
  let title = rawTitle;
  let publisher = 'Unknown Source';

  // Google News titles usually end with " - Publisher Name"
  const dashIndex = rawTitle.lastIndexOf(' - ');
  if (dashIndex !== -1) {
    title = rawTitle.substring(0, dashIndex).trim();
    publisher = rawTitle.substring(dashIndex + 3).trim();
  }

  return { title, publisher };
}

/**
 * Fetch and parse a single RSS feed URL
 */
export async function fetchFeed(url, defaultSource = '') {
  try {
    const feed = await parser.parseURL(url);
    const feedTitle = feed.title || defaultSource || 'RSS Feed';

    const items = (feed.items || []).map((item, idx) => {
      const { title, publisher } = parseTitleAndPublisher(item.title);
      const cleanSnippet = cleanText(item.contentSnippet || item.content || item.summary || '');
      const pubDate = item.isoDate || item.pubDate || new Date().toISOString();

      return {
        id: item.guid || item.id || item.link || `${url}-${idx}`,
        title: title || 'Untitled',
        publisher: publisher !== 'Unknown Source' ? publisher : feedTitle,
        link: item.link || '',
        pubDate: pubDate,
        formattedDate: new Date(pubDate).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        }),
        snippet: cleanSnippet.slice(0, 400),
        feedOrigin: feedTitle
      };
    });

    return items;
  } catch (error) {
    console.warn(`Failed to fetch RSS from ${url}:`, error.message);
    return [];
  }
}

/**
 * Search RSS news by topic using Google News RSS + optional curated feeds
 * @param {string} topic Search topic/query
 * @param {Object} options Configuration options
 */
export async function searchNewsByTopic(topic, options = {}) {
  const limit = options.limit || 15;
  const customFeeds = options.customFeeds || [];
  const includeCurated = options.includeCurated !== false;

  const results = [];
  const query = topic.trim();

  // 1. Primary: Google News RSS for the specific topic
  // Note: if query is empty or 'latest', fetch top headlines
  let googleRssUrl;
  if (!query || query.toLowerCase() === 'latest' || query.toLowerCase() === 'top news') {
    googleRssUrl = 'https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en';
  } else {
    googleRssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  }

  const primaryPromise = fetchFeed(googleRssUrl, 'Google News');

  // 2. Secondary: If topic matches technology / science / world, check relevant curated feed in parallel
  const secondaryPromises = [];
  if (customFeeds && customFeeds.length > 0) {
    for (const feedUrl of customFeeds) {
      if (typeof feedUrl === 'string' && feedUrl.startsWith('http')) {
        secondaryPromises.push(fetchFeed(feedUrl, 'Custom Feed'));
      }
    }
  }

  const [primaryItems, ...secondaryItemsLists] = await Promise.all([
    primaryPromise,
    ...secondaryPromises
  ]);

  results.push(...primaryItems);
  for (const items of secondaryItemsLists) {
    results.push(...items);
  }

  // Deduplicate by URL and normalized title
  const seenUrls = new Set();
  const seenTitles = new Set();
  const uniqueArticles = [];

  for (const item of results) {
    if (!item.link || !item.title) continue;
    const normTitle = item.title.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (seenUrls.has(item.link) || seenTitles.has(normTitle)) continue;

    seenUrls.add(item.link);
    seenTitles.add(normTitle);
    uniqueArticles.push(item);
  }

  // Assign clean reference numbers [1], [2], [3]...
  const topArticles = uniqueArticles.slice(0, limit).map((article, index) => ({
    refIndex: index + 1,
    ...article
  }));

  return {
    topic: query || 'Top Stories',
    totalFound: uniqueArticles.length,
    articles: topArticles,
    queriedAt: new Date().toISOString()
  };
}

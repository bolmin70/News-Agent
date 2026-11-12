import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { searchNewsByTopic, CURATED_FEEDS } from './services/rssService.js';
import {
  PROVIDER_CONFIG,
  getAvailableProviders,
  streamNewsAnalysis
} from './services/llmService.js';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

/**
 * Health check & provider metadata
 */
app.get('/api/providers', (req, res) => {
  try {
    const providers = getAvailableProviders();
    res.json({
      status: 'ok',
      defaultProvider: process.env.DEFAULT_PROVIDER || 'claude',
      defaultModel: process.env.DEFAULT_MODEL || '',
      providers
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Available curated feeds
 */
app.get('/api/curated-feeds', (req, res) => {
  res.json({ feeds: CURATED_FEEDS });
});

/**
 * RSS Fetch only (fast preview without LLM synthesis)
 */
app.post('/api/news/search', async (req, res) => {
  try {
    const { topic = 'Technology', limit = 15, customFeeds = [] } = req.body;
    const data = await searchNewsByTopic(topic, { limit, customFeeds });
    res.json(data);
  } catch (error) {
    console.error('Error fetching RSS:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Full News Agent SSE Streaming Endpoint
 * Streams real-time pipeline progress:
 * 1. Fetching RSS
 * 2. Articles parsed
 * 3. LLM agent streaming generation
 * 4. Completed
 */
app.post('/api/agent/stream', async (req, res) => {
  const {
    topic = 'Artificial Intelligence',
    provider = 'claude',
    model = '',
    apiKey = '',
    limit = 12,
    customFeeds = []
  } = req.body;

  // Setup Server-Sent Events headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const sendEvent = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    // Stage 1: RSS Discovery
    sendEvent('status', {
      stage: 'rss_fetching',
      message: `Searching live RSS feeds for "${topic}"...`
    });

    const rssResult = await searchNewsByTopic(topic, { limit, customFeeds });
    const articles = rssResult.articles || [];

    if (articles.length === 0) {
      sendEvent('status', {
        stage: 'error',
        message: `No news articles found for "${topic}". Try a broader topic.`
      });
      res.write('event: done\ndata: {}\n\n');
      return res.end();
    }

    sendEvent('status', {
      stage: 'rss_completed',
      message: `Retrieved ${articles.length} verified news articles from RSS.`,
      articlesCount: articles.length,
      articles: articles
    });

    // Stage 2: LLM Synthesis
    const config = PROVIDER_CONFIG[provider] || PROVIDER_CONFIG.claude;
    const targetModel = model || config.defaultModel;

    sendEvent('status', {
      stage: 'llm_starting',
      provider: config.name,
      model: targetModel,
      message: `News Agent synthesizing intelligence using ${config.name} (${targetModel})...`
    });

    let fullAnalysis = '';
    await streamNewsAnalysis({
      topic,
      articles,
      provider,
      model: targetModel,
      apiKey,
      onChunk: (chunk) => {
        fullAnalysis += chunk;
        sendEvent('chunk', { text: chunk });
      }
    });

    // Stage 3: Finished
    sendEvent('done', {
      status: 'complete',
      topic,
      provider: config.name,
      model: targetModel,
      articlesCount: articles.length,
      fullAnalysis
    });

    res.end();
  } catch (error) {
    console.error('Agent stream error:', error);
    sendEvent('error', {
      message: error.message || 'An unexpected error occurred during analysis.'
    });
    res.end();
  }
});

// Fallback to index.html for SPA
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n=================================================`);
  console.log(`🚀 News Agent Server is active at: http://localhost:${PORT}`);
  console.log(`📡 RSS Feed Engine: Ready (Google News + Curated Feeds)`);
  console.log(`🤖 AI Providers: Claude (Anthropic), OpenAI, OpenRouter`);
  console.log(`=================================================\n`);
});

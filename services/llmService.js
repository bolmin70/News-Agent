import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

/**
 * Provider catalog with default models and display information
 */
export const PROVIDER_CONFIG = {
  claude: {
    id: 'claude',
    name: 'Anthropic Claude',
    envKey: 'ANTHROPIC_API_KEY',
    defaultModel: 'claude-3-5-sonnet-20241022',
    models: [
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet (Recommended)' },
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku (Fast & Crisp)' },
      { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus (Deep Reasoning)' }
    ]
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    envKey: 'OPENAI_API_KEY',
    defaultModel: 'gpt-4o',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o (Omni / Flagship)' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini (Fast & Efficient)' },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
      { id: 'o1-mini', name: 'o1 Mini (Reasoning)' }
    ]
  },
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    envKey: 'OPENROUTER_API_KEY',
    defaultModel: 'meta-llama/llama-3.3-70b-instruct',
    models: [
      { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B Instruct (Top Open Model)' },
      { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet (via OpenRouter)' },
      { id: 'openai/gpt-4o', name: 'GPT-4o (via OpenRouter)' },
      { id: 'deepseek/deepseek-chat', name: 'DeepSeek V3' },
      { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 Flash (Free Tier)' }
    ]
  }
};

/**
 * Formats the articles into structured prompt context
 */
function buildPromptContext(topic, articles) {
  const articlesList = articles.map(art => (
`[${art.refIndex}]
Title: ${art.title}
Source: ${art.publisher}
Date: ${art.formattedDate}
URL: ${art.link}
Summary: ${art.snippet || 'No summary available.'}`
  )).join('\n\n');

  const systemPrompt = `You are a world-class investigative news intelligence AI agent.
Your objective is to analyze real-time RSS news feeds on the requested topic and synthesize an insightful, verified, and comprehensive executive intelligence briefing.

CRITICAL CITATION RULES:
- Ground all facts in the provided RSS articles.
- When referencing facts, developments, or sources, you MUST use inline bracketed citations like [1], [2], or [1, 3] matching the article index.
- If contradictory viewpoints appear across sources, clearly contrast them.
- Maintain an objective, authoritative, and analytical tone.

STRUCTURE YOUR REPORT USING CLEAN GITHUB-STYLE MARKDOWN:
# 🌐 Intelligence Briefing: [Topic]

## ⚡ Executive Summary
A 2-3 paragraph synthesis summarizing the crux of current events, why this matters now, and the prevailing narrative.

## 📌 Key Developments & Breakthroughs
Bullet points detailing specific events, announcements, and factual milestones. Every point must include citation tags like [1] or [2].

## 🔍 Deep-Dive Analysis & Implications
Examine secondary impacts, geopolitical or market consequences, technological ripples, or future projections.

## ⚖️ Sentiment & Divergent Perspectives
Analyze how different stakeholders, media outlets, or industry figures view these developments.

## 📚 Cited Intelligence Sources
A structured table or list of sources cited, highlighting [Index] - Publisher - Headline summary.`;

  const userPrompt = `Topic to analyze: "${topic}"

Below are ${articles.length} real-time RSS news articles fetched just now:
========================================
${articlesList}
========================================

Please synthesize a complete, verified intelligence briefing following the requested structure.`;

  return { systemPrompt, userPrompt };
}

/**
 * Check which providers have API keys set in the server environment
 */
export function getAvailableProviders() {
  const providers = {};
  for (const [key, config] of Object.entries(PROVIDER_CONFIG)) {
    providers[key] = {
      ...config,
      hasServerKey: Boolean(process.env[config.envKey])
    };
  }
  return providers;
}

/**
 * Generate analysis using Anthropic Claude API
 */
async function streamClaude({ model, apiKey, systemPrompt, userPrompt, onChunk }) {
  const client = new Anthropic({ apiKey });
  const stream = await client.messages.create({
    model: model || PROVIDER_CONFIG.claude.defaultModel,
    max_tokens: 4000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
    stream: true
  });

  let fullText = '';
  for await (const chunk of stream) {
    if (chunk.type === 'content_block_delta' && chunk.delta?.text) {
      const text = chunk.delta.text;
      fullText += text;
      onChunk(text);
    }
  }
  return fullText;
}

/**
 * Generate analysis using OpenAI API
 */
async function streamOpenAI({ model, apiKey, systemPrompt, userPrompt, onChunk }) {
  const client = new OpenAI({ apiKey });
  const stream = await client.chat.completions.create({
    model: model || PROVIDER_CONFIG.openai.defaultModel,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    stream: true
  });

  let fullText = '';
  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content || '';
    if (text) {
      fullText += text;
      onChunk(text);
    }
  }
  return fullText;
}

/**
 * Generate analysis using OpenRouter API
 */
async function streamOpenRouter({ model, apiKey, systemPrompt, userPrompt, onChunk }) {
  const client = new OpenAI({
    apiKey: apiKey,
    baseURL: 'https://openrouter.ai/api/v1',
    defaultHeaders: {
      'HTTP-Referer': 'http://localhost:3000',
      'X-Title': 'News Agent LLM'
    }
  });

  const stream = await client.chat.completions.create({
    model: model || PROVIDER_CONFIG.openrouter.defaultModel,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    stream: true
  });

  let fullText = '';
  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content || '';
    if (text) {
      fullText += text;
      onChunk(text);
    }
  }
  return fullText;
}

/**
 * Simulated / Demo briefing generator when no API key is provided
 */
async function streamDemo({ topic, articles, onChunk }) {
  const intro = `# 🌐 Intelligence Briefing: ${topic} *(Demo Synthesis Mode)*\n\n> [!NOTE]\n> *Running in instant preview mode. Connect your Claude, OpenAI, or OpenRouter API key via the settings panel or server .env to run with live neural models.*\n\n## ⚡ Executive Summary\nReal-time analysis of current RSS signals indicates rapid developments surrounding **${topic}**. Analysis of **${articles.length} verified news feeds** highlights ongoing momentum across major publishers including ${[...new Set(articles.map(a => a.publisher))].slice(0, 4).join(', ')}.\n\nKey observers point to notable shifts in public discourse and operational activity, particularly around recent announcements captured across multiple independent outlets [1, 2].\n\n## 📌 Key Developments & Breakthroughs\n`;

  const bullets = articles.slice(0, 6).map((art, idx) => (
    `* **${art.publisher}**: ${art.title} [${art.refIndex}]. Reported on ${art.formattedDate}.\n`
  )).join('');

  const analysis = `\n## 🔍 Deep-Dive Analysis & Implications\n- **Strategic Trajectory**: Media coverage reflects concentrated reporting on emerging trends. The speed of updates indicates high public and institutional interest.\n- **Signal Consistency**: Across ${articles.length} independent feeds, reporting exhibits strong consensus on factual timelines, with divergence primarily on long-term implications.\n\n## ⚖️ Perspectives & Sentiment\nCoverage spans analytical breakdowns, official announcements, and investigative takes. Early reporting suggests cautious optimism alongside scrutiny of regulatory and economic impact.\n\n## 📚 Cited Intelligence Sources\n` +
  articles.slice(0, 8).map(art => `- **[${art.refIndex}]** [${art.publisher}] [${art.title}](${art.link})\n`).join('');

  const fullText = intro + bullets + analysis;

  // Stream in realistic chunks
  const chunkSize = 25;
  for (let i = 0; i < fullText.length; i += chunkSize) {
    const chunk = fullText.slice(i, i + chunkSize);
    onChunk(chunk);
    await new Promise(r => setTimeout(r, 20));
  }

  return fullText;
}

/**
 * Stream news synthesis from the requested provider
 */
export async function streamNewsAnalysis({
  topic,
  articles,
  provider = 'claude',
  model,
  apiKey,
  onChunk
}) {
  const config = PROVIDER_CONFIG[provider];
  if (!config) {
    throw new Error(`Unsupported provider: "${provider}". Must be one of: claude, openai, openrouter.`);
  }

  // Resolve API key (UI parameter takes precedence, then environment variable)
  const resolvedKey = (apiKey && apiKey.trim()) || process.env[config.envKey];

  if (!resolvedKey) {
    // If no key provided anywhere, fallback to high-quality demo mode with notification
    return await streamDemo({ topic, articles, onChunk });
  }

  const { systemPrompt, userPrompt } = buildPromptContext(topic, articles);
  const selectedModel = model || config.defaultModel;

  switch (provider) {
    case 'claude':
      return await streamClaude({ model: selectedModel, apiKey: resolvedKey, systemPrompt, userPrompt, onChunk });
    case 'openai':
      return await streamOpenAI({ model: selectedModel, apiKey: resolvedKey, systemPrompt, userPrompt, onChunk });
    case 'openrouter':
      return await streamOpenRouter({ model: selectedModel, apiKey: resolvedKey, systemPrompt, userPrompt, onChunk });
    default:
      throw new Error(`Provider handler not implemented for ${provider}`);
  }
}

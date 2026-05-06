import crypto from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  agentLinkModeValues,
  agentStatusValues,
  parseAgent,
  parseCreateAgentInput,
  parseCreateLinkInput
} from "../../../packages/shared/src/index.js";

export class AgentRuntime {
  constructor(env = process.env) {
    this.env = env;
  }

  async executeAgent(agent, messages) {
    switch (agent.provider) {
      case "openai":
        return await this.executeOpenAI(agent, messages);
      case "anthropic":
        return await this.executeAnthropic(agent, messages);
      case "ollama":
        return await this.executeOllama(agent, messages);
      case "ollama-cloud":
        return await this.executeOllamaCloud(agent, messages);
      case "z-ai":
        return await this.executeZAI(agent, messages);
      default:
        throw new Error(`Provider ${agent.provider} not yet implemented for runtime execution`);
    }
  }

  async executeOpenAI(agent, messages) {
    const apiKey = this.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY environment variable is required");
    }

    const url = "https://api.openai.com/v1/chat/completions";
    const body = {
      model: agent.model,
      messages: messages.map(msg => ({
        role: msg.role,
        content: msg.content
      })),
      temperature: 0.7,
      max_tokens: 2048
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return {
      content: data.choices[0]?.message?.content || "No response",
      usage: data.usage,
      timestamp: new Date().toISOString()
    };
  }

  async executeAnthropic(agent, messages) {
    const apiKey = this.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY environment variable is required");
    }

    const url = "https://api.anthropic.com/v1/messages";
    const body = {
      model: agent.model,
      max_tokens: 2048,
      messages: messages.map(msg => ({
        role: msg.role === "user" ? "user" : "assistant",
        content: msg.content
      }))
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return {
      content: data.content[0]?.text || "No response",
      usage: data.usage,
      timestamp: new Date().toISOString()
    };
  }

  async executeOllama(agent, messages) {
    const baseUrl = this.env.OLLAMA_BASE_URL;
    if (!baseUrl) {
      throw new Error("OLLAMA_BASE_URL environment variable is required");
    }

    const url = `${baseUrl}/api/chat`;
    const body = {
      model: agent.model,
      messages: messages.map(msg => ({
        role: msg.role,
        content: msg.content
      })),
      stream: false
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return {
      content: data.message || "No response",
      usage: { input_tokens: data.prompt_eval_count, output_tokens: data.eval_count },
      timestamp: new Date().toISOString()
    };
  }

  async executeOllamaCloud(agent, messages) {
    const apiKey = this.env.OLLAMA_CLOUD_API_KEY;
    if (!apiKey) {
      throw new Error("OLLAMA_CLOUD_API_KEY environment variable is required");
    }

    const baseUrl = this.env.OLLAMA_CLOUD_BASE_URL || "https://ollama.com";
    const url = `${baseUrl}/v1/chat/completions`;
    
    const body = {
      model: agent.model,
      messages: messages.map(msg => ({
        role: msg.role,
        content: msg.content
      })),
      stream: false
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      throw new Error(`Ollama Cloud API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return {
      content: data.choices[0]?.message?.content || "No response",
      usage: data.usage,
      timestamp: new Date().toISOString()
    };
  }

  async executeZAI(agent, messages) {
    const apiKey = this.env.ZAI_API_KEY;
    if (!apiKey) {
      throw new Error("ZAI_API_KEY environment variable is required");
    }

    const baseUrl = this.env.ZAI_BASE_URL || "https://api.z.ai";
    const url = `${baseUrl}/v1/chat/completions`;
    
    const body = {
      model: agent.model,
      messages: messages.map(msg => ({
        role: msg.role,
        content: msg.content
      })),
      stream: false,
      temperature: 0.7,
      max_tokens: 2048
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      throw new Error(`Z.AI API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return {
      content: data.choices[0]?.message?.content || "No response",
      usage: data.usage,
      timestamp: new Date().toISOString()
    };
  }

  async checkProviderHealth(providerId) {
    switch (providerId) {
      case "openai":
        return await this.checkOpenAIHealth();
      case "anthropic":
        return await this.checkAnthropicHealth();
      case "ollama":
        return await this.checkOllamaHealth();
      case "ollama-cloud":
        return await this.checkOllamaCloudHealth();
      case "z-ai":
        return await this.checkZAIHealth();
      default:
        return { healthy: false, error: `Provider ${providerId} health check not implemented` };
    }
  }

  async checkOpenAIHealth() {
    const apiKey = this.env.OPENAI_API_KEY;
    if (!apiKey) return { healthy: false, error: "OPENAI_API_KEY not configured" };

    try {
      const url = "https://api.openai.com/v1/models";
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${apiKey}`
        }
      });

      return { healthy: response.ok };
    } catch (error) {
      return { healthy: false, error: error.message };
    }
  }

  async checkAnthropicHealth() {
    const apiKey = this.env.ANTHROPIC_API_KEY;
    if (!apiKey) return { healthy: false, error: "ANTHROPIC_API_KEY not configured" };

    try {
      const url = "https://api.anthropic.com/v1/models";
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01"
        }
      });

      return { healthy: response.ok };
    } catch (error) {
      return { healthy: false, error: error.message };
    }
  }

  async checkOllamaHealth() {
    const baseUrl = this.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
    try {
      const url = `${baseUrl}/api/tags`;
      const response = await fetch(url);
      return { healthy: response.ok };
    } catch (error) {
      return { healthy: false, error: error.message };
    }
  }

  async checkOllamaCloudHealth() {
    const apiKey = this.env.OLLAMA_CLOUD_API_KEY;
    if (!apiKey) return { healthy: false, error: "OLLAMA_CLOUD_API_KEY not configured" };

    try {
      const baseUrl = this.env.OLLAMA_CLOUD_BASE_URL || "https://ollama.com";
      const url = `${baseUrl}/v1/models`;
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${apiKey}`
        }
      });

      return { healthy: response.ok };
    } catch (error) {
      return { healthy: false, error: error.message };
    }
  }

  async checkZAIHealth() {
    const apiKey = this.env.ZAI_API_KEY;
    if (!apiKey) return { healthy: false, error: "ZAI_API_KEY not configured" };

    try {
      const baseUrl = this.env.ZAI_BASE_URL || "https://api.z.ai";
      const url = `${baseUrl}/v1/models`;
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${apiKey}`
        }
      });

      return { healthy: response.ok };
    } catch (error) {
      return { healthy: false, error: error.message };
    }
  }

  /**
   * Fetch Reddit posts from specified subreddits
   * @param {string[]} subreddits - Array of subreddit names
   * @param {number} limit - Maximum number of posts per subreddit
   * @returns {Promise<Array>} Array of post objects
   */
  async fetchRedditContent(subreddits = ['technology', 'programming', 'science'], limit = 10) {
    const posts = [];
    
    for (const subreddit of subreddits) {
      try {
        // Use Reddit RSS feed as a simple API alternative
        const rssUrl = `https://www.reddit.com/r/${subreddit}/new/.rss?limit=${limit}`;
        const response = await fetch(rssUrl);
        
        if (!response.ok) {
          console.error(`Failed to fetch Reddit r/${subreddit}: ${response.status}`);
          continue;
        }
        
        // Parse RSS response (simple XML parsing)
        const text = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'text/xml');
        const items = doc.querySelectorAll('item');
        
        for (let i = 0; i < Math.min(limit, items.length); i++) {
          const item = items[i];
          const title = item.querySelector('title')?.textContent || '';
          const link = item.querySelector('link')?.textContent || '';
          const pubDate = item.querySelector('pubDate')?.textContent || '';
          const description = item.querySelector('description')?.textContent || '';
          
          posts.push({
            source: 'reddit',
            subreddit,
            title,
            url: link,
            publishedAt: new Date(pubDate).toISOString(),
            description,
            score: 0, // RSS doesn't provide score, would need API access
            comments: 0
          });
        }
      } catch (error) {
        console.error(`Error fetching Reddit r/${subreddit}:`, error.message);
      }
    }
    
    return posts.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
  }

  /**
   * Fetch YouTube videos from specified channels/search queries
   * @param {Array} sources - Array of channel names or search queries
   * @param {number} maxResults - Maximum number of videos per source
   * @returns {Promise<Array>} Array of video objects
   */
  async fetchYouTubeContent(sources = ['technology', 'programming'], maxResults = 10) {
    const videos = [];
    
    for (const source of sources) {
      try {
        // Use YouTube Data API (requires API key for production use)
        // For demo purposes, we'll use a mock response structure
        const mockVideos = await this.generateMockYouTubeVideos(source, maxResults);
        videos.push(...mockVideos);
      } catch (error) {
        console.error(`Error fetching YouTube content from ${source}:`, error.message);
      }
    }
    
    return videos.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
  }

  /**
   * Generate mock YouTube video data for demo purposes
   * In production, this would use YouTube Data API
   */
  async generateMockYouTubeVideos(topic, maxResults) {
    const mockTopics = {
      'technology': [
        { title: 'Latest AI Breakthrough 2026', views: '1.2M', duration: '15:42' },
        { title: 'Quantum Computing Explained', views: '890K', duration: '22:15' },
        { title: 'New Smartphone Technology', views: '2.1M', duration: '18:30' },
        { title: 'Cybersecurity Best Practices', views: '650K', duration: '12:08' }
      ],
      'programming': [
        { title: 'React 19 New Features Tutorial', views: '450K', duration: '25:10' },
        { title: 'Python Async Programming Deep Dive', views: '320K', duration: '30:45' },
        { title: 'JavaScript Performance Optimization', views: '280K', duration: '20:15' },
        { title: 'Building APIs with Node.js', views: '190K', duration: '35:20' }
      ],
      'science': [
        { title: 'Mars Mission Update 2026', views: '1.5M', duration: '28:30' },
        { title: 'Climate Change Research Findings', views: '720K', duration: '24:10' },
        { title: 'New Particle Discovery at CERN', views: '980K', duration: '32:45' }
      ]
    };
    
    const topicVideos = mockTopics[topic] || mockTopics['technology'];
    const now = new Date();
    
    return topicVideos.slice(0, maxResults).map((video, index) => ({
      source: 'youtube',
      topic,
      title: video.title,
      channel: `Tech Channel ${index + 1}`,
      videoId: `video-${topic}-${index + 1}`,
      url: `https://youtube.com/watch?v=video-${topic}-${index + 1}`,
      publishedAt: new Date(now.getTime() - (index + 1) * 24 * 60 * 60 * 1000).toISOString(),
      views: video.views,
      duration: video.duration,
      description: `Interesting video about ${topic}: ${video.title}`
    }));
  }

  /**
   * Generate a daily digest from Reddit and YouTube content
   * @param {Object} options - Configuration options
   * @returns {Promise<Object>} Digest object with formatted content
   */
  async generateDailyDigest(options = {}) {
    const {
      redditSubreddits = ['technology', 'programming', 'science'],
      youtubeTopics = ['technology', 'programming'],
      maxRedditPosts = 15,
      maxYouTubeVideos = 12,
      digestFormat = 'markdown'
    } = options;

    console.log('Generating daily digest...');
    
    // Fetch content from both sources
    const [redditPosts, youtubeVideos] = await Promise.all([
      this.fetchRedditContent(redditSubreddits, maxRedditPosts),
      this.fetchYouTubeContent(youtubeTopics, maxYouTubeVideos)
    ]);

    console.log(`Fetched ${redditPosts.length} Reddit posts and ${youtubeVideos.length} YouTube videos`);

    // Format the digest
    const digest = {
      generatedAt: new Date().toISOString(),
      reddit: {
        totalPosts: redditPosts.length,
        subreddits: redditSubreddits,
        posts: redditPosts.slice(0, 10) // Top 10 posts
      },
      youtube: {
        totalVideos: youtubeVideos.length,
        topics: youtubeTopics,
        videos: youtubeVideos.slice(0, 8) // Top 8 videos
      },
      summary: this.generateDigestSummary(redditPosts, youtubeVideos)
    };

    return digest;
  }

  /**
   * Generate a human-readable summary of the digest
   */
  generateDigestSummary(redditPosts, youtubeVideos) {
    const summary = {
      mostActiveSubreddit: '',
      topTrendingTopic: '',
      totalContentItems: redditPosts.length + youtubeVideos.length,
      timeRange: this.getTimeRange(redditPosts, youtubeVideos)
    };

    // Find most active subreddit
    const subredditCounts = {};
    redditPosts.forEach(post => {
      subredditCounts[post.subreddit] = (subredditCounts[post.subreddit] || 0) + 1;
    });
    
    summary.mostActiveSubreddit = Object.keys(subredditCounts).reduce((a, b) => 
      subredditCounts[a] > subredditCounts[b] ? a : b, '');

    // Simple trending topic detection
    const allTitles = [...redditPosts.map(p => p.title), ...youtubeVideos.map(v => v.title)];
    summary.topTrendingTopic = this.extractTrendingTopic(allTitles);

    return summary;
  }

  /**
   * Extract trending topic from titles (simple keyword frequency)
   */
  extractTrendingTopic(titles) {
    const wordCounts = {};
    
    titles.forEach(title => {
      const words = title.toLowerCase().split(/\s+/);
      words.forEach(word => {
        if (word.length > 3 && !['this', 'that', 'with', 'from', 'they', 'have', 'been', 'will', 'would'].includes(word)) {
          wordCounts[word] = (wordCounts[word] || 0) + 1;
        }
      });
    });
    
    return Object.entries(wordCounts).sort(([,a], [,b]) => b - a)[0]?.[0] || 'technology';
  }

  /**
   * Get time range of content
   */
  getTimeRange(redditPosts, youtubeVideos) {
    const allDates = [...redditPosts.map(p => p.publishedAt), ...youtubeVideos.map(v => v.publishedAt)];
    const sortedDates = allDates.sort();
    
    return {
      earliest: sortedDates[0],
      latest: sortedDates[sortedDates.length - 1],
      spanHours: sortedDates.length > 1 
        ? Math.round((new Date(sortedDates[sortedDates.length - 1]) - new Date(sortedDates[0])) / (1000 * 60 * 60))
        : 0
    };
  }

  /**
   * Format digest for different output formats
   */
  formatDigest(digest, format = 'markdown') {
    switch (format) {
      case 'markdown':
        return this.formatMarkdownDigest(digest);
      case 'html':
        return this.formatHTMLDigest(digest);
      case 'text':
        return this.formatTextDigest(digest);
      default:
        return JSON.stringify(digest, null, 2);
    }
  }

  /**
   * Format digest as Markdown
   */
  formatMarkdownDigest(digest) {
    const { reddit, youtube, summary } = digest;
    let output = `# 📰 Daily Tech Digest - ${new Date().toLocaleDateString()}\n\n`;
    output += `**Generated:** ${new Date(digest.generatedAt).toLocaleString()}\n\n`;
    output += `📊 **Summary:** ${summary.totalContentItems} items across ${reddit.posts.length + youtube.videos.length} sources\n`;
    output += `🔥 **Trending Topic:** ${summary.topTrendingTopic}\n`;
    output += `⏰ **Content Range:** ${summary.timeRange.spanHours} hours\n\n`;

    // Reddit Section
    if (reddit.posts.length > 0) {
      output += `## 🐦 Reddit (${reddit.totalPosts} posts)\n\n`;
      
      reddit.posts.forEach((post, index) => {
        output += `### ${index + 1}. r/${post.subreddit}\n\n`;
        output += `**${post.title}**\n\n`;
        output += `🔗 [View Post](${post.url})\n`;
        output += `⏰ ${new Date(post.publishedAt).toLocaleDateString()}\n\n`;
      });
    }

    // YouTube Section
    if (youtube.videos.length > 0) {
      output += `\n## 📺 YouTube (${youtube.totalVideos} videos)\n\n`;
      
      youtube.videos.forEach((video, index) => {
        output += `### ${index + 1}. ${video.title}\n\n`;
        output += `👥 ${video.channel} | 👀 ${video.views} views | ⏱️ ${video.duration}\n\n`;
        output += `🔗 [Watch Video](${video.url})\n`;
        output += `⏰ ${new Date(video.publishedAt).toLocaleDateString()}\n\n`;
      });
    }

    return output;
  }

  /**
   * Format digest as plain text
   */
  formatTextDigest(digest) {
    const { reddit, youtube, summary } = digest;
    let output = `DAILY TECH DIGEST - ${new Date().toLocaleDateString()}\n\n`;
    output += `Generated: ${new Date(digest.generatedAt).toLocaleString()}\n`;
    output += `Summary: ${summary.totalContentItems} items\n`;
    output += `Trending Topic: ${summary.topTrendingTopic}\n\n`;

    // Reddit Section
    if (reddit.posts.length > 0) {
      output += `REDDIT (${reddit.totalPosts} posts)\n`;
      output += '─'.repeat(40) + '\n';
      
      reddit.posts.forEach((post, index) => {
        output += `${index + 1}. r/${post.subreddit}: ${post.title}\n`;
        output += `   URL: ${post.url}\n`;
        output += `   Posted: ${new Date(post.publishedAt).toLocaleDateString()}\n\n`;
      });
    }

    // YouTube Section
    if (youtube.videos.length > 0) {
      output += `YOUTUBE (${youtube.totalVideos} videos)\n`;
      output += '─'.repeat(40) + '\n';
      
      youtube.videos.forEach((video, index) => {
        output += `${index + 1}. ${video.title}\n`;
        output += `   Channel: ${video.channel} | Views: ${video.views} | Duration: ${video.duration}\n`;
        output += `   URL: ${video.url}\n`;
        output += `   Posted: ${new Date(video.publishedAt).toLocaleDateString()}\n\n`;
      });
    }

    return output;
  }

  /**
   * Format digest as HTML
   */
  formatHTMLDigest(digest) {
    const { reddit, youtube, summary } = digest;
    let output = `<!DOCTYPE html>
<html>
<head>
  <title>Daily Tech Digest - ${new Date().toLocaleDateString()}</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
    .header { background: #f0f0f0; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
    .section { margin-bottom: 30px; }
    .reddit { border-left: 4px solid #ff4500; padding-left: 15px; }
    .youtube { border-left: 4px solid #ff0000; padding-left: 15px; }
    .item { margin-bottom: 15px; padding: 10px; background: #f9f9f9; border-radius: 4px; }
    .title { font-weight: bold; margin-bottom: 5px; }
    .meta { color: #666; font-size: 0.9em; }
    a { color: #0066cc; }
  </style>
</head>
<body>
  <div class="header">
    <h1>📰 Daily Tech Digest</h1>
    <p><strong>Generated:</strong> ${new Date(digest.generatedAt).toLocaleString()}</p>
    <p><strong>Summary:</strong> ${summary.totalContentItems} items across ${reddit.posts.length + youtube.videos.length} sources</p>
    <p><strong>Trending Topic:</strong> ${summary.topTrendingTopic}</p>
    <p><strong>Content Range:</strong> ${summary.timeRange.spanHours} hours</p>
  </div>

  ${reddit.posts.length > 0 ? `
  <div class="section reddit">
    <h2>🐦 Reddit (${reddit.totalPosts} posts)</h2>
    ${reddit.posts.map(post => `
      <div class="item">
        <div class="title">r/${post.subreddit}: ${post.title}</div>
        <div class="meta">
          <a href="${post.url}">View Post</a> | 
          Posted: ${new Date(post.publishedAt).toLocaleDateString()}
        </div>
      </div>
    `).join('')}
  </div>
  ` : ''}

  ${youtube.videos.length > 0 ? `
  <div class="section youtube">
    <h2>📺 YouTube (${youtube.totalVideos} videos)</h2>
    ${youtube.videos.map(video => `
      <div class="item">
        <div class="title">${video.title}</div>
        <div class="meta">
          ${video.channel} | 👀 ${video.views} views | ⏱️ ${video.duration} | 
          <a href="${video.url}">Watch Video</a>
        </div>
        <div class="meta">Posted: ${new Date(video.publishedAt).toLocaleDateString()}</div>
      </div>
    `).join('')}
  </div>
  ` : ''}

</body>
</html>`;

    return output;
  }
}
import { strictEqual } from "node:assert";
import { test } from "node:test";

import { AgentRuntime } from "./runtime.js";

test("AgentRuntime can generate daily digest", async () => {
  const runtime = new AgentRuntime();
  
  const digest = await runtime.generateDailyDigest({
    redditSubreddits: ['technology', 'programming'],
    youtubeTopics: ['technology'],
    maxRedditPosts: 5,
    maxYouTubeVideos: 3
  });
  
  strictEqual(typeof digest, "object");
  strictEqual(digest.generatedAt, new Date(digest.generatedAt).toISOString());
  strictEqual(digest.reddit.totalPosts, 5);
  strictEqual(digest.youtube.totalVideos, 3);
  strictEqual(digest.reddit.posts.length, 5);
  strictEqual(digest.youtube.videos.length, 3);
  strictEqual(typeof digest.summary, "object");
});

test("AgentRuntime can format digest as markdown", async () => {
  const runtime = new AgentRuntime();
  
  const digest = await runtime.generateDailyDigest({
    redditSubreddits: ['technology'],
    youtubeTopics: ['technology'],
    maxRedditPosts: 2,
    maxYouTubeVideos: 1
  });
  
  const markdown = runtime.formatDigest(digest, 'markdown');
  strictEqual(typeof markdown, "string");
  strictEqual(markdown.includes('# 📰 Daily Tech Digest'), true);
  strictEqual(markdown.includes('## 🐦 Reddit'), true);
  strictEqual(markdown.includes('## 📺 YouTube'), true);
});

test("AgentRuntime can format digest as text", async () => {
  const runtime = new AgentRuntime();
  
  const digest = await runtime.generateDailyDigest({
    redditSubreddits: ['programming'],
    youtubeTopics: ['programming'],
    maxRedditPosts: 1,
    maxYouTubeVideos: 1
  });
  
  const text = runtime.formatDigest(digest, 'text');
  strictEqual(typeof text, "string");
  strictEqual(text.includes('DAILY TECH DIGEST'), true);
  strictEqual(text.includes('REDDIT (1 posts)'), true);
  strictEqual(text.includes('YOUTUBE (1 videos)'), true);
});

test("AgentRuntime can format digest as HTML", async () => {
  const runtime = new AgentRuntime();
  
  const digest = await runtime.generateDailyDigest({
    redditSubreddits: ['science'],
    youtubeTopics: ['science'],
    maxRedditPosts: 1,
    maxYouTubeVideos: 1
  });
  
  const html = runtime.formatDigest(digest, 'html');
  strictEqual(typeof html, "string");
  strictEqual(html.includes('<!DOCTYPE html>'), true);
  strictEqual(html.includes('<title>Daily Tech Digest'), true);
  strictEqual(html.includes('🐦 Reddit'), true);
  strictEqual(html.includes('📺 YouTube'), true);
});

test("AgentRuntime can extract trending topics", () => {
  const runtime = new AgentRuntime();
  
  const titles = [
    "AI breakthrough 2026 new technology",
    "Machine learning algorithms explained",
    "Latest AI research findings 2026",
    "Programming with AI tools",
    "AI in everyday technology"
  ];
  
  const trending = runtime.extractTrendingTopic(titles);
  strictEqual(typeof trending, "string");
  strictEqual(trending.length > 0, true);
});

test("AgentRuntime can get time range", () => {
  const runtime = new AgentRuntime();
  
  const redditPosts = [
    { publishedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString() },
    { publishedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString() }
  ];
  
  const youtubeVideos = [
    { publishedAt: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString() }
  ];
  
  const timeRange = runtime.getTimeRange(redditPosts, youtubeVideos);
  strictEqual(typeof timeRange, "object");
  strictEqual(timeRange.earliest, redditPosts[0].publishedAt);
  strictEqual(timeRange.latest, youtubeVideos[0].publishedAt);
  strictEqual(timeRange.spanHours > 0, true);
});
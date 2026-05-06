import assert from "node:assert/strict";
import test from "node:test";

import { AgentRegistry } from "./registry.js";

const createRegistry = () => new AgentRegistry({ databasePath: ":memory:" });

test("creates and lists channels", () => {
  const registry = createRegistry();
  
  const telegramChannel = registry.createChannel({
    type: "telegram",
    name: "Telegram Bot",
    config: {
      botToken: "test-123",
      chatId: "12345"
    }
  });

  const discordChannel = registry.createChannel({
    type: "discord",
    name: "Discord Server",
    config: {
      webhookUrl: "https://discord.com/api/webhooks/test"
    }
  });

  const channels = registry.listChannels();
  assert.equal(channels.length, 2);
  assert.equal(channels[0].type, "telegram");
  assert.equal(channels[0].name, "Telegram Bot");
  assert.equal(channels[0].isActive, true);
  assert.equal(channels[1].type, "discord");
  assert.equal(channels[1].name, "Discord Server");
});

test("creates and retrieves individual channels", () => {
  const registry = createRegistry();
  
  const telegramChannel = registry.createChannel({
    type: "telegram",
    name: "Test Telegram",
    config: {
      botToken: "test-token",
      chatId: "12345"
    }
  });

  const retrieved = registry.getChannel(telegramChannel.id);
  assert.ok(retrieved);
  assert.equal(retrieved.id, telegramChannel.id);
  assert.equal(retrieved.type, "telegram");
  assert.equal(retrieved.name, "Test Telegram");
  assert.deepEqual(retrieved.config, { botToken: "test-token", chatId: "12345" });
});

test("updates channel properties", () => {
  const registry = createRegistry();
  
  const channel = registry.createChannel({
    type: "telegram",
    name: "Original Name",
    config: {
      botToken: "original-token",
      chatId: "12345"
    }
  });

  const updated = registry.updateChannel(channel.id, {
    name: "Updated Name",
    config: {
      botToken: "updated-token",
      chatId: "12345"
    }
  });

  assert.equal(updated.name, "Updated Name");
  assert.equal(updated.config.botToken, "updated-token");
});

test("deletes channels", () => {
  const registry = createRegistry();
  
  const channel = registry.createChannel({
    type: "telegram",
    name: "To Delete",
    config: {
      botToken: "delete-me",
      chatId: "12345"
    }
  });

  assert.equal(registry.listChannels().length, 1);
  
  registry.deleteChannel(channel.id);
  assert.equal(registry.listChannels().length, 0);
  
  assert.throws(
    () => registry.getChannel(channel.id),
    /Channel with id.*not found/
  );
});

test("creates and lists channel messages", () => {
  const registry = createRegistry();
  
  const channel = registry.createChannel({
    type: "telegram",
    name: "Test Channel",
    config: {
      botToken: "test-token",
      chatId: "12345"
    }
  });

  const message1 = registry.createChannelMessage({
    channelId: channel.id,
    agentId: "test-agent",
    content: "Hello from AI",
    direction: "outgoing"
  });

  const message2 = registry.createChannelMessage({
    channelId: channel.id,
    agentId: "test-agent",
    content: "User response",
    direction: "incoming"
  });

  const messages = registry.listChannelMessages(channel.id);
  assert.equal(messages.length, 2);
  assert.equal(messages[0].content, "Hello from AI");
  assert.equal(messages[0].direction, "outgoing");
  assert.equal(messages[1].content, "User response");
  assert.equal(messages[1].direction, "incoming");
});

test("validates channel types", () => {
  const registry = createRegistry();
  
  assert.throws(
    () => registry.createChannel({
      type: "invalid-type",
      name: "Invalid Channel",
      config: {}
    }),
    /Unknown channel type/
  );
});

test("validates required channel config fields", () => {
  const registry = createRegistry();
  
  assert.throws(
    () => registry.createChannel({
      type: "telegram",
      name: "Missing Config",
      config: {}
    }),
    /Missing required field 'botToken' for telegram channel/
  );
});

test("supports supported channel types", () => {
  const registry = createRegistry();
  
  const supportedTypes = ['telegram', 'discord', 'signal', 'whatsapp', 'email'];
  
  supportedTypes.forEach(type => {
    let channel;
    if (type === 'telegram') {
      channel = registry.createChannel({
        type,
        name: `${type} Channel`,
        config: {
          botToken: "test-token",
          chatId: "12345"
        }
      });
    } else if (type === 'discord') {
      channel = registry.createChannel({
        type,
        name: `${type} Channel`,
        config: {
          webhookUrl: "https://discord.com/api/webhooks/test"
        }
      });
    } else if (type === 'email') {
      channel = registry.createChannel({
        type,
        name: `${type} Channel`,
        config: {
          smtpHost: "smtp.test.com",
          smtpPort: 587,
          username: "test@test.com",
          password: "password"
        }
      });
    } else {
      // For signal and whatsapp, just create with minimal config
      channel = registry.createChannel({
        type,
        name: `${type} Channel`,
        config: {}
      });
    }
    
    assert.ok(channel, `Channel type ${type} should be supported`);
  });
});
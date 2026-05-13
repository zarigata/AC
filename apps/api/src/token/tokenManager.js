/**
 * Token Manager - Comprehensive token usage tracking and cost estimation
 */

import crypto from "node:crypto";

/**
 * Model pricing configuration (tokens per dollar)
 * Updated for Qwen 3.1 models and common OpenAI models
 */
const MODEL_PRICING = {
  // OpenAI models
  'gpt-4': { input: 0.00001, output: 0.00003 },    // $10 per 1M tokens
  'gpt-4-turbo': { input: 0.00001, output: 0.00003 }, // $10 per 1M tokens  
  'gpt-4o': { input: 0.0000025, output: 0.00001 },   // $2.5 per 1M tokens
  'gpt-4o-mini': { input: 0.00000015, output: 0.0000006 }, // $0.15 per 1M tokens
  'gpt-3.5-turbo': { input: 0.0000005, output: 0.0000015 }, // $0.5 per 1M tokens
  
  // Qwen models (local Ollama)
  'qwen3:1.7b': { input: 0.0000001, output: 0.0000002 },   // $0.1 per 1M tokens (very cheap for local)
  'qwen:7b': { input: 0.0000001, output: 0.0000002 },      // $0.1 per 1M tokens
  'qwen:14b': { input: 0.0000001, output: 0.0000002 },     // $0.1 per 1M tokens
  'qwen:72b': { input: 0.0000001, output: 0.0000002 },     // $0.1 per 1M tokens
  
  // Default fallback pricing
  'default': { input: 0.00001, output: 0.00003 }
};

/**
 * Simple token counter (fallback for models without exact token counts)
 * This is a rough approximation - real token counting should happen at the model level
 */
class SimpleTokenCounter {
  static countTokens(text) {
    if (!text || typeof text !== 'string') return 0;
    
    // Simple approximation: 4 characters per token on average
    const tokenCount = Math.ceil(text.length / 4);
    return Math.max(1, tokenCount); // At least 1 token
  }
}

/**
 * Enhanced token tracking with cost estimation
 */
export class TokenManager {
  constructor(registry) {
    this.registry = registry;
    this.pricing = MODEL_PRICING;
  }

  /**
   * Get token pricing for a model
   */
  getModelPricing(model) {
    return this.pricing[model] || this.pricing['default'];
  }

  /**
   * Calculate cost for given token counts and model
   */
  calculateCost(tokensIn, tokensOut, model = 'default') {
    const pricing = this.getModelPricing(model);
    const inputCost = (tokensIn * pricing.input);
    const outputCost = (tokensOut * pricing.output);
    return {
      inputCost,
      outputCost,
      totalCost: inputCost + outputCost
    };
  }

  /**
   * Process a message and update token tracking
   */
  async processMessage(message, model = null) {
    try {
      const { id, sessionId, role, content } = message;
      const modelToUse = model || (message.model || 'default');
      
      // Count tokens
      const tokensIn = this.countTokens(content);
      
      // For assistant responses, we'll calculate output tokens when we get the response
      let tokensOut = message.tokensOut || 0;
      
      // Update the message with token counts
      const updatedMessage = {
        ...message,
        tokensIn,
        tokensOut
      };
      
      // Save to database
      await this.saveMessageTokens(id, tokensIn, tokensOut);
      
      return {
        ...updatedMessage,
        cost: this.calculateCost(tokensIn, tokensOut, modelToUse)
      };
    } catch (error) {
      console.error('Error processing message tokens:', error);
      throw error;
    }
  }

  /**
   * Count tokens in text (using simple approximation as fallback)
   */
  countTokens(text) {
    return SimpleTokenCounter.countTokens(text);
  }

  /**
   * Save token counts to database
   */
  async saveMessageTokens(messageId, tokensIn, tokensOut) {
    try {
      const updateStmt = this.registry.db.prepare(
        "UPDATE messages SET tokensIn = ?, tokensOut = ? WHERE id = ?"
      );
      
      const result = updateStmt.run(tokensIn, tokensOut, messageId);
      
      if (result.changes === 0) {
        throw new Error(`Failed to update token counts for message ${messageId}`);
      }
    } catch (error) {
      console.error('Error saving message tokens:', error);
      throw error;
    }
  }

  /**
   * Get session token usage statistics
   */
  async getSessionUsage(sessionId) {
    try {
      const query = `
        SELECT 
          COUNT(*) as messageCount,
          SUM(CASE WHEN role = 'user' THEN tokensIn ELSE 0 END) as userTokensIn,
          SUM(CASE WHEN role = 'user' THEN tokensOut ELSE 0 END) as userTokensOut,
          SUM(CASE WHEN role = 'assistant' THEN tokensIn ELSE 0 END) as assistantTokensIn,
          SUM(CASE WHEN role = 'assistant' THEN tokensOut ELSE 0 END) as assistantTokensOut,
          SUM(tokensIn) as totalTokensIn,
          SUM(tokensOut) as totalTokensOut
        FROM messages 
        WHERE sessionId = ?
      `;
      
      const result = this.registry.db.prepare(query).get(sessionId);
      
      if (!result) {
        return null;
      }
      
      // Get model info for this session
      const sessionQuery = this.registry.db.prepare(
        "SELECT model, agentId FROM sessions WHERE id = ?"
      ).get(sessionId);
      
      if (!sessionQuery) {
        return null;
      }
      
      const model = sessionQuery.model;
      const cost = this.calculateCost(result.totalTokensIn, result.totalTokensOut, model);
      
      return {
        sessionId,
        messageCount: result.messageCount,
        tokens: {
          user: {
            input: result.userTokensIn || 0,
            output: result.userTokensOut || 0
          },
          assistant: {
            input: result.assistantTokensIn || 0,
            output: result.assistantTokensOut || 0
          },
          total: {
            input: result.totalTokensIn || 0,
            output: result.totalTokensOut || 0
          }
        },
        cost,
        model
      };
    } catch (error) {
      console.error('Error getting session usage:', error);
      throw error;
    }
  }

  /**
   * Get agent token usage statistics across all sessions
   */
  async getAgentUsage(agentId, timeRange = null) {
    try {
      let query = `
        SELECT 
          s.id as sessionId,
          s.title as sessionTitle,
          s.model,
          s.createdAt as sessionCreatedAt,
          COUNT(m.id) as messageCount,
          SUM(m.tokensIn) as sessionTokensIn,
          SUM(m.tokensOut) as sessionTokensOut
        FROM sessions s
        LEFT JOIN messages m ON s.id = m.sessionId
        WHERE s.agentId = ?
      `;
      
      const params = [agentId];
      
      if (timeRange) {
        const timeCondition = this.getTimeCondition(timeRange);
        query += ` AND ${timeCondition}`;
        params.push(...timeCondition.params);
      }
      
      query += ` GROUP BY s.id, s.title, s.model, s.createdAt ORDER BY s.createdAt DESC`;
      
      const sessions = this.registry.db.prepare(query).all(...params);
      
      let totalTokensIn = 0;
      let totalTokensOut = 0;
      let totalMessageCount = 0;
      let totalCost = 0;
      
      const sessionUsages = [];
      
      for (const session of sessions) {
        const sessionTokensIn = session.sessionTokensIn || 0;
        const sessionTokensOut = session.sessionTokensOut || 0;
        
        totalTokensIn += sessionTokensIn;
        totalTokensOut += sessionTokensOut;
        totalMessageCount += session.messageCount || 0;
        
        // Calculate session cost using the model from that session
        const sessionCost = this.calculateCost(sessionTokensIn, sessionTokensOut, session.model);
        totalCost += sessionCost.totalCost;
        
        sessionUsages.push({
          sessionId: session.sessionId,
          sessionTitle: session.sessionTitle,
          model: session.model,
          messageCount: session.messageCount || 0,
          tokensIn: sessionTokensIn,
          tokensOut: sessionTokensOut,
          cost: sessionCost
        });
      }
      
      // Get agent info
      const agent = this.registry.getAgent(agentId);
      
      // Overall agent cost
      const agentCost = this.calculateCost(totalTokensIn, totalTokensOut);
      
      return {
        agentId,
        agentName: agent ? agent.name : 'Unknown',
        summary: {
          totalSessions: sessions.length,
          totalMessages: totalMessageCount,
          totalTokensIn,
          totalTokensOut,
          estimatedTotalCost: agentCost.totalCost
        },
        sessions: sessionUsages,
        costBreakdown: {
          byModel: this.groupCostByModel(sessions),
          byRole: this.getRoleBreakdown(agentId, timeRange)
        }
      };
    } catch (error) {
      console.error('Error getting agent usage:', error);
      throw error;
    }
  }

  /**
   * Get token usage statistics for the entire system
   */
  async getSystemUsage(timeRange = null) {
    try {
      let query = `
        SELECT 
          a.id as agentId,
          a.name as agentName,
          COUNT(DISTINCT s.id) as sessionCount,
          COUNT(m.id) as messageCount,
          SUM(m.tokensIn) as totalTokensIn,
          SUM(m.tokensOut) as totalTokensOut
        FROM agents a
        LEFT JOIN sessions s ON a.id = s.agentId
        LEFT JOIN messages m ON s.id = m.sessionId
      `;
      
      const params = [];
      
      if (timeRange) {
        const timeCondition = this.getTimeCondition(timeRange);
        query += ` WHERE ${timeCondition}`;
        params.push(...timeCondition.params);
      }
      
      query += ` GROUP BY a.id, a.name ORDER BY totalTokensIn DESC`;
      
      const agentStats = this.registry.db.prepare(query).all(...params);
      
      let totalTokensIn = 0;
      let totalTokensOut = 0;
      let totalSessions = 0;
      let totalMessages = 0;
      let totalCost = 0;
      
      for (const agent of agentStats) {
        totalTokensIn += agent.totalTokensIn || 0;
        totalTokensOut += agent.totalTokensOut || 0;
        totalSessions += agent.sessionCount || 0;
        totalMessages += agent.messageCount || 0;
        
        const agentCost = this.calculateCost(agent.totalTokensIn || 0, agent.totalTokensOut || 0);
        totalCost += agentCost.totalCost;
        
        // Add cost to agent stats
        agent.cost = agentCost;
      }
      
      return {
        summary: {
          totalAgents: agentStats.length,
          totalSessions,
          totalMessages,
          totalTokensIn,
          totalTokensOut,
          estimatedTotalCost: totalCost
        },
        agents: agentStats
      };
    } catch (error) {
      console.error('Error getting system usage:', error);
      throw error;
    }
  }

  /**
   * Get usage statistics for a specific time range
   */
  async getUsageStats(timeRange = '7d') {
    try {
      const timeCondition = this.getTimeCondition(timeRange);
      
      // Daily breakdown
      const dailyQuery = `
        SELECT 
          DATE(m.createdAt) as date,
          COUNT(*) as messageCount,
          SUM(m.tokensIn) as tokensIn,
          SUM(m.tokensOut) as tokensOut
        FROM messages m
        ${timeCondition.where}
        GROUP BY DATE(m.createdAt)
        ORDER BY date DESC
      `;
      
      const dailyStats = this.registry.db.prepare(dailyQuery).all(...timeCondition.params);
      
      // Model distribution
      const modelQuery = `
        SELECT 
          s.model,
          COUNT(DISTINCT m.id) as messageCount,
          SUM(m.tokensIn) as tokensIn,
          SUM(m.tokensOut) as tokensOut
        FROM sessions s
        LEFT JOIN messages m ON s.id = m.sessionId
        ${timeCondition.where}
        GROUP BY s.model
        ORDER BY tokensIn DESC
      `;
      
      const modelStats = this.registry.db.prepare(modelQuery).all(...timeCondition.params);
      
      // Agent distribution
      const agentQuery = `
        SELECT 
          a.name as agentName,
          COUNT(DISTINCT s.id) as sessionCount,
          COUNT(m.id) as messageCount,
          SUM(m.tokensIn) as tokensIn,
          SUM(m.tokensOut) as tokensOut
        FROM agents a
        LEFT JOIN sessions s ON a.id = s.agentId
        LEFT JOIN messages m ON s.id = m.sessionId
        ${timeCondition.where}
        GROUP BY a.id, a.name
        ORDER BY tokensIn DESC
        LIMIT 10
      `;
      
      const agentStats = this.registry.db.prepare(agentQuery).all(...timeCondition.params);
      
      return {
        timeRange,
        daily: dailyStats,
        models: modelStats,
        agents: agentStats,
        summary: {
          totalMessages: dailyStats.reduce((sum, day) => sum + (day.messageCount || 0), 0),
          totalTokensIn: dailyStats.reduce((sum, day) => sum + (day.tokensIn || 0), 0),
          totalTokensOut: dailyStats.reduce((sum, day) => sum + (day.tokensOut || 0), 0)
        }
      };
    } catch (error) {
      console.error('Error getting usage stats:', error);
      throw error;
    }
  }

  /**
   * Helper to get SQL condition for time ranges
   */
  getTimeCondition(timeRange) {
    const now = new Date();
    let condition = '';
    let params = [];
    
    switch (timeRange) {
      case '1d':
        condition = 'm.createdAt >= datetime(?, "-1 day")';
        params = [now.toISOString()];
        break;
      case '7d':
        condition = 'm.createdAt >= datetime(?, "-7 days")';
        params = [now.toISOString()];
        break;
      case '30d':
        condition = 'm.createdAt >= datetime(?, "-30 days")';
        params = [now.toISOString()];
        break;
      case '90d':
        condition = 'm.createdAt >= datetime(?, "-90 days")';
        params = [now.toISOString()];
        break;
      default:
        condition = '1=1';
    }
    
    return { where: condition, params };
  }

  /**
   * Group costs by model
   */
  groupCostByModel(sessions) {
    const byModel = {};
    
    for (const session of sessions) {
      const model = session.model || 'unknown';
      if (!byModel[model]) {
        byModel[model] = {
          tokenCount: 0,
          messageCount: 0
        };
      }
      
      byModel[model].tokenCount += (session.sessionTokensIn || 0) + (session.sessionTokensOut || 0);
      byModel[model].messageCount += session.messageCount || 0;
    }
    
    // Calculate costs for each model
    for (const [model, stats] of Object.entries(byModel)) {
      const pricing = this.getModelPricing(model);
      const cost = this.calculateCost(stats.tokenCount * 0.5, stats.tokenCount * 0.5, model);
      byModel[model].cost = cost;
    }
    
    return byModel;
  }

  /**
   * Get token breakdown by role (user/assistant)
   */
  async getRoleBreakdown(agentId, timeRange = null) {
    try {
      let query = `
        SELECT 
          role,
          COUNT(*) as messageCount,
          SUM(tokensIn) as tokensIn,
          SUM(tokensOut) as tokensOut
        FROM messages m
        JOIN sessions s ON m.sessionId = s.id
        WHERE s.agentId = ?
      `;
      
      const params = [agentId];
      
      if (timeRange) {
        const timeCondition = this.getTimeCondition(timeRange);
        query += ` AND ${timeCondition}`;
        params.push(...timeCondition.params);
      }
      
      query += ` GROUP BY role`;
      
      const result = this.registry.db.prepare(query).all(...params);
      
      return result;
    } catch (error) {
      console.error('Error getting role breakdown:', error);
      throw error;
    }
  }

  /**
   * Reset token usage for debugging/testing
   */
  async resetTokenUsage(sessionId = null, messageId = null) {
    try {
      let query = "UPDATE messages SET tokensIn = 0, tokensOut = 0";
      const params = [];
      
      if (sessionId) {
        query += " WHERE sessionId = ?";
        params.push(sessionId);
      } else if (messageId) {
        query += " WHERE id = ?";
        params.push(messageId);
      }
      
      const result = this.registry.db.prepare(query).run(...params);
      
      return result.changes > 0;
    } catch (error) {
      console.error('Error resetting token usage:', error);
      throw error;
    }
  }
}

export default TokenManager;
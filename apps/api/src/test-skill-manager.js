/**
 * Skill Manager Test Suite
 * Tests the complete skill installation, management, and lifecycle system
 */

import { strict as assert } from 'node:assert';
import { describe, it, before, after } from 'node:test';

// Import our skill management system
const { createSkillManager } = await import('./skillManager.js');
const { validateSkillPackage, checkSkillCompatibility, defaultSkillTemplates } = await import('./schemas/skillSchema.js');

// Mock registry for testing
class MockRegistry {
  constructor() {
    this.agents = new Map();
  }

  async createAgent(agentData) {
    const agentId = `agent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const agent = {
      id: agentId,
      ...agentData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.agents.set(agentId, agent);
    return agent;
  }

  async deleteAgent(agentId) {
    if (this.agents.has(agentId)) {
      this.agents.delete(agentId);
      return true;
    }
    return false;
  }

  async getAgent(agentId) {
    return this.agents.get(agentId);
  }

  async listAgents() {
    return Array.from(this.agents.values());
  }

  async seed() {
    // Mock seeding
  }
}

describe('Skill Manager System', () => {
  let skillManager;
  let registry;

  before(async () => {
    // Create mock registry
    registry = new MockRegistry();
    
    // Create skill manager
    skillManager = createSkillManager(registry);
    await skillManager.initialize();
    
    // Clean up any existing skills
    await skillManager.clearAllSkills();
  });

  describe('Skill Validation', () => {
    it('should validate a properly formed skill package', () => {
      const skill = {
        name: 'test-skill',
        version: '1.0.0',
        description: 'A test skill for validation',
        author: { name: 'Test Author' },
        category: 'development',
        difficulty: 'intermediate',
        config: {
          agents: [
            {
              id: 'test-agent',
              name: 'Test Agent',
              description: 'A test agent',
              model: 'qwen3:1.7b',
              systemPrompt: 'You are a test agent'
            }
          ]
        }
      };

      const validation = validateSkillPackage(skill);
      assert.strictEqual(validation.isValid, true, 'Skill should be valid');
      assert.strictEqual(validation.errors.length, 0, 'Should have no validation errors');
    });

    it('should reject skill with invalid name', () => {
      const skill = {
        name: 'Invalid Skill Name', // Contains spaces and uppercase
        version: '1.0.0',
        description: 'A test skill with invalid name',
        author: { name: 'Test Author' },
        category: 'development'
      };

      const validation = validateSkillPackage(skill);
      assert.strictEqual(validation.isValid, false, 'Skill should be invalid');
      assert.ok(validation.errors.some(e => e.includes('Name must be lowercase')), 'Should name format error');
    });

    it('should reject skill with invalid version', () => {
      const skill = {
        name: 'test-skill',
        version: 'invalid-version', // Not semantic versioning
        description: 'A test skill with invalid version',
        author: { name: 'Test Author' },
        category: 'development'
      };

      const validation = validateSkillPackage(skill);
      assert.strictEqual(validation.isValid, false, 'Skill should be invalid');
      assert.ok(validation.errors.some(e => e.includes('Version must follow semantic versioning')), 'Should version format error');
    });

    it('should reject skill with missing required fields', () => {
      const skill = {
        name: 'test-skill',
        // Missing version, description, author
        category: 'development'
      };

      const validation = validateSkillPackage(skill);
      assert.strictEqual(validation.isValid, false, 'Skill should be invalid');
      assert.ok(validation.errors.some(e => e.includes('Version is required')), 'Should version required error');
      assert.ok(validation.errors.some(e => e.includes('Description is required')), 'Should description required error');
    });
  });

  describe('Skill Compatibility', () => {
    it('should check compatibility with current Zsiistant version', () => {
      const skill = {
        name: 'test-skill',
        version: '1.0.0',
        description: 'A test skill',
        author: { name: 'Test Author' },
        category: 'development',
        dependencies: {
          zsiistant: '1.0.0'
        }
      };

      const compatibility = checkSkillCompatibility(skill, '1.0.0');
      assert.strictEqual(compatibility.isCompatible, true, 'Skill should be compatible');
      assert.strictEqual(compatibility.errors.length, 0, 'Should have no compatibility errors');
    });

    it('should reject incompatible Zsiistant version', () => {
      const skill = {
        name: 'test-skill',
        version: '1.0.0',
        description: 'A test skill',
        author: { name: 'Test Author' },
        category: 'development',
        dependencies: {
          zsiistant: '2.0.0' // Major version mismatch
        }
      };

      const compatibility = checkSkillCompatibility(skill, '1.0.0');
      assert.strictEqual(compatibility.isCompatible, false, 'Skill should be incompatible');
      assert.ok(compatibility.errors.some(e => e.includes('Zsiistant version incompatible')), 'Should version incompatibility error');
    });
  });

  describe('Skill Installation', () => {
    it('should install a valid skill package', async () => {
      const skill = {
        name: 'test-install-skill',
        version: '1.0.0',
        description: 'A skill for testing installation',
        author: { name: 'Test Author' },
        category: 'development',
        difficulty: 'intermediate',
        dependencies: {
          zsiistant: '1.0.0',
          skills: [],
          tools: []
        },
        config: {
          agents: [
            {
              id: 'install-test-agent',
              name: 'Install Test Agent',
              description: 'A test agent for installation',
              model: 'qwen3:1.7b',
              systemPrompt: 'You are a test agent'
            }
          ]
        }
      };

      const result = await skillManager.installSkill(skill);
      assert.strictEqual(result.success, true, 'Skill installation should succeed');
      assert.strictEqual(result.skill.name, skill.name, 'Should return correct skill');
      assert.ok(result.installationId, 'Should generate installation ID');

      // Verify skill is in installed skills
      const installedSkills = await skillManager.getInstalledSkills();
      assert.ok(installedSkills.some(s => s.name === skill.name), 'Skill should be in installed list');
    });

    it('should reject installation of duplicate skill', async () => {
      // Install a skill first
      const skill = {
        name: 'duplicate-test-skill',
        version: '1.0.0',
        description: 'A skill for testing duplicate installation',
        author: { name: 'Test Author' },
        category: 'development',
        dependencies: {
          zsiistant: '1.0.0',
          skills: [],
          tools: []
        }
      };
      
      await skillManager.installSkill(skill);

      // Now try to install the same skill again
      await assert.rejects(
        () => skillManager.installSkill(skill),
        /is already installed/
      );
    });

    it('should allow installation with overwrite option', async () => {
      // Install a skill first
      const skill = {
        name: 'overwrite-test-skill',
        version: '1.0.0',
        description: 'Original skill',
        author: { name: 'Test Author' },
        category: 'development',
        dependencies: {
          zsiistant: '1.0.0',
          skills: [],
          tools: []
        }
      };
      
      await skillManager.installSkill(skill);

      // Now overwrite it with a different version
      const updatedSkill = {
        ...skill,
        version: '2.0.0',
        description: 'Updated skill'
      };

      const result = await skillManager.installSkill(updatedSkill, { overwrite: true });
      assert.strictEqual(result.success, true, 'Overwrite installation should succeed');
      assert.strictEqual(result.skill.version, '2.0.0', 'Should have new version');
    });
  });

  describe('Skill Management', () => {
    it('should get skill by name', async () => {
      const skillName = 'test-install-skill';
      const skill = await skillManager.getSkill(skillName);
      
      assert.strictEqual(skill.name, skillName, 'Should return correct skill');
      assert.ok(skill.installation, 'Should have installation info');
    });

    it('should list all skills with filtering', async () => {
      let skills = await skillManager.listSkills();
      assert.ok(skills.length > 0, 'Should have installed skills');

      const devSkills = await skillManager.listSkills({ category: 'development' });
      assert.ok(devSkills.every(s => s.category === 'development'), 'All skills should be development category');

      const installedSkills = await skillManager.listSkills({ installed: true });
      assert.ok(installedSkills.every(s => s.isInstalled), 'All skills should be installed');
    });

    it('should check skill dependencies', async () => {
      // Test with a skill that has dependencies
      const skillName = 'test-install-skill';
      const dependents = await skillManager.getSkillDependents(skillName);
      
      // Should return empty array for this test
      assert.ok(Array.isArray(dependents), 'Should return array of dependents');
    });
  });

  describe('Skill Uninstallation', () => {
    it('should uninstall a skill', async () => {
      const skillName = 'test-install-skill';
      
      const result = await skillManager.uninstallSkill(skillName);
      assert.strictEqual(result.success, true, 'Skill uninstallation should succeed');
      assert.strictEqual(result.skillName, skillName, 'Should return correct skill name');

      // Verify skill is no longer installed
      const installedSkills = await skillManager.getInstalledSkills();
      assert.ok(!installedSkills.some(s => s.name === skillName), 'Skill should not be in installed list');
    });

    it('should reject uninstallation of non-installed skill', async () => {
      await assert.rejects(
        () => skillManager.uninstallSkill('non-existent-skill'),
        /is not installed/
      );
    });
  });

  describe('Default Skills', () => {
    it('should install default skills', async () => {
      const initialCount = (await skillManager.getInstalledSkills()).length;
      
      await skillManager.installDefaultSkills();
      
      const newCount = (await skillManager.getInstalledSkills()).length;
      assert.ok(newCount > initialCount, 'Should have more skills after installing defaults');
    });

    it('should have correct default skill templates', () => {
      assert.ok(defaultSkillTemplates.length > 0, 'Should have default templates');
      assert.ok(defaultSkillTemplates.every(t => t.name && t.category && t.config), 'All templates should be valid');
    });
  });

  describe('Skill Statistics', () => {
    it('should provide skill statistics', async () => {
      const stats = await skillManager.getSkillStats();
      
      assert.ok(stats.totalSkills >= 0, 'Should have total skills count');
      assert.ok(stats.installedSkills >= 0, 'Should have installed skills count');
      assert.ok(stats.metrics, 'Should have performance metrics');
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid skill package gracefully', async () => {
      const invalidSkill = {
        name: 'invalid',
        // Missing required fields
      };

      await assert.rejects(
        () => skillManager.installSkill(invalidSkill),
        /Skill validation failed/
      );
    });

    it('should handle skill retrieval of non-existent skill', async () => {
      await assert.rejects(
        () => skillManager.getSkill('non-existent-skill'),
        /not found/
      );
    });
  });


});

// Run the tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  // Export for test runner
  module.exports = { 
    testSuite: 'Skill Manager System',
    validateSkillPackage,
    checkSkillCompatibility,
    defaultSkillTemplates
  };
}
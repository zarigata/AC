#!/usr/bin/env node

/**
 * Test script for validation middleware
 */

import { z } from "zod";
import { validateRequest } from "./apps/api/src/middleware/validationMiddleware.js";

// Test schemas
const testSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email().optional(),
});

// Test validation function
const testValidation = async () => {
  console.log("Testing validation middleware...");
  
  // Test valid data
  const validData = {
    name: "Test User",
    email: "test@example.com"
  };
  
  try {
    const validated = await testSchema.parseAsync(validData);
    console.log("✅ Valid data passed:", validated);
  } catch (error) {
    console.error("❌ Valid data failed:", error.message);
  }
  
  // Test invalid data (empty name)
  const invalidData = {
    name: "",
    email: "invalid-email"
  };
  
  try {
    const validated = await testSchema.parseAsync(invalidData);
    console.log("❌ Invalid data should have failed but passed:", validated);
  } catch (error) {
    console.log("✅ Invalid data correctly rejected:", error.errors);
  }
  
  // Test missing required field
  const missingData = {
    email: "test@example.com"
  };
  
  try {
    const validated = await testSchema.parseAsync(missingData);
    console.log("❌ Missing data should have failed but passed:", validated);
  } catch (error) {
    console.log("✅ Missing data correctly rejected:", error.errors);
  }
  
  console.log("Validation middleware tests completed!");
};

// Run tests
testValidation().catch(console.error);
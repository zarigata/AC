# Provider Rollout Plan

## Goal

Build a provider layer that can eventually support 50 LLM backends without turning setup into a mess.

## Hard product constraints

- Provider work must not undermine the small-factor and speed goals inspired by PicoClaw.
- Adapter design should avoid unnecessary token usage and default to conservative routing.
- The roadmap should continue drawing inspiration from real OpenClaw workflows and use cases, especially from the `awesome-openclaw-usecases` collection.

## First implementation phases

1. Land a provider catalog and public API shape.
2. Add adapter interfaces for chat, embeddings, streaming, tool-calling, and model listing.
3. Ship the first live adapters in this exact order:
   - Ollama
   - Ollama Cloud
   - Z.AI
   - Anthropic
   - OpenAI
4. Add routing, fallback, health checks, and credential validation.
5. Expand into the remaining planned providers in waves.

## Coding plan

1. Create a provider driver contract shared by all adapters:
   - provider metadata
   - credential shape
   - model listing
   - chat request and response
   - streaming hooks
   - health check result
2. Build the local-first adapters first:
   - `ollama`: local host support, model list, chat, health check
   - `ollama-cloud`: authenticated remote host support, model list, chat, health check
3. Build the third cloud target:
   - `z-ai`: API key config, model list placeholder contract, chat transport, health check
4. Add common validation:
   - required credentials
   - endpoint normalization
   - timeout defaults
   - retry and error mapping
   - token-usage budgeting hooks
   - lightweight model preference rules
5. Add adapter tests in the same order:
   - contract tests per provider
   - credential validation tests
   - health check parsing tests
   - routing eligibility tests
6. Expose provider state in the API and UI:
   - configured
   - healthy
   - available models
   - last check time
7. Add Anthropic after the first three are stable.
8. Add OpenAI after Anthropic is stable.
9. Continue through the remaining provider catalog in waves, grouped by protocol similarity.

## Current 50-provider target list

1. OpenAI
2. Azure OpenAI
3. Anthropic
4. Google Gemini
5. Vertex AI
6. AWS Bedrock
7. Mistral
8. Cohere
9. Groq
10. DeepSeek
11. xAI
12. Perplexity
13. Together AI
14. Fireworks AI
15. OpenRouter
16. Cerebras
17. SambaNova
18. Cloudflare Workers AI
19. Replicate
20. Hugging Face Inference
21. NVIDIA NIM
22. Lepton AI
23. Modal
24. Baseten
25. Anyscale
26. Databricks Model Serving
27. DeepInfra
28. Writer
29. AI21
30. Ollama
31. Ollama Cloud
32. LM Studio
33. vLLM
34. llama.cpp Server
35. LocalAI
36. Text Generation Web UI
37. KoboldCpp
38. Xinference
39. Jan
40. Z.AI
41. Moonshot AI
42. Baidu Qianfan
43. Alibaba DashScope
44. Tencent Hunyuan
45. MiniMax
46. 01.AI
47. Novita AI
48. Nebius AI Studio
49. Scaleway AI
50. Hyperbolic

## Order requested

1. Ollama
2. Ollama Cloud
3. Z.AI
4. Anthropic
5. OpenAI
6. Remaining providers after those five

## Notes

- Verified current targets from official docs on May 5, 2026:
  - Ollama local and Ollama Cloud
  - Z.AI
- The first three adapters should ship before attention moves to Anthropic and OpenAI.
- Token efficiency should be treated as a first-class design constraint, not a later optimization.

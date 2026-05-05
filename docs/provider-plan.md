# Provider Rollout Plan

## Goal

Build a provider layer that can eventually support 50 LLM backends without turning setup into a mess.

## First implementation phases

1. Land a provider catalog and public API shape.
2. Add adapter interfaces for chat, embeddings, streaming, tool-calling, and model listing.
3. Ship the first live adapters:
   - OpenAI
   - Anthropic
   - Ollama
   - Ollama Cloud
   - Z.AI
4. Add routing, fallback, health checks, and credential validation.
5. Expand into the remaining planned providers in waves.

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

## Notes

- Verified current targets from official docs on May 5, 2026:
  - Ollama local and Ollama Cloud
  - Z.AI
- The first five live adapters should be implemented before the broader matrix grows.

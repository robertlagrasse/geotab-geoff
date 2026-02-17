# Guides: Vibe Coding, Geotab Integration, and AI Pipeline Patterns

Practical guides from building [Geotab Geoff](https://github.com/robertlagrasse/geotab-geoff) — an AI fleet safety coaching platform built with Claude Code in 48 hours.

## Vibe Coding Process

| # | Guide | Summary |
|---|-------|---------|
| 1 | [The 18,920-Line First Commit](01-the-18920-line-first-commit.md) | How to prompt for a full-stack architecture in one shot — vision, tech stack, and data flow in a single prompt |
| 2 | [Steal From Another Industry](02-steal-from-another-industry.md) | A framework for AI product design: find a solved parallel, map the transformation, apply the pattern |
| 3 | [AI Evaluating AI](03-ai-evaluating-ai.md) | The gap analysis loop — have AI score your project against judging criteria, then close gaps systematically |
| 11 | [When to Correct the AI](11-when-to-correct-the-ai.md) | The human judgment layer — operational context, domain accuracy, meta-rules, and design taste |
| 12 | [Prompt to Multimedia in 5 Minutes](12-prompt-to-multimedia.md) | How composable AI pipelines turn a single prompt into finished multimedia |

## Architecture Patterns

| # | Guide | Summary |
|---|-------|---------|
| 4 | [The Server-Side Safety Net](04-server-side-safety-net.md) | Don't trust the model alone — separate detection from action, enforce consequences deterministically |
| 8 | [Cloud Run GPU on a Budget](08-cloud-run-gpu-on-a-budget.md) | Wav2Lip on NVIDIA L4 with scale-to-zero — ~$0.004 per inference, $0/month when idle |
| 9 | [The $0.05 Pipeline](09-the-five-cent-pipeline.md) | How to estimate per-unit costs for a multi-service AI pipeline and build a business case |

## Geotab-Specific

| # | Guide | Summary |
|---|-------|---------|
| 5 | [MyGeotab Add-In Gotchas](05-mygeotab-addin-gotchas.md) | 9 undocumented gotchas: CSS stripping, IIFE builds, session auth, IAM permissions, and more |
| 6 | [Ace AI Integration Patterns](06-ace-ai-integration.md) | The 3-step async API, feeding Ace context into coaching prompts, error handling |
| 7 | [OData Data Connector Cookbook](07-odata-data-connector.md) | Fleet analytics without the SDK — queries, aggregations, and dashboard recipes |

## Tools

| # | Guide | Summary |
|---|-------|---------|
| 10 | [MCP Server Patterns](10-mcp-server-patterns.md) | Wrapping APIs for Claude Desktop — FastMCP, tool design, lazy initialization, testing |

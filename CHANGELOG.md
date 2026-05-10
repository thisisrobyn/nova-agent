# Changelog

## [0.4.0](https://github.com/thisisrober/nova-agent/compare/v0.3.0...v0.4.0) (2026-05-10)


### Features

* add roadmap deps, structlog logging, correlation ID middleware, memory models and DB init (Phase 1-2) ([492f6bd](https://github.com/thisisrober/nova-agent/commit/492f6bdd562a13112a9a004ca456e0ab3d02f5c0))
* added landing page ([72812eb](https://github.com/thisisrober/nova-agent/commit/72812eb27257b2b6f9514d0f218b343f520f9457))
* **US1:** conversational memory - fact extraction, episodic memory, memory context injection, API routes and UI ([14cbfc0](https://github.com/thisisrober/nova-agent/commit/14cbfc08d95fbe1799a69d9c957d4e0f7f36d070))
* **US2:** RAG knowledge base - ChromaDB vector store, document ingestion, rag_search tool, API routes and UI ([95cb031](https://github.com/thisisrober/nova-agent/commit/95cb031baf3d245661c51a4cf0661af3ff16ac8c))
* **US3:** web search tool with Tavily primary and DuckDuckGo fallback ([9aa292e](https://github.com/thisisrober/nova-agent/commit/9aa292e05fa5f4ccd73b811b5fe23b9052bea4fa))
* **US4:** sandboxed Python code execution tool + register web_search and execute_python in agent graph ([e1d6a12](https://github.com/thisisrober/nova-agent/commit/e1d6a120a236d91efae9bcbba1dd5905455f72be))
* **US5:** professional landing page with docs, dynamic GitHub roadmap ([#6](https://github.com/thisisrober/nova-agent/issues/6)) ([86c997d](https://github.com/thisisrober/nova-agent/commit/86c997d9f16463a7280d4d8b6f2cdb362e1e907d)), closes [#5](https://github.com/thisisrober/nova-agent/issues/5)
* **US5:** scheduled tasks - APScheduler manager, CRUD API, execution logs, enhanced health endpoint, and scheduler UI ([795687f](https://github.com/thisisrober/nova-agent/commit/795687fd94840f0b5f5011e7778b1a079214b092))
* **US6:** intuitive scheduler form + comprehensive documentation for all capabilities ([96893b3](https://github.com/thisisrober/nova-agent/commit/96893b37093a74ed4f450e42978a313a9c2a5c70))


### Bug Fixes

* add error handling to API endpoints and migrate routes to structlog ([076808c](https://github.com/thisisrober/nova-agent/commit/076808ce13119c19dae53bebccf096f7fd9647d5))
* **ci:** update release-please workflow to trigger on main branch ([5d762a1](https://github.com/thisisrober/nova-agent/commit/5d762a16a54301505a8d838ef9ecfb5de6ff61c0))

## [0.3.0](https://github.com/thisisrober/nova-agent/compare/v0.2.0...v0.3.0) (2026-05-10)


### Features

* auth system (Cognito), user profiles, API keys, and GPU scaling ([170a582](https://github.com/thisisrober/nova-agent/commit/170a582045327d321b62ce32664d1689e429adfb))
* implemented history, folders, memory and tool for token count ([5b07129](https://github.com/thisisrober/nova-agent/commit/5b0712989c825035aa38d6fdb726c1254b9d90d1))
* migrate from OpenAI API keys to local Ollama LLM models ([d8f6bae](https://github.com/thisisrober/nova-agent/commit/d8f6bae2e80ba0c991bb73d0998c06b1b6cb4714))
* **ui:** complete hacker/terminal aesthetic redesign ([a05f588](https://github.com/thisisrober/nova-agent/commit/a05f588a9158326e905e34b3642ff6c7577290f4))


### Bug Fixes

* **k8s:** use actual ECR images and add imagePullPolicy Always ([48aa00e](https://github.com/thisisrober/nova-agent/commit/48aa00ec392e130200e80651892593c082b494b9))

## [0.2.0](https://github.com/thisisrober/nova-agent/compare/v0.1.0...v0.2.0) (2026-04-07)


### Features

* react UI, streaming, MCP client, runtime settings ([fd3de7b](https://github.com/thisisrober/nova-agent/commit/fd3de7b351f8e127b51bb4c51cdbb84c06ff5565))
* update tests and README ([789ca90](https://github.com/thisisrober/nova-agent/commit/789ca90bdcbf5c8d9c780ef904d776f1cfbc8c93))

## 0.1.0 (2026-03-07)


### Features

* add MCP server, Streamlit UI, tool modules, and full documentation ([9ac7f2b](https://github.com/thisisrober/nova-agent/commit/9ac7f2b82c2d468fbf952c5484a0fe3ecd2abf20))
* update README.md, added versioning ([ded1279](https://github.com/thisisrober/nova-agent/commit/ded127983aac7310d4ff51b9500ab235da5be181))

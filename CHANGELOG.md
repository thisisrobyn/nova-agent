# Changelog

## [0.9.0](https://github.com/nova-ai-sys/nova-agent/compare/v0.8.0...v0.9.0) (2026-08-21)


### Features

* changed to new rebrand ([#17](https://github.com/nova-ai-sys/nova-agent/issues/17)) ([78b2374](https://github.com/nova-ai-sys/nova-agent/commit/78b237455c545c2104ad49e5058dad8dbfe99f32))
* resolved snapshot build ci for roadmap and updated landing page ([769ed7d](https://github.com/nova-ai-sys/nova-agent/commit/769ed7d84c20c93f66443503d69bdf9322820919))

## [0.8.0](https://github.com/thisisrobyn/nova-agent/compare/v0.7.0...v0.8.0) (2026-08-04)


### Features

* **a2a:** A2A orchestrator — planner, executor, budgets and live run diagrams ([#15](https://github.com/thisisrobyn/nova-agent/issues/15)) ([6b14b36](https://github.com/thisisrobyn/nova-agent/commit/6b14b3619a98037774de86ce4dfe9bd61b3ef364))

## [0.7.0](https://github.com/thisisrobyn/nova-agent/compare/v0.6.0...v0.7.0) (2026-08-03)


### Features

* **mcp-connections:** added connections to Google, Microsoft and GitHub per user, improved provider selector and overall visibility of the application ([#13](https://github.com/thisisrobyn/nova-agent/issues/13)) ([270c15a](https://github.com/thisisrobyn/nova-agent/commit/270c15aebf8c352be7abbbc5c805ffe8570f28a4))
* updated landing page and documentation ([af91df1](https://github.com/thisisrobyn/nova-agent/commit/af91df19bada82f91824cc35effcaf0b5f2686c5))

## [0.6.0](https://github.com/thisisrobyn/nova-agent/compare/v0.5.0...v0.6.0) (2026-08-02)


### Features

* add multi-provider llm support with ollama openai and anthropic ([1507ddf](https://github.com/thisisrobyn/nova-agent/commit/1507ddf7ff06e340e24785a85d46a8b9f76a353e))
* add session listing and provider settings endpoints ([d43d74a](https://github.com/thisisrobyn/nova-agent/commit/d43d74ae5df51ff8322ca241b9a6f465fd65b9c2))
* add settings panel with language switcher and provider selection ([455083e](https://github.com/thisisrobyn/nova-agent/commit/455083e5fd9673bf5bb6438913ae73a7714101dc))
* auto-inject knowledge base context into agent turns ([77252e2](https://github.com/thisisrobyn/nova-agent/commit/77252e22e795127e381f46c553cd8b313e7bc2ce))
* translate scheduled tasks panel ([f095708](https://github.com/thisisrobyn/nova-agent/commit/f0957080376a46c7f9fb691ad7d9b2e32d6da1f3))
* unify memory and knowledge base into intelligence panel ([85511ad](https://github.com/thisisrobyn/nova-agent/commit/85511ad3be024da7fada79b47c1141f4ad20e60e))
* unify sidebar navigation with intelligence and settings ([7b0e7a7](https://github.com/thisisrobyn/nova-agent/commit/7b0e7a77979c624429bad016be61de311434d17d))


### Bug Fixes

* created snapshot for better view the roadmap on public landing page ([29fd688](https://github.com/thisisrobyn/nova-agent/commit/29fd688b4f5cdc7b858feff0e21967db9c1b314d))
* hide native scrollbar arrows across the ui ([280ed58](https://github.com/thisisrobyn/nova-agent/commit/280ed58908033795940a19c217e4083c6796197e))
* load chat history from disk and keep chat titles stable ([7b3b34d](https://github.com/thisisrobyn/nova-agent/commit/7b3b34d8c7dc7374d1f8bcac0509074c74a97d49))
* restore brand green scrollbar color and robustly hide arrows ([c507cc5](https://github.com/thisisrobyn/nova-agent/commit/c507cc5f9cb8881e05ec2d5a924cb6946e453a61))


### Documentation

* document data storage layout ([31e2755](https://github.com/thisisrobyn/nova-agent/commit/31e275541aaeec5eb9e04726ac2d1330a81ebda6))

## [0.5.0](https://github.com/thisisrobyn/nova-agent/compare/v0.4.0...v0.5.0) (2026-05-10)


### Features

* add deployment pipeline and nginx configs for portfolio integration ([dda3f18](https://github.com/thisisrobyn/nova-agent/commit/dda3f185c86da479e8f77cb7350f53f24d67be62))
* split prod (landing showcase) and dev (full chat app) modes ([fd65bdc](https://github.com/thisisrobyn/nova-agent/commit/fd65bdc655c92ecccefc60c6f9f86a527891bfcb))


### Bug Fixes

* production UI adjustments ([25ec476](https://github.com/thisisrobyn/nova-agent/commit/25ec476ddd2d26269b662c4ac3c69f63a018bbad))

## [0.4.0](https://github.com/thisisrobyn/nova-agent/compare/v0.3.0...v0.4.0) (2026-05-10)


### Features

* add roadmap deps, structlog logging, correlation ID middleware, memory models and DB init (Phase 1-2) ([492f6bd](https://github.com/thisisrobyn/nova-agent/commit/492f6bdd562a13112a9a004ca456e0ab3d02f5c0))
* added landing page ([72812eb](https://github.com/thisisrobyn/nova-agent/commit/72812eb27257b2b6f9514d0f218b343f520f9457))
* **US1:** conversational memory - fact extraction, episodic memory, memory context injection, API routes and UI ([14cbfc0](https://github.com/thisisrobyn/nova-agent/commit/14cbfc08d95fbe1799a69d9c957d4e0f7f36d070))
* **US2:** RAG knowledge base - ChromaDB vector store, document ingestion, rag_search tool, API routes and UI ([95cb031](https://github.com/thisisrobyn/nova-agent/commit/95cb031baf3d245661c51a4cf0661af3ff16ac8c))
* **US3:** web search tool with Tavily primary and DuckDuckGo fallback ([9aa292e](https://github.com/thisisrobyn/nova-agent/commit/9aa292e05fa5f4ccd73b811b5fe23b9052bea4fa))
* **US4:** sandboxed Python code execution tool + register web_search and execute_python in agent graph ([e1d6a12](https://github.com/thisisrobyn/nova-agent/commit/e1d6a120a236d91efae9bcbba1dd5905455f72be))
* **US5:** professional landing page with docs, dynamic GitHub roadmap ([#6](https://github.com/thisisrobyn/nova-agent/issues/6)) ([86c997d](https://github.com/thisisrobyn/nova-agent/commit/86c997d9f16463a7280d4d8b6f2cdb362e1e907d)), closes [#5](https://github.com/thisisrobyn/nova-agent/issues/5)
* **US5:** scheduled tasks - APScheduler manager, CRUD API, execution logs, enhanced health endpoint, and scheduler UI ([795687f](https://github.com/thisisrobyn/nova-agent/commit/795687fd94840f0b5f5011e7778b1a079214b092))
* **US6:** intuitive scheduler form + comprehensive documentation for all capabilities ([96893b3](https://github.com/thisisrobyn/nova-agent/commit/96893b37093a74ed4f450e42978a313a9c2a5c70))


### Bug Fixes

* add error handling to API endpoints and migrate routes to structlog ([076808c](https://github.com/thisisrobyn/nova-agent/commit/076808ce13119c19dae53bebccf096f7fd9647d5))
* **ci:** update release-please workflow to trigger on main branch ([5d762a1](https://github.com/thisisrobyn/nova-agent/commit/5d762a16a54301505a8d838ef9ecfb5de6ff61c0))

## [0.3.0](https://github.com/thisisrobyn/nova-agent/compare/v0.2.0...v0.3.0) (2026-05-10)


### Features

* auth system (Cognito), user profiles, API keys, and GPU scaling ([170a582](https://github.com/thisisrobyn/nova-agent/commit/170a582045327d321b62ce32664d1689e429adfb))
* implemented history, folders, memory and tool for token count ([5b07129](https://github.com/thisisrobyn/nova-agent/commit/5b0712989c825035aa38d6fdb726c1254b9d90d1))
* migrate from OpenAI API keys to local Ollama LLM models ([d8f6bae](https://github.com/thisisrobyn/nova-agent/commit/d8f6bae2e80ba0c991bb73d0998c06b1b6cb4714))
* **ui:** complete hacker/terminal aesthetic redesign ([a05f588](https://github.com/thisisrobyn/nova-agent/commit/a05f588a9158326e905e34b3642ff6c7577290f4))


### Bug Fixes

* **k8s:** use actual ECR images and add imagePullPolicy Always ([48aa00e](https://github.com/thisisrobyn/nova-agent/commit/48aa00ec392e130200e80651892593c082b494b9))

## [0.2.0](https://github.com/thisisrobyn/nova-agent/compare/v0.1.0...v0.2.0) (2026-04-07)


### Features

* react UI, streaming, MCP client, runtime settings ([fd3de7b](https://github.com/thisisrobyn/nova-agent/commit/fd3de7b351f8e127b51bb4c51cdbb84c06ff5565))
* update tests and README ([789ca90](https://github.com/thisisrobyn/nova-agent/commit/789ca90bdcbf5c8d9c780ef904d776f1cfbc8c93))

## 0.1.0 (2026-03-07)


### Features

* add MCP server, Streamlit UI, tool modules, and full documentation ([9ac7f2b](https://github.com/thisisrobyn/nova-agent/commit/9ac7f2b82c2d468fbf952c5484a0fe3ecd2abf20))
* update README.md, added versioning ([ded1279](https://github.com/thisisrobyn/nova-agent/commit/ded127983aac7310d4ff51b9500ab235da5be181))

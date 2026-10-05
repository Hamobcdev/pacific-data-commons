# PDC Monorepo — Operational Makefile
KV_NAMESPACE_ID := 69654f39fa1343b4a3595ca6aa1fa5c8

.PHONY: deploy-directory-api
deploy-directory-api:
	cd apps/directory-api && wrangler deploy

.PHONY: deploy-financial-rails
deploy-financial-rails:
	cd apps/financial-rails && wrangler deploy

.PHONY: deploy-all
deploy-all: deploy-directory-api deploy-financial-rails

.PHONY: kv-put
kv-put:
	cd apps/directory-api && wrangler kv key put "$(KEY)" \
		--namespace-id $(KV_NAMESPACE_ID) \
		--path ../../$(PATH) --remote

.PHONY: kv-get
kv-get:
	cd apps/directory-api && wrangler kv key get "$(KEY)" \
		--namespace-id $(KV_NAMESPACE_ID) --remote

.PHONY: kv-list
kv-list:
	cd apps/directory-api && wrangler kv key list \
		--namespace-id $(KV_NAMESPACE_ID) --remote

.PHONY: typecheck
typecheck:
	cd apps/directory-api && npx tsc --noEmit

.PHONY: set-secret
set-secret:
	cd apps/$(WORKER) && wrangler secret put $(NAME)

.PHONY: list-secrets
list-secrets:
	cd apps/$(WORKER) && wrangler secret list

.PHONY: tail-directory-api
tail-directory-api:
	cd apps/directory-api && wrangler tail

.PHONY: tail-financial-rails
tail-financial-rails:
	cd apps/financial-rails && wrangler tail

.PHONY: ingest-ibtracs
ingest-ibtracs:
	node scripts/preprocess-ibtracs.mjs

.PHONY: help
help:
	@echo "Deploy:      make deploy-directory-api | deploy-financial-rails | deploy-all"
	@echo "KV:          make kv-put KEY=x PATH=y | kv-get KEY=x | kv-list"
	@echo "Secrets:     make set-secret WORKER=x NAME=y | list-secrets WORKER=x"
	@echo "Logs:        make tail-directory-api | tail-financial-rails"
	@echo "Typecheck:   make typecheck"
	@echo "Data:        make ingest-ibtracs"

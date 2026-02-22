include common/Makefile

# Override update targets to bump version before building
update: bump-version build get-token
	@node ../common/update-extension.mjs

update-dev: bump-version build-dev get-token
	@node ../common/update-extension.mjs

bump-version:
	@node bump-version.mjs

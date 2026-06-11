GO ?= /usr/local/go/bin/go
PREFIX ?= $(HOME)/.local
BINDIR ?= $(PREFIX)/bin

.PHONY: build build-ui install clean dev demo

build-ui:
	cd frontend && npm install && npm run build

build: build-ui
	$(GO) build -o tfops ./cmd/tfops

install: build
	install -d $(BINDIR)
	install -m 0755 tfops $(BINDIR)/tfops

dev:
	cd frontend && npm run dev

demo: build
	TFOPS_CONFIG=./examples/sample-config.yaml ./tfops serve

clean:
	rm -f tfops
	rm -rf internal/web/dist frontend/node_modules

GO ?= /usr/local/go/bin/go
PREFIX ?= $(HOME)/.local
BINDIR ?= $(PREFIX)/bin

.PHONY: build build-ui install clean dev demo

build-ui:
	cd frontend && npm install && npm run build

build: build-ui
	$(GO) build -o tf9 ./cmd/tf9

install: build
	install -d $(BINDIR)
	install -m 0755 tf9 $(BINDIR)/tf9

dev:
	cd frontend && npm run dev

demo: build
	TF9_CONFIG=./examples/sample-config.yaml ./tf9 serve

clean:
	rm -f tf9
	rm -rf internal/web/dist frontend/node_modules

package mcp

import (
	"context"

	"github.com/andres/tf9/internal/config"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// Serve builds the access-gated MCP server and runs it over stdio until the
// context is cancelled or stdin closes.
func Serve(ctx context.Context, level string, client *Client) error {
	return NewServer(level, client).Run(ctx, &mcp.StdioTransport{})
}

// levelRank orders access levels so a tool is registered only when the
// configured level is at least the tool's minimum.
func levelRank(level string) int {
	switch level {
	case config.MCPAccessUnrestricted:
		return 2
	case config.MCPAccessPlan:
		return 1
	default: // readonly or unknown
		return 0
	}
}

// NewServer builds the MCP server, registering only the tools permitted at the
// given access level. Tools above the level are not registered at all, so the
// AI host never sees capabilities it may not use.
func NewServer(level string, client *Client) *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "tf9", Version: "1"}, nil)
	allowed := levelRank(level)
	for _, t := range tools(client) {
		if levelRank(t.minLevel) <= allowed {
			t.register(srv)
		}
	}
	return srv
}

// RegisteredToolNames returns the names of tools that would be exposed at the
// given access level. Used by tests to assert the gating matrix.
func RegisteredToolNames(level string) []string {
	allowed := levelRank(level)
	var names []string
	for _, t := range tools(nil) {
		if levelRank(t.minLevel) <= allowed {
			names = append(names, t.name)
		}
	}
	return names
}

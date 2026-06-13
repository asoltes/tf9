package graph

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestPlanAction(t *testing.T) {
	tests := []struct {
		actions []string
		want    Action
	}{
		{[]string{"no-op"}, ActionNone},
		{[]string{"create"}, ActionCreate},
		{[]string{"update"}, ActionUpdate},
		{[]string{"delete"}, ActionDelete},
		{[]string{"delete", "create"}, ActionReplace},
	}
	for _, tt := range tests {
		if got := planAction(tt.actions); got != tt.want {
			t.Errorf("planAction(%v) = %q, want %q", tt.actions, got, tt.want)
		}
	}
}

func TestExpressionReferencesFindsNestedReferences(t *testing.T) {
	raw := json.RawMessage(`{"references":["aws_vpc.main.id"],"nested":{"references":["data.aws_region.current.name"]}}`)
	got := expressionReferences(raw)
	if len(got) != 2 || got[0] != "aws_vpc.main.id" || got[1] != "data.aws_region.current.name" {
		t.Fatalf("references = %#v", got)
	}
}

func TestResourceResultBlocksKeepsExactTerraformBlock(t *testing.T) {
	output := "\x1b[31m  # terraform_data.target will be destroyed\x1b[0m\n" +
		"  - resource \"terraform_data\" \"target\" {\n" +
		"      - id = \"example-id\" -> null\n" +
		"    }\n\n" +
		"Plan: 0 to add, 0 to change, 1 to destroy.\n"
	blocks, actions := resourceResultBlocks(output)
	got := blocks["terraform_data.target"]
	if !strings.Contains(got, "# terraform_data.target will be destroyed") ||
		!strings.Contains(got, `- id = "example-id" -> null`) {
		t.Fatalf("block = %q", got)
	}
	if strings.Contains(got, "\x1b") || strings.Contains(got, "Plan:") {
		t.Fatalf("block contains control or summary text: %q", got)
	}
	if actions["terraform_data.target"] != ActionDelete {
		t.Fatalf("action = %q, want %q", actions["terraform_data.target"], ActionDelete)
	}
}

func TestExtractJSONSupportsStateAndOutputChanges(t *testing.T) {
	state := []byte(`{
		"values": {
			"root_module": {
				"resources": [
					{"address":"terraform_data.source","mode":"managed","type":"terraform_data","name":"source"},
					{"address":"terraform_data.target","mode":"managed","type":"terraform_data","name":"target","depends_on":["terraform_data.source"]}
				]
			}
		}
	}`)
	output := "  # terraform_data.target will be updated in-place\n" +
		"  ~ resource \"terraform_data\" \"target\" {\n" +
		"      ~ input = \"before\" -> \"after\"\n" +
		"    }\n"
	got, err := extractJSON(state, "infra", "platform", "dev", "terraform apply", output)
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Nodes) != 3 {
		t.Fatalf("nodes = %#v", got.Nodes)
	}
	var target Node
	for _, node := range got.Nodes {
		if node.Address == "terraform_data.target" {
			target = node
		}
	}
	if target.Action != ActionUpdate || target.Command != "terraform apply" || !strings.Contains(target.Result, "updated in-place") {
		t.Fatalf("target = %#v", target)
	}
	if len(got.Edges) != 1 {
		t.Fatalf("edges = %#v", got.Edges)
	}
}

func TestExtractJSONKeepsDestroyedResourceMissingFromState(t *testing.T) {
	output := "  # terraform_data.target will be destroyed\n" +
		"  - resource \"terraform_data\" \"target\" {\n" +
		"      - id = \"example\" -> null\n" +
		"    }\n"
	got, err := extractJSON([]byte(`{"values":{}}`), "infra", "platform", "dev", "terraform destroy", output)
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Nodes) != 2 {
		t.Fatalf("nodes = %#v", got.Nodes)
	}
	for _, node := range got.Nodes {
		if node.Address == "terraform_data.target" && node.Action != ActionDelete {
			t.Fatalf("destroyed node = %#v", node)
		}
	}
}

func TestSummarizeChangesReturnsPathsWithoutValues(t *testing.T) {
	before := map[string]any{
		"name":   "old",
		"tags":   map[string]any{"Environment": "dev"},
		"secret": "old-secret",
	}
	after := map[string]any{
		"name":   "new",
		"tags":   map[string]any{"Environment": "prod"},
		"secret": "new-secret",
		"arn":    nil,
	}
	details := summarizeChanges(
		before,
		after,
		nil,
		map[string]any{"secret": true},
		map[string]any{"arn": true},
		[][]any{{"name"}},
	)
	byPath := make(map[string]ChangeDetail)
	for _, detail := range details {
		byPath[detail.Path] = detail
	}
	if !byPath["name"].Replacement || byPath["name"].Kind != "updated" {
		t.Fatalf("name detail = %#v", byPath["name"])
	}
	if !byPath["secret"].Sensitive {
		t.Fatalf("secret detail = %#v", byPath["secret"])
	}
	if !byPath["arn"].Computed {
		t.Fatalf("arn detail = %#v", byPath["arn"])
	}
	if _, ok := byPath["tags.Environment"]; !ok {
		t.Fatalf("missing nested change: %#v", details)
	}
	data, err := json.Marshal(details)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(data), "old-secret") || strings.Contains(string(data), "new-secret") {
		t.Fatalf("change summary leaked values: %s", data)
	}
}

func TestSaveTargetReplacesOnlyMatchingTarget(t *testing.T) {
	path := filepath.Join(t.TempDir(), "run", "graph.json")
	dev := TargetGraph{Nodes: []Node{{ID: "target:dev:resource:aws_vpc.main", Target: "dev", Label: "aws_vpc.main"}}}
	prod := TargetGraph{Nodes: []Node{{ID: "target:prod:resource:aws_vpc.main", Target: "prod", Label: "aws_vpc.main"}}}
	if err := SaveTarget(path, "run-1", "infra", "platform", "dev", dev); err != nil {
		t.Fatal(err)
	}
	if err := SaveTarget(path, "run-1", "infra", "platform", "prod", prod); err != nil {
		t.Fatal(err)
	}
	dev.Nodes[0].Action = ActionUpdate
	if err := SaveTarget(path, "run-1", "infra", "platform", "dev", dev); err != nil {
		t.Fatal(err)
	}

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var doc Document
	if err := json.Unmarshal(data, &doc); err != nil {
		t.Fatal(err)
	}
	if doc.Revision != 3 || len(doc.Nodes) != 2 {
		t.Fatalf("document = %#v", doc)
	}
	for _, node := range doc.Nodes {
		if node.Target == "dev" && node.Action != ActionUpdate {
			t.Fatalf("dev action = %q", node.Action)
		}
	}
}

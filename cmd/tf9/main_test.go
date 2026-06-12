package main

import (
	"reflect"
	"testing"
)

func TestParseLockIDs(t *testing.T) {
	cases := []struct {
		in   string
		want map[string]string
	}{
		{"", nil},
		{"   ", nil},
		{"dev:abc", map[string]string{"dev": "abc"}},
		{"dev:abc,staging:def", map[string]string{"dev": "abc", "staging": "def"}},
		{" dev : abc , staging:def ", map[string]string{"dev": "abc", "staging": "def"}},
		// lock ids never contain colons, but be safe: split on first colon only.
		{"dev:a:b:c", map[string]string{"dev": "a:b:c"}},
		// malformed pairs (no colon, empty name) are skipped gracefully.
		{"dev:abc,garbage,:noname,empty:", map[string]string{"dev": "abc"}},
	}
	for _, tc := range cases {
		got := parseLockIDs(tc.in)
		if !reflect.DeepEqual(got, tc.want) {
			t.Errorf("parseLockIDs(%q) = %#v, want %#v", tc.in, got, tc.want)
		}
	}
}

func TestBreakingCommandTree(t *testing.T) {
	root := newRootCmd()
	for _, path := range [][]string{
		{"config", "repo", "list"},
		{"config", "target", "list"},
		{"serve"},
	} {
		if _, _, err := root.Find(path); err != nil {
			t.Fatalf("command %v missing: %v", path, err)
		}
	}
	for _, name := range []string{"list-repos", "add-env", "show-report", "drift", "lr", "le"} {
		if !removedCommands[name] {
			t.Fatalf("%s should be explicitly rejected", name)
		}
	}
}

func TestTerraformArgumentParsing(t *testing.T) {
	filter, args, err := splitTerraformArgs("plan", []string{"dev", "-refresh=false"}, "")
	if err != nil || filter != "dev" || len(args) != 1 || args[0] != "-refresh=false" {
		t.Fatalf("plan parsing: filter=%q args=%v err=%v", filter, args, err)
	}
	filter, args, err = splitTerraformArgs("state", []string{"list"}, "dev")
	if err != nil || filter != "dev" || len(args) != 1 || args[0] != "list" {
		t.Fatalf("state parsing: filter=%q args=%v err=%v", filter, args, err)
	}
	filter, args, err = splitTerraformArgs("force-unlock", []string{"lock-id"}, "")
	if err != nil || filter != "" || len(args) != 1 || args[0] != "lock-id" {
		t.Fatalf("force-unlock parsing: filter=%q args=%v err=%v", filter, args, err)
	}
}

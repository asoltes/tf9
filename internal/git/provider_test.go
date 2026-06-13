package git

import "testing"

func TestDetectProvider(t *testing.T) {
	cases := map[string]string{
		"git@github.com:org/repo.git":         "github",
		"https://github.com/org/repo.git":     "github",
		"git@gitlab.com:org/repo.git":         "gitlab",
		"https://gitlab.example.com/org/repo": "gitlab",
		"https://bitbucket.org/org/repo.git":  "git",
		"ssh://git@internal.example/org/repo": "git",
		"":                                    "git",
	}
	for url, want := range cases {
		if got := DetectProvider(url); got != want {
			t.Errorf("DetectProvider(%q) = %q, want %q", url, got, want)
		}
	}
}

package web

import (
	"embed"
	"io/fs"
	"net/http"
)

//go:embed dist
var staticFiles embed.FS

// StaticHandler returns an http.Handler that serves the built React frontend.
// All paths not matching a real file fall back to index.html for SPA routing.
func StaticHandler() http.Handler {
	distFS, err := fs.Sub(staticFiles, "dist")
	if err != nil {
		panic("web: dist not embedded: " + err.Error())
	}
	fileServer := http.FileServer(http.FS(distFS))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Try the file; fall back to index.html for client-side routing.
		f, err := distFS.Open(r.URL.Path[1:])
		if err == nil {
			f.Close()
			fileServer.ServeHTTP(w, r)
			return
		}
		// Serve index.html for any unmatched path so React can handle routing.
		r2 := *r
		r2.URL.Path = "/"
		fileServer.ServeHTTP(w, &r2)
	})
}

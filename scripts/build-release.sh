#!/usr/bin/env bash
set -euo pipefail

version="${1:?usage: build-release.sh <version>}"
version="${version#v}"
go_bin="${GO:-go}"
commit="$(git rev-parse --short=12 HEAD)"
build_date="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
dist_dir="${DIST_DIR:-dist}"

rm -rf "${dist_dir}"
mkdir -p "${dist_dir}"
dist_dir="$(cd "${dist_dir}" && pwd)"

targets=(
  "linux amd64 tar.gz"
  "linux arm64 tar.gz"
  "darwin amd64 tar.gz"
  "darwin arm64 tar.gz"
  "windows amd64 zip"
)

ldflags="-s -w -X main.version=v${version} -X main.commit=${commit} -X main.buildDate=${build_date}"

for target in "${targets[@]}"; do
  read -r goos goarch format <<<"${target}"
  archive="tf9_${version}_${goos}_${goarch}"
  work_dir="$(mktemp -d)"
  binary="tf9"
  if [[ "${goos}" == "windows" ]]; then
    binary="tf9.exe"
  fi

  CGO_ENABLED=0 GOOS="${goos}" GOARCH="${goarch}" \
    "${go_bin}" build -trimpath -ldflags "${ldflags}" -o "${work_dir}/${binary}" ./cmd/tf9

  if [[ "${format}" == "zip" ]]; then
    (
      cd "${work_dir}"
      zip -q "${dist_dir}/${archive}.zip" "${binary}"
    )
  else
    tar -C "${work_dir}" -czf "${dist_dir}/${archive}.tar.gz" "${binary}"
  fi
  rm -rf "${work_dir}"
done

(
  cd "${dist_dir}"
  sha256sum ./*.tar.gz ./*.zip > checksums.txt
)

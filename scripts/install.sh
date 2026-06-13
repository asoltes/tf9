#!/usr/bin/env sh
set -eu

repo="asoltes/tf9"
install_dir="${INSTALL_DIR:-$HOME/.local/bin}"
requested_version="${VERSION:-latest}"

require() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "tf9 installer: required command not found: $1" >&2
    exit 1
  }
}

require curl
require tar

case "$(uname -s)" in
  Linux) os="linux" ;;
  Darwin) os="darwin" ;;
  *)
    echo "tf9 installer: unsupported operating system: $(uname -s)" >&2
    exit 1
    ;;
esac

case "$(uname -m)" in
  x86_64|amd64) arch="amd64" ;;
  arm64|aarch64) arch="arm64" ;;
  *)
    echo "tf9 installer: unsupported architecture: $(uname -m)" >&2
    exit 1
    ;;
esac

if [ "${requested_version}" = "latest" ]; then
  tag="$(
    curl -fsSL "https://api.github.com/repos/${repo}/releases/latest" |
      sed -n 's/.*"tag_name":[[:space:]]*"\([^"]*\)".*/\1/p' |
      head -n 1
  )"
else
  tag="${requested_version}"
  case "${tag}" in
    v*) ;;
    *) tag="v${tag}" ;;
  esac
fi

if [ -z "${tag}" ]; then
  echo "tf9 installer: could not determine the release version" >&2
  exit 1
fi

version="${tag#v}"
archive="tf9_${version}_${os}_${arch}.tar.gz"
base_url="https://github.com/${repo}/releases/download/${tag}"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT INT TERM

curl -fsSL "${base_url}/${archive}" -o "${tmp_dir}/${archive}"
curl -fsSL "${base_url}/checksums.txt" -o "${tmp_dir}/checksums.txt"

expected="$(awk -v archive="${archive}" '$2 == archive || $2 == "./" archive { print $1 }' "${tmp_dir}/checksums.txt")"
if [ -z "${expected}" ]; then
  echo "tf9 installer: ${archive} is missing from checksums.txt" >&2
  exit 1
fi
if command -v sha256sum >/dev/null 2>&1; then
  actual="$(sha256sum "${tmp_dir}/${archive}" | awk '{print $1}')"
elif command -v shasum >/dev/null 2>&1; then
  actual="$(shasum -a 256 "${tmp_dir}/${archive}" | awk '{print $1}')"
else
  echo "tf9 installer: sha256sum or shasum is required" >&2
  exit 1
fi
if [ "${actual}" != "${expected}" ]; then
  echo "tf9 installer: checksum verification failed" >&2
  exit 1
fi

tar -xzf "${tmp_dir}/${archive}" -C "${tmp_dir}"
mkdir -p "${install_dir}"
install -m 0755 "${tmp_dir}/tf9" "${install_dir}/tf9"
echo "Installed tf9 ${tag} to ${install_dir}/tf9"

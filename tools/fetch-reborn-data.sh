#!/usr/bin/env bash
# Downloads Pockie Ninja Reborn's public reference data into data/reborn-raw/ (gitignored).
# Only names from these files go into the repo (tools/i18n glossary); raw files stay local.
set -euo pipefail

base="https://pockieninjareborn.com"
out="$(cd "$(dirname "$0")/.." && pwd)/data/reborn-raw"
mkdir -p "$out"

for path in \
  locales/en/translation.json \
  json/items.json \
  json/ninjaHouse.json \
  json/info.json \
  json/exploration.json \
  assets/scenes/npcs.json; do
  file="$out/${path//\//_}"
  curl -fsS -A "Mozilla/5.0" -o "$file" "$base/$path"
  node -e "JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'))" "$file"
  echo "$(wc -c <"$file" | tr -d ' ') bytes  $path"
done

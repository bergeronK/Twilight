#!/bin/sh
# Makes fonts/inter-latin.woff2, the Latin core of Inter that every page
# loads, from the full fonts/inter-var.woff2 (kept, and fetched by the
# browser only for text outside this range). Both axes (wght, opsz) and every
# OpenType feature are kept, so the app looks exactly as before.
# Needs fonttools and brotli: pip install fonttools brotli
# If you change RANGE, change the two unicode-range lists in index.html and
# scripts/generate-city-pages.js to match (font-subset.test.js checks).
set -e
cd "$(dirname "$0")/.."
RANGE="U+0000-017F,U+0192,U+0218-021B,U+02B9-02DD,U+0300-0308,U+030A-030C,U+0327-0328,U+03C0,U+2000-206F,U+2070-2079,U+2080-2089,U+20AC,U+2100-2122,U+2190-21BB,U+2212,U+2215,U+2248,U+2260-2265,U+25A0-25FF,U+2600-27BF,U+FB00-FB02,U+FEFF,U+FF0B,U+FFFD"
pyftsubset fonts/inter-var.woff2 --unicodes="$RANGE" --layout-features='*' --flavor=woff2 --output-file=fonts/inter-latin.woff2

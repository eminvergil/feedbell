#!/bin/bash
# build/icon.svg ve build/tray.svg'den uygulama simgelerini üretir.
#   build/icon.png   1024 px (electron-builder, Linux)
#   build/icon.icns  macOS
#   build/icon.ico   Windows
#   src/assets/icon.png               pencere simgesi
#   src/assets/trayTemplate(@2x).png     macOS menü çubuğu (şablon görsel)
#   src/assets/trayDotTemplate(@2x).png  aynısı, görülmemiş bildirim noktasıyla
#   src/assets/tray.png               Windows / Linux sistem tepsisi
# Gerekenler: rsvg-convert (librsvg), ImageMagick; .icns için macOS'taki iconutil.
set -euo pipefail
cd "$(dirname "$0")/.."

SVG=build/icon.svg
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

rsvg-convert -w 1024 -h 1024 "$SVG" -o build/icon.png
rsvg-convert -w 512 -h 512 "$SVG" -o src/assets/icon.png
rsvg-convert -w 18 -h 18 build/tray.svg -o src/assets/trayTemplate.png
rsvg-convert -w 36 -h 36 build/tray.svg -o src/assets/trayTemplate@2x.png
rsvg-convert -w 18 -h 18 build/tray-dot.svg -o src/assets/trayDotTemplate.png
rsvg-convert -w 36 -h 36 build/tray-dot.svg -o src/assets/trayDotTemplate@2x.png
rsvg-convert -w 32 -h 32 "$SVG" -o src/assets/tray.png

# Windows .ico: her boyut SVG'den ayrı çizilir (küçük boyutlarda daha net).
ICO_PARTS=()
for s in 16 24 32 48 64 128 256; do
  rsvg-convert -w $s -h $s "$SVG" -o "$TMP/ico_$s.png"
  ICO_PARTS+=("$TMP/ico_$s.png")
done
magick "${ICO_PARTS[@]}" build/icon.ico

# macOS .icns
if command -v iconutil >/dev/null; then
  SET="$TMP/icon.iconset"
  mkdir -p "$SET"
  for s in 16 32 128 256 512; do
    rsvg-convert -w $s -h $s "$SVG" -o "$SET/icon_${s}x${s}.png"
    rsvg-convert -w $((s * 2)) -h $((s * 2)) "$SVG" -o "$SET/icon_${s}x${s}@2x.png"
  done
  iconutil -c icns "$SET" -o build/icon.icns
fi

echo "Simgeler üretildi."

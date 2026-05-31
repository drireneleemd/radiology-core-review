#!/usr/bin/env bash
# setup_extension.sh
# Downloads pdf.js files needed by the Chrome extension.
# Run once from inside the extension/ folder.

set -e
cd "$(dirname "$0")"

PDFJS_VERSION="4.4.168"
BASE="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}"

echo "Downloading pdf.js v${PDFJS_VERSION}..."

curl -sL "${BASE}/pdf.min.js"        -o pdf.min.js        && echo "  ✓ pdf.min.js"
curl -sL "${BASE}/pdf.worker.min.js" -o pdf.worker.min.js && echo "  ✓ pdf.worker.min.js"

# Generate a simple square icon if none exists
if [ ! -f icon48.png ]; then
  echo "  Generating placeholder icon48.png..."
  # Create a simple PNG using Python (no ImageMagick needed)
  python3 - << 'PYEOF'
import struct, zlib

def make_png(size, r, g, b):
    def chunk(name, data):
        c = zlib.crc32(name + data) & 0xffffffff
        return struct.pack('>I', len(data)) + name + data + struct.pack('>I', c)
    ihdr = struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)
    row  = bytes([0] + [r, g, b] * size)
    idat = zlib.compress(row * size)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr) + chunk(b'IDAT', idat) + chunk(b'IEND', b'')

with open('icon48.png', 'wb') as f:
    f.write(make_png(48, 79, 195, 247))   # #4fc3f7 accent blue
print("  ✓ icon48.png")
PYEOF
fi

echo ""
echo "Done! Your extension/ folder is ready."
echo ""
echo "Next steps:"
echo "  1. Open Chrome → chrome://extensions"
echo "  2. Enable 'Developer mode' (top right toggle)"
echo "  3. Click 'Load unpacked' → select this extension/ folder"
echo "  4. Click the extension icon → Settings → enter your GitHub token + repo"

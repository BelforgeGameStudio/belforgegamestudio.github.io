"""
Build script for Belforge website.
Injects header and footer partials into source HTML files.

Usage: 
    python build.py           - Build HTML files only
    python build.py --full    - Build HTML + Tailwind CSS (requires npm install)
"""

import subprocess
import sys
import os
import re
import time
from pathlib import Path

# Fix Unicode output on Windows consoles
if sys.platform == 'win32':
    os.environ.setdefault('PYTHONIOENCODING', 'utf-8')
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except AttributeError:
        pass

ROOT = Path(__file__).parent
SRC = ROOT / 'src'
PARTIALS = ROOT / 'partials'
OUTPUT = ROOT  # Output directly to root for GitHub Pages

def build_html():
    """Build HTML files by injecting partials."""
    # Load partials
    header = (PARTIALS / 'header.html').read_text(encoding='utf-8')
    footer = (PARTIALS / 'footer.html').read_text(encoding='utf-8')
    
    # Process all HTML files in src/
    count = 0
    for src_file in SRC.rglob('*.html'):
        content = src_file.read_text(encoding='utf-8')
        
        # Replace markers
        content = content.replace('<!-- HEADER -->', header)
        content = content.replace('<!-- FOOTER -->', footer)
        
        # Calculate output path (mirror src structure to root)
        relative = src_file.relative_to(SRC)
        dest = OUTPUT / relative
        
        # Ensure directory exists
        dest.parent.mkdir(parents=True, exist_ok=True)
        
        # Write output
        dest.write_text(content, encoding='utf-8')
        count += 1
        print(f'  Built: {relative}')
    
    print(f'\n✓ Built {count} HTML file(s)')
    return count

# Pages whose local .js/.css references get a cache-busting ?v=<build id> stamped on each build,
# so visitors always fetch fresh assets after a deploy (no stale-cache surprises). These pages are
# maintained directly (not via the src/ partial build), so we rewrite them in place.
VERSIONED_HTML = [
    ROOT / 'iplaygames' / 'shop-titans' / 'roster-builder.html',
]

def build_id():
    """A value that changes every deploy: short git SHA, else a timestamp."""
    try:
        r = subprocess.run(['git', 'rev-parse', '--short', 'HEAD'], cwd=ROOT,
                            capture_output=True, text=True, shell=(sys.platform == 'win32'))
        if r.returncode == 0 and r.stdout.strip():
            return r.stdout.strip()
    except Exception:
        pass
    return time.strftime('%Y%m%d%H%M%S')

def stamp_asset_versions():
    """Add/refresh ?v=<build id> on local .js/.css <script>/<link> URLs in VERSIONED_HTML."""
    v = build_id()
    # match  src="…foo.js"  or  href="…bar.css"  with an optional existing ?v=… to replace
    pat = re.compile(r'(\b(?:src|href)=")([^"?]+\.(?:js|css))(?:\?v=[^"]*)?(")')
    print('\nStamping asset versions (?v=' + v + ')...')
    for f in VERSIONED_HTML:
        if not f.exists():
            print(f'  (skip, not found) {f.relative_to(ROOT)}')
            continue
        txt = f.read_text(encoding='utf-8')
        new = pat.sub(lambda m: m.group(1) + m.group(2) + '?v=' + v + m.group(3), txt)
        if new != txt:
            f.write_text(new, encoding='utf-8')
            print(f'  ✓ {f.relative_to(ROOT)}')
        else:
            print(f'  (no local assets) {f.relative_to(ROOT)}')

def build_css():
    """Build Tailwind CSS."""
    print('\nBuilding Tailwind CSS...')
    try:
        result = subprocess.run(
            ['npx', 'tailwindcss', '-i', './src/css/input.css', '-o', './css/tailwind.css', '--minify'],
            cwd=ROOT,
            capture_output=True,
            text=True,
            shell=True  # Needed for Windows npx
        )
        if result.returncode == 0:
            print('✓ Tailwind CSS built successfully')
            return True
        else:
            print(f'✗ Tailwind build failed: {result.stderr}')
            return False
    except FileNotFoundError:
        print('✗ npx not found. Run "npm install" first.')
        return False

def main():
    print('Building Belforge website...\n')
    
    # Always build HTML
    build_html()

    # Cache-bust local assets on standalone pages (e.g. the shop-titans tool)
    stamp_asset_versions()

    # Build CSS if --full flag or if tailwind.css doesn't exist
    tailwind_css = ROOT / 'css' / 'tailwind.css'
    if '--full' in sys.argv or not tailwind_css.exists():
        build_css()
    
    print('\n✓ Build complete!')

if __name__ == '__main__':
    main()

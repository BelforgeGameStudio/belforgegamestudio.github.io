"""
Build script for Belforge website.
Injects header and footer partials into source HTML files.

Usage: python build.py
"""

from pathlib import Path
import re

ROOT = Path(__file__).parent
SRC = ROOT / 'src'
PARTIALS = ROOT / 'partials'
OUTPUT = ROOT  # Output directly to root for GitHub Pages

def build():
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
    
    print(f'\n✓ Built {count} file(s)')

if __name__ == '__main__':
    print('Building Belforge website...\n')
    build()

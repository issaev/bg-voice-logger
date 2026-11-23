#!/usr/bin/env python3
"""Update the embedded JS build marker after every frontend source edit.

The canonical digest is SHA-256 of app.js with only its marker literal replaced
by __BUILD_PLACEHOLDER__. The WordPress helper computes the same expected ID.
"""
from pathlib import Path
import hashlib
import re

root = Path(__file__).resolve().parents[1]
plugin = (root / 'bg-voice-logger.php').read_text(encoding='utf-8')
version = re.search(r"define\('BVLOG_VERSION', '([^']+)'\);", plugin).group(1)
file = root / 'assets' / 'app.js'
source = file.read_text(encoding='utf-8')
pattern = r"const BVLOG_RUNNING_BUILD = '[A-Za-z0-9._-]+';"
assert len(re.findall(pattern, source)) == 1, 'Missing or duplicated build marker'
canonical = re.sub(pattern, "const BVLOG_RUNNING_BUILD = '__BUILD_PLACEHOLDER__';", source, count=1)
marker = version + '-' + hashlib.sha256(canonical.encode('utf-8')).hexdigest()[:12]
updated = re.sub(pattern, "const BVLOG_RUNNING_BUILD = '" + marker + "';", source, count=1)
if updated != source:
    file.write_text(updated, encoding='utf-8')
print(marker)

#!/usr/bin/env python3
"""Build the Earth Weather Canon browse page from tier1.json.
Usage: python3 build_browser.py OUT.html
Needs pilot.json (La Rinconada record) next to this file."""
import json, sys, os
here = os.path.dirname(os.path.abspath(__file__))
t = json.load(open(os.path.join(here, 'tier1.json')))
pilot = json.load(open(os.path.join(here, 'pilot.json')))
n = sum(1 for p in t['places'] if p.get('dataSource') == 'open-meteo-era5')
meta = dict(pilot['meta'])
meta.update(generated=__import__('datetime').date.today().isoformat(), upgraded=n,
            source=t['meta']['source'], pending=t['meta']['pending'], caveats=t['meta']['caveats'],
            places=len(t['places']))
data = {'meta': meta, 'places': [pilot['place']] + t['places']}
blob = json.dumps(data, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
tpl = open(os.path.join(here, 'browser.template.html')).read()
assert '__DATA__' in tpl
open(sys.argv[1], 'w').write(tpl.replace('__DATA__', blob))
print(n, 'upgraded of', len(t['places']))

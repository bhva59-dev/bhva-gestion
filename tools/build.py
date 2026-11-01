#!/usr/bin/env python3
"""Prépare la publication de l'appli BHVA, à lancer depuis la racine du dépôt après chaque modification de index.html :
   1. tamponne la version (empreinte du contenu) dans index.html  → const APP_VERSION = '…'
   2. écrit version.json (lu par les appareils : ils se rechargent tout seuls quand la version change)
   3. fabrique prix.html (appli « Prix BHVA » du téléphone) à partir de index.html
Usage : python3 tools/build.py"""
import hashlib, json, pathlib, re, sys
racine = pathlib.Path(__file__).resolve().parent.parent
idx = racine / 'index.html'
s = idx.read_text(encoding='utf-8')
motif = re.compile(r"const APP_VERSION = '[^']*';")
if len(motif.findall(s)) != 1:
    sys.exit('const APP_VERSION introuvable (ou en double) dans index.html')
neutre = motif.sub("const APP_VERSION = '__APP_VERSION__';", s)
v = hashlib.sha256(neutre.encode('utf-8')).hexdigest()[:10]
s = motif.sub(f"const APP_VERSION = '{v}';", s)
idx.write_text(s, encoding='utf-8')
(racine / 'version.json').write_text(json.dumps({'v': v}) + '\n', encoding='utf-8')

remplacements = [
    ('<title>BHVA Comptoir</title>', '<title>Prix BHVA</title>'),
    ('<meta name="apple-mobile-web-app-title" content="BHVA">', '<meta name="apple-mobile-web-app-title" content="Prix BHVA">'),
    ('<meta name="theme-color" content="#163bdc">', '<meta name="theme-color" content="#111111">'),
    ('<link rel="apple-touch-icon" id="touch-icon" href="icons/bhva-180.png">', '<link rel="apple-touch-icon" id="touch-icon" href="icons/prix-180.png">'),
    ('<link rel="icon" type="image/png" href="icons/bhva-180.png">', '<link rel="icon" type="image/png" href="icons/prix-180.png">'),
    ('<link rel="manifest" id="manifest-link" href="manifest.webmanifest">', '<link rel="manifest" id="manifest-link" href="manifest-prix.webmanifest">'),
]
p = s
for a, b in remplacements:
    if p.count(a) != 1:
        sys.exit(f'introuvable (ou en double) dans index.html : {a}')
    p = p.replace(a, b)
if p.count('<body>\n') != 1:
    sys.exit('<body> introuvable')
p = p.replace('<body>\n', '<body>\n<script>window.FORCE_GESTION=true;</script>\n')   # même place que d'habitude
(racine / 'prix.html').write_text(p, encoding='utf-8')
print('version', v, '· index.html, prix.html, version.json prêts')

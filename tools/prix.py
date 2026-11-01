#!/usr/bin/env python3
"""Fabrique prix.html (appli « Prix BHVA » du téléphone) à partir de index.html (appli du comptoir).
Les deux pages ont le même code ; seuls le titre, l'icône, la couleur, le manifeste et FORCE_GESTION changent.
Usage : python3 tools/prix.py   (depuis la racine du dépôt)"""
import pathlib, sys
racine = pathlib.Path(__file__).resolve().parent.parent
s = (racine / 'index.html').read_text(encoding='utf-8')
remplacements = [
    ('<title>BHVA Comptoir</title>', '<title>Prix BHVA</title>'),
    ('<meta name="apple-mobile-web-app-title" content="BHVA">', '<meta name="apple-mobile-web-app-title" content="Prix BHVA">'),
    ('<meta name="theme-color" content="#163bdc">', '<meta name="theme-color" content="#111111">'),
    ('<link rel="apple-touch-icon" id="touch-icon" href="icons/bhva-180.png">', '<link rel="apple-touch-icon" id="touch-icon" href="icons/prix-180.png">'),
    ('<link rel="icon" type="image/png" href="icons/bhva-180.png">', '<link rel="icon" type="image/png" href="icons/prix-180.png">'),
    ('<link rel="manifest" id="manifest-link" href="manifest.webmanifest">', '<link rel="manifest" id="manifest-link" href="manifest-prix.webmanifest">'),
]
for a, b in remplacements:
    if s.count(a) != 1:
        sys.exit(f'introuvable (ou en double) dans index.html : {a}')
    s = s.replace(a, b)
# FORCE_GESTION tout de suite après <body> (même place que d'habitude)
ancre = '<body>\n'
if s.count(ancre) != 1:
    sys.exit('<body> introuvable')
s = s.replace(ancre, ancre + '<script>window.FORCE_GESTION=true;</script>\n')
(racine / 'prix.html').write_text(s, encoding='utf-8')
print('prix.html fabriqué', len(s))

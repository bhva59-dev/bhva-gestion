/**
 * ROBOT FACTURES BHVA — Boucherie El Fen (SAS BHVA)
 * ------------------------------------------------------------
 * Gratuit : tourne sur les serveurs de Google (Google Apps Script),
 * même quand le PC et l'iPad sont éteints. Aucune IA, aucun abonnement.
 *
 * Toutes les 5 heures :
 *   1. cherche dans Gmail les mails reçus avec une facture en PDF,
 *   2. copie chaque PDF dans l'appli BHVA (rubrique Factures),
 *   3. ne crée jamais deux fois la même facture (empreinte du fichier),
 *   4. range le mail sous le libellé « BHVA-importee ».
 * L'appli lit ensuite les montants avec les gabarits de chaque fournisseur.
 *
 * INSTALLATION (une seule fois) : choisir la fonction « installer » en haut,
 * cliquer sur ▶ Exécuter, puis « Autoriser ».
 */

const CONFIG = {
  HEURES: 5,                 // une vérification toutes les 5 heures
  JOURS_PREMIERE_FOIS: 60,   // à l'installation : factures des 60 derniers jours
  JOURS_ENSUITE: 60,         // ensuite : on regarde les 60 derniers jours (seuls les mails pas encore traités)
  LIBELLE: 'BHVA-importee',
  PROJET: 'bhva-gestion',
  CLE_API: 'AIzaSyAuEx9IUK0JdWXJeLgFj86IB0-KCdwaf4U', // clé publique de l'appli (déjà visible dans le site)
  MOTS: ['facture', 'factures', 'invoice', 'factuur', 'avoir', 'receipt', 'reçu', 'recu'],
  TAILLE_MORCEAU: 900000     // découpe des PDF pour la base (limite 1 Mo par fiche)
};

// Ce qui n'est PAS une facture : on ne l'importe pas (l'appli vérifie aussi le contenu du PDF).
const PAS_FACTURE_SUJET = /\bBL NO\d+|COURS VEAU|Confirmation du jour|EXTRAIT DE COMPTE|grands? livres?/i;
const PAS_FACTURE_FICHIER = /relance|rappel|extrait.?(?:de.?)?compte|relev[ée]|grands?.?livres?|\brib\b|conf_client|conditions|cgv|catalogue|tarif|mercuriale|cours/i;
const FICHIER_FACTURE = /fact|invoice|avoir|^F[ACS]?[ _-]?\d|^FC\b|^FA\b/i;

// Expéditeur (domaine) → nom du fournisseur affiché dans l'appli.
const FOURNISSEURS = {
  'lagache-lomme.com': 'Lagache',
  'sital.fr': 'Sital',
  'pmfood.pl': 'PM Food',
  'zaka-food.odoo.com': 'Zaka Food',
  'tendriade.fr': 'Tendriade',
  'chickenmasters.be': 'Chicken Masters',
  'lomme-primeurs.com': 'Lomme Primeurs',
  'primandco.fr': 'Prim&Co',
  'galline-frais.fr': 'Galline Frais',
  'gallinis.be': 'Gallinis',
  'etsleroy.com': 'Leroy',
  'dupont.be': 'Dupont',
  'lecontesas.fr': 'Le Conte',
  'restoflash.fr': 'RestoFlash',
  'bcnled.com': 'Barcelona LED',
  'strageco.fr': 'Strageco',
  'stripe.com': 'Stripe',
  'iabako.com': 'iabako',
  'ldc.fr': 'LDC (Lionor)',
  'matanza.be': 'Matanza',
  'ameloot.org': 'Ameloot',
  'sudfresh@orange.fr': 'Sud Fresh'
};

/* ============ À lancer une fois ============ */
function installer() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('verifier').timeBased().everyHours(1).create();
  libelle_();
  PropertiesService.getScriptProperties().deleteProperty('dernier');
  const n = importer_(CONFIG.JOURS_PREMIERE_FOIS);
  Logger.log('Robot installé. ' + n + ' facture(s) copiée(s) dans l\'appli.');
}

/* Appelée chaque heure par Google : ne travaille que toutes les 5 heures. */
function verifier() {
  const p = PropertiesService.getScriptProperties();
  const dernier = Number(p.getProperty('dernier') || 0);
  if (Date.now() - dernier < CONFIG.HEURES * 3600 * 1000 - 10 * 60 * 1000) return;
  importer_(CONFIG.JOURS_ENSUITE);
}

/* Pour forcer une vérification tout de suite (bouton ▶ sur cette fonction). */
function importerMaintenant() {
  const n = importer_(CONFIG.JOURS_ENSUITE);
  Logger.log(n + ' nouvelle(s) facture(s).');
}

/* ============ Le travail ============ */
function importer_(jours) {
  const verrou = LockService.getScriptLock();
  if (!verrou.tryLock(20000)) return 0;
  let nouvelles = 0;
  try {
    const lib = libelle_();
    const depuis = Object.keys(FOURNISSEURS).map(d => 'from:' + d).join(' OR ');
    const q = 'has:attachment filename:pdf newer_than:' + jours + 'd -label:' + CONFIG.LIBELLE +
      ' -from:me ((' + CONFIG.MOTS.join(' OR ') + ') OR ' + depuis + ')';
    const fils = [];
    for (let debut = 0; debut < 1000; debut += 100) { const lot = GmailApp.search(q, debut, 100); fils.push.apply(fils, lot); if (lot.length < 100) break; }
    fils.forEach(fil => {
      let toutBon = true;
      fil.getMessages().forEach(msg => {
        try { nouvelles += traiterMessage_(msg); } catch (e) { toutBon = false; Logger.log('Erreur ' + msg.getId() + ' : ' + e); }
      });
      if (toutBon) fil.addLabel(lib);
    });
    PropertiesService.getScriptProperties().setProperty('dernier', String(Date.now()));
    PropertiesService.getScriptProperties().setProperty('dernierResultat', new Date().toISOString() + ' · ' + nouvelles + ' nouvelle(s)');
  } finally {
    verrou.releaseLock();
  }
  return nouvelles;
}

function traiterMessage_(msg) {
  const de = msg.getFrom();
  const email = ((de.match(/<([^>]+)>/) || [null, de])[1] || '').trim().toLowerCase();
  if (email === Session.getActiveUser().getEmail().toLowerCase()) return 0;
  const sujet = msg.getSubject() || '';
  if (PAS_FACTURE_SUJET.test(sujet)) return 0;                     // ex. bons de livraison et cours du veau Tendriade
  const pdfs = msg.getAttachments({ includeInlineImages: false })
    .filter(a => a.getContentType() === 'application/pdf' || /\.pdf$/i.test(a.getName()))
    .filter(a => !(PAS_FACTURE_FICHIER.test(a.getName()) && !FICHIER_FACTURE.test(a.getName())))   // relevés, relances, RIB, conditions…
    .filter(a => !(/\b(rappel|relance|mise en demeure)\b/i.test(sujet) && !FICHIER_FACTURE.test(a.getName())));
  let n = 0;
  pdfs.forEach(a => {
    const octets = a.getBytes();
    const empreinte = hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, octets));
    const id = 'm-' + empreinte.slice(0, 24);
    if (existe_('factures/' + id)) return;              // déjà dans l'appli : pas de doublon
    const b64 = Utilities.base64Encode(octets);
    const morceaux = Math.ceil(b64.length / CONFIG.TAILLE_MORCEAU) || 1;
    for (let k = 0; k < morceaux; k++) {
      creer_('factures_pdf', id + '_' + k, { d: b64.slice(k * CONFIG.TAILLE_MORCEAU, (k + 1) * CONFIG.TAILLE_MORCEAU), k: k, n: morceaux });
    }
    const date = Utilities.formatDate(msg.getDate(), 'Europe/Paris', 'yyyy-MM-dd');
    creer_('factures', id, {
      type: 'facture', fournisseur: fournisseur_(email, de), numero: '', date: date, echeance: '',
      ht: null, tva: null, ttc: null, statut: 'a_payer', note: '', photo: '',
      source: 'mail', lu: 'a_lire',
      pdf: { n: morceaux, taille: octets.length, sha256: empreinte, nom: a.getName() },
      mail: { id: msg.getId(), de: de, email: email, sujet: msg.getSubject(), date: msg.getDate().toISOString() },
      cree: new Date().toISOString()
    });
    n++;
  });
  return n;
}

function fournisseur_(email, de) {
  const dom = (email.split('@')[1] || '');
  for (const d in FOURNISSEURS) if (dom === d || dom.endsWith('.' + d) || email.endsWith(d)) return FOURNISSEURS[d];
  const nom = de.replace(/<[^>]*>/, '').replace(/"/g, '').trim();
  return nom || dom;
}

function libelle_() {
  return GmailApp.getUserLabelByName(CONFIG.LIBELLE) || GmailApp.createLabel(CONFIG.LIBELLE);
}

/* ============ Base de l'appli (Firestore) ============ */
function url_(chemin) {
  return 'https://firestore.googleapis.com/v1/projects/' + CONFIG.PROJET + '/databases/(default)/documents/' + chemin;
}
function existe_(chemin) {
  const r = UrlFetchApp.fetch(url_(chemin), { headers: { Authorization: 'Bearer ' + jeton_() }, muteHttpExceptions: true });
  if (r.getResponseCode() === 200) return true;
  if (r.getResponseCode() === 404) return false;
  throw new Error('Lecture base ' + r.getResponseCode() + ' ' + r.getContentText().slice(0, 200));
}
function creer_(collection, id, obj) {
  const r = UrlFetchApp.fetch(url_(collection) + '?documentId=' + encodeURIComponent(id), {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + jeton_() },
    payload: JSON.stringify({ fields: champs_(obj) })
  });
  const c = r.getResponseCode();
  if (c === 200 || c === 409) return;                    // 409 = existe déjà
  throw new Error('Écriture base ' + c + ' ' + r.getContentText().slice(0, 200));
}
function champs_(o) {
  const f = {};
  Object.keys(o).forEach(k => { f[k] = val_(o[k]); });
  return f;
}
function val_(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(val_) } };
  return { mapValue: { fields: champs_(v) } };
}
/* Connexion anonyme à l'appli (comme l'iPad), jeton renouvelé automatiquement. */
function jeton_() {
  const p = PropertiesService.getScriptProperties();
  let jeton = p.getProperty('jeton'), fin = Number(p.getProperty('fin') || 0), rafraichir = p.getProperty('rafraichir');
  if (jeton && Date.now() < fin - 2 * 60 * 1000) return jeton;
  if (rafraichir) {
    const r = UrlFetchApp.fetch('https://securetoken.googleapis.com/v1/token?key=' + CONFIG.CLE_API, {
      method: 'post', contentType: 'application/x-www-form-urlencoded', muteHttpExceptions: true,
      payload: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(rafraichir)
    });
    if (r.getResponseCode() === 200) {
      const j = JSON.parse(r.getContentText());
      jeton = j.id_token; rafraichir = j.refresh_token; fin = Date.now() + Number(j.expires_in) * 1000;
    } else rafraichir = null;
  }
  if (!rafraichir) {
    const r = UrlFetchApp.fetch('https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=' + CONFIG.CLE_API, {
      method: 'post', contentType: 'application/json', payload: JSON.stringify({ returnSecureToken: true })
    });
    const j = JSON.parse(r.getContentText());
    jeton = j.idToken; rafraichir = j.refreshToken; fin = Date.now() + Number(j.expiresIn) * 1000;
  }
  p.setProperties({ jeton: jeton, fin: String(fin), rafraichir: rafraichir });
  return jeton;
}
function hex_(octets) {
  return octets.map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}

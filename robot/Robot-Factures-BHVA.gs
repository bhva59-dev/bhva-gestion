/**
 * ROBOT FACTURES BHVA — Boucherie El Fen (SAS BHVA)
 * ------------------------------------------------------------
 * Gratuit : tourne sur les serveurs de Google (Google Apps Script),
 * même quand le PC et l'iPad sont éteints. Aucune IA, aucun abonnement.
 *
 * Toutes les 5 heures :
 *   1. regarde UNIQUEMENT les mails de factures connus reçus depuis le 31/10/2026 18h45 (liste MAILS_FACTURES ci-dessous :
 *      bon expéditeur + bon objet + bon nom de PDF) ;
 *   2. copie le PDF de la facture dans l'appli BHVA (rubrique Factures) ;
 *   3. ne crée jamais deux fois la même facture (empreinte du fichier) ;
 *   4. range le mail sous le libellé « BHVA-importee ».
 * Relevés, relances, avoirs, bons de livraison, cours, devis… ne sont jamais pris.
 * Nouveau fournisseur : ajouter une ligne dans MAILS_FACTURES.
 */

const CONFIG = {
  HEURES: 5,                 // une vérification toutes les 5 heures
  DEPUIS: new Date('2026-10-31T17:45:00Z'), // départ : seules les factures reçues après le 31/10/2026 18h45 (le stock repart de l'inventaire)
  LIBELLE: 'BHVA-importee',
  PROJET: 'bhva-gestion',
  CLE_API: 'AIzaSyAuEx9IUK0JdWXJeLgFj86IB0-KCdwaf4U', // clé publique de l'appli (déjà visible dans le site)
  TAILLE_MORCEAU: 900000     // découpe des PDF pour la base (limite 1 Mo par fiche)
};

/* ===================== Les mails de factures (liste blanche) =====================
   Établie le 31/10/2026 à partir des 305 mails avec PDF reçus depuis le 17/08/2026.
   Une facture n'est prise QUE si le mail vient de cet expéditeur, avec cet objet, et que le PDF porte ce nom.
   Tout le reste (relevés, relances, avoirs, bons de livraison, cours, devis, documents du comptable…) est ignoré. */
const MAILS_FACTURES = [
  { f: 'LDC (Lionor)', q: 'noreply.factures.demat@ldc.fr', de: /^noreply\.factures\.demat@ldc\.fr$/i, sujet: /^\[LIONOR\] : Piece comptable numero/i, pdf: /__S__INVOIC__\d+__\d+\.pdf$/i },
  { f: 'Prim&Co', q: 'caisse@primandco.fr', de: /^caisse@primandco\.fr$/i, sujet: /^SAS PRIM&CO - FACTURE N/i, pdf: /^FAC_\d+\.pdf$/i },
  { f: 'Le Conte', q: 'contact@lecontesas.fr', de: /^contact@lecontesas\.fr$/i, sujet: /^Votre facture num\S*ro FA\d+/i, pdf: /^Facture_FA\d+\.pdf$/i },
  { f: 'Sud Fresh', q: 'laure.sudfresh@orange.fr', de: /^laure\.sudfresh@orange\.fr$/i, sujet: /^SUD FRESH - FACTURE N/i, pdf: /^facture_\d+\.pdf$/i },
  { f: 'Lomme Primeurs', q: 'caisse@lomme-primeurs.com', de: /^caisse@lomme-primeurs\.com$/i, sujet: /^LOMME PRIMEURS - FACTURE N/i, pdf: /^facture_\d+\.pdf$/i },
  { f: 'Tendriade', q: 'tendriade.fr', de: /^compta\.?client@tendriade\.fr$/i, sujet: /^Facture ou Avoir Tendriade invoicEDC_/i, pdf: /^invoicEDC_[\d_]+\.pdf$/i },
  { f: 'Lagache', q: 'facturation@lagache-lomme.com', de: /^facturation@lagache-lomme\.com$/i, sujet: /^FACTURE N\S*\s*\d+\s*$/i, pdf: /^facture_\d+\.pdf$/i },
  { f: 'Sital', q: 'compta@sital.fr', de: /^compta@sital\.fr$/i, sujet: /^SITAL SAS - FACTURES?\s*$/i, pdf: /^facture_\d+\.pdf$/i },
  { f: 'Ameloot', q: 'factuur@ameloot.org', de: /^factuur@ameloot\.org$/i, sujet: /^Facture Omer Ameloot/i, pdf: /^FACT-\d+\.pdf$/i },
  { f: 'Matanza', q: 'boekhouding@matanza.be', de: /^boekhouding@matanza\.be$/i, sujet: /^Facture Matanza avec r\S*f\S*rence FASN-/i, pdf: /^FASN-\d+\.pdf$/i },
  { f: 'Galline Frais', q: 'contact@galline-frais.fr', de: /^contact@galline-frais\.fr$/i, sujet: /^FACTURE\s*$/i, pdf: /^ATT\d+\.pdf$/i },
  { f: 'PM Food', q: 'pmfood.pl', de: /@pmfood\.pl$/i, sujet: /^(?:INVOICE|FS)\b/i, pdf: /^FS \d+_\d+_\d{4}\.pdf$/i },
  { f: 'Leroy', q: 'caisse@etsleroy.com', de: /^caisse@etsleroy\.com$/i, sujet: /^Facture N\S*\s*\d/i, pdf: /^facture-\d+\.pdf$/i },
  { f: 'Chicken Masters', q: 'chickenmasters.be', de: /@chickenmasters\.be$/i, sujet: /^F A C T U R E/i, pdf: /^BHVA - \d+\.pdf$/i },
  { f: 'Zaka Food', q: 'notifications@zaka-food.odoo.com', de: /^notifications@zaka-food\.odoo\.com$/i, sujet: /Facture \(R\S*f INV\//i, pdf: /^INV_\d{4}_\d+\.pdf$/i },
  { f: 'Gallinis', q: 'invoice@gallinis.be', de: /^invoice@gallinis\.be$/i, sujet: /^Facture Gallinis/i, pdf: /^FTGA-\d+\.pdf$/i },
  { f: 'Dupont', q: 'boekhouding@dupont.be', de: /^boekhouding@dupont\.be$/i, sujet: /^Facture - VF\//i, pdf: /^Facture vente VF/i },
  { f: 'Kriss Consult', q: 'steresiak@strageco.fr', de: /^steresiak@strageco\.fr$/i, sujet: /^Facture Kriss Consult n/i, pdf: /^BHVA Facture N/i },
  { f: 'Strageco (comptable)', q: 'vbauzone@strageco.fr', de: /^vbauzone@strageco\.fr$/i, sujet: /^Facture Strageco n/i, pdf: /^BHVA Facture N/i },
  { f: 'RestoFlash', q: 'info@restoflash.fr', de: /^info@restoflash\.fr$/i, sujet: /^Votre facture RestoFlash/i, pdf: /F\d+--.*\.pdf$/i },
  { f: 'MAF Métallerie', q: 'notifications@iabako.com', de: /^notifications@iabako\.com$/i, sujet: /^Facture \d+ du/i, pdf: /^Facture_\d+\.pdf$/i },
  { f: 'Anthropic (Claude)', q: 'stripe.com', de: /@stripe\.com$/i, sujet: /^Your receipt from Anthropic/i, pdf: /^Invoice-.*\.pdf$/i },
  { f: 'Barcelona LED', q: 'invoice@bcnled.com', de: /^invoice@bcnled\.com$/i, sujet: /Facture \(R\S*f INV\//i, pdf: /^INV.\d+.\d+\.pdf$/i },
  { f: 'Envie (SAV)', q: 'magasin.envie@envie.org', de: /^magasin\.envie@envie\.org$/i, sujet: /^Facture n/i, pdf: /^FACTURE_I\d+/i },
  { f: 'Metro', q: 'no-reply@metro-marketplace.eu', de: /^no-reply@metro-marketplace\.eu$/i, sujet: /^Votre facture/i, pdf: /^IN-\d+\.pdf$/i },
  { f: 'Shopify', q: 'billing@shopify.com', de: /^billing@shopify\.com$/i, sujet: /^Facture /i, pdf: /\.pdf$/i },
  { f: 'Praninter', q: 'praninter.fr', de: /@praninter\.fr$/i, sujet: /Facture client N\S* FC/i, pdf: /^FC\d+\.pdf$/i },
  { f: 'Seguard', q: 'seguard.fr', de: /@seguard\.fr$/i, sujet: /./, pdf: /^Facture_\d+_\d+\.pdf$/i },
  { f: 'Hexagonia', q: 'adamibn.c@gmail.com', de: /^adamibn\.?c@gmail\.com$/i, sujet: /Hexagonia - (?:La|Ta) facture du/i, pdf: /^facture-[A-Z0-9]+-\d+\.pdf$/i }
];
function regleFacture(email, sujet) {
  email = String(email || '').trim().toLowerCase(); sujet = String(sujet || '').trim();
  for (const r of MAILS_FACTURES) if (r.de.test(email) && r.sujet.test(sujet)) return r;
  return null;
}
function pdfFacture(regle, nom) { return !!regle && regle.pdf.test(String(nom || '').trim()); }

/* ============ À lancer une fois ============ */
function installer() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('verifier').timeBased().everyHours(1).create();
  libelle_();
  PropertiesService.getScriptProperties().deleteProperty('dernier');
  const n = importer_();
  Logger.log('Robot installé. ' + n + ' facture(s) copiée(s) dans l\'appli.');
}

/* Appelée chaque heure par Google : ne travaille que toutes les 5 heures. */
function verifier() {
  const p = PropertiesService.getScriptProperties();
  const dernier = Number(p.getProperty('dernier') || 0);
  if (Date.now() - dernier < CONFIG.HEURES * 3600 * 1000 - 10 * 60 * 1000) return;
  importer_();
}

/* Pour forcer une vérification tout de suite (bouton ▶ sur cette fonction). */
function importerMaintenant() {
  const n = importer_();
  Logger.log(n + ' nouvelle(s) facture(s).');
}

/* ============ Le travail ============ */
function importer_() {
  const verrou = LockService.getScriptLock();
  if (!verrou.tryLock(20000)) return 0;
  let nouvelles = 0;
  try {
    const lib = libelle_();
    const expediteurs = Array.from(new Set(MAILS_FACTURES.map(r => r.q))).map(q => 'from:' + q).join(' OR ');
    const q = 'has:attachment filename:pdf after:' + Math.floor(CONFIG.DEPUIS.getTime() / 1000) + ' -label:' + CONFIG.LIBELLE + ' (' + expediteurs + ')';
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
  const sujet = msg.getSubject() || '';
  if (msg.getDate() < CONFIG.DEPUIS) return 0;            // reçu avant le départ : on ne prend pas
  const regle = regleFacture(email, sujet);
  if (!regle) return 0;                                   // pas un mail de facture : on ne prend rien
  const pdfs = msg.getAttachments({ includeInlineImages: false }).filter(a => pdfFacture(regle, a.getName()));
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
      type: 'facture', fournisseur: regle.f, numero: '', date: date, echeance: '',
      ht: null, tva: null, ttc: null, statut: 'a_payer', note: '', photo: '',
      source: 'mail', lu: 'a_lire',
      pdf: { n: morceaux, taille: octets.length, sha256: empreinte, nom: a.getName() },
      mail: { id: msg.getId(), de: de, email: email, sujet: sujet, date: msg.getDate().toISOString() },
      cree: new Date().toISOString()
    });
    n++;
  });
  return n;
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

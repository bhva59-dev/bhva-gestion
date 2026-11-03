/**
 * ROBOT FACTURES BHVA — Boucherie El Fen (SAS BHVA)
 * ------------------------------------------------------------
 * Gratuit : tourne sur les serveurs de Google (Google Apps Script),
 * même quand le PC et l'iPad sont éteints. Aucune IA, aucun abonnement.
 *
 * Toutes les 5 minutes (fonction toutesLes5Minutes) :
 *   1. regarde UNIQUEMENT les mails de factures connus reçus depuis le 31/10/2026 (liste MAILS_FACTURES ci-dessous :
 *      bon expéditeur + bon objet + bon nom de PDF) ;
 *   2. copie le PDF de la facture dans l'appli BHVA (rubrique Factures) ;
 *   3. ne crée jamais deux fois la même facture (empreinte du fichier) ;
 *   4. range le mail sous le libellé « BHVA-importee » ;
 *   5. envoie une notification sur le téléphone d'Adam (appli gratuite ntfy, sujet NTFY_SUJET) pour chaque nouvelle facture :
 *      la toucher ouvre la conversation avec Claude pour la traiter (fournisseur, gabarit, références → produits) ;
 *   6. repère aussi les mails avec un PDF « facture » venant d'un expéditeur INCONNU (nouveau fournisseur ?) :
 *      ils ne sont pas copiés, mais Adam est prévenu une fois (libellé « BHVA-vu ») pour qu'on les ajoute à la liste ;
 *   7. les documents SCANNÉS par le Brother ADS-1700W (fonction scans), qui les envoie par mail à bhva59@gmail.com
 *      (de lui-même à lui-même), sont copiés dans l'appli ; l'iPad (ou le PC) lit ensuite le scan par reconnaissance
 *      de caractères (facture ou bon de livraison ; le reste est mis de côté) et prévient le téléphone d'Adam.
 * Une fois par heure (fonction verifier) : filet de sécurité si la cadence des 5 minutes s'est arrêtée.
 * Par mail, relevés, relances, avoirs, cours, devis… ne sont jamais pris (liste blanche).
 * Nouveau fournisseur : ajouter une ligne dans MAILS_FACTURES.
 */

const CONFIG = {
  MINUTES: 5,                // une vérification toutes les 5 minutes (mails de factures + scans)
  DEPUIS: new Date('2026-10-30T23:00:00Z'), // départ : factures reçues à partir du 31/10/2026 00h00 (heure de Paris)
  LIBELLE: 'BHVA-importee',
  LIBELLE_VU: 'BHVA-vu',                    // mails avec PDF déjà regardés par le repérage des nouveaux fournisseurs
  PROJET: 'bhva-gestion',
  CLE_API: 'AIzaSyAuEx9IUK0JdWXJeLgFj86IB0-KCdwaf4U', // clé publique de l'appli (déjà visible dans le site)
  TAILLE_MORCEAU: 900000,    // découpe des PDF pour la base (limite 1 Mo par fiche)
  NTFY_SUJET: 'bhva-factures-bxq7cn',                                       // notifications factures → téléphone d'Adam (pas l'iPad du comptoir)
  LIEN_CLAUDE: 'https://claude.ai/code/session_01BNsuqZf3tJo3GBGZHAsmBs',  // ouvert en touchant la notification
  LIEN_APPLI: 'https://bhva59-dev.github.io/bhva-gestion/#factures'
};

/* ===================== Les mails de factures (liste blanche) =====================
   Établie le 31/10/2026 à partir des 305 mails avec PDF reçus depuis le 17/08/2026.
   Une facture n'est prise QUE si le mail vient de cet expéditeur, avec cet objet, et que le PDF porte ce nom.
   Tout le reste (relevés, relances, avoirs, bons de livraison, cours, devis, documents du comptable…) est ignoré. */
const MAILS_FACTURES = [
  { f: 'LDC (Lionor)', q: 'noreply.factures.demat@ldc.fr', de: /^noreply\.factures\.demat@ldc\.fr$/i, sujet: /^\[LIONOR\] : Piece comptable numero/i, pdf: /__S__INVOIC__\d+__\d+\.pdf$/i, mixte: true },
  { f: 'Prim&Co', q: 'caisse@primandco.fr', de: /^caisse@primandco\.fr$/i, sujet: /^SAS PRIM&CO - FACTURE N/i, pdf: /^FAC_\d+\.pdf$/i },
  { f: 'Le Conte', q: 'contact@lecontesas.fr', de: /^contact@lecontesas\.fr$/i, sujet: /^Votre facture num\S*ro FA\d+/i, pdf: /^Facture_FA\d+\.pdf$/i },
  { f: 'Sud Fresh', q: 'laure.sudfresh@orange.fr', de: /^laure\.sudfresh@orange\.fr$/i, sujet: /^SUD FRESH - FACTURE N/i, pdf: /^facture_\d+\.pdf$/i },
  { f: 'Lomme Primeurs', q: 'caisse@lomme-primeurs.com', de: /^caisse@lomme-primeurs\.com$/i, sujet: /^LOMME PRIMEURS - FACTURE N/i, pdf: /^facture_\d+\.pdf$/i },
  { f: 'Tendriade', q: 'tendriade.fr', de: /^compta\.?client@tendriade\.fr$/i, sujet: /^Facture ou Avoir Tendriade invoicEDC_/i, pdf: /^invoicEDC_[\d_]+\.pdf$/i, mixte: true },
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
  { f: 'Hexagonia', q: 'adamibn.c@gmail.com', de: /^adamibn\.?c@gmail\.com$/i, sujet: /Hexagonia - (?:La|Ta) facture du/i, pdf: /^facture-[A-Z0-9]+-\d+\.pdf$/i },
  // le scanner Brother envoie ses PDF depuis la boîte de la boucherie vers elle-même (fournisseur reconnu ensuite par la lecture)
  { f: '', q: 'bhva59@gmail.com', de: /^bhva59@gmail\.com$/i, sujet: /./, pdf: /\.pdf$/i, scan: true }
];
/* un mail du scanner : envoyé par la boucherie à elle-même seulement (pas un transfert au comptable) */
function mailScanner_(msg, regle, email, sujet) {
  if (!regle.scan) return true;
  const dest = (String(msg.getTo() || '') + ',' + String(msg.getCc() || '')).toLowerCase();
  const autres = dest.replace(/bhva59@gmail\.com/g, '').match(/[a-z0-9._%+-]+@[a-z0-9.-]+/g);
  if (!/bhva59@gmail\.com/.test(dest) || (autres && autres.length)) return false;
  if (/^\s*(?:fwd?|tr|re)\s*:/i.test(sujet)) return false;
  return true;
}
function regleFacture(email, sujet) {
  email = String(email || '').trim().toLowerCase(); sujet = String(sujet || '').trim();
  for (const r of MAILS_FACTURES) if (r.de.test(email) && r.sujet.test(sujet)) return r;
  return null;
}
function pdfFacture(regle, nom) { return !!regle && regle.pdf.test(String(nom || '').trim()); }

/* ============ À lancer une fois ============ */
function installer() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('toutesLes5Minutes').timeBased().everyMinutes(CONFIG.MINUTES).create();
  ScriptApp.newTrigger('verifier').timeBased().everyHours(1).create();
  libelle_();
  PropertiesService.getScriptProperties().deleteProperty('dernier');
  const n = importer_();
  try { scansSeuls_(); } catch (e) { }
  Logger.log('Robot installé (vérification toutes les ' + CONFIG.MINUTES + ' minutes). ' + n + ' facture(s) copiée(s) dans l\'appli.');
}

/* Toutes les 5 minutes : les factures reçues par mail, puis les documents scannés. Rapide quand il n'y a rien de nouveau
   (une recherche Gmail sur les mails pas encore rangés), donc largement dans les quotas gratuits de Google. */
function toutesLes5Minutes() {
  try { importer_(); } catch (e) { Logger.log('Factures par mail : ' + e); }
  try { scansSeuls_(); } catch (e) { Logger.log('Scans : ' + e); }
}
/* Nom historique du déclencheur des 5 minutes (anciennes installations) : fait la même chose. */
function scans() { toutesLes5Minutes(); }

/* Appelée chaque heure par Google : filet de sécurité (si la cadence des 5 minutes s'est arrêtée, on rattrape). */
function verifier() {
  const p = PropertiesService.getScriptProperties();
  const dernier = Number(p.getProperty('dernier') || 0);
  if (Date.now() - dernier < 50 * 60 * 1000) return;   // le passage des 5 minutes a tourné récemment : rien à faire
  toutesLes5Minutes();
}

/* Les documents scannés (mails du scanner Brother, de la boucherie à elle-même). */
function scansSeuls_() {
  const verrou = LockService.getScriptLock();
  if (!verrou.tryLock(5000)) return 0;
  let nouvelles = 0;
  try {
    const lib = libelle_();
    const q = 'from:bhva59@gmail.com to:bhva59@gmail.com has:attachment filename:pdf newer_than:3d -label:' + CONFIG.LIBELLE;
    GmailApp.search(q, 0, 50).forEach(fil => {
      let toutBon = true;
      fil.getMessages().forEach(msg => { try { nouvelles += traiterMessage_(msg, null); } catch (e) { toutBon = false; Logger.log('Erreur scan ' + msg.getId() + ' : ' + e); } });
      if (toutBon) fil.addLabel(lib);
    });
    if (nouvelles) PropertiesService.getScriptProperties().setProperty('dernierScan', new Date().toISOString() + ' · ' + nouvelles + ' scan(s)');
  } finally { verrou.releaseLock(); }
  return nouvelles;
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
  const liste = [];   // les factures copiées pendant ce passage (pour la notification)
  try {
    const lib = libelle_();
    const expediteurs = Array.from(new Set(MAILS_FACTURES.map(r => r.q))).map(q => 'from:' + q).join(' OR ');
    const q = 'has:attachment filename:pdf after:' + Math.floor(CONFIG.DEPUIS.getTime() / 1000) + ' -label:' + CONFIG.LIBELLE + ' (' + expediteurs + ')';
    const fils = [];
    for (let debut = 0; debut < 1000; debut += 100) { const lot = GmailApp.search(q, debut, 100); fils.push.apply(fils, lot); if (lot.length < 100) break; }
    fils.forEach(fil => {
      let toutBon = true;
      fil.getMessages().forEach(msg => {
        try { nouvelles += traiterMessage_(msg, liste); } catch (e) { toutBon = false; Logger.log('Erreur ' + msg.getId() + ' : ' + e); }
      });
      if (toutBon) fil.addLabel(lib);
    });
    const p = PropertiesService.getScriptProperties();
    p.setProperty('dernier', String(Date.now()));
    p.setProperty('dernierResultat', new Date().toISOString() + ' · ' + nouvelles + ' nouvelle(s)');
    if (liste.length) {
      let journal = []; try { journal = JSON.parse(p.getProperty('journal') || '[]'); } catch (e) { }
      liste.forEach(x => journal.push({ le: new Date().toISOString(), f: x.f, sujet: x.sujet, recu: x.date.toISOString() }));
      p.setProperty('journal', JSON.stringify(journal.slice(-30)));
    }
  } finally {
    verrou.releaseLock();
  }
  if (liste.length) notifier_(liste);
  try { reperer_(); } catch (e) { Logger.log('Repérage nouveaux fournisseurs : ' + e); }
  return nouvelles;
}

/* Mails avec un PDF qui ressemble à une facture, envoyés par un expéditeur qui n'est PAS dans la liste (nouveau fournisseur ?).
   Rien n'est copié dans l'appli : Adam est seulement prévenu, une seule fois par mail (libellé BHVA-vu). */
function reperer_() {
  const lib = GmailApp.getUserLabelByName(CONFIG.LIBELLE_VU) || GmailApp.createLabel(CONFIG.LIBELLE_VU);
  const q = 'has:attachment filename:pdf after:' + Math.floor(CONFIG.DEPUIS.getTime() / 1000) + ' -from:me -in:sent -label:' + CONFIG.LIBELLE + ' -label:' + CONFIG.LIBELLE_VU;
  const fils = GmailApp.search(q, 0, 100);
  const vus = [];
  fils.forEach(fil => {
    fil.getMessages().forEach(msg => {
      if (msg.getDate() < CONFIG.DEPUIS) return;
      const de = msg.getFrom();
      const email = ((de.match(/<([^>]+)>/) || [null, de])[1] || '').trim().toLowerCase();
      if (MAILS_FACTURES.some(r => r.de.test(email))) return;          // fournisseur connu : ses autres mails (relevés, relances…) ne comptent pas
      const sujet = msg.getSubject() || '';
      const pdfs = msg.getAttachments({ includeInlineImages: false }).map(a => a.getName()).filter(n => /\.pdf$/i.test(n));
      if (!pdfs.length) return;
      const facture = /factur|faktur|invoice|factuur|rechnung|receipt|\bfact\b|\bFA[-_ ]?\d{3,}|\bINV[-_ /]?\d/i;
      if (!facture.test(sujet) && !pdfs.some(n => facture.test(n))) return;
      vus.push({ de: de, email: email, sujet: sujet, date: msg.getDate(), pdf: pdfs[0] });
    });
    fil.addLabel(lib);
  });
  if (!vus.length) return;
  const p = PropertiesService.getScriptProperties();
  let journal = []; try { journal = JSON.parse(p.getProperty('aTrier') || '[]'); } catch (e) { }
  vus.forEach(x => journal.push({ le: new Date().toISOString(), de: x.email, sujet: x.sujet, pdf: x.pdf, recu: x.date.toISOString() }));
  p.setProperty('aTrier', JSON.stringify(journal.slice(-30)));
  const tz = 'Europe/Paris';
  const titre = vus.length === 1 ? 'Facture d\'un nouveau fournisseur ?' : vus.length + ' factures de nouveaux fournisseurs ?';
  const message = vus.map(x => '• ' + x.de + ' — ' + x.sujet + ' (' + Utilities.formatDate(x.date, tz, "dd/MM HH:mm") + ')').join('\n')
    + '\nPas encore dans la liste : touche pour qu\'on l\'ajoute avec Claude';
  envoyer_(titre, message, 'question', 3);
}

/* Notification sur le téléphone d'Adam (appli ntfy, gratuite) : une seule notification par passage, même s'il y a plusieurs factures.
   La nuit (21 h – 7 h) elle arrive sans sonner. La toucher ouvre la conversation avec Claude. */
function notifier_(liste) {
  if (!liste.length) return;
  const tz = 'Europe/Paris';
  let titre, message, tag;
  if (liste.length === 1) {
    const x = liste[0];
    titre = (x.mixte ? 'Nouveau document : ' : 'Nouvelle facture : ') + x.f;
    message = x.sujet + '\nReçu le ' + Utilities.formatDate(x.date, tz, "dd/MM 'à' HH:mm") + '\nTouche ici : on la traite ensemble avec Claude (fournisseur, gabarit, références)';
    tag = x.mixte ? 'page_facing_up' : 'receipt';
  } else {
    titre = liste.length + ' nouvelles factures';
    message = liste.map(x => '• ' + x.f + ' : ' + x.sujet).join('\n') + '\nTouche ici : on les traite ensemble avec Claude';
    tag = 'receipt';
  }
  envoyer_(titre, message, tag, 4);
}
function envoyer_(titre, message, tag, priorite) {
  if (!CONFIG.NTFY_SUJET) return;
  const heure = Number(Utilities.formatDate(new Date(), 'Europe/Paris', 'H'));
  const nuit = heure >= 21 || heure < 7;
  try {
    UrlFetchApp.fetch('https://ntfy.sh', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      payload: JSON.stringify({
        topic: CONFIG.NTFY_SUJET, title: titre, message: message, priority: nuit ? 2 : priorite, tags: [tag], click: CONFIG.LIEN_CLAUDE,
        actions: [{ action: 'view', label: 'Ouvrir Claude', url: CONFIG.LIEN_CLAUDE }, { action: 'view', label: 'Voir dans l\'appli', url: CONFIG.LIEN_APPLI }]
      })
    });
  } catch (e) { Logger.log('Notification impossible : ' + e); }
}

/* Pour tester la notification sur le téléphone (bouton ▶ sur cette fonction). */
function testerNotification() {
  envoyer_('Test BHVA', 'Les factures arriveront ici. Touche pour ouvrir Claude.', 'white_check_mark', 4);
}

function traiterMessage_(msg, liste) {
  const de = msg.getFrom();
  const email = ((de.match(/<([^>]+)>/) || [null, de])[1] || '').trim().toLowerCase();
  const sujet = msg.getSubject() || '';
  if (msg.getDate() < CONFIG.DEPUIS) return 0;            // reçu avant le départ : on ne prend pas
  const regle = regleFacture(email, sujet);
  if (!regle) return 0;                                   // pas un mail de facture : on ne prend rien
  if (!mailScanner_(msg, regle, email, sujet)) return 0;  // mail de la boucherie qui n'est pas un scan (transfert, etc.)
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
    const fiche = {
      type: 'facture', fournisseur: regle.f, numero: '', date: date, echeance: '',
      ht: null, tva: null, ttc: null, statut: 'a_payer', note: '', photo: '',
      source: regle.scan ? 'scan' : 'mail', lu: 'a_lire',
      pdf: { n: morceaux, taille: octets.length, sha256: empreinte, nom: a.getName() },
      mail: { id: msg.getId(), de: de, email: email, sujet: sujet, date: msg.getDate().toISOString() },
      cree: new Date().toISOString()
    };
    if (regle.scan) fiche.scan = { de: 'Brother ADS-1700W', le: msg.getDate().toISOString(), nom: a.getName() };
    creer_('factures', id, fiche);
    n++;
    if (liste && !regle.scan) liste.push({ f: regle.f, sujet: sujet, date: msg.getDate(), mixte: !!regle.mixte });
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

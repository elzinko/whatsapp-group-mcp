// Lecture du drapeau d'authentification forte (Touch ID) sur grant_channel (ADR-0003).
//
// FAIL-SECURE VERS LE HAUT : toute incertitude (fichier absent, illisible, corrompu)
// retourne true (ON). L'absence du fichier est un état ON valide (défaut du projet),
// pas une erreur — seul un JSON explicite {"enabled":false} désarme la garde.
//
// Feuille d'infra volontairement minimale : aucune écriture, aucun cache, aucun
// bootstrap. Lue à chaque appel pour refléter un désarmement/réarmement manuel
// immédiat (voir src/index.js, composition root).

import fs from "node:fs";

export function readStrongAuthEnabled(file) {
  let raw;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch {
    // Absent ou illisible : fail-secure vers le HAUT.
    return true;
  }

  try {
    const parsed = JSON.parse(raw);
    return parsed?.enabled !== false;
  } catch {
    // JSON corrompu : fail-secure vers le HAUT.
    return true;
  }
}

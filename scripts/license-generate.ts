import "dotenv/config";
/**
 * Génère une clé de licence : npm run license:generate -- "RICHBOND CI"
 * Lit LICENSE_SECRET dans l'environnement (>= 32 caractères, aucun repli). Aucun accès base.
 */
import { generateLicenseKey, MIN_SECRET_LENGTH, normalizeLicensedTo } from "../src/modules/licensing/key";

const secret = process.env.LICENSE_SECRET;
const licensedTo = normalizeLicensedTo(process.argv.slice(2).join(" "));

if (!secret || secret.length < MIN_SECRET_LENGTH) {
  console.error(`LICENSE_SECRET est absente ou trop courte (${MIN_SECRET_LENGTH} caractères minimum).`);
  process.exit(1);
}
if (licensedTo.length < 2) {
  console.error('Usage : npm run license:generate -- "RICHBOND CI"');
  process.exit(1);
}
console.log(generateLicenseKey(secret, licensedTo));

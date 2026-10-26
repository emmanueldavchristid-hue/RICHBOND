// Partie pure et légère : importable aussi côté client (types, champs, correspondance de colonnes).
// Serveur uniquement : "@/modules/import/service" (aperçu, import, rapport), "./templates" (modèles Excel), "./schemas" (FormData).
// Les actions serveur sont dans "@/app/(app)/parametres/import/actions".
export * from "./types";
export { suggestMapping, resolveMapping, normalizeText } from "./mapping";

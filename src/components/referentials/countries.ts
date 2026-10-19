/** Pays proposés pour les fournisseurs (code ISO 2 lettres). Un code absent de la liste reste affiché tel quel. */
export const COUNTRIES: { code: string; name: string }[] = [
  { code: "CI", name: "Côte d'Ivoire" },
  { code: "BF", name: "Burkina Faso" },
  { code: "GH", name: "Ghana" },
  { code: "ML", name: "Mali" },
  { code: "MA", name: "Maroc" },
  { code: "NG", name: "Nigéria" },
  { code: "SN", name: "Sénégal" },
  { code: "TG", name: "Togo" },
  { code: "ZA", name: "Afrique du Sud" },
  { code: "CN", name: "Chine" },
  { code: "IN", name: "Inde" },
  { code: "TR", name: "Turquie" },
  { code: "AE", name: "Émirats arabes unis" },
  { code: "TW", name: "Taïwan" },
  { code: "VN", name: "Viêt Nam" },
  { code: "FR", name: "France" },
  { code: "DE", name: "Allemagne" },
  { code: "IT", name: "Italie" },
  { code: "ES", name: "Espagne" },
  { code: "BE", name: "Belgique" },
  { code: "NL", name: "Pays-Bas" },
  { code: "PT", name: "Portugal" },
  { code: "GB", name: "Royaume-Uni" },
  { code: "CH", name: "Suisse" },
  { code: "US", name: "États-Unis" },
];

export function countryName(code: string): string {
  return COUNTRIES.find((c) => c.code === code)?.name ?? code;
}

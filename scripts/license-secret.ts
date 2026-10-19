import { randomBytes } from "node:crypto";

/** Imprime un secret aléatoire à copier dans LICENSE_SECRET. */
console.log(randomBytes(32).toString("base64url"));

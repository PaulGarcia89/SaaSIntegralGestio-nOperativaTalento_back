-- Idioma del PDF cuya huella SHA-256 quedo registrada al enviar la oferta.
-- Es la copia RECTORA: la que firma el candidato y la que un auditor puede
-- verificar contra "pdfSha256". Las descargas en otro idioma son traducciones
-- de cortesia y se marcan como tales.
--
-- Aditiva y nullable a proposito: NULL significa "generado antes de que el PDF
-- fuera bilingue", y el codigo lo interpreta como castellano, que es lo que
-- efectivamente se genero. No se reescribe ninguna fila existente.
ALTER TABLE "JobOfferVersion"
  ADD COLUMN "pdfLocale" VARCHAR(5);

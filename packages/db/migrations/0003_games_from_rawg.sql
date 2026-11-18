-- Les jeux saisis à la main (sans identifiant RAWG) sont supprimés, avec leurs avis :
-- désormais, chaque jeu provient du catalogue RAWG.
DELETE FROM "games";--> statement-breakpoint
DROP INDEX "games_title_lower_idx";--> statement-breakpoint
ALTER TABLE "games" ALTER COLUMN "title" SET DATA TYPE varchar(200);--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "rawg_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "cover_url" text;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "released" varchar(10);--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "platforms" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "genres" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "games_rawg_id_idx" ON "games" USING btree ("rawg_id");
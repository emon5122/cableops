CREATE TABLE "annotations" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"kind" text DEFAULT 'rect' NOT NULL,
	"label" text,
	"x" integer DEFAULT 0 NOT NULL,
	"y" integer DEFAULT 0 NOT NULL,
	"width" integer DEFAULT 200 NOT NULL,
	"height" integer DEFAULT 150 NOT NULL,
	"color" text DEFAULT '#334155' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "annotations" ADD CONSTRAINT "annotations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
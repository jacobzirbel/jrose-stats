CREATE TABLE `catalog_items` (
	`id` integer PRIMARY KEY NOT NULL,
	`category_id` integer NOT NULL,
	`slug` text NOT NULL,
	`label` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'proposed' NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "catalog_items_status_chk" CHECK("catalog_items"."status" IN ('proposed','active','retired'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `catalog_items_category_slug_uq` ON `catalog_items` (`category_id`,`slug`);--> statement-breakpoint
CREATE TABLE `categories` (
	`id` integer PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`label` text NOT NULL,
	`keybind` text,
	`icon` text,
	`required` integer DEFAULT 0 NOT NULL,
	`timestamp_load_bearing` integer DEFAULT 1 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_slug_unique` ON `categories` (`slug`);--> statement-breakpoint
CREATE TABLE `category_fields` (
	`id` integer PRIMARY KEY NOT NULL,
	`category_id` integer NOT NULL,
	`catalog_item_id` integer,
	`slug` text NOT NULL,
	`label` text NOT NULL,
	`type` text DEFAULT 'text' NOT NULL,
	`ref_category_id` integer,
	`options` text,
	`required` integer DEFAULT 0 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`catalog_item_id`) REFERENCES `catalog_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`ref_category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "category_fields_type_chk" CHECK("category_fields"."type" IN ('text','number','duration','enum','catalog_ref'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `category_fields_item_slug_uq` ON `category_fields` (`category_id`,`catalog_item_id`,`slug`) WHERE "category_fields"."catalog_item_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `category_fields_cat_slug_uq` ON `category_fields` (`category_id`,`slug`) WHERE "category_fields"."catalog_item_id" IS NULL;--> statement-breakpoint
CREATE TABLE `claim_fields` (
	`id` integer PRIMARY KEY NOT NULL,
	`claim_id` integer NOT NULL,
	`field_id` integer NOT NULL,
	`value` text,
	`value_catalog_item_id` integer,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`claim_id`) REFERENCES `event_claims`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`field_id`) REFERENCES `category_fields`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`value_catalog_item_id`) REFERENCES `catalog_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `claim_fields_claim_field_uq` ON `claim_fields` (`claim_id`,`field_id`);--> statement-breakpoint
CREATE TABLE `coverage_spans` (
	`id` integer PRIMARY KEY NOT NULL,
	`log_id` integer NOT NULL,
	`start_sec` real NOT NULL,
	`end_sec` real NOT NULL,
	FOREIGN KEY (`log_id`) REFERENCES `video_logs`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "coverage_spans_order_chk" CHECK("coverage_spans"."end_sec" > "coverage_spans"."start_sec")
);
--> statement-breakpoint
CREATE TABLE `event_claims` (
	`id` integer PRIMARY KEY NOT NULL,
	`log_id` integer NOT NULL,
	`catalog_item_id` integer NOT NULL,
	`timestamp_sec` real NOT NULL,
	`note` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`log_id`) REFERENCES `video_logs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`catalog_item_id`) REFERENCES `catalog_items`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "event_claims_status_chk" CHECK("event_claims"."status" IN ('draft','proposed','agreed','contested','overturned','certified','retracted'))
);
--> statement-breakpoint
CREATE INDEX `ix_claims_log` ON `event_claims` (`log_id`);--> statement-breakpoint
CREATE INDEX `ix_claims_catalog` ON `event_claims` (`catalog_item_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`token` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`expires_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `user_settings` (
	`user_id` integer NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	PRIMARY KEY(`user_id`, `key`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`points` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	CONSTRAINT "users_role_chk" CHECK("users"."role" IN ('member','editor','admin'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `video_logs` (
	`id` integer PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`video_id` integer NOT NULL,
	`slot` integer,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	`submitted_at` text,
	`deleted_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`video_id`) REFERENCES `videos`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "video_logs_status_chk" CHECK("video_logs"."status" IN ('draft','submitted')),
	CONSTRAINT "video_logs_slot_chk" CHECK("video_logs"."slot" IS NULL OR "video_logs"."slot" IN (1,2))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `video_logs_user_video_uq` ON `video_logs` (`user_id`,`video_id`) WHERE "video_logs"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `video_logs_video_slot_uq` ON `video_logs` (`video_id`,`slot`) WHERE "video_logs"."deleted_at" IS NULL;--> statement-breakpoint
CREATE TABLE `videos` (
	`id` integer PRIMARY KEY NOT NULL,
	`title` text,
	`url` text,
	`youtube_id` text,
	`playlist_pos` integer,
	`published_at` text,
	`duration_sec` real
);
--> statement-breakpoint
CREATE TABLE `claim_run` (
	`claim_id` integer PRIMARY KEY NOT NULL,
	`run_id` integer NOT NULL,
	FOREIGN KEY (`claim_id`) REFERENCES `event_claims`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `gyms` (
	`id` integer PRIMARY KEY NOT NULL,
	`catalog_item_id` integer NOT NULL,
	`leader` text NOT NULL,
	`city` text NOT NULL,
	`canonical_order` integer NOT NULL,
	FOREIGN KEY (`catalog_item_id`) REFERENCES `catalog_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gyms_catalog_item_id_unique` ON `gyms` (`catalog_item_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `gyms_canonical_order_unique` ON `gyms` (`canonical_order`);--> statement-breakpoint
CREATE TABLE `moves` (
	`id` integer PRIMARY KEY NOT NULL,
	`catalog_item_id` integer NOT NULL,
	`name` text NOT NULL,
	`category` text,
	FOREIGN KEY (`catalog_item_id`) REFERENCES `catalog_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `moves_catalog_item_id_unique` ON `moves` (`catalog_item_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `moves_name_unique` ON `moves` (`name`);--> statement-breakpoint
CREATE TABLE `pokemon` (
	`dex` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`is_glitch` integer DEFAULT 0 NOT NULL,
	`type1` text,
	`type2` text
);
--> statement-breakpoint
CREATE TABLE `pokemon_moves` (
	`pokemon_dex` integer NOT NULL,
	`move_id` integer NOT NULL,
	PRIMARY KEY(`pokemon_dex`, `move_id`),
	FOREIGN KEY (`pokemon_dex`) REFERENCES `pokemon`(`dex`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`move_id`) REFERENCES `moves`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `run_stats` (
	`log_id` integer NOT NULL,
	`run_id` integer NOT NULL,
	`jrose_tier` text,
	`tier_position` integer,
	`final_level` integer,
	`completion_sec` real,
	PRIMARY KEY(`log_id`, `run_id`),
	FOREIGN KEY (`log_id`) REFERENCES `video_logs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `run_videos` (
	`run_id` integer NOT NULL,
	`video_id` integer NOT NULL,
	`part_no` integer DEFAULT 1 NOT NULL,
	PRIMARY KEY(`run_id`, `video_id`),
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`video_id`) REFERENCES `videos`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `runs` (
	`id` integer PRIMARY KEY NOT NULL,
	`pokemon_dex` integer NOT NULL,
	`attempt_no` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'untouched' NOT NULL,
	`record_state` text DEFAULT 'logging' NOT NULL,
	FOREIGN KEY (`pokemon_dex`) REFERENCES `pokemon`(`dex`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "runs_status_chk" CHECK("runs"."status" IN ('untouched','in_progress','done','impossible_abandoned')),
	CONSTRAINT "runs_record_state_chk" CHECK("runs"."record_state" IN ('logging','reconciling','escalated','live'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `runs_pokemon_attempt_uq` ON `runs` (`pokemon_dex`,`attempt_no`);
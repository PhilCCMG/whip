CREATE TABLE `rateLimit` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`count` integer NOT NULL,
	`lastRequest` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rateLimit_key_unique` ON `rateLimit` (`key`);--> statement-breakpoint
ALTER TABLE `campaigns` ADD `wipe_confirmed_at` text;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `create_key` text;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `create_request_hash` text;--> statement-breakpoint
CREATE UNIQUE INDEX `campaigns_owner_create_key_idx` ON `campaigns` (`owner_id`,`create_key`);--> statement-breakpoint
CREATE INDEX `campaigns_status_created_idx` ON `campaigns` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `campaigns_deleted_wipe_idx` ON `campaigns` (`deleted_at`,`wipe_confirmed_at`);
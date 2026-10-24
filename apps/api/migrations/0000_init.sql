CREATE TABLE `campaigns` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`scenario_key` text NOT NULL,
	`status` text DEFAULT 'initialising' NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`sim_date` text,
	`turn` integer DEFAULT 0 NOT NULL,
	`player_politician_id` text,
	`simulation_version` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE INDEX `campaigns_owner_updated_idx` ON `campaigns` (`owner_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `user_preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`data` text DEFAULT '{}' NOT NULL,
	`updated_at` text NOT NULL
);

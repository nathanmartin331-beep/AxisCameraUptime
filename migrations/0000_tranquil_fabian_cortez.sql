CREATE TABLE `cameras` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`ip_address` text NOT NULL,
	`username` text NOT NULL,
	`encrypted_password` text NOT NULL,
	`location` text,
	`notes` text,
	`current_boot_id` text,
	`last_seen_at` integer,
	`current_status` text DEFAULT 'unknown',
	`video_status` text DEFAULT 'unknown',
	`last_video_check` integer,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `dashboard_layouts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`layout` text NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dashboard_layouts_user_id_unique` ON `dashboard_layouts` (`user_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`sid` text PRIMARY KEY NOT NULL,
	`sess` text NOT NULL,
	`expire` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `IDX_session_expire` ON `sessions` (`expire`);--> statement-breakpoint
CREATE TABLE `uptime_events` (
	`id` text PRIMARY KEY NOT NULL,
	`camera_id` text NOT NULL,
	`timestamp` integer NOT NULL,
	`status` text NOT NULL,
	`video_status` text,
	`uptime_seconds` integer,
	`boot_id` text,
	`response_time_ms` integer,
	`error_message` text,
	FOREIGN KEY (`camera_id`) REFERENCES `cameras`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_uptime_events_camera_timestamp` ON `uptime_events` (`camera_id`,`timestamp`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password` text NOT NULL,
	`first_name` text,
	`last_name` text,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);
CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`currency` text NOT NULL,
	`scope` text NOT NULL,
	`locked_through` text,
	`csv_mapping` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`parent_id` text,
	`name` text NOT NULL,
	`kind` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `fx_rates` (
	`rate_date` text NOT NULL,
	`pair` text NOT NULL,
	`rate` text NOT NULL,
	`source` text NOT NULL,
	`fetched_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fx_rates_rate_date_pair_unique` ON `fx_rates` (`rate_date`,`pair`);--> statement-breakpoint
CREATE TABLE `merchant_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`category_id` text NOT NULL,
	`pattern` text NOT NULL,
	`scope` text,
	`hit_count` integer DEFAULT 0 NOT NULL,
	`last_used` text,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `statements` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`period_start` text NOT NULL,
	`period_end` text NOT NULL,
	`opening_minor` integer NOT NULL,
	`closing_minor` integer NOT NULL,
	`file_ref` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `statements_account_id_period_start_period_end_unique` ON `statements` (`account_id`,`period_start`,`period_end`);--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`statement_id` text,
	`category_id` text,
	`posted_on` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`merchant_raw` text,
	`merchant_norm` text,
	`cat_source` text,
	`confidence` real,
	`transfer_group` text,
	`superseded_by` text,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`statement_id`) REFERENCES `statements`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `transactions_account_posted_idx` ON `transactions` (`account_id`,`posted_on`);--> statement-breakpoint
CREATE INDEX `transactions_category_idx` ON `transactions` (`category_id`);--> statement-breakpoint
ALTER TABLE `users` ADD `default_scope` text DEFAULT 'household' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `quick_add_currency` text;
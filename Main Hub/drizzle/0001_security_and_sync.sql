ALTER TABLE `diagnoses` ADD `source_local_id` text;--> statement-breakpoint
ALTER TABLE `diagnoses` ADD `source_facility_id` integer REFERENCES facilities(id);--> statement-breakpoint
ALTER TABLE `surgeries` ADD `surgeon_name` text;--> statement-breakpoint
ALTER TABLE `surgeries` ADD `source_local_id` text;--> statement-breakpoint
ALTER TABLE `surgeries` ADD `source_facility_id` integer REFERENCES facilities(id);--> statement-breakpoint
ALTER TABLE `users` ADD `failed_login_attempts` integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE `users` ADD `locked_until` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `must_change_password` integer DEFAULT false;--> statement-breakpoint
ALTER TABLE `users` ADD `password_changed_at` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `created_by_user_id` integer;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `patients_source_unique` ON `patients` (`registered_at_facility_id`, `source_local_id`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `surgeries_source_unique` ON `surgeries` (`source_facility_id`, `source_local_id`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `diagnoses_source_unique` ON `diagnoses` (`source_facility_id`, `source_local_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `patients_updated_at_idx` ON `patients` (`updated_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `audit_logs_created_at_idx` ON `audit_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `sessions_user_idx` ON `sessions` (`user_id`);

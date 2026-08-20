PRAGMA foreign_keys = OFF;

CREATE TABLE clients (
	"id" BLOB NOT NULL,
	"name" TEXT,
	"currency_id (FK)" BLOB,
	"hourly_rate_cents" INTEGER,
	"billing_cycle" TEXT,
	"payment_method" TEXT,
	"payment_account_id (FK)" BLOB,
	"is_deleted" INTEGER,
	PRIMARY KEY("id")
);

CREATE TABLE projects (
	"id" BLOB NOT NULL,
	"client_id" BLOB,
	"name" TEXT,
	"status" TEXT,
	"hourly_rate_cents" INTEGER,
	"is_billable" INTEGER,
	"is_deleted" INTEGER,
	PRIMARY KEY("id"),
	FOREIGN KEY ("client_id") REFERENCES "clients"("id")
	ON UPDATE NO ACTION ON DELETE NO ACTION
);

CREATE TABLE tasks (
	"id" BLOB NOT NULL,
	"name" TEXT,
	"is_nullable" INTEGER,
	"is_deleted" INTEGER,
	PRIMARY KEY("id")
);

CREATE TABLE time_entries (
	"id" BLOB NOT NULL,
	"project_id" BLOB,
	"task_id" BLOB,
	"user_id (FK)" BLOB,
	"entry_date" TEXT,
	"description" TEXT,
	"duration_minutes" INTEGER,
	"rate_cents" INTEGER,
	"invoice_id" BLOB,
	"is_locked" INTEGER,
	PRIMARY KEY("id"),
	FOREIGN KEY ("project_id") REFERENCES "projects"("id")
	ON UPDATE NO ACTION ON DELETE NO ACTION,
	FOREIGN KEY ("task_id") REFERENCES "tasks"("id")
	ON UPDATE NO ACTION ON DELETE NO ACTION,
	FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id")
	ON UPDATE NO ACTION ON DELETE NO ACTION
);

CREATE TABLE payout_accounts (
	"id" BLOB NOT NULL,
	"type" TEXT,
	"swift" TEXT,
	"iban" TEXT,
	"clabe" TEXT,
	"lightning_address" TEXT,
	"is_deleted" INTEGER,
	PRIMARY KEY("id")
);

CREATE TABLE invoices (
	"id" BLOB NOT NULL,
	"invoice_number" TEXT,
	"client_id" BLOB,
	"status" TEXT,
	"currency_id (FK)" BLOB,
	"period_start" TEXT,
	"period_end" TEXT,
	"total_cents" INTEGER,
	"payment_method (FK)" TEXT,
	"payment_hash" TEXT,
	"bolt11" TEXT,
	PRIMARY KEY("id"),
	FOREIGN KEY ("client_id") REFERENCES "clients"("id")
	ON UPDATE NO ACTION ON DELETE NO ACTION
);

CREATE TABLE invoice_line_items (
	"id" BLOB NOT NULL,
	"invoice_id" BLOB,
	"project_id" BLOB,
	"quantity_minutes" INTEGER,
	"rate_cents" INTEGER,
	"amount_cents" INTEGER,
	PRIMARY KEY("id"),
	FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id")
	ON UPDATE NO ACTION ON DELETE NO ACTION,
	FOREIGN KEY ("project_id") REFERENCES "projects"("id")
	ON UPDATE NO ACTION ON DELETE NO ACTION
);

CREATE TABLE invoice_payments (
	"payment_id (FK)" BLOB NOT NULL,
	"invoice_id" BLOB,
	PRIMARY KEY("payment_id (FK)"),
	FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id")
	ON UPDATE NO ACTION ON DELETE NO ACTION
);

PRAGMA foreign_keys = ON;

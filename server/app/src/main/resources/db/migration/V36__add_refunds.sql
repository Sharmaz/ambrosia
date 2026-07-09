PRAGMA foreign_keys = ON;

CREATE TABLE refunds (
    id BLOB PRIMARY KEY,
    order_id BLOB NOT NULL UNIQUE REFERENCES orders(id),
    refund_invoice TEXT NOT NULL DEFAULT '',
    satoshi_amount INTEGER NOT NULL DEFAULT 0,
    refunded_at TEXT NOT NULL
);

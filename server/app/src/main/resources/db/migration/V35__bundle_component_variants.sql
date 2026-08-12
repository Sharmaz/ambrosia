PRAGMA foreign_keys = OFF;

CREATE TABLE product_bundle_components_new (
    bundle_id            BLOB NOT NULL,
    component_id         BLOB NOT NULL,
    component_variant_id BLOB,
    quantity             INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (bundle_id, component_id),
    FOREIGN KEY (bundle_id) REFERENCES products (id) ON DELETE CASCADE,
    FOREIGN KEY (component_id) REFERENCES products (id) ON DELETE RESTRICT,
    FOREIGN KEY (component_variant_id) REFERENCES product_variants (id) ON DELETE RESTRICT
);

INSERT INTO product_bundle_components_new (bundle_id, component_id, component_variant_id, quantity)
SELECT bundle_id, component_id, NULL, quantity
FROM product_bundle_components;

DROP TABLE product_bundle_components;
ALTER TABLE product_bundle_components_new RENAME TO product_bundle_components;

PRAGMA foreign_keys = ON;

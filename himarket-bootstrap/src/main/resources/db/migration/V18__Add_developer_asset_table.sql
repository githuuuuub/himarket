-- ========================================
-- Developer Asset (开发者资产)
-- ========================================
CREATE TABLE IF NOT EXISTS `developer_asset` (
    `id`                 BIGINT          NOT NULL AUTO_INCREMENT,
    `asset_id`           VARCHAR(64)     NOT NULL,
    `owner_id`           VARCHAR(64)     NOT NULL,
    `portal_id`          VARCHAR(64)     NOT NULL,
    `name`               VARCHAR(128)    NOT NULL,
    `type`               VARCHAR(32)     NOT NULL,
    `config`             JSON            NOT NULL,
    `review_status`      VARCHAR(32)     NOT NULL DEFAULT 'DRAFT',
    `review_comment`     TEXT            NULL,
    `reviewed_by`        VARCHAR(64)     NULL,
    `reviewed_at`        DATETIME(3)     NULL,
    `submitted_at`       DATETIME(3)     NULL,
    `product_id`         VARCHAR(64)     NULL,
    `parent_asset_id`    VARCHAR(64)     NULL,
    `unpublished_reason` TEXT            NULL,
    `unpublished_by`     VARCHAR(64)     NULL,
    `unpublished_at`     DATETIME(3)     NULL,
    `created_at`         DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at`         DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_asset_id` (`asset_id`),
    INDEX `idx_owner_id` (`owner_id`),
    INDEX `idx_portal_review` (`portal_id`, `review_status`),
    INDEX `idx_owner_type` (`owner_id`, `type`),
    INDEX `idx_parent_asset` (`parent_asset_id`),
    INDEX `idx_product_id` (`product_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

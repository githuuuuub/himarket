/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

package com.alibaba.himarket.entity;

import com.alibaba.himarket.converter.DeveloperAssetConfigConverter;
import com.alibaba.himarket.support.asset.DeveloperAssetConfig;
import com.alibaba.himarket.support.enums.AssetType;
import com.alibaba.himarket.support.enums.ReviewStatus;
import jakarta.persistence.*;
import java.time.LocalDateTime;
import lombok.*;

@Entity
@Table(
        name = "developer_asset",
        uniqueConstraints = {
            @UniqueConstraint(
                    columnNames = {"asset_id"},
                    name = "uk_asset_id")
        })
@Data
@EqualsAndHashCode(callSuper = true)
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DeveloperAsset extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "asset_id", length = 64, nullable = false)
    private String assetId;

    @Column(name = "owner_id", length = 64, nullable = false)
    private String ownerId;

    @Column(name = "portal_id", length = 64, nullable = false)
    private String portalId;

    @Column(name = "name", length = 128, nullable = false)
    private String name;

    @Column(name = "type", length = 32, nullable = false)
    @Enumerated(EnumType.STRING)
    private AssetType type;

    @Column(name = "config", columnDefinition = "json", nullable = false)
    @Convert(converter = DeveloperAssetConfigConverter.class)
    private DeveloperAssetConfig config;

    @Column(name = "review_status", length = 32, nullable = false)
    @Enumerated(EnumType.STRING)
    @Builder.Default
    private ReviewStatus reviewStatus = ReviewStatus.DRAFT;

    @Column(name = "review_comment", columnDefinition = "text")
    private String reviewComment;

    @Column(name = "reviewed_by", length = 64)
    private String reviewedBy;

    @Column(name = "reviewed_at", columnDefinition = "datetime(3)")
    private LocalDateTime reviewedAt;

    @Column(name = "submitted_at", columnDefinition = "datetime(3)")
    private LocalDateTime submittedAt;

    @Column(name = "product_id", length = 64)
    private String productId;

    @Column(name = "parent_asset_id", length = 64)
    private String parentAssetId;

    @Column(name = "unpublished_reason", columnDefinition = "text")
    private String unpublishedReason;

    @Column(name = "unpublished_by", length = 64)
    private String unpublishedBy;

    @Column(name = "unpublished_at", columnDefinition = "datetime(3)")
    private LocalDateTime unpublishedAt;
}

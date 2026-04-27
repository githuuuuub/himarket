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

package com.alibaba.himarket.repository;

import com.alibaba.himarket.entity.DeveloperAsset;
import com.alibaba.himarket.support.enums.AssetType;
import com.alibaba.himarket.support.enums.ReviewStatus;
import java.time.LocalDateTime;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface DeveloperAssetRepository extends BaseRepository<DeveloperAsset, Long> {

    /**
     * Find asset by asset ID
     *
     * @param assetId the asset ID
     * @return the asset if found
     */
    Optional<DeveloperAsset> findByAssetId(String assetId);

    /**
     * Find assets by owner ID, excluding a specific review status (paginated)
     *
     * @param ownerId the owner ID
     * @param status the review status to exclude
     * @param pageable pagination info
     * @return the page of assets
     */
    Page<DeveloperAsset> findByOwnerIdAndReviewStatusNot(
            String ownerId, ReviewStatus status, Pageable pageable);

    /**
     * Find all assets by owner ID (paginated)
     *
     * @param ownerId the owner ID
     * @param pageable pagination info
     * @return the page of assets
     */
    Page<DeveloperAsset> findByOwnerId(String ownerId, Pageable pageable);

    /**
     * Find assets by portal ID and review status (paginated)
     *
     * @param portalId the portal ID
     * @param status the review status
     * @param pageable pagination info
     * @return the page of assets
     */
    Page<DeveloperAsset> findByPortalIdAndReviewStatus(
            String portalId, ReviewStatus status, Pageable pageable);

    /**
     * Check if an asset with the same owner, type, and name already exists (excluding SUPERSEDED
     * and copies)
     *
     * @param ownerId the owner ID
     * @param type the asset type
     * @param name the asset name
     * @param excludeStatus the review status to exclude (SUPERSEDED)
     * @return true if a duplicate exists
     */
    boolean existsByOwnerIdAndTypeAndNameAndReviewStatusNotAndParentAssetIdIsNull(
            String ownerId, AssetType type, String name, ReviewStatus excludeStatus);

    /**
     * Find a copy of an asset that is not in the excluded status
     *
     * @param parentAssetId the parent asset ID
     * @param excludeStatus the review status to exclude (SUPERSEDED)
     * @return the copy if found
     */
    Optional<DeveloperAsset> findByParentAssetIdAndReviewStatusNot(
            String parentAssetId, ReviewStatus excludeStatus);

    /**
     * Find asset by product ID and review status
     *
     * @param productId the product ID
     * @param status the review status
     * @return the asset if found
     */
    Optional<DeveloperAsset> findByProductIdAndReviewStatus(String productId, ReviewStatus status);

    /**
     * Find private assets for a developer (excluding SUPERSEDED and assets already published to a
     * portal)
     *
     * @param ownerId the owner ID
     * @return the list of private assets
     */
    @Query(
            "SELECT a FROM DeveloperAsset a WHERE a.ownerId = :ownerId "
                    + "AND a.reviewStatus <> 'SUPERSEDED' "
                    + "AND (a.productId IS NULL "
                    + "     OR NOT EXISTS (SELECT 1 FROM ProductPublication pp "
                    + "                    WHERE pp.productId = a.productId))")
    java.util.List<DeveloperAsset> findPrivateAssets(@Param("ownerId") String ownerId);

    /**
     * Optimistic lock update of review status
     *
     * @param assetId the asset ID
     * @param expectedStatus the expected current status
     * @param newStatus the new status to set
     * @param submittedAt the submitted timestamp
     * @return the number of rows updated (0 if optimistic lock failed)
     */
    @Modifying
    @Query(
            "UPDATE DeveloperAsset a SET a.reviewStatus = :newStatus, "
                    + "a.submittedAt = :submittedAt "
                    + "WHERE a.assetId = :assetId AND a.reviewStatus = :expectedStatus")
    int updateReviewStatus(
            @Param("assetId") String assetId,
            @Param("expectedStatus") ReviewStatus expectedStatus,
            @Param("newStatus") ReviewStatus newStatus,
            @Param("submittedAt") LocalDateTime submittedAt);
}

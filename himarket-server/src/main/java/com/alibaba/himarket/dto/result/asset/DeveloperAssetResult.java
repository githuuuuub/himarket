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

package com.alibaba.himarket.dto.result.asset;

import com.alibaba.himarket.dto.converter.OutputConverter;
import com.alibaba.himarket.entity.DeveloperAsset;
import com.alibaba.himarket.support.asset.DeveloperAssetConfig;
import com.alibaba.himarket.support.enums.AssetType;
import com.alibaba.himarket.support.enums.ReviewStatus;
import java.time.LocalDateTime;
import lombok.Data;

@Data
public class DeveloperAssetResult implements OutputConverter<DeveloperAssetResult, DeveloperAsset> {

    private String assetId;

    private String ownerId;

    private String portalId;

    private String name;

    private AssetType type;

    private DeveloperAssetConfig config;

    private ReviewStatus reviewStatus;

    private String reviewComment;

    private String reviewedBy;

    private LocalDateTime reviewedAt;

    private LocalDateTime submittedAt;

    private String productId;

    private String parentAssetId;

    private String unpublishedReason;

    private String unpublishedBy;

    private LocalDateTime unpublishedAt;

    /** 开发者可见的显示状态 */
    private String displayStatus;

    private LocalDateTime createAt;

    private LocalDateTime updatedAt;
}

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

import com.alibaba.himarket.support.enums.AssetType;
import java.time.LocalDateTime;
import lombok.Data;

/** 审核列表项 */
@Data
public class AssetReviewResult {

    private String assetId;

    private String name;

    private AssetType type;

    private String ownerName;

    private LocalDateTime submittedAt;

    /** 是否为更新副本 */
    private boolean isUpdateCopy;

    /** 关联的 Product 名称（副本时） */
    private String parentProductName;
}

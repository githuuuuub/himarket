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

package com.alibaba.himarket.service;

import com.alibaba.himarket.dto.params.sandbox.ImportSandboxParam;
import com.alibaba.himarket.dto.params.sandbox.QuerySandboxParam;
import com.alibaba.himarket.dto.params.sandbox.UpdateSandboxParam;
import com.alibaba.himarket.dto.result.common.PageResult;
import com.alibaba.himarket.dto.result.sandbox.ClusterInfoResult;
import com.alibaba.himarket.dto.result.sandbox.SandboxResult;
import com.alibaba.himarket.dto.result.sandbox.SandboxSimpleResult;
import java.util.List;
import org.springframework.data.domain.Pageable;

public interface SandboxService {

    /**
     * 获取所有可用（ACTIVE）沙箱列表（Portal 端使用，只返回 id 和名称）
     */
    List<SandboxSimpleResult> listActiveSandboxes();

    /**
     * 获取沙箱实例列表
     */
    PageResult<SandboxResult> listSandboxes(QuerySandboxParam param, Pageable pageable);

    /**
     * 根据 sandboxId 获取沙箱实例
     */
    SandboxResult getSandbox(String sandboxId);

    /**
     * 导入沙箱实例
     */
    void importSandbox(ImportSandboxParam param);

    /**
     * 更新沙箱实例
     */
    void updateSandbox(String sandboxId, UpdateSandboxParam param);

    /**
     * 删除沙箱实例
     */
    void deleteSandbox(String sandboxId);

    /**
     * 获取集群信息（解析KubeConfig，返回namespace列表）
     */
    ClusterInfoResult fetchClusterInfo(String kubeConfig);
}

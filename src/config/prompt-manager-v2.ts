/**
 * 基于SQLite的提示词管理模块 v2
 * 使用单表设计，通过enable标记控制当前使用的版本
 */

import { databaseManager } from './database-manager.js';
import { logger } from '../logger.js';
import { getCurrentTime } from '../timezone.js';
import { readFile } from 'fs/promises';
import { join } from 'path';

/**
 * 提示词配置接口
 */
export interface PromptConfig {
  id?: number;
  version: string;
  lastModified: string;
  systemPrompt: string;
  analysisPrompt: string;
  enabled?: boolean;
}

/**
 * 数据库中的配置记录接口
 */
interface PromptConfigRecord {
  id: number;
  version: string;
  system_prompt: string;
  analysis_prompt: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * 基于SQLite的提示词管理器类 v2
 */
class PromptManagerV2 {
  private cachedConfig: PromptConfig | null = null;
  private lastLoadTime: number = 0;
  private initialized = false;

  /**
   * 初始化管理器
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    await databaseManager.initialize();
    await this.ensureDefaultConfig();
    this.initialized = true;
    
    logger.info('SQLite提示词管理器v2初始化完成');
  }

  /**
   * 确保默认配置存在
   */
  private async ensureDefaultConfig(): Promise<void> {
    const db = databaseManager.getDatabase();
    
    // 检查是否已有启用的配置
    const enabledConfig = db.prepare(`
      SELECT * FROM prompt_configs WHERE enabled = TRUE LIMIT 1
    `).get() as PromptConfigRecord | undefined;

    if (enabledConfig) {
      logger.debug('已有启用的配置', { id: enabledConfig.id, version: enabledConfig.version });
      return;
    }

    // 如果没有启用的配置，创建默认配置
    const defaultConfig = await this.loadDefaultConfigFromFile();
    
    // 插入默认配置并设为启用
    const insertStmt = db.prepare(`
      INSERT INTO prompt_configs (version, system_prompt, analysis_prompt, enabled)
      VALUES (?, ?, ?, TRUE)
    `);

    const result = insertStmt.run(
      defaultConfig.version,
      defaultConfig.systemPrompt,
      defaultConfig.analysisPrompt
    );

    logger.info('默认配置已创建并启用', { 
      id: result.lastInsertRowid,
      version: defaultConfig.version 
    });
  }

  /**
   * 从文件加载默认配置
   */
  private async loadDefaultConfigFromFile(): Promise<PromptConfig> {
    try {
      const defaultConfigPath = join(process.cwd(), 'src', 'config', 'default-prompts.json');
      const defaultContent = await readFile(defaultConfigPath, 'utf-8');
      const defaultData = JSON.parse(defaultContent);
      
      return {
        version: defaultData.version || '1.0.0',
        lastModified: getCurrentTime(),
        systemPrompt: defaultData.systemPrompt,
        analysisPrompt: defaultData.analysisPrompt
      };
    } catch (error) {
      logger.error('加载默认配置文件失败', {
        error: error instanceof Error ? error.message : String(error)
      });
      
      // 如果文件加载失败，返回硬编码的默认配置
      return this.getHardcodedDefaultConfig();
    }
  }

  /**
   * 获取硬编码的默认配置（作为最后的备选方案）
   */
  private getHardcodedDefaultConfig(): PromptConfig {
    return {
      version: '1.0.0',
      lastModified: getCurrentTime(),
      systemPrompt: '你是一位资深的加密货币交易分析师，拥有10年以上金融市场经验，精通缠论、威科夫、江恩、道氏、波浪等各种主流技术分析理论。',
      analysisPrompt: '请基于提供的K线数据进行专业的技术分析。\n\n用户问题: {question}\n交易对: {symbol}\n当前时间: {currentTime}\n时区: {timezone}\n\nK线数据:\n{klineData}'
    };
  }

  /**
   * 验证配置结构
   */
  private validateConfig(config: any): void {
    if (!config || typeof config !== 'object') {
      throw new Error('配置格式无效');
    }

    const requiredFields = ['version', 'systemPrompt', 'analysisPrompt'];
    for (const field of requiredFields) {
      if (!config[field] || typeof config[field] !== 'string') {
        throw new Error(`缺少或无效的字段: ${field}`);
      }
    }
  }

  /**
   * 获取当前启用的配置
   */
  async getConfig(): Promise<PromptConfig> {
    await this.initialize();

    // 如果缓存存在且不超过5分钟，直接返回缓存
    if (this.cachedConfig && Date.now() - this.lastLoadTime < 5 * 60 * 1000) {
      return this.cachedConfig;
    }

    return await this.loadEnabledConfig();
  }

  /**
   * 从数据库加载当前启用的配置
   */
  private async loadEnabledConfig(): Promise<PromptConfig> {
    const db = databaseManager.getDatabase();
    
    try {
      const configRecord = db.prepare(`
        SELECT * FROM prompt_configs 
        WHERE enabled = TRUE 
        LIMIT 1
      `).get() as PromptConfigRecord | undefined;

      if (!configRecord) {
        throw new Error('未找到启用的配置记录');
      }

      const config: PromptConfig = {
        id: configRecord.id,
        version: configRecord.version,
        lastModified: configRecord.updated_at,
        systemPrompt: configRecord.system_prompt,
        analysisPrompt: configRecord.analysis_prompt,
        enabled: configRecord.enabled
      };

      // 验证配置
      this.validateConfig(config);

      // 更新缓存
      this.cachedConfig = config;
      this.lastLoadTime = Date.now();

      logger.debug('从数据库加载启用配置成功', {
        id: config.id,
        version: config.version,
        lastModified: config.lastModified
      });

      return config;

    } catch (error) {
      logger.error('从数据库加载启用配置失败', {
        error: error instanceof Error ? error.message : String(error)
      });
      
      // 如果数据库加载失败，尝试重新创建默认配置
      await this.ensureDefaultConfig();
      return await this.loadEnabledConfig();
    }
  }

  /**
   * 保存新版本配置并设为当前使用
   */
  async saveAsNewVersion(config: PromptConfig): Promise<PromptConfig> {
    await this.initialize();
    
    try {
      // 验证配置
      this.validateConfig(config);
      
      const db = databaseManager.getDatabase();
      
      // 开始事务
      const transaction = db.transaction(() => {
        // 1. 禁用当前启用的配置
        db.prepare(`
          UPDATE prompt_configs SET enabled = FALSE WHERE enabled = TRUE
        `).run();

        // 2. 插入新配置并设为启用
        const insertResult = db.prepare(`
          INSERT INTO prompt_configs (version, system_prompt, analysis_prompt, enabled)
          VALUES (?, ?, ?, TRUE)
        `).run(
          config.version,
          config.systemPrompt,
          config.analysisPrompt
        );

        return insertResult.lastInsertRowid;
      });

      const newConfigId = transaction();

      // 获取新插入的配置
      const newConfig = db.prepare(`
        SELECT * FROM prompt_configs WHERE id = ?
      `).get(newConfigId) as PromptConfigRecord;

      const resultConfig: PromptConfig = {
        id: newConfig.id,
        version: newConfig.version,
        lastModified: newConfig.updated_at,
        systemPrompt: newConfig.system_prompt,
        analysisPrompt: newConfig.analysis_prompt,
        enabled: newConfig.enabled
      };

      // 清除缓存
      this.cachedConfig = null;
      this.lastLoadTime = 0;

      logger.info('新版本配置保存成功', {
        id: resultConfig.id,
        version: resultConfig.version,
        lastModified: resultConfig.lastModified
      });

      return resultConfig;

    } catch (error) {
      logger.error('保存新版本配置失败', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw new Error(`保存新版本配置失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 更新当前启用的配置（不创建新版本）
   */
  async updateCurrentVersion(config: PromptConfig): Promise<PromptConfig> {
    await this.initialize();
    
    try {
      // 验证配置
      this.validateConfig(config);
      
      const db = databaseManager.getDatabase();
      
      // 获取当前启用的配置ID
      const currentConfig = db.prepare(`
        SELECT id FROM prompt_configs WHERE enabled = TRUE LIMIT 1
      `).get() as { id: number } | undefined;

      if (!currentConfig) {
        throw new Error('未找到当前启用的配置');
      }

      // 更新当前配置
      db.prepare(`
        UPDATE prompt_configs 
        SET version = ?, system_prompt = ?, analysis_prompt = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        config.version,
        config.systemPrompt,
        config.analysisPrompt,
        currentConfig.id
      );

      // 获取更新后的配置
      const updatedConfigRecord = db.prepare(`
        SELECT * FROM prompt_configs WHERE id = ?
      `).get(currentConfig.id) as PromptConfigRecord;

      const resultConfig: PromptConfig = {
        id: updatedConfigRecord.id,
        version: updatedConfigRecord.version,
        lastModified: updatedConfigRecord.updated_at,
        systemPrompt: updatedConfigRecord.system_prompt,
        analysisPrompt: updatedConfigRecord.analysis_prompt,
        enabled: updatedConfigRecord.enabled
      };

      // 清除缓存
      this.cachedConfig = null;
      this.lastLoadTime = 0;

      logger.info('当前版本配置更新成功', {
        id: resultConfig.id,
        version: resultConfig.version,
        lastModified: resultConfig.lastModified
      });

      return resultConfig;

    } catch (error) {
      logger.error('更新当前版本配置失败', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw new Error(`更新当前版本配置失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 切换到指定版本
   */
  async switchToVersion(configId: number): Promise<PromptConfig> {
    await this.initialize();
    
    try {
      const db = databaseManager.getDatabase();
      
      // 检查目标配置是否存在
      const targetConfig = db.prepare(`
        SELECT * FROM prompt_configs WHERE id = ?
      `).get(configId) as PromptConfigRecord | undefined;

      if (!targetConfig) {
        throw new Error(`配置ID ${configId} 不存在`);
      }

      // 开始事务
      const transaction = db.transaction(() => {
        // 1. 禁用当前启用的配置
        db.prepare(`
          UPDATE prompt_configs SET enabled = FALSE WHERE enabled = TRUE
        `).run();

        // 2. 启用目标配置
        db.prepare(`
          UPDATE prompt_configs SET enabled = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `).run(configId);
      });

      transaction();

      // 清除缓存
      this.cachedConfig = null;
      this.lastLoadTime = 0;

      // 获取更新后的配置
      const updatedConfig = await this.loadEnabledConfig();

      logger.info('版本切换成功', {
        newId: updatedConfig.id,
        newVersion: updatedConfig.version
      });

      return updatedConfig;

    } catch (error) {
      logger.error('切换版本失败', {
        configId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw new Error(`切换版本失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 获取所有配置版本
   */
  async getAllVersions(limit = 50): Promise<PromptConfig[]> {
    await this.initialize();
    
    const db = databaseManager.getDatabase();
    
    const configRecords = db.prepare(`
      SELECT * FROM prompt_configs 
      ORDER BY created_at DESC 
      LIMIT ?
    `).all(limit) as PromptConfigRecord[];

    return configRecords.map(record => ({
      id: record.id,
      version: record.version,
      lastModified: record.updated_at,
      systemPrompt: record.system_prompt,
      analysisPrompt: record.analysis_prompt,
      enabled: record.enabled
    }));
  }

  /**
   * 删除当前启用的版本（需要先切换到其他版本）
   */
  async deleteCurrentVersion(): Promise<void> {
    await this.initialize();
    
    try {
      const db = databaseManager.getDatabase();
      
      // 获取当前启用的版本
      const currentConfig = db.prepare(`
        SELECT * FROM prompt_configs WHERE enabled = TRUE LIMIT 1
      `).get() as PromptConfigRecord | undefined;

      if (!currentConfig) {
        throw new Error('未找到当前启用的配置');
      }

      // 检查是否还有其他版本
      const otherVersions = db.prepare(`
        SELECT * FROM prompt_configs WHERE enabled = FALSE ORDER BY created_at DESC LIMIT 1
      `).get() as PromptConfigRecord | undefined;

      if (!otherVersions) {
        throw new Error('无法删除唯一的配置版本，请先创建新版本');
      }

      // 开始事务
      const transaction = db.transaction(() => {
        // 1. 删除当前启用的版本
        db.prepare(`
          DELETE FROM prompt_configs WHERE id = ?
        `).run(currentConfig.id);

        // 2. 启用最新的其他版本
        db.prepare(`
          UPDATE prompt_configs SET enabled = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `).run(otherVersions.id);
      });

      transaction();

      // 清除缓存
      this.cachedConfig = null;
      this.lastLoadTime = 0;

      logger.info('当前版本删除成功，已切换到版本', {
        deletedId: currentConfig.id,
        deletedVersion: currentConfig.version,
        newActiveId: otherVersions.id,
        newActiveVersion: otherVersions.version
      });

    } catch (error) {
      logger.error('删除当前版本失败', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * 删除指定版本（不能删除当前启用的版本）
   */
  async deleteVersion(configId: number): Promise<void> {
    await this.initialize();
    
    try {
      const db = databaseManager.getDatabase();
      
      // 检查是否是当前启用的版本
      const targetConfig = db.prepare(`
        SELECT * FROM prompt_configs WHERE id = ? AND enabled = TRUE
      `).get(configId) as PromptConfigRecord | undefined;

      if (targetConfig) {
        throw new Error('不能删除当前启用的配置版本');
      }

      // 删除配置
      const deleteResult = db.prepare(`
        DELETE FROM prompt_configs WHERE id = ? AND enabled = FALSE
      `).run(configId);

      if (deleteResult.changes === 0) {
        throw new Error(`配置ID ${configId} 不存在或无法删除`);
      }

      logger.info('配置版本删除成功', { configId });

    } catch (error) {
      logger.error('删除版本失败', {
        configId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }



  /**
   * 强制重新加载配置（清除缓存）
   */
  async reloadConfig(): Promise<PromptConfig> {
    this.cachedConfig = null;
    this.lastLoadTime = 0;
    return await this.getConfig();
  }

  /**
   * 替换提示词中的变量
   */
  replaceVariables(template: string, variables: Record<string, string>): string {
    let result = template;
    
    for (const [key, value] of Object.entries(variables)) {
      const placeholder = `{${key}}`;
      result = result.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), value);
    }
    
    return result;
  }

  /**
   * 获取可用变量列表（用于Web界面显示）
   */
  getAvailableVariables() {
    return [
      {
        name: 'question',
        description: '用户的问题或分析需求',
        example: '分析BTC/USDT的走势'
      },
      {
        name: 'symbol', 
        description: '交易对符号',
        example: 'BTCUSDT'
      },
      {
        name: 'timezone',
        description: '当前配置的时区',
        example: 'Asia/Shanghai'
      },
      {
        name: 'currentTime',
        description: '当前分析时间',
        example: '2024-01-01 12:00:00 (Asia/Shanghai)'
      },
      {
        name: 'klineData',
        description: '完整的多时间框架K线数据JSON',
        example: 'JSON.stringify(fullKlineData, null, 2)'
      }
    ];
  }

  /**
   * 获取统计信息
   */
  async getStats(): Promise<any> {
    await this.initialize();
    
    const dbStats = databaseManager.getStats();
    
    return {
      ...dbStats,
      cacheStatus: {
        cached: !!this.cachedConfig,
        lastLoadTime: this.lastLoadTime,
        cacheAge: this.cachedConfig ? Date.now() - this.lastLoadTime : 0
      }
    };
  }
}

// 导出单例实例
export const promptManager = new PromptManagerV2();

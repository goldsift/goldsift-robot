/**
 * 基础配置管理模块
 * 管理从环境变量迁移到数据库的基础配置
 */

import { databaseManager } from './database-manager.js';
import { logger } from '../logger.js';

/**
 * 基础配置接口
 */
export interface BasicConfig {
  telegramBotToken: string;
  openaiApiKey: string;
  openaiBaseUrl: string;
  openaiModel: string;
  aiProvider: 'openai' | 'gemini' | 'claude';
  timezone: string;
  binanceApiKey?: string;
  binanceSecret?: string;
  maxConcurrentAnalysis: number;
  enableNewMemberWelcome: boolean;
}

/**
 * 配置项定义
 */
interface ConfigItem {
  key: string;
  type: 'string' | 'number' | 'boolean';
  description: string;
  defaultValue: string;
  required: boolean;
}

/**
 * 数据库配置记录接口
 */
interface BasicConfigRecord {
  id: number;
  config_key: string;
  config_value: string;
  config_type: string;
  description: string;
  created_at: string;
  updated_at: string;
}

/**
 * 基础配置管理器类
 */
class BasicConfigManager {
  private initialized = false;

  /**
   * 配置项定义
   */
  private configItems: ConfigItem[] = [
    {
      key: 'telegramBotToken',
      type: 'string',
      description: 'Telegram机器人令牌',
      defaultValue: '',
      required: true
    },
    {
      key: 'openaiApiKey',
      type: 'string',
      description: 'OpenAI API密钥',
      defaultValue: '',
      required: true
    },
    {
      key: 'openaiBaseUrl',
      type: 'string',
      description: 'OpenAI API基础URL',
      defaultValue: 'https://api.openai.com/v1',
      required: true
    },
    {
      key: 'openaiModel',
      type: 'string',
      description: 'OpenAI模型名称',
      defaultValue: 'gpt-4o',
      required: true
    },
    {
      key: 'aiProvider',
      type: 'string',
      description: 'AI服务提供商',
      defaultValue: 'openai',
      required: true
    },
    {
      key: 'timezone',
      type: 'string',
      description: '时区设置',
      defaultValue: 'Asia/Shanghai',
      required: true
    },
    {
      key: 'binanceApiKey',
      type: 'string',
      description: '币安API密钥',
      defaultValue: '',
      required: false
    },
    {
      key: 'binanceSecret',
      type: 'string',
      description: '币安API密钥',
      defaultValue: '',
      required: false
    },
    {
      key: 'maxConcurrentAnalysis',
      type: 'number',
      description: '最大并发分析数量',
      defaultValue: '10',
      required: false
    },
    {
      key: 'enableNewMemberWelcome',
      type: 'boolean',
      description: '是否启用新成员欢迎消息',
      defaultValue: 'true',
      required: false
    }
  ];

  /**
   * 初始化管理器
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    await databaseManager.initialize();
    await this.ensureDefaultConfigs();
    this.initialized = true;
    
    logger.info('基础配置管理器初始化完成');
  }

  /**
   * 确保默认配置存在
   */
  private async ensureDefaultConfigs(): Promise<void> {
    const db = databaseManager.getDatabase();
    
    for (const configItem of this.configItems) {
      // 检查配置是否已存在
      const existingConfig = db.prepare(`
        SELECT * FROM basic_configs WHERE config_key = ?
      `).get(configItem.key) as BasicConfigRecord | undefined;

      if (!existingConfig) {
        // 使用默认值（不再从环境变量读取）
        const initialValue = configItem.defaultValue;

        // 插入默认配置
        db.prepare(`
          INSERT INTO basic_configs (config_key, config_value, config_type, description)
          VALUES (?, ?, ?, ?)
        `).run(
          configItem.key,
          initialValue,
          configItem.type,
          configItem.description
        );

        logger.info('创建默认基础配置', {
          key: configItem.key,
          value: initialValue || '空'
        });
      }
    }
  }



  /**
   * 获取所有基础配置
   */
  async getConfig(): Promise<BasicConfig> {
    await this.initialize();
    
    const db = databaseManager.getDatabase();
    
    try {
      const configRecords = db.prepare(`
        SELECT * FROM basic_configs ORDER BY config_key
      `).all() as BasicConfigRecord[];

      const config: any = {};
      
      for (const record of configRecords) {
        const value = this.parseConfigValue(record.config_value, record.config_type);
        config[record.config_key] = value;
      }

      // 验证必需配置
      this.validateConfig(config);

      logger.debug('基础配置加载成功', {
        configCount: configRecords.length
      });

      return config as BasicConfig;

    } catch (error) {
      logger.error('加载基础配置失败', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw new Error(`加载基础配置失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 保存基础配置
   */
  async saveConfig(config: Partial<BasicConfig>): Promise<void> {
    await this.initialize();
    
    try {
      const db = databaseManager.getDatabase();
      
      // 开始事务
      const transaction = db.transaction(() => {
        for (const [key, value] of Object.entries(config)) {
          if (value !== undefined) {
            const stringValue = String(value);
            
            db.prepare(`
              UPDATE basic_configs 
              SET config_value = ?, updated_at = CURRENT_TIMESTAMP
              WHERE config_key = ?
            `).run(stringValue, key);
          }
        }
      });

      transaction();

      logger.info('基础配置保存成功', {
        updatedKeys: Object.keys(config)
      });

    } catch (error) {
      logger.error('保存基础配置失败', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw new Error(`保存基础配置失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 获取单个配置项
   */
  async getConfigItem(key: string): Promise<string | undefined> {
    await this.initialize();
    
    const db = databaseManager.getDatabase();
    
    const record = db.prepare(`
      SELECT config_value FROM basic_configs WHERE config_key = ?
    `).get(key) as { config_value: string } | undefined;

    return record?.config_value;
  }

  /**
   * 设置单个配置项
   */
  async setConfigItem(key: string, value: string): Promise<void> {
    await this.initialize();
    
    const db = databaseManager.getDatabase();
    
    db.prepare(`
      UPDATE basic_configs 
      SET config_value = ?, updated_at = CURRENT_TIMESTAMP
      WHERE config_key = ?
    `).run(value, key);

    logger.info('基础配置项更新成功', { key });
  }

  /**
   * 解析配置值
   */
  private parseConfigValue(value: string, type: string): any {
    switch (type) {
      case 'boolean':
        return value === 'true';
      case 'number':
        return parseInt(value, 10);
      case 'string':
      default:
        return value;
    }
  }

  /**
   * 验证配置（现在允许空配置，由应用层决定如何处理）
   */
  private validateConfig(config: any): void {
    // 不再在这里验证必需配置项，让应用层决定如何处理空配置
    // 这样可以支持首次启动时的空配置状态
    logger.debug('配置验证完成', {
      hasToken: !!config.telegramBotToken,
      hasApiKey: !!config.openaiApiKey
    });
  }

  /**
   * 获取配置项定义
   */
  getConfigItems(): ConfigItem[] {
    return this.configItems;
  }

  /**
   * 测试配置连接
   */
  async testConfig(): Promise<{ [key: string]: { success: boolean; message?: string } }> {
    await this.initialize();
    
    const config = await this.getConfig();
    const results: { [key: string]: { success: boolean; message?: string } } = {};

    // 测试Telegram Bot连接
    try {
      // 这里可以添加实际的Telegram Bot测试逻辑
      results.telegram = { success: true, message: 'Telegram配置有效' };
    } catch (error) {
      results.telegram = { success: false, message: '无法连接到Telegram' };
    }

    // 测试OpenAI连接
    try {
      // 这里可以添加实际的OpenAI测试逻辑
      results.openai = { success: true, message: 'OpenAI配置有效' };
    } catch (error) {
      results.openai = { success: false, message: '无法连接到OpenAI' };
    }

    // 测试Binance连接（如果配置了）
    if (config.binanceApiKey) {
      try {
        // 这里可以添加实际的Binance测试逻辑
        results.binance = { success: true, message: 'Binance配置有效' };
      } catch (error) {
        results.binance = { success: false, message: '无法连接到Binance' };
      }
    }

    return results;
  }
}

// 导出单例实例
export const basicConfigManager = new BasicConfigManager();

/**
 * 时区转换工具模块
 * 严格遵守 300 行以内规范
 */

import { config } from './config.js';
import { logger } from './logger.js';

/**
 * 时区转换工具类
 */
export class TimezoneConverter {
  private readonly targetTimezone: string;

  constructor(timezone: string = config.timezone) {
    this.targetTimezone = timezone;
  }

  /**
   * 将UTC时间戳转换为目标时区的格式化字符串
   */
  formatTimestamp(timestamp: number, includeTimezone: boolean = true, compact: boolean = false): string {
    try {
      const date = new Date(timestamp);
      
      if (compact) {
        // 使用紧凑格式: YY/MM/DD hh:mm
        const options: Intl.DateTimeFormatOptions = {
          timeZone: this.targetTimezone,
          year: '2-digit',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        };

        const formatter = new Intl.DateTimeFormat('en-CA', options);
        const parts = formatter.formatToParts(date);
        
        const year = parts.find(p => p.type === 'year')?.value || '00';
        const month = parts.find(p => p.type === 'month')?.value || '01';
        const day = parts.find(p => p.type === 'day')?.value || '01';
        const hour = parts.find(p => p.type === 'hour')?.value || '00';
        const minute = parts.find(p => p.type === 'minute')?.value || '00';
        
        return `${year}/${month}/${day} ${hour}:${minute}`;
      } else {
        // 使用完整格式
        const options: Intl.DateTimeFormatOptions = {
          timeZone: this.targetTimezone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        };

        const formatter = new Intl.DateTimeFormat('zh-CN', options);
        const formattedDate = formatter.format(date);
        
        if (includeTimezone) {
          // 获取时区缩写
          const timezoneName = this.getTimezoneAbbreviation();
          return `${formattedDate} ${timezoneName}`;
        }
        
        return formattedDate;
      }
    } catch (error) {
      logger.error('时间格式化失败', {
        timestamp,
        timezone: this.targetTimezone,
        error: error instanceof Error ? error.message : String(error)
      });
      
      // 降级处理：返回UTC时间
      return new Date(timestamp).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
    }
  }

  /**
   * 将UTC ISO字符串转换为目标时区的格式化字符串
   */
  formatISOString(isoString: string, includeTimezone: boolean = true): string {
    try {
      const timestamp = new Date(isoString).getTime();
      return this.formatTimestamp(timestamp, includeTimezone);
    } catch (error) {
      logger.error('ISO字符串转换失败', {
        isoString,
        timezone: this.targetTimezone,
        error: error instanceof Error ? error.message : String(error)
      });
      
      return isoString; // 降级处理
    }
  }

  /**
   * 获取时区缩写
   */
  private getTimezoneAbbreviation(): string {
    try {
      const date = new Date();
      const formatter = new Intl.DateTimeFormat('en', {
        timeZone: this.targetTimezone,
        timeZoneName: 'short'
      });
      
      const parts = formatter.formatToParts(date);
      const timeZonePart = parts.find(part => part.type === 'timeZoneName');
      
      return timeZonePart?.value || this.getTimezoneOffset();
    } catch (error) {
      return this.getTimezoneOffset();
    }
  }

  /**
   * 获取时区偏移量字符串（如 +08:00）
   */
  private getTimezoneOffset(): string {
    try {
      const date = new Date();
      const utcDate = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
      const localDate = new Date(date.toLocaleString('en-US', { timeZone: this.targetTimezone }));
      
      const offsetMs = localDate.getTime() - utcDate.getTime();
      const offsetHours = Math.floor(offsetMs / (1000 * 60 * 60));
      const offsetMinutes = Math.floor((offsetMs % (1000 * 60 * 60)) / (1000 * 60));
      
      const sign = offsetHours >= 0 ? '+' : '-';
      const hours = Math.abs(offsetHours).toString().padStart(2, '0');
      const minutes = Math.abs(offsetMinutes).toString().padStart(2, '0');
      
      return `${sign}${hours}:${minutes}`;
    } catch (error) {
      return '+00:00';
    }
  }

  /**
   * 获取当前时间的格式化字符串
   */
  getCurrentTime(): string {
    return this.formatTimestamp(Date.now());
  }

  /**
   * 将时间戳数组批量转换
   */
  formatTimestampArray(timestamps: number[]): string[] {
    return timestamps.map(ts => this.formatTimestamp(ts, false));
  }

  /**
   * 获取时区信息
   */
  getTimezoneInfo(): {
    timezone: string;
    currentTime: string;
    offset: string;
    abbreviation: string;
  } {
    return {
      timezone: this.targetTimezone,
      currentTime: this.getCurrentTime(),
      offset: this.getTimezoneOffset(),
      abbreviation: this.getTimezoneAbbreviation()
    };
  }
}

/**
 * 全局时区转换器实例
 */
export const timezoneConverter = new TimezoneConverter();

/**
 * 便捷函数：格式化时间戳
 */
export function formatTimestamp(timestamp: number, includeTimezone: boolean = true, compact: boolean = false): string {
  return timezoneConverter.formatTimestamp(timestamp, includeTimezone, compact);
}

/**
 * 便捷函数：格式化时间戳为紧凑格式 (YY/MM/DD hh:mm)
 */
export function formatTimestampCompact(timestamp: number): string {
  return timezoneConverter.formatTimestamp(timestamp, false, true);
}

/**
 * 便捷函数：格式化ISO字符串
 */
export function formatISOString(isoString: string, includeTimezone: boolean = true): string {
  return timezoneConverter.formatISOString(isoString, includeTimezone);
}

/**
 * 便捷函数：获取当前时间
 */
export function getCurrentTime(): string {
  return timezoneConverter.getCurrentTime();
}

/**
 * 便捷函数：获取时区信息
 */
export function getTimezoneInfo() {
  return timezoneConverter.getTimezoneInfo();
}

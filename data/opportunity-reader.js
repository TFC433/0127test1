/**
 * data/opportunity-reader.js
 * 專門負責讀取所有與「機會案件」相關資料的類別
 * * @version 5.0.0 (Phase 5 Refactoring)
 * @date 2026-01-09
 * @description 實作 Strict Mode 依賴注入，並確保內部引用的其他 Reader 接收正確的 ID。
 */

const BaseReader = require('./base-reader');

class OpportunityReader extends BaseReader {
    /**
     * @param {Object} sheets - Google Sheets API Client
     * @param {string} spreadsheetId - [Required] 指定要讀取的 Sheet ID
     */
    constructor(sheets, spreadsheetId) {
        super(sheets, spreadsheetId);
    }

    /**
     * 內部輔助：建立標題與索引的對照表
     */
    _buildHeaderMap(headerRow) {
        const map = {};
        if (!headerRow || !Array.isArray(headerRow) || headerRow.length === 0) return map;
        
        headerRow.forEach((title, index) => {
            if (title) {
                map[title.trim()] = index;
            }
        });
        return map;
    }

    /**
     * 內部輔助：安全地根據標題獲取值
     */
    _getValue(row, map, fieldName) {
        const index = map[fieldName];
        if (index === undefined || index < 0) return ''; 
        return row[index] || '';
    }

    /**
     * 取得所有機會案件 (核心函式)
     * @returns {Promise<Array<object>>} - 保證回傳陣列
     */
    async getOpportunities() {
        const cacheKey = 'opportunities';
        const range = `${this.config.SHEETS.OPPORTUNITIES}!A:ZZ`;

        try {
            // ★★★ 使用 this.targetSpreadsheetId ★★★
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.targetSpreadsheetId, 
                range: range,
            });

            const rows = response.data.values;
            // 防呆：如果完全沒資料，回傳空陣列
            if (!rows || !Array.isArray(rows) || rows.length === 0) {
                console.warn('[OpportunityReader] Google Sheet 回傳空資料');
                return []; 
            }

            // 解析標題列
            const headerRow = rows[0];
            const headerMap = this._buildHeaderMap(headerRow);
            const FIELD_NAMES = this.config.OPPORTUNITY_FIELD_NAMES;

            // 檢查關鍵欄位
            if (headerMap[FIELD_NAMES.ID] === undefined) {
                console.warn(`⚠️ [OpportunityReader] 警告：找不到核心標題 "${FIELD_NAMES.ID}"`);
            }

            // 解析資料列
            const opportunities = [];
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                if (!row || row.length === 0) continue;

                const opp = {
                    rowIndex: i + 1,
                    opportunityId: this._getValue(row, headerMap, FIELD_NAMES.ID),
                    opportunityName: this._getValue(row, headerMap, FIELD_NAMES.NAME),
                    customerCompany: this._getValue(row, headerMap, FIELD_NAMES.CUSTOMER),
                    
                    salesModel: this._getValue(row, headerMap, FIELD_NAMES.SALES_MODEL),
                    
                    // 將 '主要通路/下單方' 對應到 channelDetails
                    channelDetails: this._getValue(row, headerMap, FIELD_NAMES.CHANNEL),
                    salesChannel: this._getValue(row, headerMap, FIELD_NAMES.CHANNEL),

                    channelContact: this._getValue(row, headerMap, FIELD_NAMES.CHANNEL_CONTACT),
                    mainContact: this._getValue(row, headerMap, FIELD_NAMES.CONTACT),
                    assignee: this._getValue(row, headerMap, FIELD_NAMES.ASSIGNEE),
                    opportunityType: this._getValue(row, headerMap, FIELD_NAMES.TYPE),
                    opportunitySource: this._getValue(row, headerMap, FIELD_NAMES.SOURCE),
                    currentStage: this._getValue(row, headerMap, FIELD_NAMES.STAGE),
                    expectedCloseDate: this._getValue(row, headerMap, FIELD_NAMES.CLOSE_DATE),
                    opportunityValue: this._getValue(row, headerMap, FIELD_NAMES.VALUE),
                    opportunityValueType: this._getValue(row, headerMap, FIELD_NAMES.VALUE_TYPE),
                    orderProbability: this._getValue(row, headerMap, FIELD_NAMES.PROBABILITY),
                    
                    potentialSpecification: this._getValue(row, headerMap, FIELD_NAMES.PRODUCT_SPEC),
                    deviceScale: this._getValue(row, headerMap, FIELD_NAMES.DEVICE_SCALE),
                    
                    notes: this._getValue(row, headerMap, FIELD_NAMES.NOTES),
                    driveFolderLink: this._getValue(row, headerMap, FIELD_NAMES.DRIVE_LINK),
                    currentStatus: this._getValue(row, headerMap, FIELD_NAMES.STATUS),
                    
                    stageHistory: this._getValue(row, headerMap, FIELD_NAMES.HISTORY),
                    
                    createdTime: this._getValue(row, headerMap, FIELD_NAMES.CREATED_TIME),
                    lastUpdateTime: this._getValue(row, headerMap, FIELD_NAMES.LAST_UPDATE_TIME),
                    lastModifier: this._getValue(row, headerMap, FIELD_NAMES.LAST_MODIFIER),
                    
                    parentOpportunityId: this._getValue(row, headerMap, FIELD_NAMES.PARENT_ID)
                };
                
                if (opp.currentStatus !== this.config.CONSTANTS.OPPORTUNITY_STATUS.ARCHIVED) {
                    opportunities.push(opp);
                }
            }

            // 排序
            opportunities.sort((a, b) => {
                const timeA = a.lastUpdateTime || a.createdTime;
                const timeB = b.lastUpdateTime || b.createdTime;
                return new Date(timeB) - new Date(timeA);
            });

            // 寫入快取
            if (this.cache) {
                this.cache[cacheKey] = opportunities;
            }

            return opportunities;

        } catch (error) {
            console.error('❌ [OpportunityReader] 讀取失敗:', error);
            return []; 
        }
    }

    /**
     * 搜尋並分頁機會案件
     */
    async searchOpportunities(query, page = 1, filters = {}) {
        let opportunities = await this.getOpportunities();
        if (!Array.isArray(opportunities)) opportunities = [];

        if (query) {
            const searchTerm = query.toLowerCase();
            opportunities = opportunities.filter(o => {
                if (searchTerm.startsWith('opp') && o.opportunityId.toLowerCase() === searchTerm) {
                    return true;
                }
                return (o.opportunityName && o.opportunityName.toLowerCase().includes(searchTerm)) ||
                       (o.customerCompany && o.customerCompany.toLowerCase().includes(searchTerm));
            });
        }

        if (filters.assignee) opportunities = opportunities.filter(o => o.assignee === filters.assignee);
        if (filters.type) opportunities = opportunities.filter(o => o.opportunityType === filters.type);
        if (filters.stage) opportunities = opportunities.filter(o => o.currentStage === filters.stage);
        
        if (!page || page <= 0) {
            return opportunities;
        }

        const pageSize = this.config.PAGINATION.OPPORTUNITIES_PER_PAGE;
        const startIndex = (page - 1) * pageSize;
        const paginated = opportunities.slice(startIndex, startIndex + pageSize);
        return {
            data: paginated,
            pagination: { 
                current: page, 
                total: Math.ceil(opportunities.length / pageSize), 
                totalItems: opportunities.length, 
                hasNext: (startIndex + pageSize) < opportunities.length, 
                hasPrev: page > 1 
            }
        };
    }

    /**
     * 按縣市聚合機會案件數量
     */
    async getOpportunitiesByCounty(opportunityType = null) {
        try {
            const [opportunities, companies] = await Promise.all([
                this.getOpportunities(),
                this.getCompanyList()
            ]);
            
            const safeOpportunities = Array.isArray(opportunities) ? opportunities : [];
            const safeCompanies = Array.isArray(companies) ? companies : [];

            let filteredOpportunities = opportunityType
                ? safeOpportunities.filter(opp => opp.opportunityType === opportunityType)
                : safeOpportunities;
            
            const companyToCountyMap = new Map(safeCompanies.map(c => [c.companyName, c.county]));

            const countyCounts = {};
            filteredOpportunities.forEach(opp => {
                const county = companyToCountyMap.get(opp.customerCompany);
                if (county) {
                    countyCounts[county] = (countyCounts[county] || 0) + 1;
                }
            });

            return Object.entries(countyCounts).map(([county, count]) => ({ county, count }));
        } catch (error) {
            console.error('❌ [OpportunityReader] getOpportunitiesByCounty 錯誤:', error);
            return [];
        }
    }

    /**
     * 按階段聚合機會案件
     */
    async getOpportunitiesByStage() {
        try {
            const [opportunities, systemConfig] = await Promise.all([
                this.getOpportunities(),
                this.getSystemConfig()
            ]);
            
            const safeOpportunities = Array.isArray(opportunities) ? opportunities : [];
            const stages = systemConfig['機會階段'] || [];
            const stageGroups = {};

            // 初始化所有階段
            stages.forEach(stage => {
                stageGroups[stage.value] = { name: stage.note || stage.value, opportunities: [], count: 0 };
            });

            // 分類
            safeOpportunities.forEach(opp => {
                if (opp.currentStatus === '進行中') {
                    const stageKey = opp.currentStage;
                    if (stageGroups[stageKey]) {
                        stageGroups[stageKey].opportunities.push(opp);
                        stageGroups[stageKey].count++;
                    }
                }
            });
            return stageGroups;
        } catch (error) {
            console.error('❌ [OpportunityReader] getOpportunitiesByStage 錯誤:', error);
            return {};
        }
    }

    // --- 內部輔助：動態載入其他 Reader (避免循環依賴) ---
    async getCompanyList() {
        try {
            const CompanyReader = require('./company-reader');
            // ★★★ 依賴注入修正：傳遞 targetSpreadsheetId ★★★
            const companyReader = new CompanyReader(this.sheets, this.targetSpreadsheetId);
            return await companyReader.getCompanyList();
        } catch (e) {
            console.warn('⚠️ 無法讀取公司列表:', e.message);
            return [];
        }
    }

    async getSystemConfig() {
        try {
            const SystemReader = require('./system-reader');
            // ★★★ 依賴注入修正：傳遞 targetSpreadsheetId ★★★
            // 注意：若 SystemReader 在未來使用不同的 ID，這裡需要透過 Service 層處理。
            // 目前階段我們假設 SystemReader 能接受與 Opportunity 同樣的 Config (兼容模式)。
            // 或者 SystemReader 應該從 Container 注入，而不是內部 new。
            // 但為了不破壞現有結構，我們傳遞當前的 ID。
            const systemReader = new SystemReader(this.sheets, this.targetSpreadsheetId);
            return await systemReader.getSystemConfig();
        } catch (e) {
            console.warn('⚠️ 無法讀取系統設定:', e.message);
            return {};
        }
    }
}

module.exports = OpportunityReader;
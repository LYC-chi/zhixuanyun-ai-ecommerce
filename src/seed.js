'use strict';
/**
 * seed.js — 初始数据集
 * 品类数据通过真实的「JSON 品类定义 → 解析校验 → 树构建 → 索引映射」链路生成，
 * 保证种子数据与解析引擎行为一致（一次声明、多端生效）。
 */
const cat = require('./category');
const { hashPassword } = require('./auth');

// ---------------------------------------------------------------------------
// 一、品类定义 JSON（商家自定义品类，对应 FR-07 ~ FR-10）
// ---------------------------------------------------------------------------
const CATEGORY_JSONS = [
  {
    source: '家用电器品类定义',
    text: JSON.stringify({
      schemaVersion: '1.0',
      category: {
        code: 'HOME_APPLIANCE', name: '家用电器', sort: 10,
        attributes: [
          { code: 'BRAND', name: '品牌', dataType: 'string', required: true, filterable: true, searchable: true },
          { code: 'ENERGY_LEVEL', name: '能效等级', dataType: 'enum', options: ['一级', '二级', '三级'], required: true, filterable: true },
          { code: 'WARRANTY_YEARS', name: '整机保修年限', dataType: 'integer', unit: '年', range: [1, 10], required: false, filterable: true },
        ],
        children: [
          {
            code: 'HOME_APPLIANCE_KITCHEN', name: '厨房电器', sort: 20,
            attributes: [
              { code: 'CAPACITY', name: '容量', dataType: 'decimal', unit: 'L', range: [0.5, 60], required: false, filterable: true },
            ],
            children: [
              {
                code: 'HOME_APPLIANCE_KITCHEN_RICE_COOKER', name: '电饭煲', sort: 21,
                attributes: [
                  { code: 'INNER_POT', name: '内胆材质', dataType: 'enum', options: ['铝合金', '不锈钢', '陶瓷', '铸铁'], required: true, filterable: true },
                  { code: 'KEEP_WARM_HOURS', name: '保温时长', dataType: 'integer', unit: '小时', range: [0, 48], required: false, filterable: true },
                ],
              },
              {
                code: 'HOME_APPLIANCE_KITCHEN_BLENDER', name: '破壁料理机', sort: 22,
                attributes: [
                  { code: 'SPEED_LEVELS', name: '调速档位', dataType: 'integer', unit: '档', range: [1, 12], required: false, filterable: true },
                ],
              },
            ],
          },
          {
            code: 'HOME_APPLIANCE_CLEANING', name: '清洁电器', sort: 30,
            attributes: [
              { code: 'SUCTION_POWER', name: '吸力', dataType: 'integer', unit: 'Pa', range: [1000, 40000], required: false, filterable: true },
              { code: 'RUNTIME_MIN', name: '续航时长', dataType: 'integer', unit: '分钟', range: [10, 200], required: false, filterable: true },
            ],
            children: [
              { code: 'HOME_APPLIANCE_CLEANING_VACUUM', name: '吸尘器', sort: 31, attributes: [] },
            ],
          },
        ],
      },
    }, null, 2),
  },
  {
    source: '数码电子品类定义',
    text: JSON.stringify({
      schemaVersion: '1.0',
      category: {
        code: 'DIGITAL', name: '数码电子', sort: 20,
        attributes: [
          { code: 'BRAND', name: '品牌', dataType: 'string', required: true, filterable: true, searchable: true },
          { code: 'COLOR', name: '颜色', dataType: 'multiEnum', options: ['曜石黑', '月光银', '晴空蓝', '樱花粉', '原野绿'], required: false, filterable: true },
        ],
        children: [
          {
            code: 'DIGITAL_PHONE', name: '智能手机', sort: 21,
            attributes: [
              { code: 'SCREEN_SIZE', name: '屏幕尺寸', dataType: 'decimal', unit: '英寸', range: [4, 8], required: false, filterable: true },
              { code: 'STORAGE', name: '存储容量', dataType: 'enum', options: ['128GB', '256GB', '512GB', '1TB'], required: true, filterable: true },
              { code: 'BATTERY', name: '电池容量', dataType: 'integer', unit: 'mAh', range: [2000, 8000], required: false, filterable: true },
            ],
          },
          {
            code: 'DIGITAL_LAPTOP', name: '笔记本电脑', sort: 22,
            attributes: [
              { code: 'CPU', name: '处理器', dataType: 'string', required: false, searchable: true, filterable: true },
              { code: 'MEMORY', name: '内存容量', dataType: 'enum', options: ['8GB', '16GB', '32GB', '64GB'], required: true, filterable: true },
              { code: 'DISK', name: '硬盘容量', dataType: 'enum', options: ['256GB', '512GB', '1TB', '2TB'], required: false, filterable: true },
            ],
          },
        ],
      },
    }, null, 2),
  },
  {
    source: '服饰鞋包品类定义',
    text: JSON.stringify({
      schemaVersion: '1.0',
      category: {
        code: 'FASHION', name: '服饰鞋包', sort: 30,
        attributes: [
          { code: 'BRAND', name: '品牌', dataType: 'string', required: true, filterable: true, searchable: true },
        ],
        children: [
          {
            code: 'FASHION_MEN', name: '男士上衣', sort: 31,
            attributes: [
              { code: 'SIZE', name: '尺码', dataType: 'enum', options: ['S', 'M', 'L', 'XL', 'XXL'], required: true, filterable: true },
              { code: 'MATERIAL', name: '面料', dataType: 'string', required: false, searchable: true, filterable: true },
            ],
          },
          {
            code: 'FASHION_SHOES', name: '运动鞋', sort: 32,
            attributes: [
              { code: 'SHOE_SIZE', name: '鞋码', dataType: 'integer', range: [35, 46], required: true, filterable: true },
              { code: 'CLOSURE', name: '闭合方式', dataType: 'enum', options: ['系带', '套脚', '拉链'], required: false, filterable: true },
            ],
          },
        ],
      },
    }, null, 2),
  },
  {
    source: '食品饮料品类定义',
    text: JSON.stringify({
      schemaVersion: '1.0',
      category: {
        code: 'FOOD', name: '食品饮料', sort: 40,
        attributes: [
          { code: 'BRAND', name: '品牌', dataType: 'string', required: true, filterable: true, searchable: true },
          { code: 'SHELF_LIFE', name: '保质期', dataType: 'integer', unit: '天', range: [1, 730], required: false, filterable: true },
        ],
        children: [
          {
            code: 'FOOD_SNACK', name: '休闲零食', sort: 41,
            attributes: [
              { code: 'FLAVOR', name: '口味', dataType: 'enum', options: ['原味', '香辣', '甜味', '咸味', '海盐'], required: false, filterable: true },
              { code: 'PACKAGE_TYPE', name: '包装形式', dataType: 'enum', options: ['袋装', '盒装', '罐装'], required: false, filterable: true },
            ],
          },
          {
            code: 'FOOD_DRINK', name: '饮料冲调', sort: 42,
            attributes: [
              { code: 'VOLUME', name: '容量', dataType: 'integer', unit: 'ml', range: [200, 3000], required: false, filterable: true },
              { code: 'SUGAR', name: '含糖类型', dataType: 'enum', options: ['无糖', '低糖', '常规'], required: false, filterable: true },
            ],
          },
        ],
      },
    }, null, 2),
  },
];

// ---------------------------------------------------------------------------
// 二、商品种子（SPU / SKU / 属性值 / 库存）
// ---------------------------------------------------------------------------
// 每项：[工厂名, 品类码, 标题, 副标题, 图标, 主色, 属性, [SKU 规格…]]
const PRODUCT_SEEDS = [
  ['自营', 'HOME_APPLIANCE_KITCHEN_RICE_COOKER', '智选云 IH 电饭煲 4L', 'IH 电磁加热 · 24h 智能预约', '🍚', '#2f6fb0',
    { BRAND: '智选云', ENERGY_LEVEL: '一级', WARRANTY_YEARS: 3, CAPACITY: 4, INNER_POT: '铸铁', KEEP_WARM_HOURS: 24 },
    [['4L 珍珠白', 599, 799, 120], ['4L 曜石黑', 619, 799, 60], ['5L 珍珠白', 699, 899, 45]]],
  ['自营', 'HOME_APPLIANCE_KITCHEN_RICE_COOKER', '云膳 陶瓷内胆电饭煲 3L', '陶瓷内胆 · 低糖饭模式', '🍚', '#3f9d7a',
    { BRAND: '云膳', ENERGY_LEVEL: '一级', WARRANTY_YEARS: 2, CAPACITY: 3, INNER_POT: '陶瓷', KEEP_WARM_HOURS: 12 },
    [['3L 米白', 349, 459, 200], ['3L 浅灰', 369, 459, 80]]],
  ['自营', 'HOME_APPLIANCE_KITCHEN_BLENDER', '智选云 破壁料理机 Pro', '12 档调速 · 静音降噪', '🥤', '#b06a2f',
    { BRAND: '智选云', ENERGY_LEVEL: '二级', WARRANTY_YEARS: 2, CAPACITY: 1.75, SPEED_LEVELS: 12 },
    [['标准版', 899, 1099, 66], ['降噪升级版', 1099, 1299, 30]]],
  ['自营', 'HOME_APPLIANCE_CLEANING_VACUUM', '风行者 无线吸尘器 V10', '40000Pa 强吸力 · 60 分钟续航', '🧹', '#5b6ef0',
    { BRAND: '风行者', ENERGY_LEVEL: '一级', WARRANTY_YEARS: 2, SUCTION_POWER: 40000, RUNTIME_MIN: 60 },
    [['标准版', 1299, 1699, 88], ['洗地一体版', 1899, 2299, 25]]],
  ['自营', 'HOME_APPLIANCE_CLEANING_VACUUM', '轻岚 手持吸尘器 Lite', '轻量化 1.2kg · 便携除螨', '🧹', '#7a5cf0',
    { BRAND: '轻岚', ENERGY_LEVEL: '二级', WARRANTY_YEARS: 1, SUCTION_POWER: 12000, RUNTIME_MIN: 35 },
    [['标准版', 499, 699, 150], ['除螨套装', 599, 799, 70]]],

  ['自营', 'DIGITAL_PHONE', '智选云 Phone 15 Pro', '6.7 英寸 · 全系潜望长焦', '📱', '#1f4e79',
    { BRAND: 'ZCloud', COLOR: ['曜石黑', '晴空蓝'], SCREEN_SIZE: 6.7, STORAGE: '256GB', BATTERY: 4800 },
    [['256GB 曜石黑', 4999, 5499, 60], ['256GB 晴空蓝', 4999, 5499, 45], ['512GB 曜石黑', 5699, 6199, 30]]],
  ['自营', 'DIGITAL_PHONE', 'ZCloud Neo 12', '轻旗舰 · 5000mAh 长续航', '📱', '#2a7fbf',
    { BRAND: 'ZCloud', COLOR: ['月光银', '樱花粉'], SCREEN_SIZE: 6.4, STORAGE: '128GB', BATTERY: 5000 },
    [['128GB 月光银', 2299, 2599, 120], ['256GB 樱花粉', 2599, 2899, 90]]],
  ['自营', 'DIGITAL_LAPTOP', '智选云 Book Air 14', '1.29kg 轻薄本 · 2.8K 高刷屏', '💻', '#3b4a6b',
    { BRAND: 'ZCloud', CPU: '酷睿 Ultra 5', MEMORY: '16GB', DISK: '512GB', SCREEN_SIZE: 14 },
    [['16GB+512GB', 5299, 5999, 55], ['32GB+1TB', 6899, 7599, 20]]],
  ['自营', 'DIGITAL_LAPTOP', '智选云 Book Pro 16', '高性能创作本 · 独显', '💻', '#5a3b6b',
    { BRAND: 'ZCloud', CPU: '酷睿 Ultra 9', MEMORY: '32GB', DISK: '1TB', SCREEN_SIZE: 16 },
    [['32GB+1TB', 9999, 10999, 26], ['64GB+2TB', 12999, 13999, 10]]],

  ['自营', 'FASHION_MEN', '简白 精梳棉圆领 T 恤', '100% 新疆长绒棉 · 亲肤透气', '👕', '#4a5a6a',
    { BRAND: '简白', SIZE: 'L', MATERIAL: '精梳棉' },
    [['S 白色', 89, 129, 200], ['M 白色', 89, 129, 260], ['L 白色', 89, 129, 180], ['XL 藏青', 99, 139, 120]]],
  ['自营', 'FASHION_MEN', '极北 户外冲锋衣三合一', '防风防水 · 可拆内胆', '🧥', '#2f6b5a',
    { BRAND: '极北', SIZE: 'XL', MATERIAL: '锦纶' },
    [['M 军绿', 699, 899, 60], ['L 军绿', 699, 899, 55], ['XL 黑色', 729, 929, 40]]],
  ['自营', 'FASHION_SHOES', '云跃 轻量跑鞋 3.0', '回弹中底 · 仅 218g', '👟', '#e0784a',
    { BRAND: '云跃', SHOE_SIZE: 42, CLOSURE: '系带' },
    [['41 竞速红', 399, 499, 90], ['42 竞速红', 399, 499, 110], ['42 曜石黑', 399, 499, 130], ['43 曜石黑', 399, 499, 80]]],
  ['自营', 'FASHION_SHOES', '云跃 复古板鞋', '百搭复古 · 耐磨橡胶大底', '👟', '#a05a7a',
    { BRAND: '云跃', SHOE_SIZE: 40, CLOSURE: '系带' },
    [['39 奶油白', 299, 399, 100], ['40 奶油白', 299, 399, 120], ['41 复古棕', 319, 399, 70]]],

  ['自营', 'FOOD_SNACK', '山野 每日坚果混合装 750g', '7 种果仁 · 独立小包', '🥜', '#b07a2f',
    { BRAND: '山野', SHELF_LIFE: 180, FLAVOR: '原味', PACKAGE_TYPE: '袋装' },
    [['750g 袋装', 79, 99, 300], ['750g×2 组合装', 149, 198, 120]]],
  ['自营', 'FOOD_SNACK', '脆乐 海盐薯片 大桶装', '非油炸 · 海盐轻咸', '🍟', '#c9a02f',
    { BRAND: '脆乐', SHELF_LIFE: 270, FLAVOR: '海盐', PACKAGE_TYPE: '罐装' },
    [['104g 罐装', 15.9, 19.9, 500], ['104g×3 组合装', 42, 59.7, 160]]],
  ['自营', 'FOOD_DRINK', '清源 无糖气泡水 12 瓶', '0 糖 0 卡 · 天然矿泉水基', '🥤', '#3f9db0',
    { BRAND: '清源', SHELF_LIFE: 365, VOLUME: 480, SUGAR: '无糖' },
    [['480ml×12 原味', 39, 55, 400], ['480ml×12 青柠味', 39, 55, 260]]],
  ['自营', 'FOOD_DRINK', '暖阳 冷萃拿铁 咖啡液 10 条', '0 蔗糖 · 冷萃锁鲜', '☕', '#6b4a2f',
    { BRAND: '暖阳', SHELF_LIFE: 240, VOLUME: 30, SUGAR: '低糖' },
    [['30ml×10 经典', 59, 79, 200], ['30ml×20 家庭装', 109, 158, 90]]],
  ['自营', 'HOME_APPLIANCE_KITCHEN_RICE_COOKER', '智选云 迷你电饭煲 1.6L', '1-2 人食 · 小巧不占地', '🍚', '#6fa0cf',
    { BRAND: '智选云', ENERGY_LEVEL: '三级', WARRANTY_YEARS: 1, CAPACITY: 1.6, INNER_POT: '铝合金', KEEP_WARM_HOURS: 8 },
    [['1.6L 白', 199, 259, 180]]],
];

// 品牌 → 商家映射（自营旗舰店）
const MERCHANT_SHOP = '智选云自营旗舰店';

function buildCategories(db) {
  db.categories = [];
  db.categoryVersions = [];
  db.indexMappings = [];
  let versionSeq = 0;
  let nextId = 1; // 全局唯一 id 分配（跨根品类树）
  CATEGORY_JSONS.forEach((item, idx) => {
    const syn = cat.syntaxCheck(item.text);
    if (!syn.ok) throw new Error('种子品类 JSON 语法错误：' + item.source);
    const v = cat.validate(syn.value);
    if (v.errors.length) throw new Error('种子品类校验失败：' + item.source + ' ' + JSON.stringify(v.errors));
    const tree = cat.buildTree(syn.value.category, nextId);
    const flat = cat.flatten(tree);
    nextId = Math.max.apply(null, flat.map((n) => n.id)) + 1;
    flat.forEach((node) => {
      db.categories.push({
        id: node.id, code: node.code, name: node.name, parentId: node.parentId, level: node.level,
        path: node.path, isLeaf: node.isLeaf, sort: node.sort,
        attributes: node.attributes, version: idx + 1, status: 1,
        source: item.source, merchantId: 2,
      });
    });
    const idxMap = cat.buildIndexMapping(tree);
    db.indexMappings.push(Object.assign({ id: db.indexMappings.length + 1, categoryId: tree.id }, idxMap));
    versionSeq = idx + 1;
    db.categoryVersions.push({
      id: db.categoryVersions.length + 1, code: tree.code, version: idx + 1,
      createdAt: new Date(Date.now() - (CATEGORY_JSONS.length - idx) * 86400000).toISOString(),
      attrCount: cat.flatten(tree).reduce((n, c) => n + c.attributes.length, 0),
      nodeCount: flat.length, source: item.source, status: 'published',
    });
  });
  db.meta.categoryVersionSeq = versionSeq;
}

function buildProducts(db) {
  const leafByCode = {};
  db.categories.forEach((c) => { leafByCode[c.code] = c; });
  let skuId = 1;
  const products = [];
  const skus = [];
  const inventories = [];
  PRODUCT_SEEDS.forEach((seed, i) => {
    const [merchantTag, catCode, title, subtitle, emoji, color, attrs, skuList] = seed;
    const category = leafByCode[catCode];
    if (!category) throw new Error('未找到品类 ' + catCode);
    const pid = i + 1;
    const productSkus = skuList.map((s, k) => {
      const [specText, salePrice, marketPrice, stock] = s;
      const id = skuId++;
      skus.push({ id, productId: pid, specText, salePrice, marketPrice, status: 1, attrs });
      inventories.push({ id: inventories.length + 1, skuId: id, warehouseId: k % 2 === 0 ? 1 : 2, totalQty: stock, lockedQty: 0, safeQty: Math.max(5, Math.round(stock * 0.1)), version: 1 });
      return id;
    });
    const prices = skuList.map((s) => s[1]);
    products.push({
      id: pid, merchantId: 2, merchantName: MERCHANT_SHOP,
      categoryId: category.id, categoryCode: catCode, categoryName: category.name,
      title, subtitle, emoji, color, mainImage: '',
      attrs, skuIds: productSkus,
      priceMin: Math.min.apply(null, prices), priceMax: Math.max.apply(null, prices),
      status: 1, tags: ['自营', '包邮'],
      salesCount: Math.round(200 / (i + 2)) + (i % 5) * 13,
      ratingAvg: 4.5 + ((i % 5) / 10), reviewCount: 0,
      createdAt: new Date(Date.now() - (PRODUCT_SEEDS.length - i) * 3600000 * 6).toISOString(),
    });
  });
  db.products = products;
  db.skus = skus;
  db.inventories = inventories;
}

function seedFactory(isMerge) {
  const db = {
    meta: {
      system: 'AI-ECP',
      name: '智选云 AI 电商在线售货系统',
      version: '1.0.0',
      createdAt: new Date().toISOString(),
      categoryVersionSeq: 0,
      orderSeq: 0,
    },
    users: [
      { id: 1, username: 'consumer01', nickname: '云小买', mobile: '13800000001', role: 'consumer', password: hashPassword('consumer123'), memberLevel: 2, status: 1, createdAt: new Date().toISOString() },
      { id: 2, username: 'merchant01', nickname: '智选云自营旗舰店', mobile: '13800000002', role: 'merchant', password: hashPassword('merchant123'), shopName: MERCHANT_SHOP, memberLevel: 0, status: 1, createdAt: new Date().toISOString() },
      { id: 3, username: 'admin', nickname: '平台管理员', mobile: '13800000003', role: 'admin', password: hashPassword('admin123'), memberLevel: 0, status: 1, createdAt: new Date().toISOString() },
    ],
    addresses: [
      { id: 1, userId: 1, receiver: '云小买', phone: '13800000001', province: '广东省', city: '深圳市', district: '南山区', detail: '科技园南路 88 号智选大厦 A 座 1201', isDefault: 1 },
    ],
    userProfiles: [],
    categories: [],
    categoryVersions: [],
    indexMappings: [],
    products: [],
    skus: [],
    inventories: [],
    inventoryLogs: [],
    carts: [],
    orders: [],
    orderItems: [],
    payments: [],
    shipments: [],
    logisticsTraces: [],
    reviews: [],
    afterSales: [],
    coupons: [
      { id: 1, code: 'WELCOME20', name: '新人满 200 减 20', type: 'full_reduce', threshold: 200, value: 20, startAt: new Date(Date.now() - 86400000).toISOString(), endAt: new Date(Date.now() + 30 * 86400000).toISOString(), total: 1000, claimed: 0, status: 1 },
      { id: 2, code: 'SUMMER50', name: '夏日满 500 减 50', type: 'full_reduce', threshold: 500, value: 50, startAt: new Date(Date.now() - 86400000).toISOString(), endAt: new Date(Date.now() + 30 * 86400000).toISOString(), total: 500, claimed: 0, status: 1 },
      { id: 3, code: 'DISCOUNT95', name: '全场 9.5 折', type: 'discount', threshold: 0, value: 0.95, startAt: new Date(Date.now() - 86400000).toISOString(), endAt: new Date(Date.now() + 30 * 86400000).toISOString(), total: 300, claimed: 0, status: 1 },
    ],
    userCoupons: [],
    behaviors: [],
    conversations: [],
    messages: [],
    recommendLogs: [],
    bundles: [],
    bundleItems: [],
    knowledge: [],
    prompts: [
      { id: 1, name: '智能客服主提示词', scene: 'customer_service', version: 3, content: '你是智选云 AI 电商客服助手，依据检索到的知识片段与受控工具返回结果作答；不确定时建议转人工。', status: 'published', updatedAt: new Date().toISOString() },
      { id: 2, name: '智能选品排序提示词', scene: 'selection', version: 2, content: '结合用户画像与实时行为，对多路召回商品进行精排并给出推荐理由。', status: 'published', updatedAt: new Date().toISOString() },
      { id: 3, name: '智能组货搭配提示词', scene: 'bundle', version: 1, content: '以主商品为中心生成成套搭配方案与组合优惠；仅生成可售组合的搭配理由。', status: 'published', updatedAt: new Date().toISOString() },
    ],
    auditLogs: [],
    config: {
      llm: { provider: 'local-gateway', model: 'aiecp-rule-engine', temperature: 0.3, enabled: true, fallbackEnabled: true },
      recommend: { recallChannels: ['vector', 'hot', 'new', 'cf'], rerankTopN: 12, diversity: true },
      guardrail: { inputFilter: true, outputFilter: true, toolWhitelist: ['order_query', 'logistics_query', 'inventory_query', 'coupon_query'] },
    },
  };

  buildCategories(db);
  buildProducts(db);
  buildKnowledge(db);
  if (!isMerge) {
    db.userProfiles = [{
      id: 1, userId: 1, preferredCategories: ['DIGITAL', 'HOME_APPLIANCE'], priceBand: 'mid',
      activityScore: 0.62, updatedAt: new Date().toISOString(),
    }];
  }
  return db;
}

function buildKnowledge(db) {
  const K = [
    ['售后政策', '七天无理由退货：自签收之日起 7 天内，商品完好、配件齐全可申请无理由退货，运费由平台承担。', 'AFTERSALE'],
    ['售后政策', '退货流程：订单详情页点击「申请售后」→ 选择退货退款 → 上传凭证 → 审核通过后按提示寄回 → 验收后 1-3 个工作日退款到原支付渠道。', 'AFTERSALE'],
    ['配送说明', '默认使用顺丰/京东物流发货，付款后 48 小时内出库，全国大部分地区 1-3 天送达，偏远地区 3-5 天。', 'LOGISTICS'],
    ['配送说明', '满 99 元包邮，未满收取 8 元基础运费；大件家电支持送装一体，偏远地区可能加收运费。', 'LOGISTICS'],
    ['支付方式', '支持微信支付、支付宝、银行卡与余额支付；支付回调经签名校验且幂等处理，重复回调不重复扣款。', 'PAYMENT'],
    ['发票说明', '下单时可在备注中填写发票抬头与税号，电子发票将在订单完成后 24 小时内推送至账号邮箱。', 'INVOICE'],
    ['品类自定义', '本系统支持商家以 JSON 文本自定义商品品类结构，系统解析后自动生成属性 Schema、动态商品发布表单与检索索引，新增品类无需代码变更与系统发版。', 'CATEGORY'],
    ['智能客服', '智能客服支持多轮对话与上下文记忆，知识咨询走检索增强生成，订单、物流等业务问题走受控工具查询；置信度不足时可转接人工客服。', 'AI_CS'],
    ['智能选品', '智能选品依据用户画像与实时行为进行多路召回与个性化排序，过滤下架、无库存与限购商品；冷启动时返回热门榜单兜底。', 'AI_REC'],
    ['智能组货', '智能组货以主商品为中心召回配套商品，只有库存、履约、价格与毛利四维同时成立的组合才会输出，否则降级为单品推荐。', 'AI_BUNDLE'],
    ['会员权益', '会员等级分为 V1-V4，等级越高享受越高比例的会员折扣与专属客服；成长值由成交金额与互动行为累积。', 'MEMBER'],
  ];
  db.knowledge = K.map((k, i) => ({
    id: i + 1, categoryCode: k[2], content: k[0] + '：' + k[1],
    title: k[0], embeddingId: 'vec_' + (i + 1), status: 1,
  }));
}

module.exports = { seedFactory, CATEGORY_JSONS, MERCHANT_SHOP };

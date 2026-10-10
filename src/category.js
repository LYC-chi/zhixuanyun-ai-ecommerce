'use strict';
/**
 * category.js — 自定义商品品类 JSON 引擎
 * 对应需求 FR-07 ~ FR-10、报告 3.6 节品类规范与 V-01 ~ V-12 校验规则。
 * 契约：全量校验、一次反馈（不在首个错误处中断）；纯校验(dry-run)与正式提交分离。
 */

const SUPPORTED_VERSIONS = ['1.0'];
const DATA_TYPES = ['string', 'integer', 'decimal', 'boolean', 'enum', 'multiEnum', 'date', 'text', 'image'];
const NUMERIC_TYPES = ['integer', 'decimal'];
const ENUM_TYPES = ['enum', 'multiEnum'];
const CODE_RE = /^[A-Z][A-Z0-9_]{1,63}$/;
const MAX_NODES = 2000;
const MAX_ATTRS = 20000;
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_DEPTH = 5;

/** V-01：JSON 语法校验，定位行号与列号 */
function syntaxCheck(jsonText) {
  if (jsonText == null) return { ok: false, error: { detail: '请求体缺少 jsonText' } };
  const bytes = Buffer.byteLength(jsonText, 'utf8');
  if (bytes > MAX_BYTES) {
    return { ok: false, error: { rule: 'V-12', detail: `JSON 文本超过 2MB 限制（当前 ${bytes} 字节）` } };
  }
  try {
    const value = JSON.parse(jsonText);
    return { ok: true, value };
  } catch (e) {
    const m = /position\s+(\d+)/i.exec(e.message);
    let line = 1, column = 1;
    if (m) {
      const pos = Number(m[1]);
      const before = jsonText.slice(0, pos);
      line = before.split('\n').length;
      column = pos - before.lastIndexOf('\n');
    }
    return {
      ok: false,
      error: {
        rule: 'V-01',
        line, column,
        detail: 'JSON 语法错误：' + e.message,
      },
    };
  }
}

/** 主校验：返回 { errors: [], warnings: [], tree, stats } */
function validate(root) {
  const errors = [];
  const warnings = [];
  const stats = { nodeCount: 0, attrCount: 0, maxDepth: 0 };
  const seenCodes = new Map(); // code -> path

  if (!root || typeof root !== 'object' || Array.isArray(root)) {
    errors.push({ rule: 'V-11', path: '$', detail: '根节点必须是对象，且包含 schemaVersion 与 category' });
    return { errors, warnings, stats };
  }

  // V-02：规范版本
  if (root.schemaVersion == null) {
    errors.push({ rule: 'V-02', path: 'schemaVersion', detail: '缺少 schemaVersion，当前支持版本：' + SUPPORTED_VERSIONS.join('、') });
  } else if (!SUPPORTED_VERSIONS.includes(String(root.schemaVersion))) {
    errors.push({ rule: 'V-02', path: 'schemaVersion', detail: `不支持的 schemaVersion「${root.schemaVersion}」，当前支持：${SUPPORTED_VERSIONS.join('、')}` });
  }

  // V-11：category 必填
  if (!root.category || typeof root.category !== 'object') {
    errors.push({ rule: 'V-11', path: 'category', detail: '缺少 category 根品类节点' });
    return { errors, warnings, stats };
  }

  const visitedInStack = new Set(); // V-10 循环引用检测

  function walk(node, path, depth, inheritedAttrCodes) {
    if (depth > MAX_DEPTH) {
      errors.push({ rule: 'V-05', path, detail: `品类树深度超过 ${MAX_DEPTH} 层限制` });
      return;
    }
    stats.maxDepth = Math.max(stats.maxDepth, depth);
    stats.nodeCount += 1;
    if (stats.nodeCount > MAX_NODES) {
      errors.push({ rule: 'V-12', path, detail: `品类节点总数超过 ${MAX_NODES} 限制` });
      return;
    }

    if (!node || typeof node !== 'object' || Array.isArray(node)) {
      errors.push({ rule: 'V-11', path, detail: '品类节点必须是对象' });
      return;
    }

    // V-10：循环引用（对象引用层面）
    if (visitedInStack.has(node)) {
      errors.push({ rule: 'V-10', path, detail: '品类树存在循环引用' });
      return;
    }
    visitedInStack.add(node);

    // V-11 / V-04：code
    if (node.code == null || String(node.code).trim() === '') {
      errors.push({ rule: 'V-11', path: path + '.code', detail: '品类缺少非空 code' });
    } else {
      const code = String(node.code);
      if (!CODE_RE.test(code)) {
        errors.push({ rule: 'V-04', path: path + '.code', detail: `品类编码「${code}」不符合 ^[A-Z][A-Z0-9_]{1,63}$ 格式` });
      }
      if (seenCodes.has(code)) {
        errors.push({ rule: 'V-03', path: path + '.code', detail: `品类编码重复：「${code}」已出现在 ${seenCodes.get(code)}` });
      } else {
        seenCodes.set(code, path + '.code');
      }
    }

    // V-11：name
    if (node.name == null || String(node.name).trim() === '') {
      errors.push({ rule: 'V-11', path: path + '.name', detail: '品类缺少非空 name' });
    } else if (String(node.name).length > 64) {
      errors.push({ rule: 'V-11', path: path + '.name', detail: '品类名称超过 64 字符限制' });
    }

    if (node.sort != null && !Number.isInteger(node.sort)) {
      errors.push({ rule: 'V-11', path: path + '.sort', detail: 'sort 必须为整数' });
    }

    // 属性校验
    const localAttrCodes = new Set();
    if (node.attributes != null) {
      if (!Array.isArray(node.attributes)) {
        errors.push({ rule: 'V-11', path: path + '.attributes', detail: 'attributes 必须为数组' });
      } else {
        node.attributes.forEach((attr, i) => {
          const ap = `${path}.attributes[${i}]`;
          stats.attrCount += 1;
          if (stats.attrCount > MAX_ATTRS) {
            errors.push({ rule: 'V-12', path: ap, detail: `属性总数超过 ${MAX_ATTRS} 限制` });
            return;
          }
          if (!attr || typeof attr !== 'object') {
            errors.push({ rule: 'V-11', path: ap, detail: '属性必须是对象' });
            return;
          }
          if (!attr.code || String(attr.code).trim() === '') {
            errors.push({ rule: 'V-11', path: ap + '.code', detail: '属性缺少非空 code' });
          } else if (!CODE_RE.test(String(attr.code))) {
            errors.push({ rule: 'V-04', path: ap + '.code', detail: `属性编码「${attr.code}」不符合 ^[A-Z][A-Z0-9_]{1,63}$ 格式` });
          }
          if (!attr.name || String(attr.name).trim() === '') {
            errors.push({ rule: 'V-11', path: ap + '.name', detail: '属性缺少非空 name' });
          }
          // V-07 数据类型白名单
          if (!attr.dataType || !DATA_TYPES.includes(attr.dataType)) {
            errors.push({ rule: 'V-07', path: ap + '.dataType', detail: `dataType「${attr.dataType}」不在白名单 ${DATA_TYPES.join('/')} 内` });
          }
          // V-08 枚举完备性
          if (ENUM_TYPES.includes(attr.dataType)) {
            if (!Array.isArray(attr.options) || attr.options.length === 0) {
              errors.push({ rule: 'V-08', path: ap + '.options', detail: `${attr.dataType} 类型必须提供非空 options 枚举列表` });
            }
          }
          // V-09 数值区间合法性
          if (attr.range != null) {
            const bad = !Array.isArray(attr.range) || attr.range.length !== 2 ||
              typeof attr.range[0] !== 'number' || typeof attr.range[1] !== 'number' ||
              attr.range[0] > attr.range[1];
            if (bad) {
              errors.push({ rule: 'V-09', path: ap + '.range', detail: 'range 必须为 [min, max] 且 min <= max' });
            } else if (!NUMERIC_TYPES.includes(attr.dataType)) {
              warnings.push({ rule: 'V-09', path: ap + '.range', detail: '非数值型属性设置了 range，已忽略' });
            }
          }
          // V-06 属性编码唯一性
          if (attr.code) {
            if (localAttrCodes.has(attr.code)) {
              errors.push({ rule: 'V-06', path: ap + '.code', detail: `同一品类内属性编码重复：「${attr.code}」` });
            } else {
              localAttrCodes.add(attr.code);
            }
            if (inheritedAttrCodes.has(attr.code)) {
              warnings.push({ rule: 'V-06', path: ap + '.code', detail: `属性「${attr.code}」与继承自父品类的属性编码冲突，视为覆盖意图` });
            }
          }
        });
      }
    }

    // 子品类
    if (node.children != null) {
      if (!Array.isArray(node.children)) {
        errors.push({ rule: 'V-11', path: path + '.children', detail: 'children 必须为数组' });
      } else {
        const inherited = new Set(inheritedAttrCodes);
        if (Array.isArray(node.attributes)) {
          node.attributes.forEach((a) => { if (a && a.code) inherited.add(a.code); });
        }
        node.children.forEach((child, i) => walk(child, `${path}.children[${i}]`, depth + 1, inherited));
      }
    }

    visitedInStack.delete(node);
  }

  walk(root.category, 'category', 1, new Set());

  return { errors, warnings, stats };
}

/** 构建品类树（含继承后的完整属性集） */
function buildTree(rootCategory, idStart) {
  let autoId = idStart || 1;
  function rec(node, parentId, level, parentAttrs) {
    const ownAttrs = Array.isArray(node.attributes) ? node.attributes : [];
    // 继承：父级有效属性（标记 inherited=true）+ 本级属性（本级同名视为覆盖）
    const attrMap = new Map();
    (parentAttrs || []).forEach((a) => { if (a && a.code) attrMap.set(a.code, Object.assign({ inherited: true }, a)); });
    ownAttrs.forEach((a) => { if (a && a.code) attrMap.set(a.code, Object.assign({ inherited: false }, a)); });
    const effectiveAttrs = Array.from(attrMap.values());
    const childInherit = effectiveAttrs;

    const id = autoId++;
    const children = Array.isArray(node.children) ? node.children : [];
    const tree = {
      id,
      code: node.code,
      name: node.name,
      sort: node.sort || 0,
      parentId: parentId || null,
      level,
      path: (parentId ? '' : '') + '/' + node.code,
      isLeaf: children.length === 0,
      ownAttributes: ownAttrs.map((a) => Object.assign({ inherited: false }, a)),
      attributes: effectiveAttrs,
    };
    tree.children = children
      .slice()
      .sort((a, b) => (a.sort || 0) - (b.sort || 0))
      .map((c) => rec(c, id, level + 1, childInherit));
    return tree;
  }
  const t = rec(rootCategory, null, 1, []);
  // 计算完整 path
  (function fix(n, parentPath) {
    n.path = parentPath + '/' + n.code;
    n.children.forEach((c) => fix(c, n.path));
  })(t, '');
  return t;
}

/** 扁平化品类树 */
function flatten(tree, acc) {
  acc = acc || [];
  acc.push(tree);
  tree.children.forEach((c) => flatten(c, acc));
  return acc;
}

/** FR-09：依据属性 Schema 生成动态商品发布表单描述 */
function buildFormSchema(tree) {
  const fields = tree.attributes.map((a) => {
    const f = {
      field: a.code,
      label: a.name,
      type: a.dataType,
      required: !!a.required,
      inherited: !!a.inherited,
      placeholder: '',
    };
    if (a.unit) f.unit = a.unit;
    if (a.options) f.options = a.options;
    if (a.range) { f.min = a.range[0]; f.max = a.range[1]; }
    if (a.dataType === 'multiEnum') { f.multiple = true; }
    if (a.dataType === 'image') { f.placeholder = '粘贴图片 URL 或上传素材'; }
    return f;
  });
  const groups = [
    { group: '基础信息', fields: [
      { field: 'title', label: '商品标题', type: 'string', required: true },
      { field: 'mainImage', label: '主图', type: 'image', required: false },
      { field: 'subtitle', label: '副标题/卖点', type: 'string', required: false },
    ] },
    { group: '品类属性（由品类 Schema 动态生成）', fields },
    { group: 'SKU 与价格', fields: [
      { field: 'skuSpecs', label: '销售规格', type: 'skuMatrix', required: true },
    ] },
  ];
  return {
    categoryId: tree.id,
    categoryCode: tree.code,
    categoryName: tree.name,
    schemaVersion: '1.0',
    fieldCount: fields.length,
    fields,
    groups,
  };
}

/** FR-10：依据 filterable / searchable 属性生成检索与筛选索引映射 */
function buildIndexMapping(tree) {
  const indexFields = [];
  tree.attributes.forEach((a) => {
    if (a.searchable) indexFields.push({ field: a.code, type: 'text', purpose: 'fulltext', mappedFrom: a.dataType });
    if (a.filterable) {
      const t = NUMERIC_TYPES.includes(a.dataType) ? 'range'
        : (ENUM_TYPES.includes(a.dataType) ? 'keyword' : (a.dataType === 'boolean' ? 'keyword' : 'keyword'));
      indexFields.push({ field: a.code, type: t, purpose: 'filter', mappedFrom: a.dataType, options: a.options || null });
    }
  });
  return {
    indexName: 'idx_product_' + tree.code.toLowerCase(),
    categoryCode: tree.code,
    fieldCount: indexFields.length,
    fields: indexFields,
    analyzer: 'ik_smart',
    syncStatus: 'synced',
  };
}

module.exports = {
  syntaxCheck, validate, buildTree, flatten, buildFormSchema, buildIndexMapping,
  DATA_TYPES, SUPPORTED_VERSIONS, CODE_RE,
};

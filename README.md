# 智选云 AI 电商在线售货系统（AI-ECP）

> 依据《智选云 AI 电商在线售货系统 - 完整成果包》（需求分析报告 AIECP-SRS-001、系统设计报告 AIECP-SDD-001、22 幅 UML 图）实现的可运行电商在线销售系统。

技术形态：**动态网站**（Node.js 单端口 HTTP 服务，前端 SPA + REST API + 文件型持久化），零外部依赖，可直接外网部署。

---

## 一、运行方式

```bash
# 需 Node.js >= 18
node server.js
# 默认监听 3000；部署环境通过 PORT 环境变量注入
PORT=8080 node server.js
```

浏览器访问 `http://localhost:3000`。

## 二、系统登录信息（默认账号）

| 角色 | 用户名 | 密码 | 说明 |
|---|---|---|---|
| 消费者 | `consumer01` | `consumer123` | 商城浏览、加购、下单、AI 助手 |
| 商家 | `merchant01` | `merchant123` | 品类 JSON 导入、商品/库存/订单管理 |
| 平台管理员 | `admin` | `admin123` | 数据看板、用户权限、营销、AI 与知识库配置 |

> 登录页提供「一键填充」按钮；亦支持注册新账号（消费者 / 商家）。

## 三、已实现能力与需求对应

| 需求 | 能力 | 实现要点 |
|---|---|---|
| FR-01 | 商品浏览与检索 | 品类树逐级浏览、关键词检索、按 Schema `filterable` 动态生成筛选维度、多种排序 |
| FR-02 | 商品详情与规格选择 | SPU/SKU 展示，规格价格库存联动，属性 Schema 动态渲染 |
| FR-03 | 购物车管理 | 单品加购、组合方案整单加购、数量修改、勾选结算、失效提示 |
| FR-04 | 下单与支付 | 地址/优惠计算、订单创建、库存锁定、支付发起、回调验签且幂等 |
| FR-05 | 订单与物流 | 订单列表/详情、状态流转步进条、物流轨迹、确认收货 |
| FR-06 | 售后与评价 | 取消订单、退款退货申请与凭证、商品评价 |
| FR-07~10 | JSON 自定义品类 | 语法/结构全量校验（V-01~V-12）、品类树构建、动态表单生成、检索索引映射 |
| FR-11 | SPU/SKU 管理 | 商品发布（按品类必填属性校验）、上下架、规格价格维护 |
| FR-12 | 库存管理 | 多仓库存、锁定与扣减、低库存预警、库存流水 |
| FR-13~16 | 智能客服 | 多轮上下文、意图识别+槽位、知识 RAG、受控工具调用、转人工、降级 |
| FR-17~20 | 智能选品 | 画像构建、多路召回（向量/热门/新品/协同）、精排、规则过滤、多样性重排、冷启动兜底、埋点 |
| FR-21~23 | 智能组货 | 场景识别、配套召回、库存/履约/价格/毛利四维校验、组合定价、一键加购、降级单品 |
| FR-24 | 营销与优惠券 | 满减/折扣券、领取与使用、与订单金额联动 |
| FR-25 | 运营数据看板 | GMV/订单/客单价、品类销售分布、行为埋点分布、AI 调用统计 |
| FR-26 | 用户与权限 | 角色/菜单/数据范围三级权限、操作审计日志 |
| FR-27 | AI 与知识库配置 | 提示词模板版本管理、模型路由与护栏配置、知识文档导入与切片 |

## 四、统一接口约定

- 风格：RESTful，前缀 `/api/v1`
- 响应体：`{ code, message, data, traceId }`，`code = 0` 表示成功
- 鉴权：请求头 `Authorization: Bearer <token>`
- 幂等：写接口支持 `X-Idempotency-Key` 请求头
- AI 接口统一携带 `degraded` / `degradeReason` 降级语义字段

主要接口：

```
POST /api/v1/auth/login | /register
GET  /api/v1/mall/categories/tree
GET  /api/v1/mall/products            # 检索/筛选/排序
GET  /api/v1/mall/products/{id}
POST /api/v1/mall/orders
POST /api/v1/mall/payments/{orderId}/pay
POST /api/v1/callback/payment/{channel}
GET  /api/v1/mall/orders/{id}/logistics
POST /api/v1/merchant/categories/validate | /import
GET  /api/v1/merchant/categories/{id}/form-schema
POST /api/v1/ai/customer-service/chat
POST /api/v1/ai/recommend/selection
POST /api/v1/ai/bundle/compose
GET  /api/v1/console/dashboard
```

## 五、工程结构

```
aiecp-app/
├── server.js                 # 单端口 HTTP 服务：静态资源 + REST 路由 + 领域逻辑
├── package.json
├── src/
│   ├── store.js              # JSON 文件持久层
│   ├── seed.js               # 种子数据（品类经真实解析链路生成）
│   ├── category.js           # 品类 JSON 引擎（校验 V-01~V-12 / 树 / 表单 / 索引）
│   ├── auth.js               # 口令散列、令牌签名、角色权限
│   └── ai/
│       ├── llm.js            # 大模型网关抽象 + 向量检索 + 安全护栏
│       ├── customerService.js# 智能客服（意图/ RAG / 工具 / 转人工 / 降级）
│       ├── selection.js      # 智能选品（多路召回 + 精排 + 过滤 + 兜底）
│       └── bundle.js         # 智能组货（四维校验 + 组合定价）
├── public/                   # 前端 SPA（原生物、无外部依赖）
│   ├── index.html
│   └── assets/{app.css,app.js}
└── data/db.json              # 运行时数据（首次启动自动生成）
```

## 六、自测

```bash
python test_flow.py           # 44 项端到端用例（需服务已在 3111 端口运行）
```

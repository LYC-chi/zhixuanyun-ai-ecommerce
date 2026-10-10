# -*- coding: utf-8 -*-
import json, urllib.request, urllib.parse, sys, time, os

os.environ['NO_PROXY'] = '127.0.0.1,localhost'
os.environ['no_proxy'] = '127.0.0.1,localhost'
OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))

B = "http://127.0.0.1:3111"

def req(method, path, token=None, body=None, raw=False):
    url = B + path
    data = None
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    if body is not None:
        data = json.dumps(body).encode('utf-8')
    r = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with OPENER.open(r, timeout=20) as resp:
            txt = resp.read().decode('utf-8')
    except urllib.error.HTTPError as e:
        txt = e.read().decode('utf-8')
    if raw:
        return txt
    try:
        return json.loads(txt)
    except Exception:
        print("NON-JSON:", txt[:300]); return None

def P(label, cond, extra=''):
    print(('  OK  ' if cond else ' FAIL ') + label + ((' | ' + str(extra)) if extra else ''))

# 1. 登录
r = req('POST', '/api/v1/auth/login', body={'username': 'consumer01', 'password': 'consumer123'})
T = r['data']['token']
P('消费者登录', r['code'] == 0)
P('登录手机号脱敏', '****' in r['data']['user']['mobile'], r['data']['user']['mobile'])
P('菜单权限返回', 'mall' in r['data']['user']['menus'])

# 2. 品类树
r = req('GET', '/api/v1/mall/categories/tree')
roots = [n['name'] for n in r['data']['tree']]
P('品类树 4 个根品类', len(roots) == 4, roots)
# 检查 id 唯一
allids = []
def walk(n):
    allids.append(n['id'])
    for c in n['children']: walk(c)
for n in r['data']['tree']: walk(n)
P('品类 id 全局唯一', len(allids) == len(set(allids)), f'{len(allids)} / {len(set(allids))}')

# 3. 商品列表 + 筛选
r = req('GET', '/api/v1/mall/products?size=100')
P('商品总数 18', r['data']['total'] == 18, r['data']['total'])
# 找到电饭煲叶子
leaf = None
for n in r and req('GET','/api/v1/mall/categories/tree')['data']['tree']:
    def find(x, code):
        if x['code'] == code: return x
        for c in x['children']:
            f = find(c, code)
            if f: return f
        return None
    leaf = find(n, 'HOME_APPLIANCE_KITCHEN_RICE_COOKER')
    if leaf: break
r = req('GET', f"/api/v1/mall/products?categoryId={leaf['id']}&size=50")
P('电饭煲品类 3 件商品', r['data']['total'] == 3, [p['title'] for p in r['data']['list']])
facets = {f['code']: f for f in r['data']['facets']}
P('筛选维度由 filterable 生成', 'INNER_POT' in facets and 'BRAND' in facets, list(facets.keys()))
r2 = req('GET', f"/api/v1/mall/products?categoryId={leaf['id']}&att.INNER_POT=%E9%93%B8%E9%93%81")  # 铸铁
P('按属性值筛选(内胆=铸铁)', r2['data']['total'] == 1, [p['title'] for p in r2['data']['list']])

# 4. 商品详情
r = req('GET', '/api/v1/mall/products/1')
prod = r['data']['product']
P('商品详情含 SKU', len(prod['skus']) == 3, [s['specText'] for s in prod['skus']])
P('详情动态属性 Schema 继承父属性', any(a['name'] == '品牌' for a in prod['attributeSchema']), [a['name'] for a in prod['attributeSchema']])

# 5. 购物车
req('POST', '/api/v1/mall/cart/items', T, {'skuId': 1, 'quantity': 2})
r = req('GET', '/api/v1/mall/cart', T)
P('购物车合计正确', r['data']['summary']['selectedTotal'] == 1198, r['data']['summary'])

# 6. 领券
r = req('POST', '/api/v1/mall/coupons/claim', T, {'code': 'WELCOME20'})
P('领取优惠券', r['code'] == 0, r['message'])

# 7. 下单
r = req('POST', '/api/v1/mall/orders', T, {'items': [{'skuId': 1, 'quantity': 1}, {'skuId': 6, 'quantity': 2}], 'couponCode': 'WELCOME20'})
order = r['data']['order']
P('创建订单', r['code'] == 0, order['orderNo'])
P('优惠券满减生效', order['couponDiscount'] == 20, order['couponDiscount'])
P('库存锁定', order['status'] == 0, order['statusText'])
oid = order['id']

# 8. 支付
r = req('POST', f'/api/v1/mall/payments/{oid}/pay', T, {'channel': 'wechat'})
P('支付成功并自动发货', r['data']['order']['status'] == 2, r['data']['order']['statusText'])

# 9. 物流
r = req('GET', f'/api/v1/mall/orders/{oid}/logistics', T)
P('物流轨迹返回', len(r['data']['traces']) >= 4, r['data']['shipment']['carrier'])

# 10. 确认收货
r = req('POST', f'/api/v1/mall/orders/{oid}/confirm', T)
P('确认收货', r['data']['order']['status'] == 3, r['data']['order']['statusText'])

# 11. 评价
r = req('POST', '/api/v1/mall/reviews', T, {'orderId': oid, 'productId': 1, 'rating': 5, 'content': '煮饭很香，预约功能好用！'})
P('提交评价', r['code'] == 0, r['message'])

# 12. AI 客服
r = req('POST', '/api/v1/ai/customer-service/chat', T, {'question': '我的订单什么时候发货？', 'pageContext': 'home'})
P('AI客服-物流意图', r['data']['intent'] == 'logistics_query', (r['data']['intent'], r['data']['confidence']))
P('AI客服-工具调用', len(r['data']['toolCalls']) > 0, r['data']['toolCalls'])
r = req('POST', '/api/v1/ai/customer-service/chat', T, {'question': '退货流程是什么？'})
P('AI客服-知识RAG+引用', len(r['data']['citations']) > 0, r['data']['citations'][:1])

# 13. AI 选品
r = req('POST', '/api/v1/ai/recommend/selection', T, {'scene': 'home', 'limit': 6})
P('智能选品 返回 items', len(r['data']['items']) > 0, [i['title'] for i in r['data']['items'][:3]])
P('智能选品 召回统计', 'vector' in r['data']['recallStats'], r['data']['recallStats'])
P('智能选品 含降级字段', 'degraded' in r['data'], r['data']['degraded'])

# 14. AI 组货
r = req('POST', '/api/v1/ai/bundle/compose', T, {'mainSkuId': 1, 'sceneTag': '厨房焕新'})
P('智能组货 返回方案或降级', len(r['data'].get('bundles', [])) > 0 or r['data'].get('degraded'), (len(r['data'].get('bundles', [])), r['data'].get('degraded')))
if r['data'].get('bundles'):
    b = r['data']['bundles'][0]
    P('组货四维校验', all(b['dims'][k]['ok'] for k in b['dims']), b['dims'])
    P('组货组合价低于原价', b['bundlePrice'] < b['totalMarket'], f"{b['bundlePrice']} < {b['totalMarket']}")

# 15. 商家端 - 品类导入
rm = req('POST', '/api/v1/auth/login', body={'username': 'merchant01', 'password': 'merchant123'})
TM = rm['data']['token']
badjson = '{ "schemaVersion":"1.0", "category": { "code":"test", "name":"" } }'
r = req('POST', '/api/v1/merchant/categories/validate', TM, {'jsonText': badjson})
P('品类校验-全量错误反馈', (r['data'] is not None) and r['data'].get('valid') is False and len(r['data'].get('errors', [])) >= 2, [e['rule'] for e in (r['data'] or {}).get('errors', [])])
goodjson = json.dumps({"schemaVersion":"1.0","category":{"code":"PET_SUPPLY","name":"宠物用品","attributes":[{"code":"BRAND","name":"品牌","dataType":"string","required":True,"filterable":True}],"children":[{"code":"PET_FOOD","name":"宠物主粮","attributes":[{"code":"WEIGHT","name":"规格","dataType":"enum","options":["1kg","2kg","5kg"],"required":True,"filterable":True}]}]}})
r = req('POST', '/api/v1/merchant/categories/import', TM, {'mode': 'dryRun', 'jsonText': goodjson})
P('品类 dry-run 生成表单 Schema', r['code'] == 0 and r['data']['formSchema']['fieldCount'] >= 1, r['data']['generated'])
r = req('POST', '/api/v1/merchant/categories/import', TM, {'mode': 'commit', 'jsonText': goodjson, 'sourceName': '测试导入'})
P('品类正式导入落库', r['code'] == 0, r['data'])

# 16. 商家商品发布（动态表单校验）
r = req('POST', '/api/v1/merchant/products', TM, {'categoryId': leaf['id'], 'title': '测试电饭煲', 'attrs': {'BRAND': '测试', 'ENERGY_LEVEL': '一级', 'INNER_POT': '不锈钢'}, 'skus': [{'specText': '3L', 'salePrice': 299, 'marketPrice': 399, 'stock': 10}]})
P('商家发布商品', r['code'] == 0, r['message'])
r = req('POST', '/api/v1/merchant/products', TM, {'categoryId': leaf['id'], 'title': '缺属性商品', 'attrs': {'BRAND': '测试'}, 'skus': []})
P('必填属性校验拦截', r['code'] != 0, r['message'])

# 17. 运营端
ra = req('POST', '/api/v1/auth/login', body={'username': 'admin', 'password': 'admin123'})
TA = ra['data']['token']
r = req('GET', '/api/v1/console/dashboard', TA)
P('运营看板 KPI', r['data']['kpi']['gmv'] > 0, r['data']['kpi'])
r = req('GET', '/api/v1/console/users', TA)
P('用户管理列表', len(r['data']['list']) >= 3, len(r['data']['list']))
r = req('GET', '/api/v1/console/audit-logs', TA)
P('操作审计日志', len(r['data']['list']) > 0, len(r['data']['list']))
r = req('GET', '/api/v1/console/ai/prompts', TA)
P('AI 提示词管理', len(r['data']['list']) >= 3, len(r['data']['list']))
r = req('POST', '/api/v1/console/knowledge/documents', TA, {'title': '新增FAQ', 'categoryCode': 'CUSTOM', 'content': '支持货到付款吗？目前暂不支持货到付款，请选择在线支付。'})
P('知识库导入切片', r['code'] == 0 and r['data']['chunks'] >= 1, r['data'])

# 18. 权限隔离
r = req('GET', '/api/v1/console/dashboard', T)
P('消费者访问运营端被拒', r['code'] == 40300, r['message'])

# 19. 未登录保护
r = req('GET', '/api/v1/mall/cart')
P('未登录访问购物车被拒', r['code'] == 40100, r['message'])

# 20. 幂等
import uuid
key = uuid.uuid4().hex
h = {'Authorization': 'Bearer ' + T, 'Content-Type': 'application/json', 'X-Idempotency-Key': key}
def post_idem(path, body):
    data = json.dumps(body).encode()
    rq = urllib.request.Request(B + path, data=data, headers=h, method='POST')
    return json.loads(OPENER.open(rq, timeout=20).read().decode())
o1 = post_idem('/api/v1/mall/orders', {'items': [{'skuId': 3, 'quantity': 1}]})
o2 = post_idem('/api/v1/mall/orders', {'items': [{'skuId': 3, 'quantity': 1}]})
P('下单幂等（同键同结果）', o1['data']['order']['orderNo'] == o2['data']['order']['orderNo'], o1['data']['order']['orderNo'])

print('\n==== 全部用例执行完毕 ====')

# Elasticsearch × Go 学习回顾

这篇笔记基于本地 Docker Elasticsearch 8.19.17 与 Go 官方客户端 `go-elasticsearch/v8`。

## 1. Elasticsearch 的核心结构

```text
Index（索引）
  └─ Document（文档）
       └─ Field（字段）
```

可以暂时类比为：

```text
MySQL database/table 的部分概念 → ES index
MySQL 一行记录                  → ES document
MySQL 列                         → ES field
```

一个索引通常包含很多同类文档，而不是“一条数据一个索引”。例如 `user_index` 中可包含很多用户文档。

## 2. Docker 与客户端版本必须匹配

本地镜像：

```text
docker.elastic.co/elasticsearch/elasticsearch:8.19.17
```

对应 Go 依赖必须使用：

```bash
go get github.com/elastic/go-elasticsearch/v8@latest
```

```go
import "github.com/elastic/go-elasticsearch/v8"
```

客户端大版本不能高于服务端大版本，例如 ES 8 配 `go-elasticsearch/v9` 会产生 `media_type_header_exception`。

开发环境中若配置：

```yaml
xpack.security.enabled=false
xpack.security.http.ssl.enabled=false
```

则客户端使用 HTTP 且无需账号密码：

```go
client, err := elasticsearch.New(
	elasticsearch.WithAddresses("http://localhost:9200"),
)
```

生产环境则应开启认证与 TLS，使用 HTTPS、CA 证书、最小权限用户或 API Key。

## 3. `context.Context` 的作用 //这个控制请求的操作在redis学习中也有应用

`context.Background()` 是一个没有超时、不会自动取消的根上下文。

```go
ctx := context.Background()
```

实际业务更常用超时上下文：
//传参的时候在context.Background()地方替换为实际定义过的ctx可以实现控制请求;
```go
ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
//上面代码实现的逻辑: 运行3秒后自动取消请求
defer cancel()
```

将 `ctx` 传给 ES 后，超时、用户取消请求或服务关闭时，ES 调用能尽快停止：

```go
global.ESClient.Search(
	global.ESClient.Search.WithContext(ctx),
)
```

## 4. Mapping：字段如何索引

## 简单补充一下索引的简单使用方法 : 
global.ESClient.Indices.Create // 创建索引
global.ESClient.Indices.Delete // 删除索引
global.ESClient.Indices.Exists // 判断索引是否存在
global.ESClient.Indices.Get    // 查询索引配置

创建索引时应先定义 Mapping：这里可以理解为归类,多个文档的同一个字段都属于一个mapping中实现的定义字段; 

```json
{
  "mappings": {
    "properties": {
      "user_name": { "type": "keyword" },
      "quick_name": { "type": "text" },
      "age": { "type": "integer" },
      "created_at": {
        "type": "date",
        "format": "strict_date_optional_time||yyyy-MM-dd HH:mm:ss"
      }
    }
  }
}
```

常用字段类型：

| 类型 | 用途 | 常见查询 |
|---|---|---|
| `keyword` | ID、状态、分类、用户名精确筛选 | `term` |
| `text` | 标题、昵称、文章全文检索 | `match` |
| `integer` / `long` | 年龄、数量、业务数值 | `range` / `term` |
| `date` | 创建时间、排序、范围过滤 | `range` / `sort` |
| `nested` | 数组对象内部字段需要关联匹配 | `nested` query |

官方 Go v8 的低层客户端可以直接发送 Mapping JSON：

```go
response, err := global.ESClient.Indices.Create(
	"user_index",
	global.ESClient.Indices.Create.WithBody(strings.NewReader(mappingJSON)),
	global.ESClient.Indices.Create.WithContext(ctx),
)
```

## 5. 写入、读取、删除与更新文档
 框架中的设计库 : ESClient ; 用于操作ES的客户端; 
Index : 创建或者实现覆盖; 
Search : 搜索
Get : 获取
Delete : 删除
### 创建或覆盖一条文档

```go
data, _ := json.Marshal(user)

response, err := global.ESClient.Index(
	"user_index",
	bytes.NewReader(data),
	global.ESClient.Index.WithDocumentID("10"),
	global.ESClient.Index.WithContext(ctx),
)
```

对应：

```http
PUT /user_index/_doc/10
```

`WithDocumentID("10")` 指定 ES 的 `_id`。若 `_id` 不存在则创建；已存在则覆盖该文档。

### 按 `_id` 查询一条文档

```go
response, err := global.ESClient.Get(
	"user_index",
	"10",
	global.ESClient.Get.WithContext(ctx),
)
```

ES 返回的业务数据在 `_source` 内：

```go
var result struct {
	Source models.UserModel `json:"_source"`
}
err = json.NewDecoder(response.Body).Decode(&result)
user := result.Source
```

### 删除一条文档

```go
response, err := global.ESClient.Delete(
	"user_index",
	"10",
	global.ESClient.Delete.WithContext(ctx),
)
```

对应：

```http
DELETE /user_index/_doc/10
```

### 部分更新文档

`json.Marshal` 只负责把 Go 数据转换成 JSON；真正决定“更新”的是 `ESClient.Update` 与 Update API 的 `doc` 格式。

```go
updates := map[string]any{
	"age":        19,
	"quick_name": "new_name",
}
body, _ := json.Marshal(map[string]any{
	"doc": updates,
})

response, err := global.ESClient.Update(
	"user_index",
	"10",
	bytes.NewReader(body),
	global.ESClient.Update.WithContext(ctx),
)
```

对应：

```http
POST /user_index/_update/10
{
  "doc": {
    "age": 19,
    "quick_name": "new_name"
  }
}
```

未放进 `doc` 的字段保持不变。底层 Lucene 不支持原地修改，ES 会将合并后的文档重新索引。

## 6. 列表查询与分页

分页参数关系：

```go
page := 2
limit := 10
from := (page - 1) * limit // 10
```

查询 DSL：

```json
{
  "from": 10,
  "size": 10,
  "query": {
    "match_all": {}
  },
  "sort": [
    { "created_at": { "order": "desc" } }
  ]
}
```

Go 中通过 `Search` 发出查询：

```go
response, err := global.ESClient.Search(
	global.ESClient.Search.WithIndex("user_index"),
	global.ESClient.Search.WithBody(bytes.NewReader(requestBody)),
	global.ESClient.Search.WithContext(ctx),
)
```

ES 列表结果位于：

```text
hits.total.value → 命中文档总数
hits.hits        → 当前页命中的文档
hits.hits[i]._source → 第 i 条业务数据
```

## 7. 精确查询与模糊查询

### 精确查询：`keyword + term`

```json
{
  "query": {
    "term": {
      "user_name": "sunyuhan"
    }
  }
}
```

适合 ID、状态、分类、枚举值、用户名等。值通常需要完全一致。

### 全文查询：`text + match`

```json
{
  "query": {
    "match": {
      "quick_name": "天花板"
    }
  }
}
```

`match` 会使用字段分词器，适合标题、昵称、正文。

### 拼写容错与包含查询

英文拼写容错可使用：

```json
{
  "match": {
    "name": {
      "query": "sunyuhaan",
      "fuzziness": "AUTO"
    }
  }
}
```

包含匹配可使用 `wildcard`，如 `*sun*`，但前导 `*` 在大量数据上性能较差；高频包含检索通常需要 ngram 设计。

## 8. Nested：保持数组对象内部字段关联

Go 模型：

```go
type Address struct {
	City     string `json:"city"`
	District string `json:"district"`
	Detail   string `json:"detail"`
}

type UserModel struct {
	UserName  string    `json:"user_name"`
	Addresses []Address `json:"addresses"`
}
```

Mapping：

```json
"addresses": {
  "type": "nested",
  "properties": {
    "city": { "type": "keyword" },
    "district": { "type": "keyword" },
    "detail": { "type": "text" }
  }
}
```

示例文档：

```json
"addresses": [
  { "city": "Shanghai", "district": "Pudong" },
  { "city": "Beijing", "district": "Haidian" }
]
```

查询“同一条地址中城市为 Shanghai 且区域为 Pudong”：

```json
{
  "query": {
    "nested": {
      "path": "addresses",
      "score_mode": "none",
      "query": {
        "bool": {
          "filter": [
            { "term": { "addresses.city": "Shanghai" } },
            { "term": { "addresses.district": "Pudong" } }
          ]
        }
      }
    }
  }
}
```

`nested` 解决的是“两个条件是否属于同一个数组对象”的问题；`term` 与 `match` 解决的是“字段值如何匹配”的问题。因此可组合：

```text
nested + term  → 同一对象内精确筛选
nested + match → 同一对象内全文检索
```

生产常见场景：商品 SKU（颜色、尺码、库存必须同一规格）、订单明细、地址、权限列表。Nested 有额外索引和查询成本，只在需要保持数组对象字段关联时使用。

## 9. Bulk 批量删除

Bulk API 要求 NDJSON：每个操作一行，并以换行结束。

```go
var requestBody bytes.Buffer
for _, id := range ids {
	action, _ := json.Marshal(map[string]map[string]string{
		"delete": {
			"_index": "user_index",
			"_id":    id,
		},
	})
	requestBody.Write(action)
	requestBody.WriteByte('\n')
}

response, err := global.ESClient.Bulk(
	bytes.NewReader(requestBody.Bytes()),
	global.ESClient.Bulk.WithContext(ctx),
)
```

批量接口 HTTP 返回 200 也不代表每条都成功，仍要解析响应中的：

```text
errors      → 是否存在任意失败项
items       → 每一条操作的结果
items[i].delete.status → 某一条删除的状态码
```

## 10. 今天最重要的结论

```text
1. ES 服务端大版本与 Go 客户端大版本要匹配。
2. 一个索引包含很多同类文档。
3. Mapping 先于数据设计：keyword、text、date、nested 的用途不同。
4. Index 是写文档；Indices.Create 才是创建索引。
5. Get 按 _id 查单条；Search 查列表和条件查询。
6. term 适合 keyword 精确过滤；match 适合 text 全文检索。
7. nested 保证数组对象内部字段不会跨对象误匹配。
8. context 控制请求超时与取消。
9. 所有 HTTP response.Body 都应关闭；所有 ES 响应都应检查 IsError。
10. 开发环境可删索引重建；生产环境使用新索引、Reindex 与 Alias 切换，避免直接删数据。
```

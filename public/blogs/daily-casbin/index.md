# 2026-07-15 Go 与 Casbin 学习总结

今天的学习从 Go `context` 开始，延伸到 Casbin 权限控制、GORM/MySQL 持久化和日志记录。

## 一、Go Context

`context.Context` 用于在调用链和 goroutine 之间传递：

- 取消信号；
- 超时或截止时间；
- 请求范围内的少量数据。

它的核心接口为：

```go
type Context interface {
	Deadline() (deadline time.Time, ok bool)
	Done() <-chan struct{}
	Err() error
	Value(key any) any
}
```

### 1. `Value` 与类型断言

`ctx.Value(key)` 的返回类型是 `any`，所以取出后需要类型断言：

```go
user, ok := ctx.Value(whoKey).(lover)
if !ok {
	return
}
fmt.Println(user.name)
```

带 `ok` 的断言不会 panic；单返回值断言在值不存在或类型不匹配时会 panic。

Context 的 key 不建议直接使用字符串，应使用自定义类型避免冲突：

```go
type contextKey string

const whoKey contextKey = "who"
```

### 2. Channel 的 `<-`

`<-` 是 Channel 操作符。

```go
value := <-ch // 接收并保存
<-ch          // 接收但丢弃值，只等待事件
ch <- value   // 发送
```

在下面的代码中：

```go
select {
case <-time.After(4 * time.Second):
	// 4 秒到达
case <-ctx.Done():
	// Context 取消或超时
}
```

`time.After` 返回定时 Channel；`ctx.Done()` 返回取消通知 Channel。哪个事件先发生，就执行哪个分支。

### 3. `sync.WaitGroup`

`WaitGroup` 的作用是等待多个 goroutine 完成：

```go
var wg sync.WaitGroup

wg.Add(1)
go func() {
	defer wg.Done()
	// 任务代码
}()

wg.Wait()
```

- `Add(1)`：登记一个待完成任务，计数加一；
- `Done()`：任务结束，计数减一；
- `Wait()`：等待计数变为零。

固定顺序：**先 `Add`，再启动 goroutine；在 goroutine 开始处 `defer Done()`；最后 `Wait()`。**

`ctx.Done()` 与 `wg.Done()` 完全不同：

- `ctx.Done()`：返回一个 Channel，用来接收取消通知；
- `wg.Done()`：将 WaitGroup 的任务计数减一。

### 4. `WithCancel`

```go
ctx, cancel := context.WithCancel(context.Background())
```

返回：

- `ctx`：可取消的子 Context；
- `cancel`：类型为 `context.CancelFunc` 的取消函数。

调用：

```go
cancel()
```

会关闭 `ctx.Done()` 返回的 Channel，并令：

```go
ctx.Err() == context.Canceled
```

`cancel()` 不会强制杀死 goroutine。它只是广播“请停止”的信号；goroutine 必须主动监听并 `return`：

```go
func worker(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case <-time.After(time.Second):
			// 执行一小段工作
		}
	}
}
```

父 Context 被取消时，所有子 Context 都会收到通知；子 Context 被取消不会反向影响父 Context。

### 5. `WithTimeout` 与 `WithDeadline`

```go
ctx, cancel := context.WithTimeout(parent, 2*time.Second)
defer cancel()
```

- `WithCancel`：由业务事件手动决定何时取消；
- `WithTimeout`：从现在开始最多执行一段时间；
- `WithDeadline`：在某个绝对时间点之前必须结束。

`WithTimeout` 本质上近似于：

```go
context.WithDeadline(parent, time.Now().Add(timeout))
```

超时后：

```go
ctx.Err() == context.DeadlineExceeded
```

无论哪种方式，都应将原来的 `ctx` 持续向下传递；不要在下层重新创建 `context.Background()`，否则会切断上游的取消、超时和 Value 信息。

## 二、Casbin 基础

Casbin 是**授权（Authorization）**库，不负责认证（Authentication）。

```text
认证：你是谁？
授权：你可以做什么？
```

新项目使用 Casbin v3：

```bash
go get github.com/casbin/casbin/v3@latest
```

导入路径：

```go
import "github.com/casbin/casbin/v3"
```

### 1. `model.conf` 与 `policy.csv`

```text
model.conf  ：权限判断结构和规则
policy.csv  ：具体的权限数据
```

典型 RBAC 模型：

```ini
[request_definition]
r = sub, obj, act

[policy_definition]
p = sub, obj, act

[role_definition]
g = _, _

[policy_effect]
e = some(where (p.eft == allow))

[matchers]
m = g(r.sub, p.sub) && r.obj == p.obj && r.act == p.act
```

其中：

- `sub`：谁请求访问；
- `obj`：访问什么资源；
- `act`：执行什么操作；
- `p`：权限规则；
- `g`：用户和角色的归属关系。

策略例子：

```csv
p, admin, /api/users, GET
g, zhangsan, admin
```

含义：张三属于管理员；管理员可以 `GET /api/users`。

### 2. Enforcer

`Enforcer` 是 Casbin 的核心对象：

```go
ok, err := e.Enforce("zhangsan", "/api/users", "GET")
```

若权限允许，`ok` 为 `true`。

### 3. 策略与角色管理

```go
e.AddPolicy("admin", "/api/users", "GET")
e.AddRoleForUser("zhangsan", "admin")
```

对应添加：

```csv
p, admin, /api/users, GET
g, zhangsan, admin
```

撤销关系：

```go
e.DeleteRoleForUser("zhangsan", "admin")
e.RemovePolicy("admin", "/api/users", "GET")
```

`RemoveGroupingPolicy("zhangsan", "admin")` 与 `DeleteRoleForUser("zhangsan", "admin")` 的效果相同，后者在 RBAC 场景中语义更清晰。

### 4. CachedEnforcer

```go
e, err := casbin.NewCachedEnforcer(m, a)
```

CachedEnforcer 会缓存相同 `Enforce` 请求的结果，减少重复计算。

Casbin v3 中缓存过期时间的参数类型是 `time.Duration`：

```go
e.SetExpireTime(time.Hour)
```

不能写：

```go
e.SetExpireTime(60 * 60) // 这是 3600 纳秒，不是 1 小时
```

当策略被外部服务直接改动数据库时，需要重新加载：

```go
err := e.LoadPolicy()
```

## 三、Casbin + GORM + MySQL

安装 GORM Adapter：

```bash
go get github.com/casbin/gorm-adapter/v3@latest
```

Casbin v3 应搭配 GORM Adapter v3：

```go
import (
	"github.com/casbin/casbin/v3"
	gormadapter "github.com/casbin/gorm-adapter/v3"
)
```

### 1. GORM 初始化

DSN：

```go
dsn := "root:root@tcp(127.0.0.1:3306)/rule_db?charset=utf8mb4&parseTime=True&loc=Local"
```

它描述用户名、密码、地址、端口、数据库名和连接参数。

`gorm.Open()` 创建 GORM 操作对象；`db.DB()` 获取底层 `*sql.DB` 连接池；`Ping()` 用来实际验证 MySQL 是否可访问。

连接池常用设置：

```go
sqlDB.SetMaxIdleConns(10)
sqlDB.SetMaxOpenConns(100)
sqlDB.SetConnMaxLifetime(4 * time.Hour)
```

`*gorm.DB` 不是一条固定连接，而是操作数据库和管理连接池的入口。

### 2. CasbinRule 表

```go
err := global.DB.AutoMigrate(&gormadapter.CasbinRule{})
```

会创建或更新默认的 `casbin_rule` 表。它通常包含：

```text
id、ptype、v0、v1、v2、v3、v4、v5
```

例如：

```csv
p, admin, /api/users, GET
g, zhangsan, admin
```

在表中分别以 `ptype = p` 和 `ptype = g` 保存。

创建 Adapter：

```go
a, err := gormadapter.NewAdapterByDB(global.DB)
```

之后 Casbin 的策略会从 MySQL 的 `casbin_rule` 表读写，而不是从 `policy.csv` 读写。

GORM Adapter 支持 AutoSave 时，`AddPolicy`、`AddRoleForUser`、删除策略等操作会增量写入数据库；此时 `SavePolicy()` 通常不必每次都调用。

`SavePolicy()` 是把当前内存中的**全部策略**整体写回存储。它不是恢复已删除策略的操作。

## 四、Logrus 与 Zap

Logrus 是结构化日志库：

```bash
go get github.com/sirupsen/logrus@latest
```

常用级别：

```go
logrus.Debug("调试信息")
logrus.Info("普通信息")
logrus.Warn("警告")
logrus.Error("错误")
```

记录错误时：

```go
logrus.WithError(err).Error("MySQL 连接失败")
```

记录业务字段：

```go
logrus.WithFields(logrus.Fields{
	"user_id":  1001,
	"username": "zhangsan",
}).Info("用户登录成功")
```

`WithError`、`WithField`、`WithFields` 只是在构造附加上下文的日志项；后续调用 `Info`、`Error` 等方法时才会真正输出。

GORM SQL 日志可在学习阶段开启：

```go
Logger: logger.Default.LogMode(logger.Info),
```

Logrus 适合学习和简单项目；高并发生产服务也常选择 Zap 或 Go 标准库 `log/slog`。Zap 使用强类型字段，性能更高：

```go
zapLogger.Error("MySQL 连接失败", zap.Error(err))
```

## 今日核心结论

1. Context 通过 `Done()` Channel 广播取消信号，goroutine 需要主动监听并 `return`。
2. `WaitGroup` 用于等待 goroutine 真正完成，和 Context 的取消通知是两件事。
3. `WithTimeout` 适合“最多执行多久”，`WithDeadline` 适合“在某个时刻前结束”。
4. Casbin 的 Model 定义规则，Policy 保存具体权限，Enforcer 执行权限判断。
5. RBAC 中 `p` 表示角色权限，`g` 表示用户与角色关系。
6. GORM Adapter 将 Casbin 策略存入 MySQL 的 `casbin_rule` 表。
7. CachedEnforcer 缓存权限结果；Casbin v3 的缓存时间必须使用 `time.Duration`。
8. 日志应保留错误原因和必要上下文，但不要在日志中暴露数据库密码等敏感信息。

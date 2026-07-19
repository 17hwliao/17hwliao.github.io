# Go、PostgreSQL 与 Zap 学习总结

> 学习主题：PostgreSQL、Docker、Go 项目日志（Zap）

## 1. PostgreSQL 基础

### 1.1 PostgreSQL 与 MySQL 的关系

- PostgreSQL 和 MySQL 都是关系型数据库，建库、建表、增删改查等基础 SQL 写法非常接近。
- PostgreSQL 更强调标准 SQL、事务能力、复杂查询、扩展能力和类型系统。
- 已掌握 MySQL 的基础操作后，学习 PostgreSQL 很值得；重点是理解两者的差异，而不是重新学习全部 SQL。

### 1.2 数据库、Schema、表的层级

PostgreSQL 的对象层级可以理解为：

```text
PostgreSQL 服务实例
└─ 数据库（Database，例如 db）
   └─ Schema（例如 public）
      └─ 表（Table，例如 test）
```

- **数据库**：相对独立的数据空间，例如 `db`、`postgres`。
- **Schema**：数据库内部的命名空间，用来给表再分组。默认 Schema 是 `public`。
- **表**：真正存储行数据的对象。

Schema 不只是“多一层目录”，它最直接的价值是避免命名冲突和划分模块，例如：

```sql
CREATE SCHEMA blog;
CREATE TABLE blog.article (...);
```

### 1.3 常用 psql 命令

```sql
\l                 -- 查看全部数据库
\c db              -- 连接到 db 数据库
\dn                -- 查看 Schema
\d                 -- 查看当前 Schema 下的表、视图等关系
\d test            -- 查看 test 表定义
\dt                -- 只查看表
\q                 -- 退出 psql
```

当 `\l` 的输出进入分页器并出现 `(END)` 时：

```text
按 q 退出分页器，回到 psql 命令行。
```

### 1.4 创建和删除表

```sql
CREATE DATABASE db;
```

连接到 `db` 后：

```sql
CREATE TABLE test (
    id SERIAL PRIMARY KEY,
    name VARCHAR(16) NOT NULL
);
```

删除刚创建的表：

```sql
DROP TABLE test;
```

如果不确定表是否存在：

```sql
DROP TABLE IF EXISTS test;
```

注意：`DROP TABLE` 会删除表结构和表数据。

### 1.5 为什么 `\d test` 找不到表

如果在 `db` 中执行：

```sql
\d test
```

却找不到表，常见原因是：表创建在另一个数据库中。

例如日志中先连接的是 `postgres.public`，随后执行：

```sql
CREATE TABLE test (...);
```

那么表实际位于：

```text
postgres 数据库 -> public Schema -> test 表
```

而不是：

```text
db 数据库 -> public Schema -> test 表
```

PostgreSQL 不能跨数据库直接查看表；先使用 `\c postgres` 切换回正确数据库。

### 1.6 INSERT 字符串写法

PostgreSQL 的字符串使用单引号：

```sql
INSERT INTO test (name) VALUES ('user');
```

反引号 `` ` `` 是 MySQL 中常用于标识符的写法，不能用于 PostgreSQL 字符串。

### 1.7 执行 SQL 文件

可以直接使用 psql 执行 SQL 文件：

```powershell
psql -U postgres -d db -f .\init.sql
```

- `-U postgres`：连接用户名。
- `-d db`：目标数据库。
- `-f init.sql`：执行文件中的 SQL。

如果 SQL 文件中含有 `CREATE DATABASE`，通常应先连接已有库（如 `postgres`）执行；创建目标库后，再连接目标库执行建表 SQL。

## 2. Docker 运行 PostgreSQL

### 2.1 Docker Compose 示例

```yaml
services:
  postgresql:
    image: postgres:18
    container_name: postgresql
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-postgres}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-你的密码}
      POSTGRES_DB: ${POSTGRES_DB:-postgres}
      TZ: Asia/Shanghai
    ports:
      - "5432:5432"
    volumes:
      - "C:/Docker/postgresql:/var/lib/postgresql"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $$POSTGRES_USER -d $$POSTGRES_DB"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s
```

Docker Compose 的配置方式与 Kubernetes 都是“声明式配置”：描述期望的镜像、端口、卷和环境变量，然后由平台创建运行环境。二者理念相近，但 Compose 用于单机/开发环境，Kubernetes 用于集群编排。

### 2.2 挂载卷

```yaml
volumes:
  - "C:/Docker/postgresql:/var/lib/postgresql"
```

含义：

- 左边：Windows 主机目录。
- 右边：容器内 PostgreSQL 数据目录。
- 容器删除后，左边目录的数据仍然保留。

### 2.3 进入容器：镜像名不是容器名

下面写法报错的原因是把镜像名当成容器名：

```powershell
docker exec -it postgres:18 /bin/bash
```

`postgres:18` 是**镜像名:标签**，而 `docker exec` 必须传入正在运行的**容器名或容器 ID**。

正确示例：

```powershell
docker exec -it postgresql /bin/bash
```

先查看容器：

```powershell
docker ps
```

### 2.4 容器内 psql 的 root 报错

进入容器后，Linux 当前用户可能是 `root`。直接执行：

```powershell
psql
```

会尝试以同名数据库角色 `root` 登录，因此可能报：

```text
FATAL: role "root" does not exist
```

应显式指定 PostgreSQL 用户和数据库：

```powershell
psql -U postgres -d postgres
```

## 3. Go 连接 PostgreSQL

### 3.1 pgxpool 是什么

`pgxpool` 是 Go 的 `pgx` 驱动提供的 PostgreSQL 连接池。

它负责：

- 复用数据库连接，避免每次请求都重新建立 TCP/认证连接。
- 控制最大连接数。
- 管理空闲连接和连接生命周期。
- 在高并发 Web 服务中提供稳定的数据库访问能力。

可以把它理解为：

```text
业务请求 -> pgxpool（借连接） -> PostgreSQL
                   -> 用完归还连接
```

## 4. Zap 日志框架基础

### 4.1 为什么使用 Zap

Zap 是 Go 中常用的高性能结构化日志库。

- `zap.Logger`：类型安全、性能更好，推荐用于核心业务和生产环境。
- `zap.SugaredLogger`：支持 `Infof`、`Infow` 等格式化调用，写法方便，但会有额外开销。

```go
logger.Info("用户登录成功", zap.String("username", "fengfeng"))

logger.Sugar().Infof("用户 %s 登录成功", "fengfeng")
```

`Sugar()` 不只是简单替代 `fmt.Sprintf`；它提供格式化方法和键值对方法，但内部仍要做额外的参数解析与格式化。

### 4.2 常见日志等级

日志等级从低到高：

```text
Debug < Info < Warn < Error < DPanic < Panic < Fatal
```

| 等级 | 常见用途 |
|---|---|
| Debug | 调试细节，例如 SQL、变量状态 |
| Info | 正常关键流程，例如服务启动、用户登录 |
| Warn | 可继续运行但值得注意的异常 |
| Error | 当前操作失败，需要记录错误并向上返回 |
| DPanic | 开发模式下可能触发 panic，生产模式通常只记录 |
| Panic | 写日志后 `panic`，会执行 defer，除非被 recover，否则程序崩溃 |
| Fatal | 写日志后执行 `os.Exit(1)`，**不会执行 defer** |

实际项目中，不要在底层函数随意使用 `Fatal`；底层应返回 `error`，由程序入口决定是否退出。

### 4.3 开发与生产配置

```go
zap.NewDevelopment()
zap.NewProduction()
```

它们是 Zap 给出的两套预设配置：

- 开发环境：偏向人类阅读、通常包含调用位置、默认等级较低。
- 生产环境：偏向机器收集、通常使用 JSON、默认更关注性能和稳定性。

这不是只能配置 Development/Production，而是它们刚好提供了完整默认配置。也可以手工构建 `Encoder`、`Core` 和 `Logger`。

## 5. Logger、Core、Encoder 与输出目标

### 5.1 核心流程

```text
logger.Info(...)
      ↓
Logger：收集消息、等级、调用位置、字段
      ↓
Core：判断是否输出，并协调编码和写入
      ├─ Encoder：把日志数据变成文本或 JSON
      └─ WriteSyncer：写到控制台、文件等目标
```

### 5.2 `zapcore.NewCore`

```go
zapcore.NewCore(encoder, writer, levelEnabler)
```

三个参数分别是：

1. `encoder`：日志如何编码，例如控制台文本、JSON。
2. `writer`：日志写到哪里，例如 `os.Stdout` 或文件。
3. `levelEnabler`：什么等级允许通过。

### 5.3 `zapcore.NewTee`

`NewTee` 将多个 Core 合并：一条日志会分别交给每个满足等级条件的 Core。

```text
一条 Error 日志
├─ consoleCore -> 控制台
└─ errorCore   -> err.log
```

## 6. 时间格式化

### 6.1 设置方式

```go
cfg.EncoderConfig.EncodeTime =
    zapcore.TimeEncoderOfLayout("2006-01-02 15:04:05")
```

这是 Go 标准库 `time.Format` 的布局规则，不是任意数字，也不是 Java 的日期格式。

Go 用一个固定参考时间表示各部分：

```text
Mon Jan 2 15:04:05 MST 2006
```

常用模板：

```go
"2006-01-02"                 // 年-月-日
"15:04:05"                   // 时:分:秒
"2006-01-02 15:04:05"        // 常用完整格式
"2006-01-02 15:04:05.000"    // 加毫秒
"2006-01-02 15:04:05.000000" // 加微秒
"Mon, 02 Jan 2006 15:04:05 MST" // 星期、月份英文、时区
```

## 7. 日志等级显示与颜色

### 7.1 `EncodeLevel`

```go
fileCfg.EncodeLevel = zapcore.CapitalLevelEncoder
```

含义：设置“日志等级如何显示”。

`zapcore.CapitalLevelEncoder` 输出：

```text
DEBUG / INFO / WARN / ERROR
```

常用内置编码器：

```go
zapcore.LowercaseLevelEncoder      // debug、info、warn、error
zapcore.CapitalLevelEncoder        // DEBUG、INFO、WARN、ERROR
zapcore.CapitalColorLevelEncoder   // 大写并带终端颜色
```

### 7.2 ANSI 颜色原理

```go
const red = "\033[31m"
const reset = "\033[0m"
```

- `\033[`：ANSI 转义序列的开头。
- `31m`：前景色设为红色。
- `0m`：恢复默认颜色。

示例：

```go
fmt.Println(red + "ERROR" + reset)
```

自定义 Zap 等级编码器：

```go
func myEncoderLevel(level zapcore.Level, enc zapcore.PrimitiveArrayEncoder) {
    switch level {
    case zapcore.InfoLevel:
        enc.AppendString(green + "INFO" + reset)
    case zapcore.ErrorLevel:
        enc.AppendString(red + "ERROR" + reset)
    }
}
```

参数含义：

- `level zapcore.Level`：当前日志的等级，如 `InfoLevel`、`ErrorLevel`。
- `enc zapcore.PrimitiveArrayEncoder`：Zap 提供的编码写入器；调用 `AppendString` 将等级文字写入日志结果。

### 7.3 颜色的使用原则

- 控制台：可以使用颜色，便于开发时快速识别等级。
- 文件：不要写颜色，ANSI 控制字符会污染文件内容。
- JSON 日志：不要写颜色，应保留纯净、可被日志系统解析的字段。

## 8. 结构化日志

### 8.1 基本写法

```go
zap.L().Info("用户登录成功",
    zap.String("username", "fengfeng"),
)
```

其中：

- `"用户登录成功"`：固定事件消息，说明发生了什么。
- `zap.String("username", "fengfeng")`：结构化字段，表示 `username=fengfeng`。

日志大致表现为：

```text
INFO  用户登录成功  {"username": "fengfeng"}
```

与字符串拼接相比，结构化字段便于按字段检索、聚合和分析。

### 8.2 常用字段构造函数

```go
zap.String("username", "fengfeng")
zap.Int("age", 18)
zap.Int64("user_id", 1001)
zap.Bool("is_admin", true)
zap.Float64("price", 99.9)
zap.Duration("cost", cost)
zap.Time("login_time", time.Now())
zap.Error(err)
zap.Any("user", user)
```

推荐：消息保持稳定，变化数据放字段中。

```go
zap.L().Info("用户登录成功",
    zap.Int64("user_id", 1001),
    zap.String("username", "fengfeng"),
    zap.String("ip", "127.0.0.1"),
)
```

## 9. 调用位置、前缀与堆栈

### 9.1 调用位置

```go
zap.AddCaller()
```

让日志带上触发日志的文件和行号，便于定位代码。

### 9.2 错误调用栈

```go
zap.AddStacktrace(zapcore.ErrorLevel)
```

表示 Error 及以上日志追加调用栈。调用栈适合排查异常，但会增加日志体积。

### 9.3 项目/模块前缀

```go
logger := zap.New(core).Named("myProject")
```

`Named` 为日志器增加名称。还可以继续分模块：

```go
userLog := logger.Named("service.user")
```

名称会形成层级，帮助定位来源。

## 10. 按等级分片和双写

### 10.1 目标规则

```text
控制台：达到最低等级的全部日志（带颜色）
log.log：Debug、Info、Warn
err.log：Error、DPanic、Panic、Fatal
```

### 10.2 等级过滤器

```go
normalLevel := zap.LevelEnablerFunc(func(level zapcore.Level) bool {
    return level >= zapcore.DebugLevel &&
        level < zapcore.ErrorLevel
})

errorLevel := zap.LevelEnablerFunc(func(level zapcore.Level) bool {
    return level >= zapcore.ErrorLevel
})
```

`LevelEnablerFunc` 将普通函数变成 Zap 可识别的“等级判断器”。返回 `true` 的日志会进入该 Core。

### 10.3 最低日志等级与动态修改

```go
minLevel := zap.NewAtomicLevelAt(zapcore.InfoLevel)
```

- 初始设为 `InfoLevel`：Debug 日志不输出。
- 可在运行中修改：

```go
minLevel.SetLevel(zapcore.WarnLevel)
```

此时 Debug 和 Info 不输出，Warn 仍进入 `log.log`，Error 仍进入 `err.log`。

## 11. 推荐的项目日志模板

### 11.1 目录结构

```text
my-project/
├─ main.go
├─ logger/
│  └─ logger.go
├─ service/
│  └─ user.go
└─ handler/
   └─ user.go
```

### 11.2 `logger` 包与 `main` 包的区别

- `package main`：可执行程序入口，只能放在启动程序的目录。
- `package logger`：普通工具包，负责创建与配置日志器。

因此，不应把完整的 `package main` 代码直接放到 `logger` 文件夹。

正确改法：

```go
// logger/logger.go
package logger

func Init(projectName string) (cleanup func(), err error) {
    // 创建 Core、Logger、文件输出等
    // 注册为全局 Logger
}
```

### 11.3 初始化全局 Logger

在 `logger.Init` 中：

```go
log := zap.New(core).Named(projectName)
restore := zap.ReplaceGlobals(log)
```

`zap.ReplaceGlobals(log)` 的作用：将 Zap 全局 Logger 换成项目自定义的 Logger。此后 `zap.L()` 和 `zap.S()` 都使用你的配置。

### 11.4 在 `main` 中初始化一次

```go
func main() {
    cleanup, err := logger.Init("myProject")
    if err != nil {
        log.Fatal(err)
    }
    defer cleanup()

    // 启动数据库、HTTP 服务、路由、goroutine 等
}
```

必须在启动业务模块和 goroutine 之前完成初始化。

### 11.5 在任意业务代码中直接记录

```go
zap.L().Info("用户登录成功",
    zap.String("username", "fengfeng"),
)
```

错误日志：

```go
zap.L().Error("查询数据库失败",
    zap.Error(err),
    zap.Int64("user_id", 1001),
)
```

Sugar 风格：

```go
zap.S().Infof("用户 %s 登录成功", username)
zap.S().Errorw("数据库查询失败",
    "error", err,
    "user_id", userID,
)
```

### 11.6 全局日志器的注意事项

全局方式适合初学项目和中小型项目，使用方便：

```go
zap.L().Info("...")
```

更复杂的大型项目或测试较多的项目，常将 `*zap.Logger` 通过构造函数传入各层，便于替换与测试。

无论哪种方式，都应做到：

- 全项目只初始化一次底层 Logger。
- 不要在每个业务文件中重复 `zap.New(...)`。
- 程序退出前执行 `Sync` 并关闭日志文件。
- 同一个错误不要在每层都重复打印 `Error`；通常由最终处理错误的一层记录一次。

## 12. 当前模板的使用清单

新项目中使用当前日志模板时：

1. 将完整配置放到 `logger/logger.go`。
2. 修改包名为 `package logger`。
3. 将 `main()` 改为 `Init(projectName string)`。
4. 在 `main.go` 最早调用 `logger.Init("项目名")`。
5. 使用 `defer cleanup()` 保证同步日志、关闭文件。
6. 任意业务文件使用 `zap.L().Info/Error/...`。
7. 控制台日志可以上色；文件日志保持无颜色。
8. 正常日志写入 `log.log`，错误日志写入 `err.log`。

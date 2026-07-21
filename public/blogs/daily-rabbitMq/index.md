# RabbitMQ 学习总结

> 学习主题：使用 Go 与 RabbitMQ 构建消息队列，并理解可靠性、安全性和高可用配置。

## 一、为什么使用消息队列

RabbitMQ 的核心价值是让服务之间通过消息通信，从而实现：

- **解耦**：生产者只负责发送消息，不需要直接依赖消费者。
- **异步**：耗时操作可放到消费者异步处理，缩短主流程响应时间。
- **削峰**：高并发请求先写入队列，消费者按自身能力持续处理，保护下游服务。

基本链路为：`Producer -> Exchange -> Queue -> Consumer`。在使用默认交换机时，消息可通过“队列同名的 routing key”直接进入指定队列。

## 二、Docker 部署与连接

使用 `rabbitmq:3-management` 镜像可以同时获得 AMQP 服务和管理控制台：

- `5672`：AMQP 客户端连接端口。
- `15672`：管理控制台端口。
- `RABBITMQ_DEFAULT_USER` / `RABBITMQ_DEFAULT_PASS`：初始化账号密码。
- `/var/lib/rabbitmq` 挂载为 volume：保留 RabbitMQ 数据。

Go 客户端使用 `github.com/rabbitmq/amqp091-go`。连接地址建议来自环境变量 `AMQP_URL`，本地开发再使用默认值，避免把生产环境凭证写死在代码中。

## 三、简单队列模式

### 生产者的关键步骤

1. 使用 `amqp091.Dial` 建立连接。
2. 通过 `conn.Channel()` 创建 Channel。
3. 用 `QueueDeclare` 声明队列。
4. 用 `PublishWithContext` 发布消息。

若使用默认交换机（exchange 为空字符串），`routing key` 必须是目标队列名。生产环境中应为队列设置 `durable=true`，并在发布消息时设置 `DeliveryMode: amqp.Persistent`；两者配合才构成持久化链路。

### 消费者的关键步骤

1. 连接 RabbitMQ 并创建 Channel。
2. 使用与生产者完全一致的参数声明队列。
3. 使用 `Consume` 注册消费者。
4. 处理成功后调用 `message.Ack(false)` 确认消息。

`autoAck=false` 时，消息只有在显式确认后才会从队列删除。消费者异常退出而未确认的消息会重新投递，因此这是处理可能失败任务时的推荐方式。

## 四、工作队列：分摊任务压力

一个队列绑定多个消费者时，RabbitMQ 默认会以轮询（Round-Robin）方式分发消息，适合把批量或耗时任务分摊到多个工作进程。

仅使用轮询不能保证任务按处理能力分配。可以通过：

```go
ch.Qos(1, 0, false)
```

限制每个消费者最多持有一条“尚未确认”的消息。慢消费者在完成并 `Ack` 前不会继续拿到新任务，形成更公平的分发。

## 五、发布订阅模式

发布订阅模式让一条消息被多个独立消费者接收：

- 生产者把消息发送给 `fanout` 类型交换机。
- `fanout` 忽略 routing key，并把消息广播到所有已绑定的队列。
- 每个消费者拥有自己的队列；同一队列中的多个消费者仍是竞争消费。

临时订阅者可声明匿名队列：队列名为空、`exclusive=true`、`autoDelete=true`。连接关闭后，该队列会自动删除，适合在线通知、日志订阅等场景。

需要注意：交换机只负责路由，不负责保存历史消息。消费者必须先创建队列并完成绑定，之后发布的消息才会进入该队列。

## 六、可靠性与消息处理

### 1. 队列与消息持久化

- 队列持久化：`QueueDeclare(..., durable=true, ...)`。
- 交换机持久化：`ExchangeDeclare(..., durable=true, ...)`。
- 消息持久化：`Publishing{DeliveryMode: amqp.Persistent}`。

持久化提升了 Broker 重启后的数据保留能力，但不等同于端到端绝对不丢消息；实际项目还需要考虑发布确认、消费确认、重试、幂等和死信处理。

### 2. 确认与拒绝

- `Ack(false)`：确认已成功处理，消息从队列删除。
- `Reject(true)`：拒绝消息并重新入队。
- `Reject(false)`：拒绝消息且不重新入队。

重复投递是常见情况，因此消费者业务必须具备幂等性，例如用订单号、消息 ID 做去重。

### 3. 队列容量控制

可通过 `args` 限制队列长度，例如：

```go
args := amqp.Table{
    "x-max-length": 100,
    "x-overflow":   "reject-publish",
}
```

其中 `x-overflow=reject-publish` 会在队列满时拒绝新消息；另一种策略 `drop-head` 会丢弃最旧消息。选择哪种策略取决于业务是否允许丢消息。

## 七、常用 API 参数理解

### `QueueDeclare`

- `name`：队列名；为空时由 RabbitMQ 自动生成。
- `durable`：Broker 重启后是否保留队列。
- `autoDelete`：最后一个消费者断开后是否删除队列。
- `exclusive`：是否只允许当前连接使用；连接关闭时会删除。
- `noWait`：是否等待服务端确认；一般使用 `false`，便于及时发现配置错误。
- `args`：扩展参数，如 TTL、最大长度、优先级等。

相同名称的队列被重复声明时，所有参数必须一致，否则 RabbitMQ 会报错。

### `Publish`

- `mandatory=true`：消息无法路由到任何队列时返回生产者，可通过 `NotifyReturn` 接收。
- `immediate`：已废弃，应保持 `false`。
- `Publishing`：可设置 `ContentType`、`MessageId`、`CorrelationId`、`ReplyTo`、`Expiration`、`Priority` 等消息元数据。

### `Consume`

- `autoAck=false`：手动确认，推荐用于重要业务。
- `exclusive=true`：该消费者独占队列。
- `noLocal`：RabbitMQ 通常不使用该选项。
- `noWait=false`：等待服务端确认，便于发现异常。

## 八、TLS 与访问安全

学习中梳理了 RabbitMQ 与 Go 客户端的双向 TLS 认证流程：

1. 创建根 CA。
2. 使用 CA 签发 RabbitMQ 服务端证书（包含正确的 SAN：IP/DNS）。
3. 使用同一 CA 签发客户端证书。
4. Go 中加载 CA、客户端证书和私钥，构造 `tls.Config`。
5. 通过 `amqps://` 与 `DialTLS` 建立加密连接。

生产环境应保持 `InsecureSkipVerify=false`，并确保 `ServerName` 与服务端证书的 SAN 匹配。外部网络访问必须加密；内部网络也应按安全边界评估。TLS 会引入一定握手和加解密开销，但不能以牺牲安全性为代价。

## 九、高可用认识

单节点 RabbitMQ 是单点故障：容器或主机不可用时，依赖消息队列的业务会受影响。学习中通过三个容器、相同 Erlang Cookie 和固定网络搭建集群，并让节点加入主节点。

过去常见的镜像队列策略可使消息在多个节点保留副本；实际生产部署还应关注 RabbitMQ 当前版本推荐的 **Quorum Queue（仲裁队列）**、节点故障演练、网络分区策略、监控告警和备份恢复方案。

## 十、今日重点与后续练习

今天建立了从“能发消息”到“可用于生产”的完整认知：

- 基础通信：连接、Channel、队列、交换机、路由和消费。
- 消费模型：简单队列、工作队列、发布订阅。
- 可靠性：持久化、手动确认、拒绝重入队、容量限制与幂等。
- 安全性：TLS、证书链、服务端身份校验和双向认证。
- 可用性：集群与多副本消息队列的必要性。

建议下一步动手完成一个“订单创建 -> RabbitMQ -> 库存扣减”的小项目，并补充：发布确认（Publisher Confirms）、死信队列（DLX）、TTL 与延迟消息、失败重试和消费者幂等性。

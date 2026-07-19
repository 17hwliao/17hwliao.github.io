# Kafka 学习总结（2026-07-19）

## Docker 与 KRaft

当前 Docker Compose 使用 `apache/kafka:4.3.1` 运行单节点 KRaft Kafka：同一个容器同时作为 broker 和 controller，因此不需要 ZooKeeper。

```cmd
docker compose up -d
```

若报错找不到 `dockerDesktopLinuxEngine`，表示 Docker Desktop 的 Linux 引擎尚未运行。启动 Docker Desktop 并确认 Engine running 后再执行。

- 宿主机连接 Kafka：`localhost:9092`
- 同一 Docker 网络中的服务连接 Kafka：`kafka:19092`

## Go Modules 与 Sarama

Sarama 是 Go 的 Kafka 客户端库，当前依赖路径：

```bash
go get github.com/IBM/sarama
```

注意是 `github.com`，历史教程中的 `github.com/Shopify/sarama` 是旧组织路径。

`go mod tidy` 会按代码中的 `import` 整理 `go.mod` 和 `go.sum`：补齐真正使用的依赖，删除不再使用的依赖，并更新校验记录。

## 生产者

同步生产者的基本配置：

```go
config := sarama.NewConfig()
config.Producer.RequiredAcks = sarama.WaitForAll
config.Producer.Retry.Max = 3
config.Producer.Return.Successes = true

producer, err := sarama.NewSyncProducer(
	[]string{"localhost:9092"}, config,
)
```

- `WaitForAll`：等待所有已同步副本确认；单 broker 时等同于等待该 broker 写成功。
- `Retry.Max`：发送失败的最大自动重试次数。
- `Return.Successes`：同步生产者要获得发送成功结果时必须开启。

`Encoder` 是编码器，用于把 Go 的字符串、数字等转为 Kafka 实际保存的字节数据：

```go
Value: sarama.StringEncoder("hello")
```

消费者收到字节后可通过 `string(msg.Value)` 还原为字符串。

## Topic、分区与指定分区

Topic 是消息分类；一个 Topic 可有多个分区。每个分区是独立的追加队列，顺序只在同一分区内保证。

分区数量创建后只能增加，不能从 3 减少到 1。学习环境想重新建立一个单分区 Topic，可以删除后重建：

```cmd
docker exec -it kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --delete --topic test_topic
docker exec -it kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --create --topic test_topic --partitions 1 --replication-factor 1
```

若 Topic 本身仍有多个分区，但要让消息始终发往分区 0，必须同时设置手动分区器和 `Partition`：

```go
config.Producer.Partitioner = sarama.NewManualPartitioner

msg := &sarama.ProducerMessage{
	Topic:     "test_topic",
	Partition: 0,
	Value:     sarama.StringEncoder("hello"),
}
```

只写 `Partition: 0` 不够；没有 `NewManualPartitioner` 时，Sarama 仍会按默认策略选择分区。

## Offset

offset 是消息在某个分区内部的递增位置，不是整个 Topic 的全局编号：

```text
分区 0：offset 0, 1, 2
分区 1：offset 0, 1
```

生产者每次发送都会在分区末尾追加，因此 offset 持续增长。消费者读完消息不会修改消息 offset，也不会自动删除消息。

Kafka 返回消息时，会同时返回 Topic、Partition 与 Offset；Sarama 将它们填入 `msg`：

```go
fmt.Printf("%s partition=%d offset=%d value=%s\n",
	msg.Topic, msg.Partition, msg.Offset, string(msg.Value),
)
```

## 消费起始位置与消费进度

```go
consumer.ConsumePartition(topic, 0, sarama.OffsetOldest)
```

第三个参数决定从哪里开始读取：

- `sarama.OffsetOldest`：从当前仍保留的最早消息开始。
- `sarama.OffsetNewest`：只读取消费者启动之后的新消息。
- 具体数字：直接从该 offset 开始。

`ConsumePartition` 是基础消费者，不会自动提交消费进度；以 `OffsetOldest` 重启时，会重新读取历史消息。生产通常用消费者组，由 Kafka 保存该组已提交的消费位置。

生产者和消费者并非一一绑定，它们都面向 Topic；同一消费者组中，一个分区同时只会分给一个消费者。

`NotLeaderForPartition` 常见排查点：生产/消费 Topic 名不一致、Topic 刚被删除重建导致元数据未稳定、分区没有 leader。可检查：

```cmd
docker exec -it kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --describe --topic test_topic
```

## 清理策略

学习环境中，若想重新从 offset 0 练习，可以删除并重建测试 Topic。不要直接删除 Kafka 的整个 `data` 目录来清理单个 Topic。

生产环境一般不为了 offset 归零而手工删除数据，而是对 Topic 设定保留策略：

```text
cleanup.policy=delete
retention.ms=保留时长
retention.bytes=每个分区的容量上限
```

- `delete`：按时间或容量删除旧日志段，适合日志和业务事件流。
- `compact`：按 Key 保留最新一条消息，适合状态同步，例如库存或用户资料。
- `delete,compact`：同时采用两种策略。

清理旧数据后 offset 也不会归零，持续增长是 Kafka 的正常设计。

## Kafka 与 Elasticsearch

日志、告警场景中的 ES 通常指 Elasticsearch，而不是 etcd。

```text
应用日志 / 告警 → Kafka → 消费者（清洗解析）→ Elasticsearch → Kibana
```

- Kafka：保存事件流，提供缓冲、顺序消费和重放。
- Elasticsearch：保存可搜索、可聚合分析的文档副本，适合按时间、关键字、服务和日志级别检索。
- etcd：分布式配置和协调存储，不适合大量日志吞吐。
- Redis：多用于缓存、计数、短期队列，不是日志检索系统。

ES 可以保存 Kafka 消费后的消息，但不替代 Kafka；Kafka 保留原始消息一段时间，ES 故障时可以重放 Kafka 消息并补写。

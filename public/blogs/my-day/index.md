今日份算法题：动态规划实现最短编辑距离
核心要点
增 == 删：两种操作对称，代价相同

改：参考 dp[i-1][j-1]

最后操作数 +1

注意设置完全不处理的状态（边界初始化）

完整代码
java
class Solution {
    public int minDistance(String word1, String word2) {
        int len1 = word1.length();
        int len2 = word2.length();
        
        // 边界情况：任一为空，操作次数就是另一个的长度
        if (len1 == 0 || len2 == 0) return Math.max(len1, len2);
        
        int[][] dp = new int[len1 + 1][len2 + 1];
        
        // 初始化边界
        dp[0][0] = 0;
        for (int i = 0; i <= len2; i++) dp[0][i] = i;  // word1为空，需要插入
        for (int i = 0; i <= len1; i++) dp[i][0] = i;  // word2为空，需要删除
        
        for (int i = 1; i <= len1; i++) {
            for (int j = 1; j <= len2; j++) {
                if (word1.charAt(i - 1) == word2.charAt(j - 1)) {
                    dp[i][j] = dp[i - 1][j - 1];  // 字符相同，无需操作
                } else {
                    // 删除、插入、替换 三者取最小，然后 +1
                    dp[i][j] = Math.min(dp[i - 1][j], dp[i][j - 1]);
                    dp[i][j] = Math.min(dp[i][j], dp[i - 1][j - 1]);
                    dp[i][j] += 1;
                }
            }
        }
        return dp[len1][len2];
    }
}
今日份技术记录
一、MyBatis 相关
场景	处理方式
增删改查，封装类自动匹配	正常使用，MyBatis 自动完成
一对多查询（一查多）	需要手动使用 ResultMap 封装结果
删除操作	注意逻辑外键，不要硬删
动态 SQL	使用 <if test="">、<set> 等标签
二、全局异常处理
java
@RestControllerAdvice  // 标记为全局异常处理器
public class GlobalExceptionHandler {
    
    @ExceptionHandler(DuplicateKeyException.class)  // 捕获唯一键冲突
    public Result handleDuplicateKey(DuplicateKeyException e) {
        log.error("程序出错啦~", e);
        String message = e.getMessage();
        int i = message.indexOf("Duplicate entry");
        String errMsg = message.substring(i);
        String[] arr = errMsg.split(" ");
        return Result.error(arr[2] + " 已存在");
    }
}
流程：异常 → Controller 层 → 全局异常处理器统一处理

三、ECharts 数据对接
后端三层结构（SSM）：

Controller：接收请求，返回数据

Service：业务逻辑

Mapper：数据库操作

数据封装示例：

java
// Mapper 返回 List<Map<String, Object>>
List<Map<String, Object>> list = empMapper.countEmpJobData();

// 分离出两个独立的 List 给前端
List<Object> jobList = list.stream()
    .map(dataMap -> dataMap.get("pos"))
    .toList();
List<Object> dataList = list.stream()
    .map(dataMap -> dataMap.get("total"))
    .toList();
SQL 中使用 CASE 转换数字为文字：

sql
SELECT
    (CASE job 
        WHEN 1 THEN '班主任' 
        WHEN 2 THEN '讲师' 
        WHEN 3 THEN '学工主管' 
        WHEN 4 THEN '教研主管' 
        WHEN 5 THEN '咨询师' 
        ELSE '其他' 
    END) AS pos,
    COUNT(*) AS total
FROM emp
GROUP BY job
SQL 执行顺序：

FROM emp — 读取所有数据

GROUP BY job — 按原始数值分组

SELECT 计算 CASE — 分组内转换文字

COUNT(*) — 统计每组行数

返回结果

会话保持技术演进
老版本：Cookie
特点	说明
存储位置	客户端（纯文本）
安全性	不安全
限制	协议、端口、IP 苛刻限制
问题	锁移动的特殊性
中版本：Session
特点	说明
存储位置	服务器端（键值对）
优点	解决了 Cookie 的安全问题
缺点	压力给到服务器
新问题	Redis 集群下负载均衡会导致会话中断
核心流程：

客户端存储 Session ID（钥匙）

服务器存储用户数据（柜子里的东西）

新版本：Token（JWT）
生成 Token：

java
String token = Jwts.builder()
    .signWith(SignatureAlgorithm.HS256, "c3Zod2xpYW8=")  // 加密方式 + Base64编码的密钥
    .addClaims(dataMap)      // 添加自定义信息
    .setExpiration(new Date(System.currentTimeMillis() + 3600 * 1000))  // 过期时间（毫秒）
    .compact();              // 生成令牌
解析 Token：

java
@Test
public void testParseToken() {
    String token = "";  // 获取令牌
    Claims claims = Jwts.parser()
        .setSigningKey("c3Zod2xpYW8=")
        .parseClaimsJws(token)
        .getBody();      // 获取自定义信息
    System.out.println(claims);
}
JWT 三部分结构：

部分	名称	内容	示例
第一部分	Header（头）	令牌类型、签名算法	{"alg":"HS256","type":"JWT"}
第二部分	Payload（载荷）	自定义信息 + 默认信息	{"id":"1","username":"Tom"}
第三部分	Signature（签名）	防篡改，确保安全性	由 header+payload+密钥+算法计算
关键点：

Header 和 Payload 都是 JSON 对象，经过 Base64Url 编码

Map 中存放必要但不敏感的信息（因为 Base64 可直接解码查看）

密钥保存在本地环境变量

Base64 vs Base32
编码	字符集	长度
Base64	a-z、A-Z、0-9、+、/	64 个字符
Base32	A-Z、2-7	32 个字符
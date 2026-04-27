2025-04-27 学习日志 | LeetCode + 技术学习总结
一、LeetCode 算法题
题目：在排序数组中查找元素的第一个和最后一个位置
解题思路
使用两次二分查找：
第一次二分：找目标值左边界（第一个 >= target 的位置）
第二次二分：找目标值右边界（第一个 > target 的位置）
最终结果：左边界～右边界 - 1
时间复杂度：O (log n)，空间复杂度：O (1)
java
class Solution {
    public int[] searchRange(int[] nums, int target) {
        if (nums.length == 0) {
            return new int[]{-1, -1};
        }
        // 第一次二分：找左边界
        int l1 = -1, r1 = nums.length;
        while (l1 + 1 < r1) {
            int mid = l1 + (r1 - l1) / 2;
            if (nums[mid] >= target) {
                r1 = mid;
            } else {
                l1 = mid;
            }
        }
        // 第二次二分：找右边界
        int l2 = -1, r2 = nums.length;
        while (l2 + 1 < r2) {
            int mid = l2 + (r2 - l2) / 2;
            if (nums[mid] > target) {
                r2 = mid;
            } else {
                l2 = mid;
            }
        }
        // 校验是否存在目标值
        if (r1 > nums.length -1 || nums[r1] != target) {
            return new int[]{-1, -1};
        }
        return new int[]{r1, r2 - 1};
    }
}

二、今日技术学习总结
1. Spring 事务核心知识点
@Transactional 注解
默认只回滚运行时异常
指定 rollbackFor = Exception.class 可回滚所有异常
事务传播机制（记 2 个即可）
REQUIRED：依附上层事务，共用一个事务
REQUIRES_NEW：新建独立事务，提交后不受外部回滚影响
事务作用
保证关联操作同步成功 / 失败，避免数据库数据不一致
快捷键
Ctrl + Alt + T：快速给代码包裹 try-catch 等结构
ACID：事务四大特性（原子性、一致性、隔离性、持久性）
2. SpringBoot 文件上传
（1）基础接收方式
前端传递文件二进制字节码
Controller 用 MultipartFile file 接收
默认单个文件最大限制：1MB
（2）MultipartFile 常用方法
getOriginalFilename()：获取原始文件名
getBytes()：获取文件字节数组
getSize()：获取文件大小
transferTo(File dest)：将文件保存到本地
getInputStream()：获取文件输入流
（3）本地存储优化
用 UUID.randomUUID() 生成唯一文件名
防止文件重名覆盖
（4）阿里云 OSS 存储
在 application.yml 配置 OSS 信息
用 @Value 注入配置
编写配置类，交给 Spring IOC 管理（@Component）
注入配置类，调用 OSS 工具类实现文件上传
三、学习说明
因硬盘损坏 + 学习时间紧张，不再梳理旧博客 / 旧文件当前阶段：刷视频学技术 + 每日 LeetCode 算法后续文章固定格式：LeetCode 题解 + 当日技术总结
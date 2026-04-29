今日份算法篇
单链表：找最后相同链部分，返回相同部分的起点
初始思路
设计两个反向的链表存储，正好存储到两个链表的大小；反向找相同的部分，发现不同后保存值和 pos。

空间复杂度：O(n + m)

最终算法思路
设计两个链表中的部分：

链表 A：a + c

链表 B：b + c

让 A 走完走 B，B 走完走 A，最后都是 a + b + c。
最后 A、B 两个节点一定会相遇，直接判断此处的 A、B 节点本身是否相等，直接返回此处 C 的初始节点。

代码实现
java
public class Solution {
    public ListNode getIntersectionNode(ListNode headA, ListNode headB) {
        if (headA == null || headB == null) return null;
        
        ListNode pA = headA;
        ListNode pB = headB;
        
        // 当两个指针相等时停止（要么是相交节点，要么都是null）
        while (pA != pB) {
            // pA走完后从headB继续，pB走完后从headA继续
            pA = (pA == null) ? headB : pA.next;
            pB = (pB == null) ? headA : pB.next;
        }
        
        return pA;
    }
}
今日份技术总结
主题：会话技术、过滤器 Filter、拦截器 Interceptor

一、Cookie 和 Session
Cookie
服务端：存储的是 Session 完整内容

客户端：存储 SessionID

[补充] Cookie 也可以直接存储加密后的用户数据（不依赖 Session）

Session
服务器：存储的是 key : val

客户端：存的是 val

[补充] 标准 Session 中客户端存的是 SessionID（钥匙），服务端存的是用户数据（房间内容）。你描述的“客户端存 val”更接近 Token/JWT 或加密 Cookie 方式。

Cookie 签名机制
服务器：密钥（用户传回来的前两项数值 + 密钥 → 使用哈希加密算法实现创建签名，对比即可）

客户端：签名

二、过滤 + 拦截核心思路
获取请求 URL

判断请求 URL 中是否包含 login，如果包含，说明是登录操作，放行

获取请求头中的令牌（token）

判断令牌是否存在，如果不存在，响应 401

解析 token，如果解析失败，响应 401

放行

三、过滤器（Filter）
@WebFilter(urlPatterns = "/*") 实现锁路径请求。

特点
内部属于 Servlet 规范

需要开启 Servlet 的组件支持：Spring 启动类上加上 @ServletComponentScan（开启对 Servlet 组件的支持）

内部 init()、destroy() 底层实现且一次只运行一次，非必要不写

直接使用注解实现自动在限制的请求前执行过滤操作

实现步骤
创建一个新的过滤器类，实现 Filter 接口

重写 doFilter 方法

先将请求和响应转化为对应协议的 HttpServletRequest 和 HttpServletResponse

按照上面的思路实现拦截逻辑

如果验证正确，chain.doFilter(request, response) 放行

如果不正确，返回 401 状态：response.setStatus(HttpStatus.SC_UNAUTHORIZED)，直接返回

前端获取到数据后发现状态码是 401，会自动跳转到登录页

四、拦截器（Interceptor）
底层是 Spring 框架实现，基本完全实现了过滤器的全部内容。

内部方法接口
方法	时机	说明
preHandle	目标资源方法执行前执行	返回 true：放行；返回 false：不放行
postHandle	目标资源方法执行后执行	正常返回后执行
afterCompletion	视图渲染完毕后执行	最后执行，无论是否异常
实现方式
重写 preHandle 方法，内部逻辑和过滤器差不多。
主要注意：返回的是 boolean 值（true=放行，false=不放行），参数中有 request 和 response。

配置类（必须）
实现拦截器需要另外创建一个 config 类：

java
@Configuration  // 实现 IOC 交互，声明这是一个配置类
public class WebConfig implements WebMvcConfigurer {
    
    // 拦截器对象
    @Autowired
    private TokenInterceptor tokenInterceptor;

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        // 注册自定义拦截器对象，并指定拦截路径
        registry.addInterceptor(tokenInterceptor).addPathPatterns("/**");
    }
}
[补充] @Configuration 告诉 Spring 这是一个配置类；WebMvcConfigurer 提供了各种配置 Spring MVC 的方法（如 addInterceptors、addCorsMappings 等）

[补充] 拦截器必须通过配置类注册才能生效，不能像过滤器那样只用注解

五、Filter vs Interceptor 对比 [补充]
维度	Filter	Interceptor
规范	Servlet 规范	Spring 框架规范
是否需要配置类	不需要（@WebFilter + @ServletComponentScan）	需要（@Configuration + WebMvcConfigurer）
拦截范围	更广（可拦截静态资源）	仅 Spring MVC 的 Controller
能否注入 Spring Bean	较麻烦	✅ 容易（@Autowired）
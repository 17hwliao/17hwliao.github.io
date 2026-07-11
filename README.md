<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>关于我</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      min-height: 100vh;
      background: linear-gradient(135deg, #0f0c29, #302b63, #24243e);
      display: flex;
      justify-content: center;
      align-items: center;
      font-family: 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
      color: #e0e0e0;
      padding: 40px 20px;
    }
    .card {
      max-width: 680px;
      width: 100%;
      background: rgba(255, 255, 255, 0.05);
      backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 20px;
      padding: 48px 40px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    }
    .card h1 {
      font-size: 28px;
      font-weight: 700;
      margin-bottom: 32px;
      background: linear-gradient(90deg, #a78bfa, #60a5fa, #34d399);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .timeline {
      position: relative;
      padding-left: 28px;
      margin-bottom: 36px;
    }
    .timeline::before {
      content: '';
      position: absolute;
      left: 6px;
      top: 4px;
      bottom: 4px;
      width: 2px;
      background: linear-gradient(to bottom, #a78bfa, #60a5fa, #34d399);
      border-radius: 2px;
    }
    .timeline-item {
      position: relative;
      margin-bottom: 20px;
      line-height: 1.7;
      font-size: 15px;
      color: #c0c0c0;
    }
    .timeline-item::before {
      content: '';
      position: absolute;
      left: -24px;
      top: 8px;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #a78bfa;
      border: 2px solid #24243e;
    }
    .timeline-item:nth-child(2)::before { background: #60a5fa; }
    .timeline-item:nth-child(3)::before { background: #34d399; }
    .timeline-item:nth-child(4)::before { background: #fbbf24; }
    .arrow { color: #a78bfa; font-weight: 600; }
    .sad { font-size: 16px; }
    .highlight { color: #60a5fa; font-weight: 500; }
    .tag {
      display: inline-block;
      background: rgba(167, 139, 250, 0.15);
      border: 1px solid rgba(167, 139, 250, 0.3);
      border-radius: 6px;
      padding: 1px 8px;
      font-size: 13px;
      color: #a78bfa;
      margin-left: 4px;
    }
    .star { color: #fbbf24; }
    .links {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-top: 28px;
      padding-top: 24px;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
    }
    .link-btn {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 18px;
      border-radius: 12px;
      text-decoration: none;
      color: #e0e0e0;
      font-size: 14px;
      transition: all 0.25s ease;
    }
    .link-btn.github {
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.1);
    }
    .link-btn.github:hover {
      background: rgba(255, 255, 255, 0.12);
      border-color: rgba(255, 255, 255, 0.2);
      transform: translateY(-1px);
    }
    .link-btn.blog {
      background: linear-gradient(135deg, rgba(167,139,250,0.2), rgba(96,165,250,0.2));
      border: 1px solid rgba(167,139,250,0.3);
    }
    .link-btn.blog:hover {
      background: linear-gradient(135deg, rgba(167,139,250,0.3), rgba(96,165,250,0.3));
      transform: translateY(-1px);
    }
    .link-icon { font-size: 18px; }
    .footer-note {
      text-align: center;
      margin-top: 28px;
      font-size: 13px;
      color: #888;
      letter-spacing: 2px;
    }
    @media (max-width: 500px) {
      .card { padding: 32px 24px; }
      .card h1 { font-size: 22px; }
    }
  </style>
</head>
<body>
  <div class="card">
    <h1>关于我</h1>
    <div class="timeline">
      <div class="timeline-item">
        从 Hexo 静态框架起步 <span class="tag">入门</span>
        <span class="arrow">→</span> 自己写一点 C 语言
      </div>
      <div class="timeline-item">
        使用 Meme 简单主题 <span class="tag">轻量</span>
        <span class="arrow">→</span> 学习算法
      </div>
      <div class="timeline-item">
        整了 Butterfly 主题 <span class="tag">折腾</span>
        <span class="arrow">→</span> 硬盘丢了，文件全无了 <span class="sad">(>_<)</span>
      </div>
      <div class="timeline-item">
        后来找到了一个<span class="highlight">全栈式</span>的新颖项目 —— 原作者是前端大佬，我只是修改了一些代码，并没有改变原项目的功能
      </div>
    </div>
    <div class="links">
      <a href="https://github.com/YYsuni/2025-blog-public" target="_blank" class="link-btn github">
        <span class="link-icon">★</span>
        给原作者点个 Star
        <span class="star">★</span>
      </a>
      <a href="https://17hwliao.vercel.app/" target="_blank" class="link-btn blog">
        <span class="link-icon">🌐</span>
        访问我的新博客
      </a>
    </div>
    <p class="footer-note">欢迎每一位到访我博客的朋友 ! ! !</p>
  </div>
</body>
</html>

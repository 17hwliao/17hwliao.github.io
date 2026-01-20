// 视频懒加载和增强功能
document.addEventListener('DOMContentLoaded', function() {
  console.log('视频JS加载成功！');
  
  // 为所有视频添加点击播放/暂停
  const videos = document.querySelectorAll('.meow-video-container video');
  videos.forEach(video => {
    video.addEventListener('click', function() {
      if (this.paused) {
        this.play();
      } else {
        this.pause();
      }
    });
  });
});

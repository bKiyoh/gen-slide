<script setup>
defineEmits(['next'])
</script>
<template>
  <article class="slide-content slide-title">
    <p class="slide-kicker">GENERATIVE SLIDE SYSTEM / 01</p>
    <div class="slide-title-copy"><h1>動きをつくる。<br />伝わる瞬間をつくる。</h1><p>四角形から始まる、スライド間のモーショングラフィックス。</p>
      <button class="slide-start" @click="$emit('next')">プレゼンテーションを始める <span aria-hidden="true">→</span></button>
    </div>
    <div class="slide-art" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
    <footer>CREATE THE TRANSITION.<span>Vue × Three.js</span></footer>
  </article>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import SiliconFlowQA from '../index.js'

const storyContent = ref('')
const choices = ref([])
const isLoading = ref(false)
const gameHistory = ref([])
const gameStarted = ref(false)
const gameTitle = ref('')
const gameDescription = ref('')
const streamingContent = ref('')
const customInput = ref('')
const showCustomInput = ref(false)
const currentRound = ref(0)

const apiKey = import.meta.env.VITE_API_KEY
const qa = new SiliconFlowQA(apiKey)

// 计算历史章节列表（用于左侧目录）
const historyChapters = computed(() => {
  const chapters = []
  for (let i = 0; i < gameHistory.value.length; i += 2) {
    const round = Math.floor(i / 2) + 1
    const assistantMsg = gameHistory.value[i]
    const userMsg = gameHistory.value[i + 1]
    chapters.push({
      round,
      title: `第 ${round} 章`,
      preview: assistantMsg?.content?.slice(0, 30) + '...' || '',
      hasChoice: !!userMsg
    })
  }
  return chapters
})

// 获取前一轮和本轮的内容
const getDisplayHistory = computed(() => {
  const history = gameHistory.value
  const len = history.length
  if (len === 0) return []
  
  // 只返回前一轮和本轮
  if (len <= 4) {
    // 如果总共只有1-2轮，显示全部
    return history
  } else {
    // 显示前一轮（2条）和本轮（最多2条）
    return history.slice(-4)
  }
})

// 解析JSON响应
const parseGameData = (content) => {
  try {
    return JSON.parse(content)
  } catch (e) {
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0])
      } catch (e2) {
        return null
      }
    }
    return null
  }
}

// 开始新游戏
const startNewGame = async () => {
  isLoading.value = true
  streamingContent.value = ''
  currentRound.value = 1
  try {
    const initialPrompt = '创建一个互动叙事游戏，包含引人入胜的开场和至少3个选择选项。请以JSON格式返回：{"title": "游戏标题", "description": "游戏描述", "content": "开场内容", "choices": ["选项1", "选项2", "选项3"]}'
    
    const result = await qa.askStream(initialPrompt, (chunk) => {
      streamingContent.value = chunk.fullAnswer
    })
    
    const gameData = parseGameData(result.answer)
    if (gameData) {
      gameTitle.value = gameData.title || '未命名游戏'
      gameDescription.value = gameData.description || ''
      storyContent.value = gameData.content || ''
      choices.value = gameData.choices || []
      gameHistory.value = [{ role: 'assistant', content: gameData.content || '' }]
      gameStarted.value = true
    } else {
      storyContent.value = '解析游戏数据失败，请重试'
    }
  } catch (error) {
    console.error('Error starting game:', error)
    storyContent.value = '游戏初始化失败，请重试'
  } finally {
    isLoading.value = false
    streamingContent.value = ''
  }
}

// 选择选项
const makeChoice = async (choice) => {
  if (isLoading.value) return
  
  isLoading.value = true
  streamingContent.value = ''
  currentRound.value++
  try {
    gameHistory.value.push({ role: 'user', content: choice })
    
    const prompt = `基于之前的对话历史，玩家选择了："${choice}"。请继续故事，提供新的情节发展，并给出至少3个新的选择选项。请以JSON格式返回：{"content": "新的故事内容", "choices": ["选项1", "选项2", "选项3"]}`
    
    const result = await qa.askStream(prompt, (chunk) => {
      streamingContent.value = chunk.fullAnswer
    })
    
    const gameData = parseGameData(result.answer)
    if (gameData) {
      storyContent.value = gameData.content || ''
      choices.value = gameData.choices || []
      gameHistory.value.push({ role: 'assistant', content: gameData.content || '' })
    } else {
      storyContent.value = '解析故事数据失败，请重试'
    }
  } catch (error) {
    console.error('Error making choice:', error)
    storyContent.value = '故事继续失败，请重试'
  } finally {
    isLoading.value = false
    streamingContent.value = ''
    showCustomInput.value = false
    customInput.value = ''
  }
}

// 提交自定义输入
const submitCustomInput = () => {
  if (!customInput.value.trim() || isLoading.value) return
  makeChoice(customInput.value.trim())
}

// 切换自定义输入显示
const toggleCustomInput = () => {
  showCustomInput.value = !showCustomInput.value
  if (showCustomInput.value) {
    setTimeout(() => {
      document.querySelector('.custom-input')?.focus()
    }, 100)
  }
}

// 重新开始游戏
const restartGame = () => {
  gameStarted.value = false
  storyContent.value = ''
  choices.value = []
  gameHistory.value = []
  gameTitle.value = ''
  gameDescription.value = ''
  streamingContent.value = ''
  customInput.value = ''
  showCustomInput.value = false
  currentRound.value = 0
}

onMounted(() => {
})
</script>

<template>
  <div class="game-app">
    <!-- 顶部导航栏 -->
    <header class="app-header">
      <div class="header-brand">
        <span class="brand-icon">◈</span>
        <h1 class="brand-title">InteractiveStory</h1>
      </div>
      <div class="header-meta">
        <span v-if="gameStarted" class="round-badge">Round {{ currentRound }}</span>
        <button class="header-btn" @click="restartGame" v-if="gameStarted">
          <span class="btn-icon">↺</span> 重新开始
        </button>
      </div>
    </header>

    <div class="app-body">
      <!-- 左侧历史目录 -->
      <aside class="sidebar" v-if="gameStarted">
        <div class="sidebar-header">
          <h3>📖 故事章节</h3>
        </div>
        <div class="chapter-list">
          <div 
            v-for="chapter in historyChapters" 
            :key="chapter.round"
            class="chapter-item"
            :class="{ 
              'chapter-current': chapter.round === currentRound,
              'chapter-completed': chapter.round < currentRound 
            }"
          >
            <div class="chapter-number">{{ chapter.round }}</div>
            <div class="chapter-info">
              <div class="chapter-title">{{ chapter.title }}</div>
              <div class="chapter-preview">{{ chapter.preview }}</div>
            </div>
            <div class="chapter-status">
              <span v-if="chapter.round === currentRound" class="status-current">●</span>
              <span v-else-if="chapter.hasChoice" class="status-completed">✓</span>
            </div>
          </div>
        </div>
      </aside>

      <!-- 主内容区 -->
      <main class="main-content" :class="{ 'full-width': !gameStarted }">
        <!-- 未开始状态 -->
        <div v-if="!gameStarted" class="welcome-screen">
          <div class="welcome-card">
            <div class="welcome-icon">📚</div>
            <h2 class="welcome-title">开启你的互动叙事之旅</h2>
            <p class="welcome-desc">
              AI 驱动的沉浸式故事体验<br>
              每一个选择都将影响故事走向
            </p>
            <button class="start-btn" @click="startNewGame" :disabled="isLoading">
              <span v-if="isLoading" class="loading-spinner"></span>
              <span v-else>开始游戏</span>
            </button>
          </div>
        </div>

        <!-- 游戏进行区 -->
        <div v-else class="game-area">
          <!-- 故事标题卡 -->
          <div class="title-card">
            <h2 class="game-title-text">{{ gameTitle }}</h2>
            <p class="game-desc-text">{{ gameDescription }}</p>
          </div>

          <!-- 对话展示区（只显示前一轮和本轮） -->
          <div class="dialogue-area">
            <div 
              v-for="(item, index) in getDisplayHistory" 
              :key="index"
              class="message"
              :class="item.role"
            >
              <div class="message-avatar">
                <span v-if="item.role === 'user'">🎮</span>
                <span v-else">🤖</span>
              </div>
              <div class="message-content">
                <div class="message-label">
                  {{ item.role === 'user' ? '你的选择' : '故事叙述' }}
                </div>
                <div class="message-text">{{ item.content }}</div>
              </div>
            </div>
            
            <!-- 流式输出 -->
            <div v-if="streamingContent" class="message assistant streaming">
              <div class="message-avatar">🤖</div>
              <div class="message-content">
                <div class="message-label">故事叙述</div>
                <div class="message-text">{{ streamingContent }}<span class="typing-cursor">|</span></div>
              </div>
            </div>
          </div>

          <!-- 交互区 -->
          <div class="interaction-area">
            <!-- 预设选项 -->
            <div v-if="!isLoading && choices.length > 0" class="choices-wrapper">
              <div class="choices-label">选择一个行动：</div>
              <div class="choices-grid">
                <button 
                  v-for="(choice, index) in choices" 
                  :key="index"
                  class="choice-card"
                  @click="makeChoice(choice)"
                >
                  <span class="choice-index">{{ index + 1 }}</span>
                  <span class="choice-text">{{ choice }}</span>
                </button>
              </div>
            </div>

            <!-- 自定义输入切换 -->
            <div v-if="!isLoading && choices.length > 0" class="custom-action">
              <button class="toggle-input-btn" @click="toggleCustomInput">
                {{ showCustomInput ? '隐藏自定义输入' : '✎ 输入自定义行动' }}
              </button>
            </div>

            <!-- 自定义输入框 -->
            <div v-if="showCustomInput && !isLoading" class="custom-input-wrapper">
              <input 
                v-model="customInput"
                type="text"
                class="custom-input"
                placeholder="描述你想采取的行动..."
                @keyup.enter="submitCustomInput"
              />
              <button 
                class="submit-btn" 
                @click="submitCustomInput"
                :disabled="!customInput.trim()"
              >
                确认
              </button>
            </div>

            <!-- 加载状态 -->
            <div v-if="isLoading && !streamingContent" class="loading-state">
              <div class="loading-spinner large"></div>
              <span>AI 正在构思故事...</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  </div>
</template>

<style scoped>
/* ===== 基础样式 ===== */
* {
  box-sizing: border-box;
}

.game-app {
  min-height: 100vh;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  color: #eaeaea;
}

/* ===== 顶部导航栏 ===== */
.app-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 30px;
  height: 60px;
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  position: sticky;
  top: 0;
  z-index: 100;
}

.header-brand {
  display: flex;
  align-items: center;
  gap: 12px;
}

.brand-icon {
  font-size: 24px;
  color: #e94560;
}

.brand-title {
  font-size: 20px;
  font-weight: 600;
  background: linear-gradient(90deg, #e94560, #ff6b6b);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.header-meta {
  display: flex;
  align-items: center;
  gap: 16px;
}

.round-badge {
  padding: 6px 14px;
  background: rgba(233, 69, 96, 0.2);
  border: 1px solid rgba(233, 69, 96, 0.3);
  border-radius: 20px;
  font-size: 14px;
  color: #e94560;
  font-weight: 500;
}

.header-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  color: #eaeaea;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.header-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  transform: translateY(-1px);
}

.btn-icon {
  font-size: 16px;
}

/* ===== 主体布局 ===== */
.app-body {
  display: flex;
  height: calc(100vh - 60px);
  overflow: hidden;
}

/* ===== 左侧边栏 ===== */
.sidebar {
  width: 280px;
  background: rgba(0, 0, 0, 0.2);
  border-right: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  flex-direction: column;
}

.sidebar-header {
  padding: 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.sidebar-header h3 {
  font-size: 16px;
  font-weight: 600;
  color: #eaeaea;
}

.chapter-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.chapter-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px;
  margin-bottom: 8px;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.3s ease;
  border: 1px solid transparent;
}

.chapter-item:hover {
  background: rgba(255, 255, 255, 0.05);
}

.chapter-completed {
  opacity: 0.7;
}

.chapter-current {
  background: rgba(233, 69, 96, 0.15);
  border-color: rgba(233, 69, 96, 0.3);
}

.chapter-number {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  color: #eaeaea;
}

.chapter-current .chapter-number {
  background: #e94560;
  color: white;
}

.chapter-info {
  flex: 1;
  min-width: 0;
}

.chapter-title {
  font-size: 14px;
  font-weight: 500;
  color: #eaeaea;
  margin-bottom: 4px;
}

.chapter-preview {
  font-size: 12px;
  color: #888;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chapter-status {
  font-size: 12px;
}

.status-current {
  color: #e94560;
  animation: pulse 2s infinite;
}

.status-completed {
  color: #4ade80;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* ===== 主内容区 ===== */
.main-content {
  flex: 1;
  overflow-y: auto;
  padding: 30px;
}

.main-content.full-width {
  display: flex;
  align-items: center;
  justify-content: center;
}

/* ===== 欢迎页面 ===== */
.welcome-screen {
  text-align: center;
}

.welcome-card {
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 24px;
  padding: 60px 80px;
  max-width: 500px;
}

.welcome-icon {
  font-size: 64px;
  margin-bottom: 24px;
}

.welcome-title {
  font-size: 28px;
  font-weight: 700;
  margin-bottom: 16px;
  background: linear-gradient(90deg, #eaeaea, #a0a0a0);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.welcome-desc {
  font-size: 16px;
  color: #888;
  line-height: 1.6;
  margin-bottom: 32px;
}

.start-btn {
  padding: 16px 48px;
  background: linear-gradient(135deg, #e94560, #ff6b6b);
  border: none;
  border-radius: 12px;
  color: white;
  font-size: 18px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 4px 20px rgba(233, 69, 96, 0.3);
}

.start-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 30px rgba(233, 69, 96, 0.4);
}

.start-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

/* ===== 游戏区域 ===== */
.game-area {
  max-width: 800px;
  margin: 0 auto;
}

.title-card {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  padding: 24px 30px;
  margin-bottom: 24px;
}

.game-title-text {
  font-size: 24px;
  font-weight: 700;
  color: #eaeaea;
  margin-bottom: 8px;
}

.game-desc-text {
  font-size: 14px;
  color: #888;
  line-height: 1.5;
}

/* ===== 对话区域 ===== */
.dialogue-area {
  display: flex;
  flex-direction: column;
  gap: 20px;
  margin-bottom: 30px;
}

.message {
  display: flex;
  gap: 16px;
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.message-avatar {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  font-size: 20px;
  flex-shrink: 0;
}

.message-content {
  flex: 1;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  padding: 20px;
}

.message.user .message-content {
  background: rgba(233, 69, 96, 0.1);
  border-color: rgba(233, 69, 96, 0.2);
}

.message.assistant .message-content {
  background: rgba(77, 171, 247, 0.1);
  border-color: rgba(77, 171, 247, 0.2);
}

.message-label {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
  color: #888;
}

.message.user .message-label {
  color: #e94560;
}

.message.assistant .message-label {
  color: #4dabf7;
}

.message-text {
  font-size: 15px;
  line-height: 1.7;
  color: #eaeaea;
  white-space: pre-wrap;
}

.typing-cursor {
  display: inline-block;
  color: #4dabf7;
  animation: blink 1s infinite;
}

@keyframes blink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}

/* ===== 交互区域 ===== */
.interaction-area {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  padding: 24px;
}

.choices-label {
  font-size: 14px;
  font-weight: 600;
  color: #888;
  margin-bottom: 16px;
}

.choices-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
}

.choice-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.3s ease;
  text-align: left;
}

.choice-card:hover {
  background: rgba(233, 69, 96, 0.1);
  border-color: rgba(233, 69, 96, 0.3);
  transform: translateY(-2px);
}

.choice-index {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(233, 69, 96, 0.2);
  color: #e94560;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
}

.choice-text {
  font-size: 14px;
  color: #eaeaea;
  line-height: 1.4;
}

/* ===== 自定义输入 ===== */
.custom-action {
  margin-top: 20px;
  text-align: center;
}

.toggle-input-btn {
  padding: 10px 20px;
  background: transparent;
  border: 1px dashed rgba(255, 255, 255, 0.3);
  border-radius: 8px;
  color: #888;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.toggle-input-btn:hover {
  border-color: #e94560;
  color: #e94560;
}

.custom-input-wrapper {
  display: flex;
  gap: 12px;
  margin-top: 16px;
}

.custom-input {
  flex: 1;
  padding: 14px 18px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 12px;
  color: #eaeaea;
  font-size: 15px;
  outline: none;
  transition: all 0.3s ease;
}

.custom-input:focus {
  border-color: #e94560;
  background: rgba(255, 255, 255, 0.08);
}

.custom-input::placeholder {
  color: #666;
}

.submit-btn {
  padding: 14px 28px;
  background: #e94560;
  border: none;
  border-radius: 12px;
  color: white;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
}

.submit-btn:hover:not(:disabled) {
  background: #ff6b6b;
  transform: translateY(-1px);
}

.submit-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ===== 加载状态 ===== */
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 40px;
  color: #888;
}

.loading-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid rgba(255, 255, 255, 0.1);
  border-top-color: #e94560;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.loading-spinner.large {
  width: 40px;
  height: 40px;
  border-width: 3px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* ===== 滚动条样式 ===== */
::-webkit-scrollbar {
  width: 6px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.2);
}

/* ===== 响应式设计 ===== */
@media (max-width: 768px) {
  .sidebar {
    display: none;
  }
  
  .app-header {
    padding: 0 16px;
  }
  
  .brand-title {
    font-size: 16px;
  }
  
  .main-content {
    padding: 20px;
  }
  
  .welcome-card {
    padding: 40px 30px;
    margin: 20px;
  }
  
  .choices-grid {
    grid-template-columns: 1fr;
  }
  
  .custom-input-wrapper {
    flex-direction: column;
  }
}
</style>

<script setup>
import { ref, onMounted, computed, watch } from 'vue'
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

const showThemeSelection = ref(true)
const selectedTheme = ref(null)
const customTheme = ref('')
const keyPlots = ref([])
const contextSummary = ref('')
const MAX_ROUNDS_BEFORE_SUMMARY = 5

const THEMES = [
  { id: 'fantasy', name: '奇幻冒险', icon: '🗡️', desc: '魔法、龙、骑士与神秘大陆' },
  { id: 'scifi', name: '科幻未来', icon: '🚀', desc: '太空探索、人工智能、未来世界' },
  { id: 'mystery', name: '悬疑推理', icon: '🔍', desc: '解谜、侦探、扑朔迷离的案件' },
  { id: 'romance', name: '言情都市', icon: '💕', desc: '都市爱情、情感纠葛' },
  { id: 'wuxia', name: '武侠江湖', icon: '⚔️', desc: '江湖恩怨、武林秘籍' },
  { id: 'horror', name: '恐怖惊悚', icon: '👻', desc: '诡异事件、惊悚氛围' },
]

const FAMOUS_STORIES = [
  { id: 'journey', name: '西游记', icon: '🐵', theme: 'fantasy', prompt: '以西游记为背景，玩家可以扮演孙悟空、唐僧等角色，经历九九八十一难中的故事' },
  { id: 'threekingdoms', name: '三国演义', icon: '🏛️', theme: 'wuxia', prompt: '以三国演义为背景，玩家可以扮演诸葛亮、曹操、刘备等角色，参与著名战役和谋略' },
  { id: 'watermargin', name: '水浒传', icon: '🏔️', theme: 'wuxia', prompt: '以水浒传为背景，玩家可以扮演宋江、武松等好汉，体验梁山聚义的故事' },
  { id: 'dream', name: '红楼梦', icon: '🌸', theme: 'romance', prompt: '以红楼梦为背景，玩家可以扮演贾宝玉，体验大观园中的爱恨情仇' },
  { id: 'sherlock', name: '福尔摩斯', icon: '🎩', theme: 'mystery', prompt: '以福尔摩斯探案集为背景，玩家扮演侦探助手，与福尔摩斯一起破解谜案' },
  { id: 'harrypotter', name: '哈利波特', icon: '⚡', theme: 'fantasy', prompt: '以哈利波特魔法世界为背景，玩家作为霍格沃茨学生，经历魔法冒险' },
]

const selectedStoryType = ref('theme')

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
      hasChoice: !!userMsg,
      keyPlot: keyPlots.value.find(p => p.round === round)
    })
  }
  return chapters
})

const getDisplayHistory = computed(() => {
  const history = gameHistory.value
  const len = history.length
  if (len === 0) return []
  
  if (len <= 4) {
    return history
  } else {
    return history.slice(-4)
  }
})

const TAGS = ['TITLE', 'DESC', 'CONTENT', 'CHOICE']
const OPEN_TAG_REGEX = /\[([A-Z]+)\]/
const CLOSE_TAG_REGEX = /\[\/([A-Z]+)\]/

const parseGameData = (content) => {
  try {
    return JSON.parse(content)
  } catch (e) {
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0])
      } catch (e2) {
      }
    }
  }
  
  const result = {}
  const stack = []
  let pos = 0
  
  while (pos < content.length) {
    const openMatch = content.slice(pos).match(OPEN_TAG_REGEX)
    const closeMatch = content.slice(pos).match(CLOSE_TAG_REGEX)
    
    const openPos = openMatch ? pos + openMatch.index : Infinity
    const closePos = closeMatch ? pos + closeMatch.index : Infinity
    
    if (openPos === Infinity && closePos === Infinity) break
    
    if (openPos < closePos && openMatch) {
      const tagName = openMatch[1]
      if (TAGS.includes(tagName)) {
        stack.push({ tag: tagName, start: openPos + openMatch[0].length })
      }
      pos = openPos + openMatch[0].length
    } else if (closeMatch) {
      const tagName = closeMatch[1]
      const lastIdx = stack.findLastIndex(item => item.tag === tagName)
      
      if (lastIdx !== -1) {
        const openItem = stack[lastIdx]
        const tagContent = content.slice(openItem.start, closePos).trim()
        
        if (tagName === 'CHOICE') {
          if (!result.choices) result.choices = []
          result.choices.push(tagContent)
        } else {
          result[tagName.toLowerCase()] = tagContent
        }
        
        stack.splice(lastIdx, 1)
      }
      pos = closePos + closeMatch[0].length
    } else {
      break
    }
  }
  
  return Object.keys(result).length > 0 ? result : null
}

function createStreamingParser(options = {}) {
  const { arrayTags = [] } = options;
  const result = {};
  let buffer = '';
  let currentTag = null;
  let isInsideTag = false;
  const tagRegex = /\[(\/?)([A-Z]+)\]/g;

  function saveContent(tagName, content) {
    if (arrayTags.includes(tagName)) {
      if (!result[tagName]) {
        result[tagName] = [];
      }
      result[tagName].push(content);
    } else {
      result[tagName] = content;
    }
  }

  return {
    write(chunk) {
      if (typeof chunk !== 'string') return;
      buffer += chunk;
      let lastIndex = 0;
      let match;
      tagRegex.lastIndex = 0;

      while ((match = tagRegex.exec(buffer)) !== null) {
        const fullMatch = match[0];
        const isClosing = match[1] === '/';
        const tagName = match[2];
        const matchIndex = match.index;
        const contentBeforeTag = buffer.substring(lastIndex, matchIndex);

        if (isInsideTag && currentTag) {
          if (isClosing && tagName === currentTag) {
            saveContent(currentTag, contentBeforeTag);
            currentTag = null;
            isInsideTag = false;
            lastIndex = matchIndex + fullMatch.length;
            continue;
          }
          
          if (!isClosing || (isClosing && tagName !== currentTag)) {
            saveContent(currentTag, contentBeforeTag);
            currentTag = null;
            isInsideTag = false;
          }
        }

        if (!isInsideTag) {
          if (!isClosing) {
            currentTag = tagName;
            isInsideTag = true;
            lastIndex = matchIndex + fullMatch.length;
          } else {
            lastIndex = matchIndex + fullMatch.length;
          }
        } else {
          if (!isClosing) {
            currentTag = tagName;
            isInsideTag = true;
            lastIndex = matchIndex + fullMatch.length;
          } else {
            lastIndex = matchIndex + fullMatch.length;
          }
        }
        
        if (lastIndex <= matchIndex) {
          lastIndex = matchIndex + fullMatch.length;
        }
      }

      buffer = buffer.substring(lastIndex);
    },

    end() {
      if (isInsideTag && currentTag && buffer.length > 0) {
        saveContent(currentTag, buffer);
      }
      buffer = '';
      currentTag = null;
      isInsideTag = false;
      return result;
    }
  };
}

const extractContentFromStream = (chunk, accumulatedText = '') => {
  const parser = createStreamingParser({ arrayTags: ['CHOICE'] });
  parser.write(accumulatedText + chunk);
  const result = parser.end();
  
  if (result.CONTENT) {
    return result.CONTENT;
  }
  
  const fullText = accumulatedText + chunk;
  const jsonMatch = fullText.match(/\{[\s\S]*"content"\s*:\s*"([^"]*)/);
  if (jsonMatch) {
    return jsonMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
  }
  
  return chunk;
}

const extractKeyPlot = (content) => {
  if (!content || content.length < 50) return null
  
  const sentences = content.match(/[^。！？.!?]+[。！？.!?]+/g) || [content]
  const keySentence = sentences.length > 0 ? sentences[0] : content.slice(0, 100)
  
  return keySentence.length > 80 ? keySentence.slice(0, 80) + '...' : keySentence
}

const generateContextPrompt = () => {
  let prompt = ''
  
  if (contextSummary.value) {
    prompt += `\n【故事背景摘要】\n${contextSummary.value}\n`
  }
  
  if (keyPlots.value.length > 0) {
    prompt += '\n【关键情节记录】\n'
    const recentPlots = keyPlots.value.slice(-3)
    recentPlots.forEach(plot => {
      prompt += `第${plot.round}章：${plot.plot}\n`
    })
  }
  
  const recentHistory = gameHistory.value.slice(-4)
  if (recentHistory.length > 0) {
    prompt += '\n【最近的对话】\n'
    recentHistory.forEach(msg => {
      const role = msg.role === 'user' ? '玩家选择' : '故事'
      prompt += `${role}：${msg.content.slice(0, 150)}...\n`
    })
  }
  
  return prompt
}

const summarizeHistory = async () => {
  if (gameHistory.value.length < 6) return
  
  const historyToSummarize = gameHistory.value.slice(0, -4)
  if (historyToSummarize.length === 0) return
  
  const summaryPrompt = `请将以下故事情节压缩成一段简洁的摘要（100字以内），保留关键人物、重要事件和故事主线：

${historyToSummarize.map(m => `${m.role === 'user' ? '玩家' : '叙述'}：${m.content}`).join('\n')}

请直接输出摘要内容，不要添加任何解释。`

  try {
    const result = await qa.askStream(summaryPrompt, () => {})
    contextSummary.value = result.answer.trim()
  } catch (error) {
    console.error('Failed to summarize history:', error)
  }
}

const selectTheme = (theme) => {
  selectedTheme.value = theme
}

const selectFamousStory = (story) => {
  selectedTheme.value = FAMOUS_STORIES.find(s => s.id === story.id)
  selectedTheme.value.isFamousStory = true
  selectedTheme.value.storyPrompt = story.prompt
}

const startGameWithTheme = async () => {
  if (!selectedTheme.value && !customTheme.value.trim()) return
  
  isLoading.value = true
  streamingContent.value = ''
  currentRound.value = 1
  showThemeSelection.value = false
  
  try {
    let themePrompt = ''
    
    if (selectedTheme.value?.isFamousStory) {
      themePrompt = selectedTheme.value.storyPrompt
      gameTitle.value = selectedTheme.value.name
    } else if (selectedTheme.value) {
      themePrompt = `主题：${selectedTheme.value.name}（${selectedTheme.value.desc}）`
    } else if (customTheme.value.trim()) {
      themePrompt = `主题：${customTheme.value.trim()}`
    }
    
    const initialPrompt = `创建一个互动叙事游戏。
${themePrompt}

要求：
1. 创建引人入胜的开场
2. 提供至少3个选择选项
3. 故事要有明确的冲突和悬念

请使用标签格式返回（便于流式显示）：
[TITLE]游戏标题[/TITLE]
[DESC]游戏描述（一句话）[/DESC]
[CONTENT]开场内容（200-300字）[/CONTENT]
[CHOICE]选项1[/CHOICE]
[CHOICE]选项2[/CHOICE]
[CHOICE]选项3[/CHOICE]`
    
    const result = await qa.askStream(initialPrompt, (chunk) => {
      streamingContent.value = extractContentFromStream(chunk.content, chunk.fullAnswer)
    })
    
    const gameData = parseGameData(result.answer)
    if (gameData) {
      if (!selectedTheme.value?.isFamousStory) {
        gameTitle.value = gameData.title || '未命名游戏'
      }
      gameDescription.value = gameData.description || ''
      storyContent.value = gameData.content || ''
      choices.value = gameData.choices || []
      gameHistory.value = [{ role: 'assistant', content: gameData.content || '' }]
      gameStarted.value = true
      
      const keyPlot = extractKeyPlot(gameData.content)
      if (keyPlot) {
        keyPlots.value.push({ round: 1, plot: keyPlot })
      }
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

const makeChoice = async (choice) => {
  if (isLoading.value) return
  
  isLoading.value = true
  streamingContent.value = ''
  currentRound.value++
  
  try {
    gameHistory.value.push({ role: 'user', content: choice })
    
    const contextPrompt = generateContextPrompt()
    
    const prompt = `继续互动叙事游戏。
${contextPrompt}

玩家当前选择："${choice}"

要求：
1. 根据玩家选择推进故事
2. 创造新的情节转折
3. 提供至少3个新的选择选项
4. 保持故事的连贯性和悬念

请使用标签格式返回（便于流式显示）：
[CONTENT]新的故事内容（150-250字）[/CONTENT]
[CHOICE]选项1[/CHOICE]
[CHOICE]选项2[/CHOICE]
[CHOICE]选项3[/CHOICE]`
    
    const result = await qa.askStream(prompt, (chunk) => {
      streamingContent.value = extractContentFromStream(chunk.content, chunk.fullAnswer)
    })
    
    const gameData = parseGameData(result.answer)
    if (gameData) {
      storyContent.value = gameData.content || ''
      choices.value = gameData.choices || []
      gameHistory.value.push({ role: 'assistant', content: gameData.content || '' })
      
      const keyPlot = extractKeyPlot(gameData.content)
      if (keyPlot) {
        keyPlots.value.push({ round: currentRound.value, plot: keyPlot })
      }
      
      if (currentRound.value % MAX_ROUNDS_BEFORE_SUMMARY === 0) {
        await summarizeHistory()
      }
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

const submitCustomInput = () => {
  if (!customInput.value.trim() || isLoading.value) return
  makeChoice(customInput.value.trim())
}

const toggleCustomInput = () => {
  showCustomInput.value = !showCustomInput.value
  if (showCustomInput.value) {
    setTimeout(() => {
      document.querySelector('.custom-input')?.focus()
    }, 100)
  }
}

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
  showThemeSelection.value = true
  selectedTheme.value = null
  customTheme.value = ''
  keyPlots.value = []
  contextSummary.value = ''
}

onMounted(() => {
})
</script>

<template>
  <div class="game-app">
    <header class="app-header">
      <div class="header-brand">
        <span class="brand-icon">◈</span>
        <h1 class="brand-title">InteractiveStory</h1>
      </div>
      <div class="header-meta">
        <span v-if="gameStarted" class="round-badge">Round {{ currentRound }}</span>
        <button class="header-btn" @click="restartGame" v-if="gameStarted || !showThemeSelection">
          <span class="btn-icon">↺</span> 重新开始
        </button>
      </div>
    </header>

    <div class="app-body">
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
              <div class="chapter-preview" v-if="chapter.keyPlot">{{ chapter.keyPlot.plot }}</div>
              <div class="chapter-preview" v-else>{{ chapter.preview }}</div>
            </div>
            <div class="chapter-status">
              <span v-if="chapter.round === currentRound" class="status-current">●</span>
              <span v-else-if="chapter.hasChoice" class="status-completed">✓</span>
            </div>
          </div>
        </div>
        
        <div class="sidebar-summary" v-if="contextSummary">
          <div class="summary-header">📝 故事摘要</div>
          <div class="summary-content">{{ contextSummary }}</div>
        </div>
      </aside>

      <main class="main-content" :class="{ 'full-width': showThemeSelection || !gameStarted }">
        <div v-if="showThemeSelection" class="theme-selection">
          <div class="selection-header">
            <div class="welcome-icon">📚</div>
            <h2 class="welcome-title">选择你的故事</h2>
            <p class="welcome-desc">选择一个主题或经典故事，开启你的互动叙事之旅</p>
          </div>

          <div class="story-type-tabs">
            <button 
              class="tab-btn" 
              :class="{ active: selectedStoryType === 'theme' }"
              @click="selectedStoryType = 'theme'"
            >
              🎨 主题类型
            </button>
            <button 
              class="tab-btn" 
              :class="{ active: selectedStoryType === 'famous' }"
              @click="selectedStoryType = 'famous'"
            >
              📖 经典故事
            </button>
          </div>

          <div v-if="selectedStoryType === 'theme'" class="theme-grid">
            <div 
              v-for="theme in THEMES" 
              :key="theme.id"
              class="theme-card"
              :class="{ selected: selectedTheme?.id === theme.id && !selectedTheme?.isFamousStory }"
              @click="selectTheme(theme)"
            >
              <div class="theme-icon">{{ theme.icon }}</div>
              <div class="theme-name">{{ theme.name }}</div>
              <div class="theme-desc">{{ theme.desc }}</div>
            </div>
          </div>

          <div v-else class="famous-stories-grid">
            <div 
              v-for="story in FAMOUS_STORIES" 
              :key="story.id"
              class="story-card"
              :class="{ selected: selectedTheme?.id === story.id }"
              @click="selectFamousStory(story)"
            >
              <div class="story-icon">{{ story.icon }}</div>
              <div class="story-name">{{ story.name }}</div>
              <div class="story-desc">{{ story.prompt.slice(0, 40) }}...</div>
            </div>
          </div>

          <div class="custom-theme-section">
            <div class="custom-label">或输入自定义主题：</div>
            <div class="custom-input-row">
              <input 
                v-model="customTheme"
                type="text"
                class="custom-theme-input"
                placeholder="例如：末日生存、赛博朋克、古代宫廷..."
                @focus="selectedTheme = null"
              />
            </div>
          </div>

          <button 
            class="start-game-btn" 
            @click="startGameWithTheme"
            :disabled="(!selectedTheme && !customTheme.trim()) || isLoading"
          >
            <span v-if="isLoading" class="loading-spinner"></span>
            <span v-else>🎮 开始游戏</span>
          </button>
        </div>

        <div v-else-if="!gameStarted" class="welcome-screen">
          <div class="welcome-card">
            <div class="welcome-icon">📚</div>
            <h2 class="welcome-title">开启你的互动叙事之旅</h2>
            <p class="welcome-desc">
              AI 驱动的沉浸式故事体验<br>
              每一个选择都将影响故事走向
            </p>
            <button class="start-btn" @click="showThemeSelection = true" :disabled="isLoading">
              <span v-if="isLoading" class="loading-spinner"></span>
              <span v-else>选择主题</span>
            </button>
          </div>
        </div>

        <div v-else class="game-area">
          <div class="title-card">
            <h2 class="game-title-text">{{ gameTitle }}</h2>
            <p class="game-desc-text">{{ gameDescription }}</p>
          </div>

          <div class="dialogue-area">
            <div 
              v-for="(item, index) in getDisplayHistory" 
              :key="index"
              class="message"
              :class="item.role"
            >
              <div class="message-avatar">
                <span v-if="item.role === 'user'">🎮</span>
                <span v-else>🤖</span>
              </div>
              <div class="message-content">
                <div class="message-label">
                  {{ item.role === 'user' ? '你的选择' : '故事叙述' }}
                </div>
                <div class="message-text">{{ item.content }}</div>
              </div>
            </div>
            
            <div v-if="streamingContent" class="message assistant streaming">
              <div class="message-avatar">🤖</div>
              <div class="message-content">
                <div class="message-label">故事叙述</div>
                <div class="message-text">{{ streamingContent }}<span class="typing-cursor">|</span></div>
              </div>
            </div>
          </div>

          <div class="interaction-area">
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

            <div v-if="!isLoading && choices.length > 0" class="custom-action">
              <button class="toggle-input-btn" @click="toggleCustomInput">
                {{ showCustomInput ? '隐藏自定义输入' : '✎ 输入自定义行动' }}
              </button>
            </div>

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
* {
  box-sizing: border-box;
}

.game-app {
  min-height: 100vh;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  color: #eaeaea;
}

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

.app-body {
  display: flex;
  height: calc(100vh - 60px);
  overflow: hidden;
}

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
  font-size: 11px;
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

.sidebar-summary {
  padding: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.1);
}

.summary-header {
  font-size: 13px;
  font-weight: 600;
  color: #4dabf7;
  margin-bottom: 8px;
}

.summary-content {
  font-size: 12px;
  color: #888;
  line-height: 1.5;
}

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

.theme-selection {
  width: 100%;
  max-width: 900px;
  margin: 0 auto;
  padding: 20px;
}

.selection-header {
  text-align: center;
  margin-bottom: 32px;
}

.welcome-icon {
  font-size: 64px;
  margin-bottom: 16px;
}

.welcome-title {
  font-size: 28px;
  font-weight: 700;
  margin-bottom: 12px;
  background: linear-gradient(90deg, #eaeaea, #a0a0a0);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.welcome-desc {
  font-size: 16px;
  color: #888;
  line-height: 1.6;
}

.story-type-tabs {
  display: flex;
  justify-content: center;
  gap: 16px;
  margin-bottom: 28px;
}

.tab-btn {
  padding: 12px 28px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  color: #888;
  font-size: 15px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.tab-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #eaeaea;
}

.tab-btn.active {
  background: rgba(233, 69, 96, 0.2);
  border-color: rgba(233, 69, 96, 0.4);
  color: #e94560;
}

.theme-grid, .famous-stories-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin-bottom: 32px;
}

.theme-card, .story-card {
  padding: 24px 20px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  text-align: center;
  cursor: pointer;
  transition: all 0.3s ease;
}

.theme-card:hover, .story-card:hover {
  background: rgba(255, 255, 255, 0.08);
  transform: translateY(-2px);
}

.theme-card.selected, .story-card.selected {
  background: rgba(233, 69, 96, 0.15);
  border-color: rgba(233, 69, 96, 0.4);
}

.theme-icon, .story-icon {
  font-size: 40px;
  margin-bottom: 12px;
}

.theme-name, .story-name {
  font-size: 16px;
  font-weight: 600;
  color: #eaeaea;
  margin-bottom: 8px;
}

.theme-desc, .story-desc {
  font-size: 13px;
  color: #888;
  line-height: 1.4;
}

.custom-theme-section {
  margin-bottom: 28px;
}

.custom-label {
  font-size: 14px;
  color: #888;
  margin-bottom: 12px;
}

.custom-input-row {
  display: flex;
  gap: 12px;
}

.custom-theme-input {
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

.custom-theme-input:focus {
  border-color: #e94560;
  background: rgba(255, 255, 255, 0.08);
}

.custom-theme-input::placeholder {
  color: #666;
}

.start-game-btn {
  display: block;
  width: 100%;
  max-width: 300px;
  margin: 0 auto;
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

.start-game-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 30px rgba(233, 69, 96, 0.4);
}

.start-game-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

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
</style>

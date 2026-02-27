class SiliconFlowQA {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = "https://api.siliconflow.cn/v1/chat/completions";
    this.model = "Qwen/Qwen3-8B";
    this.systemPrompt = "你是一个网文作家，你擅长给出博人眼球的故事简介，也擅长给出精彩、剧情紧凑的故事内容，文风细腻";
    this.history = [];
  }

  async ask(question, onChunk) {
    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: "system",
              content: this.systemPrompt,
            },
            ...this.history,
            {
              role: "user",
              content: question,
            },
          ],
          temperature: 0.7,
          enable_thinking: false,
          stream: true,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      this.history.push({ role: "user", content: question });

      let fullAnswer = "";
      let thinkingContent = "";

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.substring(6);
            if (data === "[DONE]") {
              continue;
            }
            try {
              const parsed = JSON.parse(data);
              if (parsed.choices && parsed.choices[0]) {
                const choice = parsed.choices[0];
                if (choice.delta) {
                  if (choice.delta.content) {
                    fullAnswer += choice.delta.content;
                    if (onChunk) {
                      onChunk({
                        type: "answer",
                        content: choice.delta.content,
                        fullAnswer: fullAnswer,
                      });
                    }
                  }
                  if (choice.delta.reasoning_content) {
                    thinkingContent += choice.delta.reasoning_content;
                    if (onChunk) {
                      onChunk({
                        type: "thinking",
                        content: choice.delta.reasoning_content,
                        thinkingContent: thinkingContent,
                      });
                    }
                  }
                }
              }
            } catch (error) {
              // 忽略解析错误
            }
          }
        }
      }

      return { answer: fullAnswer, thinking: thinkingContent };
    } catch (error) {
      console.error(
        "Error calling SiliconFlow API:",
        error.message,
      );
      throw error;
    }
  }

  // 新增：流式对话方法，实时返回解析后的数据
  async askStream(question, onStream) {
    const result = await this.ask(question, (chunk) => {
      if (chunk.type === "answer" && onStream) {
        onStream({
          content: chunk.content,
          fullAnswer: chunk.fullAnswer,
        });
      }
    });
    return result;
  }
}

export default SiliconFlowQA;
